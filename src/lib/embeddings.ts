import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { nanoid } from "nanoid";
import { getDatabaseManager, transaction } from "../db/connection.js";
import {
  serializeEmbedding,
  deserializeEmbedding,
  cosineSimilarity,
  type VectorSearchResult,
  type Embedding,
} from "../db/schema.js";

export interface EmbeddingConfig {
  model: string;
  maxLength: number;
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
  provider: "openai";
  apiKey?: string;
  dimensions: number;
}

export interface TextChunk {
  id: string;
  content: string;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  documentIds?: string[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  chunk: TextChunk;
  similarity: number;
  document_id: string;
  metadata?: Record<string, any>;
}

export class EmbeddingService {
  private embeddingModel: any = null;
  private isInitialized = false;
  private config: EmbeddingConfig;

  constructor(config?: Partial<EmbeddingConfig>) {
    const defaultModel =
      process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    const modelDimensions = this.getModelDimensions(defaultModel);

    this.config = {
      model: defaultModel,
      maxLength: 8192,
      batchSize: 10,
      chunkSize: 500,
      chunkOverlap: 50,
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      dimensions: modelDimensions,
      ...config,
    };
  }

  /**
   * Get embedding dimensions for different models
   */
  private getModelDimensions(model: string): number {
    const modelDimensions: Record<string, number> = {
      "text-embedding-3-small": 1536,
      "text-embedding-3-large": 3072,
      "text-embedding-ada-002": 1536,
    };
    return modelDimensions[model] || 1536;
  }

  /**
   * Initialize the embedding service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log(
        `Initializing embedding service with model: ${this.config.model}`,
      );

      if (!this.config.apiKey) {
        throw new Error("OpenAI API key is required for embeddings");
      }

      // Initialize the OpenAI embedding model
      this.embeddingModel = openai.textEmbedding(this.config.model, {
        apiKey: this.config.apiKey,
      });

      this.isInitialized = true;
      console.log("Embedding service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize embedding service:", error);
      throw new Error(`Failed to initialize embedding service: ${error}`);
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Truncate text if it's too long
      const truncatedText =
        text.length > this.config.maxLength
          ? text.substring(0, this.config.maxLength)
          : text;

      const result = await embed({
        model: this.embeddingModel,
        value: truncatedText,
      });

      return result.embedding;
    } catch (error) {
      console.error("Failed to generate embedding:", error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      console.log(
        `Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(texts.length / this.config.batchSize)}`,
      );

      // Use embedMany for batch processing when available
      try {
        const batchResults = await Promise.all(
          batch.map((text) => this.generateEmbedding(text)),
        );
        results.push(...batchResults);
      } catch (error) {
        console.error(
          `Failed to process batch ${Math.floor(i / this.config.batchSize) + 1}:`,
          error,
        );
        // Fall back to individual processing
        for (const text of batch) {
          try {
            const embedding = await this.generateEmbedding(text);
            results.push(embedding);
          } catch (textError) {
            console.error(
              `Failed to process individual text in batch:`,
              textError,
            );
            // Add zero vector as fallback
            results.push(new Array(this.config.dimensions).fill(0));
          }
        }
      }

      // Add delay between batches to respect rate limits
      if (i + this.config.batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Chunk text into smaller pieces with overlap
   */
  chunkText(text: string, metadata?: Record<string, any>): TextChunk[] {
    const chunks: TextChunk[] = [];
    const words = text.split(/\s+/);

    if (words.length <= this.config.chunkSize) {
      return [
        {
          id: nanoid(),
          content: text,
          startIndex: 0,
          endIndex: text.length,
          metadata,
        },
      ];
    }

    let startIndex = 0;
    let wordIndex = 0;

    while (wordIndex < words.length) {
      const chunkWords = words.slice(
        wordIndex,
        wordIndex + this.config.chunkSize,
      );
      const chunkText = chunkWords.join(" ");
      const endIndex = startIndex + chunkText.length;

      chunks.push({
        id: nanoid(),
        content: chunkText,
        startIndex,
        endIndex,
        metadata,
      });

      // Calculate next starting point with overlap
      const nextWordIndex =
        wordIndex + this.config.chunkSize - this.config.chunkOverlap;
      wordIndex = Math.max(nextWordIndex, wordIndex + 1);
      startIndex = endIndex + 1; // +1 for space
    }

    return chunks;
  }

