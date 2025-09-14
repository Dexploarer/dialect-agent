import { PublicKey } from '@solana/web3.js';

// Base Agent Types
export interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;

  // AI Configuration
  aiConfig: AgentAIConfig;

  // Event Monitoring
  eventTriggers: EventTrigger[];

  // Actions
  actions: AgentAction[];

  // Statistics
  stats: AgentStats;

  // Settings
  settings: AgentSettings;
}

export interface AgentAIConfig {
  model: string;
  provider: 'openai' | 'anthropic';
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enableRag: boolean;
  contextMemory: number; // Number of previous interactions to remember
  personality?: AgentPersonality;
}

export interface AgentPersonality {
  traits: string[];
  communicationStyle: 'formal' | 'casual' | 'professional' | 'friendly';
  expertise: string[];
  responseLength: 'concise' | 'balanced' | 'detailed';
}

// Event System Types
export interface EventTrigger {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  eventType: EventType;
  conditions: EventCondition[];
  actions: string[]; // Action IDs to execute
  cooldown?: number; // Seconds between triggers
  priority: 'low' | 'medium' | 'high';
}

export type EventType =
  | 'dialect_message'
  | 'token_transfer'
  | 'account_balance_change'
  | 'nft_mint'
  | 'nft_transfer'
  | 'defi_transaction'
  | 'governance_proposal'
  | 'price_alert'
  | 'custom_program'
  | 'webhook'
  | 'scheduled';

export interface EventCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

// Blockchain Event Types
export interface SolanaEvent {
  id: string;
  type: EventType;
  timestamp: string;
  signature: string;
  slot: number;
  blockTime: number;

  // Transaction details
  transaction: {
    signatures: string[];
    message: {
      accountKeys: PublicKey[];
      instructions: any[];
    };
  };

  // Parsed data based on event type
  parsedData: Record<string, any>;

  // Processing status
  processed: boolean;
  processingError?: string;
}

export interface DialectEvent extends SolanaEvent {
  type: 'dialect_message';
  parsedData: {
    messageId: string;
    sender: PublicKey;
    recipient: PublicKey;
    content: string;
    encrypted: boolean;
    threadId?: string;
  };
}

export interface TokenTransferEvent extends SolanaEvent {
  type: 'token_transfer';
  parsedData: {
    mint: PublicKey;
    source: PublicKey;
    destination: PublicKey;
    amount: number;
    decimals: number;
    authority: PublicKey;
  };
}

// Agent Actions
export interface AgentAction {
  id: string;
  name: string;
  description: string;
  type: ActionType;
  configuration: ActionConfiguration;
  isActive: boolean;
  lastExecuted?: string;
  executionCount: number;
  successRate: number;
}

export type ActionType =
  | 'send_message'
  | 'send_notification'
  | 'execute_transaction'
  | 'call_webhook'
  | 'ai_response'
  | 'data_query'
  | 'custom_script';

export interface ActionConfiguration {
  [key: string]: any;
}

export interface SendMessageActionConfig extends ActionConfiguration {
  recipient: string; // Public key or username
  template: string; // Message template with variables
  channel: 'dialect' | 'email' | 'sms' | 'discord' | 'telegram';
  priority: 'low' | 'medium' | 'high';
}

export interface TransactionActionConfig extends ActionConfiguration {
  programId: PublicKey;
  instruction: string;
  accounts: {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }[];
  data?: Buffer;
  computeUnits?: number;
  priorityFee?: number;
}

export interface WebhookActionConfig extends ActionConfiguration {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: any;
  timeout: number;
  retries: number;
}

// Agent Execution Context
export interface ExecutionContext {
  agentId: string;
  eventId: string;
  triggerId: string;
  timestamp: string;
  event: SolanaEvent;
  variables: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  timestamp: string;
}

export interface ExecutionResult {
  contextId: string;
  agentId: string;
  success: boolean;
  actionResults: ActionResult[];
  totalExecutionTime: number;
  error?: string;
  timestamp: string;
}

// Agent Statistics
export interface AgentStats {
  totalTriggers: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageResponseTime: number;
  lastActivity: string;
  uptime: number; // Percentage
  eventsProcessed: Record<EventType, number>;
  popularActions: string[];
}

