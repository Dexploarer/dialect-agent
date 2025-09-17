import {
  generateText,
  generateObject,
  streamText,
  jsonSchema,
  tool,
  gateway,
} from "ai";
import type {
  CoreMessage,
  LanguageModel,
} from "ai";
import { z } from "zod";
import { findSimilarDocuments, type SearchResult } from "./embeddings.js";

export interface AIConfig {
  defaultProvider: "openai" | "anthropic";
  openaiApiKey?: string; // unused with Gateway; kept for type compatibility
  anthropicApiKey?: string; // unused with Gateway; kept for type compatibility
  aiGatewayUrl?: string;
  aiGatewayApiKey?: string;
  aiGatewayOrder?: string[];
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxRetries: number;
  timeout: number;
  enableRag: boolean;
  ragConfig: {
    maxResults: number;
    similarityThreshold: number;
    includeMetadata: boolean;
  };
  webFetch: {
    unrestricted: boolean;
    allowlist: string[];
    maxBytes: number;
    timeoutMs: number;
  };
}

// Default configuration
const defaultConfig: AIConfig = {
  defaultProvider: "openai",
  openaiApiKey: process.env.OPENAI_API_KEY || "", // deprecated (Gateway only)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "", // deprecated (Gateway only)
  aiGatewayUrl: process.env.AI_GATEWAY_URL || "",
  aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY || "",
  aiGatewayOrder: (process.env.AI_GATEWAY_ORDER || "").split(",").map((s) => s.trim()).filter(Boolean),
  // Prefer namespaced model id for AI SDK v5 + Gateway. If not provided,
  // we'll namespace at runtime based on defaultProvider.
  defaultModel: process.env.AI_DEFAULT_MODEL || "openai/gpt-4o",
  maxTokens: 4000,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxRetries: 3,
  timeout: 30000,
  enableRag: true,
  ragConfig: {
    maxResults: 5,
    similarityThreshold: 0.7,
    includeMetadata: true,
  },
  webFetch: {
    unrestricted: (process.env.WEB_FETCH_UNRESTRICTED || "false").toLowerCase() === "true",
    allowlist: (process.env.WEB_FETCH_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    maxBytes: Number(process.env.WEB_FETCH_MAX_BYTES || 1_000_000),
    timeoutMs: Number(process.env.WEB_FETCH_TIMEOUT || 10_000),
  },
};

// Response schemas for structured generation
export const ChatResponseSchema = z.object({
  content: z.string(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sources: z.array(z.string()).optional(),
});

export const SummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  topics: z.array(z.string()).optional(),
});

