import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { serveStatic } from "hono/bun";
import { createHmac, timingSafeEqual } from "crypto";

import { streamText } from "hono/streaming";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { nanoid } from "nanoid";
import { config } from "dotenv";

// Load environment variables
config();

// Import our services
import {
  initializeDatabase,
  getDatabaseManager,
  setupGracefulShutdown,
} from "./db/connection.js";
import {
  initializeEmbeddingService,
  getEmbeddingService,
} from "./lib/embeddings.js";
import { initializeAIService, getAIService, getAIServiceOrThrow } from "./lib/ai.js";
import { initializeQueues, enqueueDialectEvents, queuesReady } from "./lib/queue.js";

// Import types
import type { CoreMessage } from "ai";
import type { Document, Message, Conversation } from "./db/schema.js";

// Import agent system
import AgentManager from "./agents/agent-manager.js";
import type {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  ChatSession,
  AgentChatMessage,
} from "./agents/types.js";

// Import Dialect services
import { createDialectAlertsService } from "./lib/dialect-alerts.js";
import { createDialectMarketsService } from "./lib/dialect-markets.js";
import { createDialectPositionsService } from "./lib/dialect-positions.js";
import { createDialectBlinksService } from "./lib/dialect-blinks.js";
import { createDialectAuthService } from "./lib/dialect-auth.js";
import { createDialectInboxService } from "./lib/dialect-inbox.js";
import { createDialectMCPService } from "./lib/dialect-mcp-service.js";
import { createDialectMonitoringService } from "./lib/dialect-monitoring-service.js";

const app = new Hono();

// Helper: always return AI service instance
function getAIServiceOrThrow() {
  return getAIService();
}

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
    credentials: Boolean(process.env.CORS_CREDENTIALS) || true,
  }),
);

// Request validation schemas
const MessagePartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), image: z.string() }), // data URL or URL
  z.object({ type: z.literal('file'), data: z.string(), mediaType: z.string().optional() }),
]);

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.union([z.string(), z.array(MessagePartSchema)]),
    }),
  ),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  stream: z.boolean().optional(),
  enableRag: z.boolean().optional(),
  toolsEnabled: z.boolean().optional(),
  responseType: z.enum(['text', 'object']).optional(),
  jsonSchema: z.record(z.any()).optional(),
  conversationId: z.string().optional(),
});

const DocumentRequestSchema = z.object({
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
});

const SearchRequestSchema = z.object({
  query: z.string(),
  limit: z.number().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
});

const ConversationRequestSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
});

// Health check endpoint
app.get("/health", async (c) => {
  try {
    const dbStats = getDatabaseManager().getStats();
    const aiHealth = await getAIServiceOrThrow().healthCheck();
    const embeddingService = getEmbeddingService();

    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: "healthy",
          stats: dbStats,
        },
        ai: aiHealth,
        embeddings: {
          status: embeddingService.isReady() ? "healthy" : "initializing",
          config: embeddingService.getConfig(),
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

// Streamed object output endpoint
app.post("/api/chat/object/stream", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ChatRequestSchema.parse(body);
    const { messages, model, temperature, maxTokens, enableRag, toolsEnabled, jsonSchema } = parsed;
    if (!jsonSchema) {
      return c.json({ error: "jsonSchema is required" }, 400);
    }

    const aiService = getAIServiceOrThrow();
    return streamText(c, async (stream) => {
      try {
        const { result } = await aiService.generateObjectStreamWithJsonSchema(
          messages as CoreMessage[],
          jsonSchema,
          {
            ...(model && { model }),
            ...(temperature !== undefined && { temperature }),
            ...(maxTokens !== undefined && { maxTokens }),
            ...(enableRag !== undefined && { enableRag }),
            ...(toolsEnabled !== undefined && { toolsEnabled }),
          },
        );

        let finishReason: string | undefined;
        let usage: any | undefined;

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            await stream.write(part.textDelta);
          } else if (part.type === 'finish') {
            finishReason = part.finishReason as any;
            usage = part.usage;
          }
        }

        if (finishReason || usage) {
          try {
            await stream.write("\n\n[METADATA]" + JSON.stringify({ finishReason, usage }));
          } catch {}
        }
      } catch (error) {
        await stream.write(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to stream object output",
      },
      500,
    );
  }
});

// AI Models + Config endpoints
app.get("/api/ai/models", async (c) => {
  try {
    const textModels = [
      { id: "openai/gpt-4o", label: "OpenAI · GPT-4o" },
      { id: "openai/gpt-4o-mini", label: "OpenAI · GPT-4o mini" },
      { id: "openai/gpt-4-turbo", label: "OpenAI · GPT-4 Turbo" },
      { id: "anthropic/claude-3-5-sonnet-20241022", label: "Anthropic · Claude 3.5 Sonnet (2024-10-22)" },
      { id: "anthropic/claude-3-opus-20240229", label: "Anthropic · Claude 3 Opus" },
      { id: "anthropic/claude-3-sonnet-20240229", label: "Anthropic · Claude 3 Sonnet" },
      { id: "anthropic/claude-3-haiku-20240307", label: "Anthropic · Claude 3 Haiku" },
    ];
    const embeddingModels = [
      { id: "openai/text-embedding-3-small", label: "OpenAI · text-embedding-3-small (1536d)" },
      { id: "openai/text-embedding-3-large", label: "OpenAI · text-embedding-3-large (3072d)" },
      { id: "openai/text-embedding-ada-002", label: "OpenAI · text-embedding-ada-002 (legacy)" },
    ];
    return c.json({ textModels, embeddingModels });
  } catch (error) {
    return c.json({ error: "Failed to fetch models" }, 500);
  }
});

app.get("/api/ai/config", async (c) => {
  try {
    const svc = getAIServiceOrThrow();
    const emb = getEmbeddingService();
    return c.json({
      textModel: svc.getConfig().defaultModel,
      embeddingModel: emb.getConfig().model,
      ragEnabled: svc.getConfig().enableRag,
      temperature: svc.getConfig().temperature,
      maxTokens: svc.getConfig().maxTokens,
      webFetchUnrestricted: svc.getConfig().webFetch.unrestricted,
      webFetchAllowlist: svc.getConfig().webFetch.allowlist,
      webFetchMaxBytes: svc.getConfig().webFetch.maxBytes,
      webFetchTimeoutMs: svc.getConfig().webFetch.timeoutMs,
    });
  } catch (error) {
    return c.json({ error: "Failed to get AI config" }, 500);
  }
});

app.patch("/api/ai/config", async (c) => {
  try {
    const { textModel, embeddingModel, ragEnabled, temperature, maxTokens, webFetchUnrestricted, webFetchAllowlist, webFetchMaxBytes, webFetchTimeoutMs } = await c.req.json();
    if (textModel) {
      getAIServiceOrThrow().updateConfig({ defaultModel: textModel });
    }
    if (embeddingModel) {
      getEmbeddingService().updateConfig({ model: embeddingModel });
    }
    const updates: any = {};
    if (typeof ragEnabled === 'boolean') updates.enableRag = ragEnabled;
    if (typeof temperature === 'number') updates.temperature = temperature;
    if (typeof maxTokens === 'number') updates.maxTokens = maxTokens;
    if (typeof webFetchUnrestricted === 'boolean' || Array.isArray(webFetchAllowlist) || typeof webFetchMaxBytes === 'number' || typeof webFetchTimeoutMs === 'number') {
      updates.webFetch = {
        ...(getAIServiceOrThrow().getConfig().webFetch),
        ...(typeof webFetchUnrestricted === 'boolean' ? { unrestricted: webFetchUnrestricted } : {}),
        ...(Array.isArray(webFetchAllowlist) ? { allowlist: webFetchAllowlist } : {}),
        ...(typeof webFetchMaxBytes === 'number' ? { maxBytes: webFetchMaxBytes } : {}),
        ...(typeof webFetchTimeoutMs === 'number' ? { timeoutMs: webFetchTimeoutMs } : {}),
      };
    }
    if (Object.keys(updates).length > 0) {
      getAIServiceOrThrow().updateConfig(updates);
    }
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: "Failed to update AI config" }, 500);
  }
});

