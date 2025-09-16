import { Database } from "bun:sqlite";
import { z } from "zod";

// Zod schemas for validation
export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const EmbeddingSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  chunk_id: z.string(),
  content: z.string(),
  embedding: z.array(z.number()),
  metadata: z.record(z.any()).optional(),
  created_at: z.string(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  title: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string(),
});

// TypeScript types
export type Document = z.infer<typeof DocumentSchema>;
export type Embedding = z.infer<typeof EmbeddingSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;

export interface VectorSearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

export interface DatabaseSchema {
  documents: Document;
  embeddings: Embedding;
  conversations: Conversation;
  messages: Message;
}

// SQL Schema definitions
export const createTablesSQL = `
  -- Documents table
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}', -- JSON string
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Text chunks and their vector embeddings
  CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL, -- Store as binary data
    metadata TEXT DEFAULT '{}', -- JSON string
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
  );

  -- Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Messages in conversations
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}', -- JSON string
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);
  CREATE INDEX IF NOT EXISTS idx_documents_title ON documents (title);

  CREATE INDEX IF NOT EXISTS idx_embeddings_document_id ON embeddings (document_id);
  CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings (chunk_id);
  CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON embeddings (created_at);

  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations (created_at);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_role ON messages (role);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);

  -- Triggers to update timestamps
  CREATE TRIGGER IF NOT EXISTS update_documents_timestamp
    AFTER UPDATE ON documents
    BEGIN
      UPDATE documents SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

  CREATE TRIGGER IF NOT EXISTS update_conversations_timestamp
    AFTER UPDATE ON conversations
    BEGIN
      UPDATE conversations SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
`;

// Helper functions for vector operations
export function serializeEmbedding(embedding: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (value !== undefined) {
      buffer.writeFloatLE(value, i * 4);
    }
  }
  return buffer;
}

export function deserializeEmbedding(buffer: Buffer): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    embedding.push(buffer.readFloatLE(i));
  }
  return embedding;
}

// Cosine similarity calculation
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai !== undefined && bi !== undefined) {
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}