export const SearchQuerySchema = z.object({
  query: z.string(),
  intent: z.enum(["search", "question", "comparison", "summary"]),
  keywords: z.array(z.string()),
  filters: z.record(z.string()).optional(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export interface RAGContext {
  results: SearchResult[];
  query: string;
  totalResults: number;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  enableRag?: boolean;
  systemPrompt?: string;
  ragQuery?: string;
  toolsEnabled?: boolean;
}

export interface StreamingOptions extends ChatOptions {
  onToken?: (token: string) => void;
  onFinish?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export class AIService {
  private config: AIConfig;
  private models: Map<string, LanguageModel>;

  constructor(config?: Partial<AIConfig>) {
    this.config = { ...defaultConfig, ...config };
    this.models = new Map();
    this.initializeModels();
  }

  // Tools disabled due to TypeScript compatibility issues with AI SDK
  // private readonly tools = { ... };

  private initializeModels(): void {
    // Register models via Vercel AI Gateway only
    this.models.clear();
    if (this.config.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY) {
      const supportedModels = [
        // OpenAI family
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "openai/gpt-4-turbo",
        // Anthropic family
        "anthropic/claude-3-5-sonnet-20241022",
        "anthropic/claude-3-opus-20240229",
        "anthropic/claude-3-sonnet-20240229",
        "anthropic/claude-3-haiku-20240307",
      ];
      for (const id of supportedModels) {
        this.models.set(id, gateway(id));
      }
    }
  }

  private resolveModelArg(modelName?: string): string | LanguageModel {
    const requested = modelName || this.config.defaultModel;
    const modelId = requested.includes("/")
      ? requested
      : `${this.config.defaultProvider}/${requested}`;

    // When using AI Gateway, we can directly use the gateway function
    if (this.config.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY) {
      return gateway(modelId);
    }

    // Fallback to registered models
    const selectedModel = this.models.get(modelId);
    if (!selectedModel) {
      throw new Error(`Model ${requested} not available. Check your API keys and model configuration.`);
    }
    return selectedModel;
  }

  /**
   * Perform RAG-enhanced context retrieval
   */
  private async performRAG(
    query: string,
    ragQuery?: string,
  ): Promise<RAGContext> {
    const searchQuery = ragQuery || query;
    try {
      const results = await findSimilarDocuments(searchQuery, {
        limit: this.config.ragConfig.maxResults,
        threshold: this.config.ragConfig.similarityThreshold,
      });
      return {
        results,
        query: searchQuery,
        totalResults: results.length,
      };
    } catch (err) {
      console.warn(
        "RAG lookup failed; continuing without context:",
        err instanceof Error ? err.message : String(err),
      );
      return { results: [], query: searchQuery, totalResults: 0 };
    }
  }

  /**
   * Build system prompt with RAG context
   */
  private buildSystemPromptWithRAG(
    basePrompt: string,
    ragContext: RAGContext,
  ): string {
    if (ragContext.results.length === 0) {
      return basePrompt;
    }

    const contextSections = ragContext.results
      .map((result, index) => {
        const metadata =
          this.config.ragConfig.includeMetadata && result.metadata
            ? `\nMetadata: ${JSON.stringify(result.metadata)}`
            : "";

        return `[Source ${index + 1}] (Similarity: ${result.similarity.toFixed(3)})
${result.chunk.content}${metadata}`;
      })
      .join("\n\n");

    return `${basePrompt}

## Available Context
The following information has been retrieved based on the user's query and may be relevant to your response:

${contextSections}

When referencing this context in your response, please cite the source numbers (e.g., [Source 1], [Source 2]).`;
  }

  /**
   * Generate chat completion
   */
  async generateChatCompletion(
    messages: CoreMessage[],
    options: ChatOptions = {},
  ): Promise<{ content: string; ragContext?: RAGContext; finishReason?: string; usage?: any }> {
    const model = this.resolveModelArg(options.model);

    let ragContext: RAGContext | undefined;
    let finalMessages = messages;

    // Perform RAG if enabled
    if ((options.enableRag ?? this.config.enableRag) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        lastMessage.role === "user" &&
        typeof lastMessage.content === "string"
      ) {
        ragContext = await this.performRAG(
          lastMessage.content,
          options.ragQuery,
        );

        // Update system message with RAG context
        const systemMessage = finalMessages.find((m) => m.role === "system");
        const baseSystemPrompt =
          (systemMessage?.content as string) || "You are a helpful assistant.";
        const enhancedSystemPrompt = this.buildSystemPromptWithRAG(
          baseSystemPrompt,
          ragContext,
        );

        finalMessages = [
          { role: "system", content: enhancedSystemPrompt },
          ...finalMessages.filter((m) => m.role !== "system"),
        ];
      }
    }

    try {
      const result = await generateText({
        model,
        messages: finalMessages,
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
        topP: this.config.topP,
        frequencyPenalty: this.config.frequencyPenalty,
        presencePenalty: this.config.presencePenalty,
        // Tools disabled due to TypeScript compatibility issues
        // ...(options.toolsEnabled ? { tools: this.tools } : {}),
      });

      return {
        content: result.text,
        finishReason: (result as any).finishReason,
        usage: (result as any).usage,
        ...(ragContext && { ragContext }),
      };
    } catch (error) {
      console.error("Chat completion error:", error);
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  /**
   * Generate streaming chat completion
   */
  async generateStreamingCompletion(
    messages: CoreMessage[],
    options: StreamingOptions = {},
  ) {
    const model = this.resolveModelArg(options.model);

    let ragContext: RAGContext | undefined;
    let finalMessages = messages;

    // Perform RAG if enabled
    if ((options.enableRag ?? this.config.enableRag) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        lastMessage.role === "user" &&
        typeof lastMessage.content === "string"
      ) {
        ragContext = await this.performRAG(
          lastMessage.content,
          options.ragQuery,
        );

        const systemMessage = finalMessages.find((m) => m.role === "system");
        const baseSystemPrompt =
          (systemMessage?.content as string) || "You are a helpful assistant.";
        const enhancedSystemPrompt = this.buildSystemPromptWithRAG(
          baseSystemPrompt,
          ragContext,
        );

        finalMessages = [
          { role: "system", content: enhancedSystemPrompt },
          ...finalMessages.filter((m) => m.role !== "system"),
        ];
      }
    }

    try {
      const stream = await streamText({
        model,
        messages: finalMessages,
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
        topP: this.config.topP,
        frequencyPenalty: this.config.frequencyPenalty,
        presencePenalty: this.config.presencePenalty,
        // Tools disabled due to TypeScript compatibility issues
        // ...(options.toolsEnabled ? { tools: this.tools } : {}),
      });

      return {
        stream,
        ragContext,
      };
    } catch (error) {
      console.error("Streaming completion error:", error);
      throw new Error(`Failed to generate streaming response: ${error}`);
    }
  }

  /**
   * Stream structured object response using JSON Schema
   */
  async generateObjectStreamWithJsonSchema<T = any>(
    messages: CoreMessage[],
    schemaObject: Record<string, any>,
    options: ChatOptions = {},
  ) {
    const model = this.resolveModelArg(options.model);

    let ragContext: RAGContext | undefined;
    let finalMessages = messages;

    if ((options.enableRag ?? this.config.enableRag) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
        ragContext = await this.performRAG(lastMessage.content, options.ragQuery);
        const systemMessage = finalMessages.find((m) => m.role === 'system');
        const baseSystemPrompt = (systemMessage?.content as string) || 'You are a helpful assistant.';
        const enhancedSystemPrompt = this.buildSystemPromptWithRAG(baseSystemPrompt, ragContext);
        finalMessages = [{ role: 'system', content: enhancedSystemPrompt }, ...finalMessages.filter((m) => m.role !== 'system')];
      }
    }

    const result = await (await import('ai')).streamObject({
      model,
      messages: finalMessages,
      schema: jsonSchema({ schema: schemaObject }),
      temperature: options.temperature ?? this.config.temperature,
      maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
      // Tools disabled due to TypeScript compatibility issues
      // ...(options.toolsEnabled ? { tools: this.tools } : {}),
    });

    return { result, ragContext };
  }

  /**
   * Generate structured object response
   */
  async generateStructuredResponse<T>(
    messages: CoreMessage[],
    schema: z.ZodSchema<T>,
    options: ChatOptions = {},
  ): Promise<{ object: T; ragContext?: RAGContext }> {
    const model = this.resolveModelArg(options.model);

    let ragContext: RAGContext | undefined;
    let finalMessages = messages;

    // Perform RAG if enabled
    if ((options.enableRag ?? this.config.enableRag) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        lastMessage.role === "user" &&
        typeof lastMessage.content === "string"
      ) {
        ragContext = await this.performRAG(
          lastMessage.content,
          options.ragQuery,
        );

        const systemMessage = finalMessages.find((m) => m.role === "system");
        const baseSystemPrompt =
          (systemMessage?.content as string) || "You are a helpful assistant.";
        const enhancedSystemPrompt = this.buildSystemPromptWithRAG(
          baseSystemPrompt,
          ragContext,
        );

        finalMessages = [
          { role: "system", content: enhancedSystemPrompt },
          ...finalMessages.filter((m) => m.role !== "system"),
        ];
      }
    }

    try {
      const result = await generateObject({
        model,
        messages: finalMessages,
        schema,
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
        // Tools disabled due to TypeScript compatibility issues
        // ...(options.toolsEnabled ? { tools: this.tools } : {}),
      });

      return {
        object: result.object,
        ...(ragContext && { ragContext }),
      };
    } catch (error) {
      console.error("Structured generation error:", error);
      throw new Error(`Failed to generate structured response: ${error}`);
    }
  }

  /**
   * Generate structured object from JSON Schema (using AI SDK jsonSchema helper)
   */
  async generateObjectWithJsonSchema<T = any>(
    messages: CoreMessage[],
    schemaObject: Record<string, any>,
    options: ChatOptions = {},
  ): Promise<{ object: T; ragContext?: RAGContext }> {
    const model = this.resolveModelArg(options.model);

    let ragContext: RAGContext | undefined;
    let finalMessages = messages;

    if ((options.enableRag ?? this.config.enableRag) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === "user" && typeof lastMessage.content === "string") {
        ragContext = await this.performRAG(lastMessage.content, options.ragQuery);
        const systemMessage = finalMessages.find((m) => m.role === "system");
        const baseSystemPrompt = (systemMessage?.content as string) || "You are a helpful assistant.";
        const enhancedSystemPrompt = this.buildSystemPromptWithRAG(baseSystemPrompt, ragContext);
        finalMessages = [{ role: "system", content: enhancedSystemPrompt }, ...finalMessages.filter((m) => m.role !== "system")];
      }
    }

    const result = await generateObject({
      model,
      messages: finalMessages,
      schema: jsonSchema({ schema: schemaObject }),
      temperature: options.temperature ?? this.config.temperature,
      maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
      // Tools disabled due to TypeScript compatibility issues
      // ...(options.toolsEnabled ? { tools: this.tools } : {}),
    });

    return { object: result.object as T, ...(ragContext && { ragContext }) };
  }

  /**
   * Generate document summary
   */
  async summarizeDocument(
    content: string,
    options: ChatOptions = {},
  ): Promise<Summary> {
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an expert document summarizer. Analyze the provided content and create a comprehensive summary with key points, sentiment analysis, and topic identification.`,
      },
      {
        role: "user",
        content: `Please summarize the following document:\n\n${content}`,
      },
    ];

    const result = await this.generateStructuredResponse(
      messages,
      SummarySchema,
      options,
    );
    return result.object;
  }

  /**
   * Parse and enhance search queries
   */
  async parseSearchQuery(
    query: string,
    options: ChatOptions = {},
  ): Promise<SearchQuery> {
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are a search query analyzer. Parse the user's query to understand their intent, extract keywords, and suggest filters.`,
      },
      {
        role: "user",
        content: `Analyze this search query: "${query}"`,
      },
    ];

    const result = await this.generateStructuredResponse(
      messages,
      SearchQuerySchema,
      options,
    );
    return result.object;
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeModels();
  }

  /**
   * Get current configuration
   */
  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * Health check for AI service
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {
      availableModels: this.getAvailableModels(),
      defaultModel: this.config.defaultModel,
      ragEnabled: this.config.enableRag,
    };

    try {
      // Test with a simple prompt
      const testMessages: CoreMessage[] = [
        {
          role: "user",
          content: 'Hello, this is a health check. Please respond with "OK".',
        },
      ];

      const result = await this.generateChatCompletion(testMessages, {
        enableRag: false,
        maxTokens: 10,
      });

      details.testResponse = result.content.substring(0, 50);

      return { status: "healthy", details };
    } catch (error) {
      details.error = error instanceof Error ? error.message : String(error);
      return { status: "unhealthy", details };
    }
  }
}