// Chat completion endpoint
app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();
    const {
      messages,
      model,
      temperature,
      maxTokens,
      stream,
      enableRag,
      toolsEnabled,
      responseType,
      jsonSchema,
      conversationId,
    } = ChatRequestSchema.parse(body);

    const aiService = getAIServiceOrThrow();
    const dbManager = getDatabaseManager();

    // If requesting structured object response
    if (responseType === 'object' && jsonSchema && !stream) {
      const { object, ragContext } = await aiService.generateObjectWithJsonSchema(
        messages as CoreMessage[],
        jsonSchema,
        {
          ...(model && { model }),
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && { maxTokens }),
          ...(enableRag !== undefined && { enableRag }),
          ...(toolsEnabled !== undefined && { toolsEnabled }),
        },
      );
      return c.json({ object, ragContext });
    }

    // Handle streaming response
    if (stream) {
      return streamText(c, async (stream) => {
        try {
          const { stream: textStream, ragContext } =
            await aiService.generateStreamingCompletion(
              messages as CoreMessage[],
              { 
                ...(model && { model }), 
                ...(temperature !== undefined && { temperature }), 
                ...(maxTokens !== undefined && { maxTokens }), 
                ...(enableRag !== undefined && { enableRag }),
                ...(toolsEnabled !== undefined && { toolsEnabled }),
              },
            );

          let fullResponse = "";
          let finishReason: string | undefined;
          let usage: any | undefined;

          for await (const chunk of textStream.textStream) {
            fullResponse += chunk;
            await stream.write(chunk);
          }

          // Attach finish metadata
          try {
            finishReason = (await (textStream as any).finishReason) as any;
            usage = await (textStream as any).usage;
          } catch {}

          // Save conversation if ID provided
          if (conversationId) {
            const messageId = nanoid();
            dbManager.run(
              "INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)",
              messageId,
              conversationId,
              "assistant",
              fullResponse,
              JSON.stringify({ ragContext, finishReason, usage }),
            );
          }

          // Append metadata trailer for clients that care
          if (finishReason || usage) {
            try {
              await stream.write("\n\n[METADATA]" + JSON.stringify({ finishReason, usage }));
            } catch {}
          }
        } catch (error) {
          await stream.write(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    }

    // Handle non-streaming response
    const { content, ragContext, finishReason, usage } = await aiService.generateChatCompletion(
      messages as CoreMessage[],
      { 
        ...(model && { model }), 
        ...(temperature !== undefined && { temperature }), 
        ...(maxTokens !== undefined && { maxTokens }), 
        ...(enableRag !== undefined && { enableRag }),
        ...(toolsEnabled !== undefined && { toolsEnabled }),
      },
    );

    // Save conversation if ID provided
    if (conversationId) {
      const messageId = nanoid();
      dbManager.run(
        "INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)",
        messageId,
        conversationId,
        "assistant",
        content,
        JSON.stringify({ ragContext }),
      );
    }

    return c.json({
      content,
      ragContext: ragContext
        ? {
            query: ragContext.query,
            totalResults: ragContext.totalResults,
            sources: ragContext.results.map((r) => ({
              document_id: r.document_id,
              similarity: r.similarity,
              content: r.chunk.content.substring(0, 200) + "...",
            })),
          }
        : undefined,
      finishReason,
      usage,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500,
    );
  }
});

// SSE wrapper for text streaming
app.post("/api/chat/stream-sse", async (c) => {
  try {
    const body = await c.req.json();
    const { messages, model, temperature, maxTokens, enableRag, toolsEnabled } = ChatRequestSchema.parse(body);

    const aiService = getAIServiceOrThrow();
    const { stream: textStream } = await aiService.generateStreamingCompletion(
      messages as CoreMessage[],
      {
        ...(model && { model }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(enableRag !== undefined && { enableRag }),
        ...(toolsEnabled !== undefined && { toolsEnabled }),
      },
    );

    return streamSSE(c, async (sse) => {
      try {
        for await (const part of (textStream as any).fullStream) {
          switch (part.type) {
            case 'start':
              await sse.writeSSE({ event: 'start', data: '{}' });
              break;
            case 'text-delta':
              await sse.writeSSE({ event: 'delta', data: JSON.stringify({ text: part.text }) });
              break;
            case 'tool-call':
              await sse.writeSSE({ event: 'tool-call', data: JSON.stringify(part) });
              break;
            case 'tool-result':
              await sse.writeSSE({ event: 'tool-result', data: JSON.stringify(part) });
              break;
            case 'finish':
              await sse.writeSSE({ event: 'finish', data: JSON.stringify({ finishReason: part.finishReason, totalUsage: part.totalUsage }) });
              break;
            case 'error':
              await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: (part.error && (part.error.message || String(part.error))) || 'Unknown error' }) });
              break;
            default:
              break;
          }
        }
      } catch (err) {
        await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) });
      }
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to stream SSE' }, 500);
  }
});

// SSE wrapper for object streaming
app.post("/api/chat/object/stream-sse", async (c) => {
  try {
    const body = await c.req.json();
    const { messages, model, temperature, maxTokens, enableRag, toolsEnabled, jsonSchema } = ChatRequestSchema.parse(body);
    if (!jsonSchema) return c.json({ error: 'jsonSchema is required' }, 400);

    const aiService = getAIServiceOrThrow();
    const { result } = await aiService.generateObjectStreamWithJsonSchema(
      messages as CoreMessage[],
      jsonSchema,
      {
        ...(model && { model }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(enableRag !== undefined && { enableRag }),
        ...(toolsEnabled !== undefined && { toolsEnabled }),
      },
    );

    return streamSSE(c, async (sse) => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            await sse.writeSSE({ event: 'delta', data: JSON.stringify({ text: part.textDelta }) });
          } else if (part.type === 'object') {
            await sse.writeSSE({ event: 'partial', data: JSON.stringify(part.object) });
          } else if (part.type === 'finish') {
            await sse.writeSSE({ event: 'finish', data: JSON.stringify({ finishReason: part.finishReason, usage: part.usage }) });
          } else if (part.type === 'error') {
            await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: part.error && (part.error.message || String(part.error)) }) });
          }
        }
      } catch (err) {
        await sse.writeSSE({ event: 'error', data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) });
      }
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to stream object SSE' }, 500);
  }
});

// Document management endpoints
app.post("/api/documents", async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, metadata } = DocumentRequestSchema.parse(body);

    const documentId = nanoid();
    const dbManager = getDatabaseManager();
    const embeddingService = getEmbeddingService();

    // Save document to database
    dbManager.run(
      "INSERT INTO documents (id, title, content, metadata) VALUES (?, ?, ?, ?)",
      documentId,
      title,
      content,
      JSON.stringify(metadata || {}),
    );

    // Generate and store embeddings
    await embeddingService.processDocument(
      documentId,
      content,
      title,
      metadata,
    );

    const document = dbManager.get(
      "SELECT * FROM documents WHERE id = ?",
      documentId,
    );

    return c.json(
      {
        document: {
          ...document,
          metadata: JSON.parse(document.metadata),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Document creation error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create document",
      },
      500,
    );
  }
});

