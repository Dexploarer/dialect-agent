export * from '../db/schema.js';
export * from '../lib/ai.js';
export * from '../lib/embeddings.js';

// Core application types
export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  corsOrigin: string;
  corsCredentials: boolean;
}

// API Request/Response types
export interface APIResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  userId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  enableRag?: boolean;
  conversationId?: string;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  ragContext?: {
    query: string;
    totalResults: number;
    sources: Array<{
      document_id: string;
      similarity: number;
      content: string;
      metadata?: Record<string, any>;
    }>;
  };
  conversationId?: string;
  messageId?: string;
}

// Document types
export interface DocumentMetadata {
  category?: string;
  topic?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  author?: string;
  tags?: string[];
  language?: string;
  source?: string;
  lastUpdated?: string;
  version?: string;
}

export interface DocumentWithStats extends Document {
  stats?: {
    chunkCount: number;
    averageChunkLength: number;
    embeddingDimensions: number;
    lastProcessed: string;
  };
}

export interface DocumentRequest {
  title: string;
  content: string;
  metadata?: DocumentMetadata;
}

export interface DocumentUpdateRequest {
  title?: string;
  content?: string;
  metadata?: DocumentMetadata;
}

// Search types
export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  documentIds?: string[];
  metadata?: Record<string, any>;
  includeContent?: boolean;
  includeSimilarity?: boolean;
}

export interface SearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
  document_title?: string;
  document_metadata?: DocumentMetadata;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  executionTime: number;
  threshold: number;
}

// Vector embedding types
export interface VectorEmbedding {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
  dimensions: number;
  model: string;
  createdAt: string;
}

export interface EmbeddingModel {
  name: string;
  dimensions: number;
  maxTokens: number;
  language: string[];
  provider: string;
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  keepSeparator?: boolean;
}

// AI Provider types
export interface AIProvider {
  name: string;
  models: string[];
  apiKeyRequired: boolean;
  supportsStreaming: boolean;
  maxTokens: number;
  supportedFeatures: Array<'chat' | 'completion' | 'embedding' | 'image' | 'audio'>;
}

export interface ModelUsage {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  requestCount: number;
  timestamp: string;
}

// Error types
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

// Health check types
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  lastChecked: string;
  details?: Record<string, any>;
  error?: string;
}

// Analytics types
export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  averageResponseTime: number;
  errorRate: number;
  topModels: Array<{
    model: string;
    count: number;
    percentage: number;
  }>;
  topQueries: Array<{
    query: string;
    count: number;
    averageSimilarity: number;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface DatabaseStats {
  documents: number;
  embeddings: number;
  conversations: number;
  messages: number;
  dbSizeBytes: number;
  dbSizeMB: number;
  lastOptimized?: string;
  averageQueryTime?: number;
}

// Configuration types
export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  pragma?: Record<string, string | number | boolean>;
  backupInterval?: number;
  maxConnections?: number;
}

export interface EmbeddingConfig {
  model: string;
  maxLength: number;
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
  pooling?: 'mean' | 'cls';
  normalize?: boolean;
  dimensions?: number;
  provider?: string;
  apiKey?: string;
}

export interface AIConfig {
  defaultProvider: 'openai' | 'anthropic';
  openaiApiKey?: string;
  anthropicApiKey?: string;
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
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithTimestamps<T> = T & {
  createdAt: string;
  updatedAt: string;
};

export type WithId<T> = T & {
  id: string;
};

// Event types for potential future use
export interface ApplicationEvent {
  type: string;
  payload: any;
  timestamp: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface ChatEvent extends ApplicationEvent {
  type: 'chat.message.sent' | 'chat.message.received' | 'chat.conversation.created';
  payload: {
    conversationId: string;
    messageId?: string;
    content?: string;
    model?: string;
    ragUsed?: boolean;
  };
}

export interface DocumentEvent extends ApplicationEvent {
  type: 'document.created' | 'document.updated' | 'document.deleted' | 'document.embedded';
  payload: {
    documentId: string;
    title?: string;
    chunkCount?: number;
    embeddingTime?: number;
  };
}

export interface SearchEvent extends ApplicationEvent {
  type: 'search.executed' | 'search.no_results';
  payload: {
    query: string;
    resultCount: number;
    executionTime: number;
    threshold: number;
  };
}

// Rate limiting types
export interface RateLimit {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// Export commonly used union types
export type MessageRole = 'user' | 'assistant' | 'system';
export type DocumentStatus = 'processing' | 'ready' | 'failed';
export type ConversationStatus = 'active' | 'archived' | 'deleted';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type Environment = 'development' | 'production' | 'test';
export type AIModel = 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku';
export type EmbeddingModelType = 'sentence-transformers' | 'openai' | 'huggingface';