  /**
   * Process and store document embeddings
   */
  async processDocument(
    documentId: string,
    content: string,
    title?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const dbManager = getDatabaseManager();

    try {
      // Delete existing embeddings for this document
      dbManager.run("DELETE FROM embeddings WHERE document_id = ?", documentId);

      // Chunk the content
      const chunks = this.chunkText(content, metadata);
      console.log(`Created ${chunks.length} chunks for document ${documentId}`);

      // Generate embeddings for all chunks
      const texts = chunks.map((chunk) => chunk.content);
      const embeddings = await this.generateEmbeddingsBatch(texts);

      // Store embeddings in database
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const embeddingData = serializeEmbedding(embeddings[index]);
        const metadataJson = JSON.stringify(chunk.metadata || {});

        dbManager.run(
          "INSERT INTO embeddings (id, document_id, chunk_id, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?)",
          nanoid(),
          documentId,
          chunk.id,
          chunk.content,
          embeddingData,
          metadataJson,
        );
      }

      console.log(
        `Processed and stored ${chunks.length} embeddings for document ${documentId}`,
      );
    } catch (error) {
      console.error("Failed to process document:", error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      threshold = 0.5,
      documentIds,
      metadata: metadataFilter,
    } = options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Get all embeddings from database
      const dbManager = getDatabaseManager();
      const allEmbeddings = dbManager.query(
        "SELECT id, document_id, chunk_id, content, embedding, metadata, created_at FROM embeddings",
      );

      // Calculate similarities
      const similarities: Array<{
        embedding: any;
        similarity: number;
      }> = [];

      for (const embedding of allEmbeddings) {
        // Filter by document IDs if specified
        if (documentIds && !documentIds.includes(embedding.document_id)) {
          continue;
        }

        // Filter by metadata if specified
        if (metadataFilter) {
          const embeddingMetadata = JSON.parse(embedding.metadata);
          const matches = Object.entries(metadataFilter).every(
            ([key, value]) => embeddingMetadata[key] === value,
          );
          if (!matches) continue;
        }

        const embeddingVector = deserializeEmbedding(embedding.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embeddingVector);

        if (similarity >= threshold) {
          similarities.push({
            embedding,
            similarity,
          });
        }
      }

      // Sort by similarity (highest first) and limit results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limit);

      // Convert to SearchResult format
      const results: SearchResult[] = topResults.map(
        ({ embedding, similarity }) => ({
          chunk: {
            id: embedding.chunk_id,
            content: embedding.content,
            startIndex: 0,
            endIndex: embedding.content.length,
            metadata: JSON.parse(embedding.metadata),
          },
          similarity,
          document_id: embedding.document_id,
          metadata: JSON.parse(embedding.metadata),
        }),
      );

      return results;
    } catch (error) {
      console.error("Failed to search similar content:", error);
      throw error;
    }
  }

  /**
   * Get embeddings for a specific document
   */
  async getDocumentEmbeddings(documentId: string): Promise<Embedding[]> {
    const dbManager = getDatabaseManager();
    const embeddings = dbManager.query(
      "SELECT * FROM embeddings WHERE document_id = ?",
      documentId,
    );

    return embeddings.map((embedding: any) => ({
      ...embedding,
      embedding: deserializeEmbedding(embedding.embedding),
      metadata: JSON.parse(embedding.metadata),
    }));
  }

  /**
   * Delete embeddings for a document
   */
  async deleteDocumentEmbeddings(documentId: string): Promise<void> {
    const dbManager = getDatabaseManager();
    dbManager.run("DELETE FROM embeddings WHERE document_id = ?", documentId);
    console.log(`Deleted embeddings for document ${documentId}`);
  }

  /**
   * Get embedding statistics
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    // Note: Changing the model requires re-initialization
    if (config.model && config.model !== this.config.model) {
      this.isInitialized = false;
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.embeddingModel = null;
    this.isInitialized = false;
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

/**
 * Get or create embedding service instance
 */
export function getEmbeddingService(
  config?: Partial<EmbeddingConfig>,
): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(config);
  }
  return embeddingService;
}

/**
 * Initialize embedding service
 */
export async function initializeEmbeddingService(
  config?: Partial<EmbeddingConfig>,
): Promise<EmbeddingService> {
  const service = getEmbeddingService(config);
  await service.initialize();
  return service;
}

/**
 * Utility function to find similar documents
 */
export async function findSimilarDocuments(
  query: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const service = getEmbeddingService();
  return service.searchSimilar(query, options);
}

/**
 * Utility function to process and store document
 */
export async function embedDocument(
  documentId: string,
  content: string,
  title?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  const service = getEmbeddingService();
  return service.processDocument(documentId, content, title, metadata);
}