app.get("/api/documents", async (c) => {
  try {
    const dbManager = getDatabaseManager();
    const documents = dbManager.query(
      "SELECT * FROM documents ORDER BY created_at DESC",
    );

    return c.json({
      documents: documents.map((doc: any) => ({
        ...doc,
        metadata: JSON.parse(doc.metadata),
      })),
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch documents",
      },
      500,
    );
  }
});

app.get("/api/documents/:id", async (c) => {
  try {
    const documentId = c.req.param("id");
    const dbManager = getDatabaseManager();
    const document = dbManager.get(
      "SELECT * FROM documents WHERE id = ?",
      documentId,
    );

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({
      document: {
        ...document,
        metadata: JSON.parse(document.metadata),
      },
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch document",
      },
      500,
    );
  }
});

app.delete("/api/documents/:id", async (c) => {
  try {
    const documentId = c.req.param("id");
    const dbManager = getDatabaseManager();
    const embeddingService = getEmbeddingService();

    // Delete document and associated embeddings
    dbManager.run("DELETE FROM documents WHERE id = ?", documentId);
    await embeddingService.deleteDocumentEmbeddings(documentId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete document",
      },
      500,
    );
  }
});

// Vector search endpoint
app.post("/api/search", async (c) => {
  try {
    const body = await c.req.json();
    const { query, limit, threshold, documentIds } =
      SearchRequestSchema.parse(body);

    const embeddingService = getEmbeddingService();
    const results = await embeddingService.searchSimilar(query, {
      limit: limit || 10,
      threshold: threshold || 0.7,
      ...(documentIds && { documentIds }),
    });

    return c.json({
      query,
      results: results.map((result) => ({
        document_id: result.document_id,
        chunk_id: result.chunk.id,
        content: result.chunk.content,
        similarity: result.similarity,
        metadata: result.metadata,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
      },
      500,
    );
  }
});

// Conversation management endpoints
app.post("/api/conversations", async (c) => {
  try {
    const body = await c.req.json();
    const { title, userId } = ConversationRequestSchema.parse(body);

    const conversationId = nanoid();
    const dbManager = getDatabaseManager();

    dbManager.run(
      "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
      conversationId,
      userId || null,
      title || null,
    );

    const conversation = dbManager.get(
      "SELECT * FROM conversations WHERE id = ?",
      conversationId,
    );

    return c.json({ conversation }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create conversation",
      },
      500,
    );
  }
});

app.get("/api/conversations", async (c) => {
  try {
    const userId = c.req.query("userId");
    const dbManager = getDatabaseManager();

    let conversations;
    if (userId) {
      conversations = dbManager.query(
        "SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC",
        userId,
      );
    } else {
      conversations = dbManager.query(
        "SELECT * FROM conversations ORDER BY created_at DESC",
      );
    }

    return c.json({ conversations });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch conversations",
      },
      500,
    );
  }
});

app.get("/api/conversations/:id", async (c) => {
  try {
    const conversationId = c.req.param("id");
    const dbManager = getDatabaseManager();

    const conversation = dbManager.get(
      "SELECT * FROM conversations WHERE id = ?",
      conversationId,
    );
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    const messages = dbManager.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      conversationId,
    );

    return c.json({
      conversation,
      messages: messages.map((msg: any) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
      })),
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch conversation",
      },
      500,
    );
  }
});

app.delete("/api/conversations/:id", async (c) => {
  try {
    const conversationId = c.req.param("id");
    const dbManager = getDatabaseManager();

    dbManager.run("DELETE FROM conversations WHERE id = ?", conversationId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete conversation",
      },
      500,
    );
  }
});

// Summary generation endpoint
app.post("/api/summarize", async (c) => {
  try {
    const body = await c.req.json();
    const { content } = z.object({ content: z.string() }).parse(body);

    const aiService = getAIServiceOrThrow();
    const summary = await aiService.summarizeDocument(content);

    return c.json({ summary });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate summary",
      },
      500,
    );
  }
});

// Database stats endpoint
app.get("/api/stats", async (c) => {
  try {
    const stats = getDatabaseManager().getStats();
    return c.json({ stats });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      500,
    );
  }
});

// AI Service
let aiService: ReturnType<typeof getAIService> | null = null;

// Dialect Services
let dialectAlertsService: ReturnType<typeof createDialectAlertsService>;
let dialectMarketsService: ReturnType<typeof createDialectMarketsService>;
let dialectPositionsService: ReturnType<typeof createDialectPositionsService>;
let dialectBlinksService: ReturnType<typeof createDialectBlinksService>;
let dialectAuthService: ReturnType<typeof createDialectAuthService>;
let dialectInboxService: ReturnType<typeof createDialectInboxService>;
let dialectMCPService: ReturnType<typeof createDialectMCPService>;
let dialectMonitoringService: ReturnType<typeof createDialectMonitoringService>;

// Agent Management Routes
let agentManager: AgentManager;

// Create agent
app.post("/api/agents", async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.req.header("X-User-ID"); // Optional user identification

    const agent = await agentManager.createAgent(
      body as CreateAgentRequest,
      userId,
    );
    return c.json({ agent }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      500,
    );
  }
});

// Get all agents
app.get("/api/agents", async (c) => {
  try {
    const userId = c.req.query("userId");
    const agents = userId
      ? agentManager.getAgentsByUser(userId)
      : agentManager.getAllAgents();

    return c.json({ agents });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch agents",
      },
      500,
    );
  }
});

// Get agent by ID
app.get("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const agent = agentManager.getAgent(agentId);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json({ agent });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch agent",
      },
      500,
    );
  }
});

// Seed an example agent with Dialect triggers
app.post("/api/agents/seed-example", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as any;
    const tokenSymbol = body.tokenSymbol || "SOL";
    const thresholdPercentage = typeof body.thresholdPercentage === 'number' ? body.thresholdPercentage : 10;
    const window = body.window || "24h";
    const marketCapMin = typeof body.marketCapMin === 'number' ? body.marketCapMin : 5_000_000;
    const liquidityMin = typeof body.liquidityMin === 'number' ? body.liquidityMin : 500_000;
    const priceChange24hMin = typeof body.priceChange24hMin === 'number' ? body.priceChange24hMin : 5;

    // Base actions
    const actions = [
      {
        name: "AI Analysis",
        description: "Analyze Dialect event",
        type: "ai_response" as const,
        configuration: {},
        isActive: true,
      },
      {
        name: "Notify (stub)",
        description: "Send stub notification",
        type: "send_notification" as const,
        configuration: { channel: "IN_APP" },
        isActive: true,
      },
    ];

    // Create agent with actions first (no triggers so we can wire action IDs)
    const agent = await agentManager.createAgent({
      name: "Example Dialect Agent",
      description: "Reacts to Dialect price change and trending token events",
      aiConfig: {
        model: "gpt-4o",
        provider: "openai",
        temperature: 0.7,
        maxTokens: 800,
        enableRag: true,
        systemPrompt: "You are a proactive blockchain event analyst. Summarize incoming Dialect events and recommend next steps.",
        contextMemory: 6,
      },
      actions,
      eventTriggers: [],
      settings: { enableDetailedLogging: true },
    });

    // Resolve created action IDs
    const aiActionId = agent.actions.find((a) => a.name === "AI Analysis")?.id;
    const notifyActionId = agent.actions.find((a) => a.name === "Notify (stub)")?.id;
    if (!aiActionId || !notifyActionId) {
      return c.json({ error: "Failed to create base actions" }, 500);
    }

    // Build triggers with real action IDs
    const triggers = [
      {
        id: nanoid(),
        name: `Price Surge ≥ ${thresholdPercentage}% (${window}) - ${tokenSymbol}`,
        description: "On significant price change, analyze and notify",
        isActive: true,
        eventType: "token_price_change" as const,
        conditions: [
          { field: "parsedData.token.symbol", operator: "equals", value: tokenSymbol },
          { field: "parsedData.changeNormalized.window", operator: "equals", value: window, logicalOperator: "AND" },
          { field: "parsedData.changeNormalized.percentage", operator: "greater_than", value: thresholdPercentage, logicalOperator: "AND" },
        ],
        actions: [aiActionId, notifyActionId],
        cooldown: 3600,
        priority: "high" as const,
      },
      {
        id: nanoid(),
        name: "Trending Token High Quality",
        description: "On trending token event, analyze and notify",
        isActive: true,
        eventType: "trending_token" as const,
        conditions: [
          { field: "parsedData.metrics.marketCap", operator: "greater_than", value: marketCapMin },
          { field: "parsedData.metrics.liquidity", operator: "greater_than", value: liquidityMin, logicalOperator: "AND" },
          { field: "parsedData.metrics.priceChange24h", operator: "greater_than", value: priceChange24hMin, logicalOperator: "AND" },
        ],
        actions: [aiActionId, notifyActionId],
        cooldown: 7200,
        priority: "medium" as const,
      },
    ];

    const updated = await agentManager.updateAgent(agent.id, { eventTriggers: triggers });

    return c.json({ agent: updated });
  } catch (error) {
    console.error("❌ Seed example agent error:", error);
    return c.json({ error: "Failed to seed example agent" }, 500);
  }
});
// Update agent
app.put("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const body = await c.req.json();

    const agent = await agentManager.updateAgent(
      agentId,
      body as UpdateAgentRequest,
    );
    return c.json({ agent });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update agent",
      },
      500,
    );
  }
});