// Singleton instance
let aiService: AIService | null = null;

/**
 * Get or create AI service instance
 */
export function getAIService(config?: Partial<AIConfig>): AIService {
  if (!aiService) {
    aiService = new AIService(config);
  }
  return aiService;
}

/**
 * Get AI service instance, throwing if not initialized
 */
export function getAIServiceOrThrow(): AIService {
  if (!aiService) {
    throw new Error("AI service not initialized. Check your AI_GATEWAY_API_KEY environment variable.");
  }
  return aiService;
}

/**
 * Initialize AI service with configuration validation
 */
export function initializeAIService(config?: Partial<AIConfig>): AIService | null {
  const service = getAIService(config);

  // Validate that at least one provider is configured
  const availableModels = service.getAvailableModels();
  const cfg = service.getConfig();
  const usingGateway = Boolean(cfg.aiGatewayApiKey || process.env.AI_GATEWAY_API_KEY);
  if (!usingGateway) {
    console.warn("⚠️ Vercel AI Gateway is required. Set AI_GATEWAY_API_KEY (and optionally AI_GATEWAY_URL).");
    return null;
  }

  if (availableModels.length === 0) {
    console.warn(
      "⚠️ No models registered. Verify AI_DEFAULT_MODEL and Gateway configuration.",
    );
    return null;
  }

  if (usingGateway) {
    console.log("AI Service initialized via Gateway with default model:", cfg.defaultModel);
  } else {
    console.log(
      `AI Service initialized with models: ${availableModels.join(", ")}`,
    );
  }
  return service;
}

// Utility functions
export async function chat(
  messages: CoreMessage[],
  options?: ChatOptions,
): Promise<{ content: string; ragContext?: RAGContext }> {
  const service = getAIService();
  return service.generateChatCompletion(messages, options);
}

export async function chatStream(
  messages: CoreMessage[],
  options?: StreamingOptions,
) {
  const service = getAIService();
  return service.generateStreamingCompletion(messages, options);
}

export async function generateSummary(
  content: string,
  options?: ChatOptions,
): Promise<Summary> {
  const service = getAIService();
  return service.summarizeDocument(content, options);
}

export async function parseQuery(
  query: string,
  options?: ChatOptions,
): Promise<SearchQuery> {
  const service = getAIService();
  return service.parseSearchQuery(query, options);
}