// Agent Settings
export interface AgentSettings {
  // Execution settings
  maxConcurrentActions: number;
  executionTimeout: number; // milliseconds
  rateLimitPerMinute: number;

  // Monitoring settings
  enableDetailedLogging: boolean;
  alertOnFailure: boolean;

  // Security settings
  allowedOrigins: string[];
  requireAuthentication: boolean;
  maxMemoryUsage: number; // MB

  // Integration settings
  walletAddress?: PublicKey;
  dialectConfig?: DialectConfig;
}

export interface DialectConfig {
  walletKeypair?: string; // Encrypted keypair
  subscriptions: DialectSubscription[];
  webhookUrl?: string;
  enableEncryption: boolean;
}

export interface DialectSubscription {
  id: string;
  name: string;
  accountAddress: PublicKey;
  eventTypes: EventType[];
  isActive: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'event' | 'status' | 'error' | 'ping' | 'pong';
  payload: any;
  timestamp: string;
  id?: string;
}

export interface EventMessage extends WebSocketMessage {
  type: 'event';
  payload: SolanaEvent;
}

export interface StatusMessage extends WebSocketMessage {
  type: 'status';
  payload: {
    connected: boolean;
    subscriptions: number;
    eventsProcessed: number;
    uptime: number;
  };
}

// API Types
export interface CreateAgentRequest {
  name: string;
  description: string;
  aiConfig: Partial<AgentAIConfig>;
  eventTriggers?: Omit<EventTrigger, 'id'>[];
  actions?: Omit<AgentAction, 'id' | 'lastExecuted' | 'executionCount' | 'successRate'>[];
  settings?: Partial<AgentSettings>;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  avatar?: string;
  isActive?: boolean;
  aiConfig?: Partial<AgentAIConfig>;
  eventTriggers?: EventTrigger[];
  actions?: AgentAction[];
  settings?: Partial<AgentSettings>;
}

export interface AgentChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  metadata?: {
    eventTriggered?: boolean;
    actionsExecuted?: string[];
    responseTime?: number;
  };
}

export interface ChatSession {
  id: string;
  agentId: string;
  userId?: string;
  messages: AgentChatMessage[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Queue and Job Types
export interface Job {
  id: string;
  type: 'execute_action' | 'process_event' | 'agent_chat' | 'monitor_subscription';
  priority: number;
  data: any;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledFor?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
}

// Monitoring Types
export interface MonitoringMetrics {
  timestamp: string;
  agentId: string;

  // Performance metrics
  cpuUsage: number;
  memoryUsage: number;
  responseTime: number;

  // Event metrics
  eventsReceived: number;
  eventsProcessed: number;
  eventsFailed: number;

  // Action metrics
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
}

// Configuration Types
export interface SystemConfig {
  // Database
  database: {
    url: string;
    maxConnections: number;
    connectionTimeout: number;
  };

  // Redis/Queue
  redis: {
    url: string;
    maxRetries: number;
  };

  // Solana
  solana: {
    rpcUrl: string;
    wsUrl: string;
    commitment: 'processed' | 'confirmed' | 'finalized';
  };

  // Dialect
  dialect: {
    apiUrl: string;
    websocketUrl: string;
    apiKey?: string;
  };

  // AI Providers
  ai: {
    openai: {
      apiKey: string;
      baseUrl?: string;
    };
    anthropic: {
      apiKey: string;
      baseUrl?: string;
    };
  };

  // Security
  security: {
    jwtSecret: string;
    encryptionKey: string;
    rateLimitWindow: number;
    rateLimitMax: number;
  };
}

// Error Types
export interface AgentError extends Error {
  agentId: string;
  code: string;
  context?: Record<string, any>;
  timestamp: string;
}

export interface ValidationError extends AgentError {
  code: 'VALIDATION_ERROR';
  field: string;
  value: any;
}

export interface ExecutionError extends AgentError {
  code: 'EXECUTION_ERROR';
  actionId?: string;
  triggerId?: string;
}

export interface ConnectionError extends AgentError {
  code: 'CONNECTION_ERROR';
  service: 'solana' | 'dialect' | 'database' | 'redis';
}