// Delete agent
app.delete("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    await agentManager.deleteAgent(agentId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete agent",
      },
      500,
    );
  }
});

// Agent Chat Routes

// Start chat session
app.post("/api/agents/:id/chat", async (c) => {
  try {
    const agentId = c.req.param("id");
    const userId = c.req.header("X-User-ID");

    const session = await agentManager.startChatSession(agentId, userId);
    return c.json({ session }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start chat session",
      },
      500,
    );
  }
});

// Send message to agent
app.post("/api/chat/:sessionId/messages", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const userId = c.req.header("X-User-ID");

    const { content } = z.object({ content: z.string() }).parse(body);

    const message = await agentManager.sendMessage(sessionId, content, userId);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send message",
      },
      500,
    );
  }
});

// Get chat session
app.get("/api/chat/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = agentManager.getChatSession(sessionId);

    if (!session) {
      return c.json({ error: "Chat session not found" }, 404);
    }

    return c.json({ session });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch chat session",
      },
      500,
    );
  }
});

// Close chat session
app.delete("/api/chat/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    await agentManager.closeChatSession(sessionId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to close chat session",
      },
      500,
    );
  }
});

// Dialect Webhook Endpoint
app.post("/api/webhooks/dialect", async (c) => {
  try {
    const signatureHeader = (process.env.DIALECT_WEBHOOK_SIGNATURE_HEADER || "X-Dialect-Signature").toLowerCase();
    const encoding = (process.env.DIALECT_WEBHOOK_SIGNATURE_ENCODING || "hex").toLowerCase();
    const strict = String(process.env.DIALECT_WEBHOOK_STRICT || "false").toLowerCase() === "true";
    const secret = process.env.DIALECT_WEBHOOK_SECRET || "";

    // Read raw body for signature verification
    const rawText = await c.req.text();

    // Verify signature when secret is present
    if (secret) {
      const provided = c.req.header(signatureHeader) || c.req.header(signatureHeader.toLowerCase());
      if (!provided) {
        const msg = `Missing webhook signature header: ${signatureHeader}`;
        console.warn(`⚠️ ${msg}`);
        return strict ? c.text(msg, 401) : c.text("OK", 200);
      }

      try {
        const hmac = createHmac("sha256", secret).update(rawText).digest(encoding as "hex" | "base64");
        // timing-safe compare
        const a = Buffer.from(hmac, encoding as BufferEncoding);
        const b = Buffer.from(provided, encoding as BufferEncoding);
        const match = a.length === b.length && timingSafeEqual(a, b);
        if (!match) {
          console.warn("⚠️ Webhook signature verification failed");
          return strict ? c.text("Invalid signature", 401) : c.text("OK", 200);
        }
      } catch (e) {
        console.warn("⚠️ Webhook signature verification error:", e);
        return strict ? c.text("Signature error", 401) : c.text("OK", 200);
      }
    }

    // Parse JSON after verification
    const parsed = rawText ? JSON.parse(rawText) : {};
    const events = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.events)
        ? parsed.events
        : parsed.event
          ? [parsed]
          : [];

    // Enqueue for background processing; ack immediately to Dialect
    if (events.length > 0 && queuesReady()) {
      await enqueueDialectEvents(events);
    } else if (agentManager && (agentManager as any)["dialectMonitor"]) {
      // Fallback: process inline if queues not ready
      (agentManager as any)["dialectMonitor"].processDialectWebhook(events);
    }

    // Respond 200 OK (Dialect typically expects 2xx to stop retries)
    return c.text("OK", 200);
  } catch (error) {
    console.error("❌ Dialect webhook error:", error);
    // Still return 200 OK to prevent provider retry storms unless strict is set
    const strict = String(process.env.DIALECT_WEBHOOK_STRICT || "false").toLowerCase() === "true";
    return strict ? c.text("Error", 500) : c.text("OK", 200);
  }
});

// Dialect Webhook Test Endpoint (echo + normalization + trigger matches)
app.post("/api/webhooks/dialect/test", async (c) => {
  try {
    const rawText = await c.req.text();
    const parsed = rawText ? JSON.parse(rawText) : {};
    const events = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.events)
        ? parsed.events
        : parsed.event
          ? [parsed]
          : [];

    // Preview normalized events
    if (agentManager && (agentManager as any)["dialectMonitor"]) {
      const monitor = (agentManager as any)["dialectMonitor"];
      const normalized = monitor.previewNormalizedEvents(events);

      // Compute matching triggers for each event
      const matches = normalized.map((evt: any) => ({
        eventId: evt.id,
        type: evt.type,
        matches: monitor.findMatchingTriggersForEvent(evt)
          .map((m: any) => ({ agentId: m.agentId, trigger: { id: m.trigger.id, name: m.trigger.name } })),
      }));

      return c.json({
        received: events.length,
        normalized,
        matches,
      });
    }

    return c.json({ error: "Dialect monitor not initialized" }, 500);
  } catch (error) {
    console.error("❌ Dialect webhook test error:", error);
    return c.json({ error: "Failed to process test payload" }, 500);
  }
});

// Event Monitoring Routes

// Get recent events
app.get("/api/events", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "100");
    const eventType = c.req.query("type");

    const events = eventType
      ? agentManager["dialectMonitor"].getEventsByType(eventType as any, limit)
      : agentManager["dialectMonitor"].getRecentEvents(limit);

    return c.json({ events });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch events",
      },
      500,
    );
  }
});

// Get monitoring status
app.get("/api/events/status", async (c) => {
  try {
    const stats = agentManager["dialectMonitor"].getStats();
    const globalStats = agentManager.getGlobalStats();

    return c.json({
      monitoring: stats,
      agents: globalStats,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch monitoring status",
      },
      500,
    );
  }
});

// Get agent execution history
app.get("/api/agents/:id/executions", async (c) => {
  try {
    const agentId = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "50");

    const executions = agentManager.getAgentExecutions(agentId, limit);
    return c.json({ executions });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch agent executions",
      },
      500,
    );
  }
});

// Get recent executions (all agents)
app.get("/api/executions", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const executions = agentManager.getRecentExecutions(limit);
    return c.json({ executions });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch executions",
      },
      500,
    );
  }
});

// Get agent metrics
app.get("/api/agents/:id/metrics", async (c) => {
  try {
    const agentId = c.req.param("id");
    const metrics = agentManager.getAgentMetrics(agentId);

    return c.json({ metrics });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch agent metrics",
      },
      500,
    );
  }
});

// Dialect Alerts Routes

// Send alert
app.post("/api/dialect/alerts/send", async (c) => {
  try {
    const body = await c.req.json();
    const result = await dialectAlertsService.sendAlert(body);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send alert",
      },
      500,
    );
  }
});

// Send batch alerts
app.post("/api/dialect/alerts/send-batch", async (c) => {
  try {
    const body = await c.req.json();
    const result = await dialectAlertsService.sendBatchAlerts(body);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send batch alerts",
      },
      500,
    );
  }
});

// Send price alert
app.post("/api/dialect/alerts/price", async (c) => {
  try {
    const { walletAddress, tokenSymbol, priceChange, currentPrice, channels } = await c.req.json();
    const result = await dialectAlertsService.sendPriceAlert(
      walletAddress,
      tokenSymbol,
      priceChange,
      currentPrice,
      channels
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send price alert",
      },
      500,
    );
  }
});

// Send liquidation warning
app.post("/api/dialect/alerts/liquidation", async (c) => {
  try {
    const { walletAddress, protocol, collateralToken, healthFactor, channels } = await c.req.json();
    const result = await dialectAlertsService.sendLiquidationWarning(
      walletAddress,
      protocol,
      collateralToken,
      healthFactor,
      channels
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send liquidation warning",
      },
      500,
    );
  }
});

// Broadcast message
app.post("/api/dialect/alerts/broadcast", async (c) => {
  try {
    const { title, body, channels, topicId } = await c.req.json();
    const result = await dialectAlertsService.broadcastMessage(title, body, channels, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to broadcast message",
      },
      500,
    );
  }
});

// Dialect Markets Routes

// Get all markets
app.get("/api/dialect/markets", async (c) => {
  try {
    if (!dialectMarketsService) {
      return c.json({
        error: "Dialect Markets service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const protocol = c.req.query("protocol");
    const type = c.req.query("type");
    const tokenSymbol = c.req.query("token");
    const minApy = c.req.query("minApy") ? parseFloat(c.req.query("minApy")!) : undefined;
    const maxApy = c.req.query("maxApy") ? parseFloat(c.req.query("maxApy")!) : undefined;
    const minTvl = c.req.query("minTvl") ? parseFloat(c.req.query("minTvl")!) : undefined;
    const maxTvl = c.req.query("maxTvl") ? parseFloat(c.req.query("maxTvl")!) : undefined;

    const filters = {
      ...(protocol && { protocol }),
      ...(type && { type: type as any }),
      ...(tokenSymbol && { tokenSymbol }),
      ...(minApy !== undefined && { minApy }),
      ...(maxApy !== undefined && { maxApy }),
      ...(minTvl !== undefined && { minTvl }),
      ...(maxTvl !== undefined && { maxTvl }),
    };

    const result = await dialectMarketsService.getMarkets(filters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch markets",
      },
      500,
    );
  }
});

// Get markets grouped by type
app.get("/api/dialect/markets/grouped", async (c) => {
  try {
    if (!dialectMarketsService) {
      return c.json({
        error: "Dialect Markets service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const result = await dialectMarketsService.getMarketsGroupedByType();
    return c.json({ markets: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch grouped markets",
      },
      500,
    );
  }
});

// Get market statistics
app.get("/api/dialect/markets/stats", async (c) => {
  try {
    if (!dialectMarketsService) {
      return c.json({
        error: "Dialect Markets service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const result = await dialectMarketsService.getMarketStats();
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch market stats",
      },
      500,
    );
  }
});

// Search markets
app.get("/api/dialect/markets/search", async (c) => {
  try {
    if (!dialectMarketsService) {
      return c.json({
        error: "Dialect Markets service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }
    const result = await dialectMarketsService.searchMarkets(query);
    return c.json({ markets: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to search markets",
      },
      500,
    );
  }
});

// Dialect Positions Routes

// Get positions by wallet
app.get("/api/dialect/positions/:walletAddress", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const protocol = c.req.query("protocol");
    const type = c.req.query("type");
    const minValue = c.req.query("minValue") ? parseFloat(c.req.query("minValue")!) : undefined;
    const maxValue = c.req.query("maxValue") ? parseFloat(c.req.query("maxValue")!) : undefined;
    const status = c.req.query("status");
    const healthFactorThreshold = c.req.query("healthFactorThreshold") 
      ? parseFloat(c.req.query("healthFactorThreshold")!) 
      : undefined;

    const filters = {
      ...(protocol && { protocol }),
      ...(type && { type: type as any }),
      ...(minValue !== undefined && { minValue }),
      ...(maxValue !== undefined && { maxValue }),
      ...(status && { status: status as any }),
      ...(healthFactorThreshold !== undefined && { healthFactorThreshold }),
    };

    const result = await dialectPositionsService.getPositionsByWallet(walletAddress, filters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch positions",
      },
      500,
    );
  }
});

// Get position summary
app.get("/api/dialect/positions/:walletAddress/summary", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const result = await dialectPositionsService.getPositionSummary(walletAddress);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch position summary",
      },
      500,
    );
  }
});

// Get at-risk positions
app.get("/api/dialect/positions/:walletAddress/at-risk", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const threshold = c.req.query("threshold") ? parseFloat(c.req.query("threshold")!) : 1.5;
    const result = await dialectPositionsService.getAtRiskPositions(walletAddress, threshold);
    return c.json({ positions: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch at-risk positions",
      },
      500,
    );
  }
});

// Dialect Blinks Routes

// Get blink preview
app.get("/api/dialect/blinks/preview", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlinkPreview(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink preview",
      },
      500,
    );
  }
});

// Get full blink data
app.get("/api/dialect/blinks/data", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlink(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink data",
      },
      500,
    );
  }
});

// Get blink data table
app.get("/api/dialect/blinks/data-table", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlinkDataTable(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink data table",
      },
      500,
    );
  }
});

// Execute blink action
app.post("/api/dialect/blinks/execute", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const { blinkUrl, walletAddress, parameters } = await c.req.json();
    
    if (!blinkUrl || !walletAddress) {
      return c.json({ error: "blinkUrl and walletAddress are required" }, 400);
    }
    
    const result = await dialectBlinksService.executeBlinkAction(blinkUrl, walletAddress, parameters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute blink action",
      },
      500,
    );
  }
});

// Get popular blinks
app.get("/api/dialect/blinks/popular", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const category = c.req.query("category");
    const result = await dialectBlinksService.getPopularBlinks(category);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch popular blinks",
      },
      500,
    );
  }
});

// Search blinks
app.get("/api/dialect/blinks/search", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }
    
    const result = await dialectBlinksService.searchBlinks(query);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to search blinks",
      },
      500,
    );
  }
});

// Get blinks by provider
app.get("/api/dialect/blinks/provider/:provider", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const provider = c.req.param("provider");
    const result = await dialectBlinksService.getBlinksByProvider(provider);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blinks by provider",
      },
      500,
    );
  }
});

// Validate blink URL
app.get("/api/dialect/blinks/validate", async (c) => {
  try {
    if (!dialectBlinksService) {
      return c.json({
        error: "Dialect Blinks service not configured",
        hint: "Set DIALECT_API_KEY (and optionally DIALECT_API_URL) on the server",
      }, 503);
    }
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const isValid = dialectBlinksService.isValidBlinkUrl(url);
    const metadata = dialectBlinksService.extractBlinkMetadata(url);
    
    return c.json({
      isValid,
      metadata,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to validate blink URL",
      },
      500,
    );
  }
});

// Dialect Authentication Routes

// Prepare authentication
app.post("/api/dialect/auth/prepare", async (c) => {
  try {
    const { walletAddress } = await c.req.json();
    
    if (!walletAddress) {
      return c.json({ error: "walletAddress is required" }, 400);
    }
    
    const result = await dialectAuthService.prepareAuth(walletAddress);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to prepare authentication",
      },
      500,
    );
  }
});

// Verify authentication
app.post("/api/dialect/auth/verify", async (c) => {
  try {
    const { message, signature } = await c.req.json();
    
    if (!message || !signature) {
      return c.json({ error: "message and signature are required" }, 400);
    }
    
    const result = await dialectAuthService.verifyAuth(message, signature);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to verify authentication",
      },
      500,
    );
  }
});

// Get authenticated user
app.get("/api/dialect/auth/me", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getAuthenticatedUser(token);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get authenticated user",
      },
      500,
    );
  }
});

// Get user subscriptions
app.get("/api/dialect/auth/subscriptions", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getUserSubscriptions(token);
    return c.json({ subscriptions: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get user subscriptions",
      },
      500,
    );
  }
});

// Subscribe to app
app.post("/api/dialect/auth/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { appId: bodyAppId, channels } = await c.req.json();
    const appId = bodyAppId || process.env.DIALECT_APP_ID;
    
    if (!appId) {
      return c.json({ error: "appId is required (or set DIALECT_APP_ID)" }, 400);
    }
    
    const result = await dialectAuthService.subscribeToApp(token, appId, channels);
    return c.json({ subscription: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to app",
      },
      500,
    );
  }
});

// Unsubscribe from app
app.delete("/api/dialect/auth/subscribe/:subscriptionId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const subscriptionId = c.req.param("subscriptionId");
    
    const result = await dialectAuthService.unsubscribeFromApp(token, subscriptionId);
    return c.json({ success: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from app",
      },
      500,
    );
  }
});

// Get available apps
app.get("/api/dialect/auth/apps", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getAvailableApps(token);
    return c.json({ apps: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get available apps",
      },
      500,
    );
  }
});

// Dialect Inbox Routes

// Get notification history
app.get("/api/dialect/inbox/notifications", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.query("appId");
    const limit = c.req.query("limit");
    const cursor = c.req.query("cursor");
    const unreadOnly = c.req.query("unreadOnly") === "true";
    
    const result = await dialectInboxService.getNotificationHistory(token, {
      ...(appId && { appId }),
      ...(limit && { limit: parseInt(limit) }),
      ...(cursor && { cursor }),
      ...(unreadOnly && { unreadOnly }),
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get notification history",
      },
      500,
    );
  }
});

// Get notification summary
app.get("/api/dialect/inbox/summary", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.query("appId");
    
    const result = await dialectInboxService.getNotificationSummary(token, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get notification summary",
      },
      500,
    );
  }
});

// Mark notifications as read
app.post("/api/dialect/inbox/read", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const request = await c.req.json();
    
    const result = await dialectInboxService.markNotificationsRead(token, request);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to mark notifications as read",
      },
      500,
    );
  }
});

// Clear notification history
app.post("/api/dialect/inbox/clear", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const request = await c.req.json();
    
    const result = await dialectInboxService.clearNotificationHistory(token, request);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear notification history",
      },
      500,
    );
  }
});

// Get user channels
app.get("/api/dialect/inbox/channels", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectInboxService.getUserChannels(token);
    return c.json({ channels: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get user channels",
      },
      500,
    );
  }
});

// Update channel configuration
app.patch("/api/dialect/inbox/channels/:channelType", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const channelType = c.req.param("channelType") as 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH';
    const config = await c.req.json();
    
    const result = await dialectInboxService.updateChannel(token, channelType, config);
    return c.json({ channel: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to update channel",
      },
      500,
    );
  }
});

// Prepare email channel
app.post("/api/dialect/inbox/channels/email/prepare", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({ error: "email is required" }, 400);
    }
    
    const result = await dialectInboxService.prepareEmailChannel(token, email);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to prepare email channel",
      },
      500,
    );
  }
});

// Verify email channel
app.post("/api/dialect/inbox/channels/email/verify", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { code } = await c.req.json();
    
    if (!code) {
      return c.json({ error: "verification code is required" }, 400);
    }
    
    const result = await dialectInboxService.verifyEmailChannel(token, code);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to verify email channel",
      },
      500,
    );
  }
});

// Subscribe to push notifications
app.post("/api/dialect/inbox/channels/push/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { deviceId, fcmToken, appId } = await c.req.json();
    
    if (!deviceId || !fcmToken) {
      return c.json({ error: "deviceId and fcmToken are required" }, 400);
    }
    
    const result = await dialectInboxService.subscribeToPushNotifications(token, deviceId, fcmToken, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to push notifications",
      },
      500,
    );
  }
});

// Unsubscribe from push notifications
app.post("/api/dialect/inbox/channels/push/unsubscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { deviceId, appId } = await c.req.json();
    
    if (!deviceId) {
      return c.json({ error: "deviceId is required" }, 400);
    }
    
    const result = await dialectInboxService.unsubscribeFromPushNotifications(token, deviceId, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from push notifications",
      },
      500,
    );
  }
});

// Get app topics
app.get("/api/dialect/inbox/apps/:appId/topics", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.param("appId");
    
    const result = await dialectInboxService.getAppTopics(token, appId);
    return c.json({ topics: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get app topics",
      },
      500,
    );
  }
});

// Subscribe to topic
app.post("/api/dialect/inbox/topics/:topicId/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const topicId = c.req.param("topicId");
    
    const result = await dialectInboxService.subscribeToTopic(token, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to topic",
      },
      500,
    );
  }
});

// Unsubscribe from topic
app.post("/api/dialect/inbox/topics/:topicId/unsubscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const topicId = c.req.param("topicId");
    
    const result = await dialectInboxService.unsubscribeFromTopic(token, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from topic",
      },
      500,
    );
  }
});

// Initialize services and start server
async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "localhost";

  try {
    console.log("🚀 Initializing services...");

    // Initialize database
    await initializeDatabase();
    console.log("✅ Database initialized");

    // Initialize embedding service
    await initializeEmbeddingService();
    console.log("✅ Embedding service initialized");

    // Initialize AI service
    try {
      aiService = initializeAIService();
      if (aiService) {
        console.log("✅ AI service initialized");
      } else {
        console.log("⚠️ AI service disabled (no API keys configured)");
      }
    } catch (error) {
      console.error("❌ AI service failed to initialize:", error);
      console.log("⚠️ Continuing without AI service for testing");
      aiService = null;
    }

    // Initialize Dialect services
    try {
      dialectAlertsService = createDialectAlertsService();
      console.log("✅ Dialect Alerts service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Alerts service failed to initialize:", error);
    }

    try {
      dialectMarketsService = createDialectMarketsService();
      console.log("✅ Dialect Markets service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Markets service failed to initialize:", error);
    }

    try {
      dialectPositionsService = createDialectPositionsService();
      console.log("✅ Dialect Positions service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Positions service failed to initialize:", error);
    }

    try {
      dialectBlinksService = createDialectBlinksService();
      console.log("✅ Dialect Blinks service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Blinks service failed to initialize:", error);
    }

    try {
      dialectAuthService = createDialectAuthService();
      console.log("✅ Dialect Auth service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Auth service failed to initialize:", error);
    }

    try {
      dialectInboxService = createDialectInboxService();
      console.log("✅ Dialect Inbox service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Inbox service failed to initialize:", error);
    }

    // Initialize Dialect MCP Service
    try {
      dialectMCPService = createDialectMCPService({
        apiKey: process.env.DIALECT_API_KEY || 'test-key',
        baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
        clientKey: process.env.DIALECT_CLIENT_KEY || 'test-client-key',
        appId: process.env.DIALECT_APP_ID || 'test-app-id',
      });
      await dialectMCPService.initialize();
      console.log("✅ Dialect MCP service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect MCP service failed to initialize:", error);
    }

    // Initialize Dialect Monitoring Service
    try {
      dialectMonitoringService = createDialectMonitoringService({
        apiKey: process.env.DIALECT_API_KEY || 'test-key',
        baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
        webhookUrl: process.env.DIALECT_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/dialect',
        monitoringInterval: 30000, // 30 seconds
        maxRetries: 3,
        retryDelay: 5000,
      });
      await dialectMonitoringService.initialize();
      console.log("✅ Dialect Monitoring service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Monitoring service failed to initialize:", error);
    }

    // Initialize agent manager
    agentManager = new AgentManager();
    
    // Configure Dialect services with agent manager
    agentManager.setDialectServices({
      alerts: dialectAlertsService,
      markets: dialectMarketsService,
      positions: dialectPositionsService,
      blinks: dialectBlinksService,
    });
    
    await agentManager.initialize();
    console.log("✅ Agent manager initialized");

    // Initialize queues (for offline/background processing)
    try {
      await initializeQueues(agentManager as any);
      console.log("✅ Queues initialized");
    } catch (error) {
      console.warn("⚠️ Queue initialization failed:", error);
    }

    // Setup graceful shutdown
    setupGracefulShutdown();

    console.log(`🌟 Server starting on http://${host}:${port}`);

    // Start the server using Bun's native serve
    Bun.serve({
      fetch: app.fetch,
      port,
      hostname: host,
    });

    console.log(`✨ Server running on http://${host}:${port}`);
    console.log("\nAvailable endpoints:");
    console.log("  GET    /health                 - Health check");
    console.log("  POST   /api/chat               - Chat completions");
    console.log("  POST   /api/documents          - Create document");
    console.log("  GET    /api/documents          - List documents");
    console.log("  GET    /api/documents/:id      - Get document");
    console.log("  DELETE /api/documents/:id      - Delete document");
    console.log("  POST   /api/search             - Vector search");
    console.log("  POST   /api/conversations      - Create conversation");
    console.log("  GET    /api/conversations      - List conversations");
    console.log("  GET    /api/conversations/:id  - Get conversation");
    console.log("  DELETE /api/conversations/:id  - Delete conversation");
    console.log("  POST   /api/summarize          - Generate summary");
    console.log("  GET    /api/stats              - Database statistics");
    console.log("");
    console.log("Agent Management:");
    console.log("  POST   /api/agents             - Create agent");
    console.log("  GET    /api/agents             - List agents");
    console.log("  GET    /api/agents/:id         - Get agent");
    console.log("  PUT    /api/agents/:id         - Update agent");
    console.log("  DELETE /api/agents/:id         - Delete agent");
    console.log("");
    console.log("Utilities:");
    console.log("  POST   /api/agents/seed-example - Create example agent with triggers");
    console.log("");
    console.log("Dialect Webhooks:");
    console.log("  POST   /api/webhooks/dialect   - Webhook endpoint (prod)");
    console.log("  POST   /api/webhooks/dialect/test - Test normalization + matches");
    console.log("");
    console.log("Agent Chat:");
    console.log("  POST   /api/agents/:id/chat    - Start chat session");
    console.log("  POST   /api/chat/:id/messages  - Send message");
    console.log("  GET    /api/chat/:id           - Get chat session");
    console.log("  DELETE /api/chat/:id           - Close chat session");
    console.log("");
    console.log("Event Monitoring:");
    console.log("  POST   /api/webhooks/dialect   - Dialect webhook endpoint");
    console.log("  GET    /api/events             - Get recent events");
    console.log("  GET    /api/events/status      - Get monitoring status");
    console.log("  GET    /api/agents/:id/executions - Get agent executions");
    console.log("  GET    /api/agents/:id/metrics - Get agent metrics");
    console.log("");
    console.log("Dialect Alerts:");
    console.log("  POST   /api/dialect/alerts/send - Send alert");
    console.log("  POST   /api/dialect/alerts/send-batch - Send batch alerts");
    console.log("  POST   /api/dialect/alerts/price - Send price alert");
    console.log("  POST   /api/dialect/alerts/liquidation - Send liquidation warning");
    console.log("  POST   /api/dialect/alerts/broadcast - Broadcast message");
    console.log("");
    console.log("Dialect Markets:");
    console.log("  GET    /api/dialect/markets - Get all markets");
    console.log("  GET    /api/dialect/markets/grouped - Get markets grouped by type");
    console.log("  GET    /api/dialect/markets/stats - Get market statistics");
    console.log("  GET    /api/dialect/markets/search - Search markets");
    console.log("");
    console.log("Dialect Positions:");
    console.log("  GET    /api/dialect/positions/:wallet - Get positions by wallet");
    console.log("  GET    /api/dialect/positions/:wallet/summary - Get position summary");
    console.log("  GET    /api/dialect/positions/:wallet/at-risk - Get at-risk positions");
    console.log("");
    console.log("Dialect Blinks:");
    console.log("  GET    /api/dialect/blinks/preview - Get blink preview");
    console.log("  GET    /api/dialect/blinks/data - Get full blink data");
    console.log("  GET    /api/dialect/blinks/data-table - Get blink data table");
    console.log("  POST   /api/dialect/blinks/execute - Execute blink action");
    console.log("  GET    /api/dialect/blinks/popular - Get popular blinks");
    console.log("  GET    /api/dialect/blinks/search - Search blinks");
    console.log("  GET    /api/dialect/blinks/provider/:provider - Get blinks by provider");
    console.log("  GET    /api/dialect/blinks/validate - Validate blink URL");
    console.log("");
    console.log("Dialect Authentication:");
    console.log("  POST   /api/dialect/auth/prepare - Prepare authentication");
    console.log("  POST   /api/dialect/auth/verify - Verify authentication");
    console.log("  GET    /api/dialect/auth/me - Get authenticated user");
    console.log("  GET    /api/dialect/auth/subscriptions - Get user subscriptions");
    console.log("  POST   /api/dialect/auth/subscribe - Subscribe to app");
    console.log("  DELETE /api/dialect/auth/subscribe/:id - Unsubscribe from app");
    console.log("  GET    /api/dialect/auth/apps - Get available apps");
    console.log("");
    console.log("Dialect Inbox:");
    console.log("  GET    /api/dialect/inbox/notifications - Get notification history");
    console.log("  GET    /api/dialect/inbox/summary - Get notification summary");
    console.log("  POST   /api/dialect/inbox/read - Mark notifications as read");
    console.log("  POST   /api/dialect/inbox/clear - Clear notification history");
    console.log("  GET    /api/dialect/inbox/channels - Get user channels");
    console.log("  PATCH  /api/dialect/inbox/channels/:type - Update channel config");
    console.log("  POST   /api/dialect/inbox/channels/email/prepare - Prepare email channel");
    console.log("  POST   /api/dialect/inbox/channels/email/verify - Verify email channel");
    console.log("  POST   /api/dialect/inbox/channels/push/subscribe - Subscribe to push");
    console.log("  POST   /api/dialect/inbox/channels/push/unsubscribe - Unsubscribe from push");
    console.log("  GET    /api/dialect/inbox/apps/:id/topics - Get app topics");
    console.log("  POST   /api/dialect/inbox/topics/:id/subscribe - Subscribe to topic");
    console.log("  POST   /api/dialect/inbox/topics/:id/unsubscribe - Unsubscribe from topic");
    console.log("");
    console.log("Dialect MCP Service:");
    console.log("  GET    /api/dialect/mcp/status - Get MCP service status");
    console.log("  GET    /api/dialect/mcp/blinks - Get available Blinks");
    console.log("  GET    /api/dialect/mcp/markets - Get market data via MCP");
    console.log("  POST   /api/dialect/mcp/blinks/execute - Execute Blink action");
    console.log("  POST   /api/dialect/mcp/alerts/template - Create alert template");
    console.log("  POST   /api/dialect/mcp/alerts/send - Send alert via template");
    console.log("  GET    /api/dialect/mcp/docs/search - Search documentation");
    console.log("");
    console.log("Dialect Monitoring Service:");
    console.log("  GET    /api/dialect/monitoring/status - Get monitoring status");
    console.log("  GET    /api/dialect/monitoring/rules - Get monitoring rules");
    console.log("  POST   /api/dialect/monitoring/rules - Add monitoring rule");
    console.log("  PUT    /api/dialect/monitoring/rules/:id - Update monitoring rule");
    console.log("  DELETE /api/dialect/monitoring/rules/:id - Delete monitoring rule");
    console.log("  GET    /api/dialect/monitoring/events - Get recent events");
    console.log("  GET    /api/dialect/monitoring/stats - Get monitoring stats");
    console.log("  POST   /api/dialect/monitoring/start - Start monitoring");
    console.log("  POST   /api/dialect/monitoring/stop - Stop monitoring");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Dialect MCP Service Routes
app.get("/api/dialect/mcp/status", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const status = dialectMCPService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("❌ MCP status error:", error);
    return c.json({ error: "Failed to get MCP status" }, 500);
  }
});

app.get("/api/dialect/mcp/blinks", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const category = c.req.query('category');
    const blinks = await dialectMCPService.getAvailableBlinks(category);
    return c.json({ blinks });
  } catch (error) {
    console.error("❌ MCP blinks error:", error);
    return c.json({ error: "Failed to get available blinks" }, 500);
  }
});

app.get("/api/dialect/mcp/markets", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const protocol = c.req.query('protocol');
    const token = c.req.query('token');
    const minApy = c.req.query('minApy') ? parseFloat(c.req.query('minApy')!) : undefined;
    const maxApy = c.req.query('maxApy') ? parseFloat(c.req.query('maxApy')!) : undefined;

    const markets = await dialectMCPService.getMarketData({
      ...(protocol && { protocol }),
      ...(token && { token }),
      ...(minApy && { minApy }),
      ...(maxApy && { maxApy }),
    });
    return c.json({ markets });
  } catch (error) {
    console.error("❌ MCP markets error:", error);
    return c.json({ error: "Failed to get market data" }, 500);
  }
});

app.post("/api/dialect/mcp/blinks/execute", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const { blinkUrl, parameters, walletAddress } = await c.req.json();

    if (!blinkUrl || !walletAddress) {
      return c.json({ error: "blinkUrl and walletAddress are required" }, 400);
    }

    const result = await dialectMCPService.executeBlink(blinkUrl, parameters || {}, walletAddress);
    return c.json(result);
  } catch (error) {
    console.error("❌ MCP blink execution error:", error);
    return c.json({ error: "Failed to execute blink" }, 500);
  }
});

app.post("/api/dialect/mcp/alerts/template", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const template = await c.req.json();
    const createdTemplate = await dialectMCPService.createAlertTemplate(template);
    return c.json(createdTemplate);
  } catch (error) {
    console.error("❌ MCP alert template error:", error);
    return c.json({ error: "Failed to create alert template" }, 500);
  }
});

app.post("/api/dialect/mcp/alerts/send", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const { templateId, recipients, customData } = await c.req.json();

    if (!templateId || !recipients || !Array.isArray(recipients)) {
      return c.json({ error: "templateId and recipients array are required" }, 400);
    }

    const result = await dialectMCPService.sendAlert(templateId, recipients, customData);
    return c.json(result);
  } catch (error) {
    console.error("❌ MCP alert send error:", error);
    return c.json({ error: "Failed to send alert" }, 500);
  }
});

app.get("/api/dialect/mcp/docs/search", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const query = c.req.query('q');
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }

    const results = await dialectMCPService.searchDocumentation(query);
    return c.json(results);
  } catch (error) {
    console.error("❌ MCP docs search error:", error);
    return c.json({ error: "Failed to search documentation" }, 500);
  }
});

// Dialect Monitoring Service Routes
app.get("/api/dialect/monitoring/status", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const status = dialectMonitoringService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("❌ Monitoring status error:", error);
    return c.json({ error: "Failed to get monitoring status" }, 500);
  }
});

app.get("/api/dialect/monitoring/rules", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const rules = dialectMonitoringService.getRules();
    return c.json({ rules });
  } catch (error) {
    console.error("❌ Monitoring rules error:", error);
    return c.json({ error: "Failed to get monitoring rules" }, 500);
  }
});

app.post("/api/dialect/monitoring/rules", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const ruleData = await c.req.json();
    const rule = await dialectMonitoringService.addRule(ruleData);
    return c.json(rule);
  } catch (error) {
    console.error("❌ Add monitoring rule error:", error);
    return c.json({ error: "Failed to add monitoring rule" }, 500);
  }
});

app.put("/api/dialect/monitoring/rules/:id", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const id = c.req.param('id');
    const updates = await c.req.json();
    const rule = await dialectMonitoringService.updateRule(id, updates);
    
    if (!rule) {
      return c.json({ error: "Rule not found" }, 404);
    }
    
    return c.json(rule);
  } catch (error) {
    console.error("❌ Update monitoring rule error:", error);
    return c.json({ error: "Failed to update monitoring rule" }, 500);
  }
});

app.delete("/api/dialect/monitoring/rules/:id", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const id = c.req.param('id');
    const deleted = await dialectMonitoringService.deleteRule(id);
    
    if (!deleted) {
      return c.json({ error: "Rule not found" }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("❌ Delete monitoring rule error:", error);
    return c.json({ error: "Failed to delete monitoring rule" }, 500);
  }
});

app.get("/api/dialect/monitoring/events", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const limit = parseInt(c.req.query('limit') || '50');
    const events = dialectMonitoringService.getRecentEvents(limit);
    return c.json({ events });
  } catch (error) {
    console.error("❌ Monitoring events error:", error);
    return c.json({ error: "Failed to get monitoring events" }, 500);
  }
});

app.get("/api/dialect/monitoring/stats", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const stats = dialectMonitoringService.getStats();
    return c.json(stats);
  } catch (error) {
    console.error("❌ Monitoring stats error:", error);
    return c.json({ error: "Failed to get monitoring stats" }, 500);
  }
});

app.post("/api/dialect/monitoring/start", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    await dialectMonitoringService.startMonitoring();
    return c.json({ success: true, message: "Monitoring started" });
  } catch (error) {
    console.error("❌ Start monitoring error:", error);
    return c.json({ error: "Failed to start monitoring" }, 500);
  }
});

app.post("/api/dialect/monitoring/stop", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    await dialectMonitoringService.stopMonitoring();
    return c.json({ success: true, message: "Monitoring stopped" });
  } catch (error) {
    console.error("❌ Stop monitoring error:", error);
    return c.json({ error: "Failed to stop monitoring" }, 500);
  }
});

// Serve frontend (production) - after all API routes
// Static assets
app.use('/assets/*', serveStatic({ root: './frontend/dist' }));
// SPA fallback to index.html
app.get('*', serveStatic({ path: './frontend/dist/index.html' }));

// Start the server
startServer().catch(console.error);

export default app;
