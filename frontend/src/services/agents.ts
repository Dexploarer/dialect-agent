import { toast } from 'react-hot-toast';

// Types matching backend interfaces
export interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  aiConfig: AgentAIConfig;
  eventTriggers: EventTrigger[] | number;
  actions: AgentAction[] | number;
  stats: AgentStats;
  settings: AgentSettings;
}

export interface AgentAIConfig {
  model: string;
  provider: 'openai' | 'anthropic';
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enableRag: boolean;
  contextMemory: number;
  personality?: AgentPersonality;
}

export interface AgentPersonality {
  traits: string[];
  communicationStyle: 'formal' | 'casual' | 'professional' | 'friendly';
  expertise: string[];
  responseLength: 'concise' | 'balanced' | 'detailed';
}

export interface EventTrigger {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  eventType: EventType;
  conditions: EventCondition[];
  actions: string[];
  cooldown?: number;
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
  | 'scheduled'
  | 'token_price_change'
  | 'trending_token'
  | 'custom_event'
  | 'dialect_generic_event';

export interface EventCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

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

export interface AgentStats {
  totalTriggers: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageResponseTime: number;
  lastActivity: string;
  uptime: number;
  eventsProcessed: Record<EventType, number>;
  popularActions: string[];
}

export interface AgentSettings {
  maxConcurrentActions: number;
  executionTimeout: number;
  rateLimitPerMinute: number;
  enableDetailedLogging: boolean;
  alertOnFailure: boolean;
  allowedOrigins: string[];
  requireAuthentication: boolean;
  maxMemoryUsage: number;
}

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

// API Service Functions
export class AgentService {
  private static baseUrl = '/api';

  static async getAllAgents(): Promise<Agent[]> {
    try {
      const response = await fetch(`${this.baseUrl}/agents`);
      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.status}`);
      }
      const data = await response.json();
      return data.agents || [];
    } catch (error) {
      toast.error('Failed to fetch agents');
      throw error;
    }
  }

  static async getAgent(id: string): Promise<Agent> {
    try {
      const response = await fetch(`${this.baseUrl}/agents/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch agent: ${response.status}`);
      }
      const data = await response.json();
      return data.agent;
    } catch (error) {
      toast.error('Failed to fetch agent');
      throw error;
    }
  }

  static async createAgent(agentData: CreateAgentRequest): Promise<Agent> {
    try {
      const response = await fetch(`${this.baseUrl}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agentData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create agent: ${response.status}`);
      }

      const data = await response.json();
      toast.success('Agent created successfully!');
      return data.agent;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create agent');
      throw error;
    }
  }

  static async updateAgent(id: string, updateData: UpdateAgentRequest): Promise<Agent> {
    try {
      const response = await fetch(`${this.baseUrl}/agents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update agent: ${response.status}`);
      }

      const data = await response.json();
      toast.success('Agent updated successfully!');
      return data.agent;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update agent');
      throw error;
    }
  }

  static async deleteAgent(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/agents/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete agent: ${response.status}`);
      }

      toast.success('Agent deleted successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent');
      throw error;
    }
  }

  static async toggleAgent(id: string, isActive: boolean): Promise<Agent> {
    try {
      const response = await fetch(`${this.baseUrl}/agents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to toggle agent: ${response.status}`);
      }

      const data = await response.json();
      toast.success(`Agent ${isActive ? 'activated' : 'deactivated'} successfully!`);
      return data.agent;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle agent');
      throw error;
    }
  }

  static async createExampleAgent(): Promise<Agent> {
    try {
      const response = await fetch(`${this.baseUrl}/agents/seed-example`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create example agent: ${response.status}`);
      }

      const data = await response.json();
      toast.success('Example agent created successfully!');
      return data.agent;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create example agent');
      throw error;
    }
  }
}

// Default configurations for new agents
export const DEFAULT_AI_CONFIG: AgentAIConfig = {
  model: 'openai/gpt-4o',
  provider: 'openai',
  temperature: 0.7,
  maxTokens: 800,
  systemPrompt: 'You are a helpful blockchain agent. Analyze events and provide insights.',
  enableRag: true,
  contextMemory: 6,
  personality: {
    traits: ['analytical', 'helpful', 'proactive'],
    communicationStyle: 'professional',
    expertise: ['blockchain', 'DeFi', 'crypto'],
    responseLength: 'balanced',
  },
};

export const DEFAULT_SETTINGS: AgentSettings = {
  maxConcurrentActions: 5,
  executionTimeout: 30000,
  rateLimitPerMinute: 60,
  enableDetailedLogging: true,
  alertOnFailure: true,
  allowedOrigins: ['*'],
  requireAuthentication: false,
  maxMemoryUsage: 512,
};

// Event type options for UI
export const EVENT_TYPE_OPTIONS: { value: EventType; label: string; description: string }[] = [
  { value: 'token_price_change', label: 'Price Change', description: 'React to token price movements' },
  { value: 'trending_token', label: 'Trending Token', description: 'Monitor trending tokens and metrics' },
  { value: 'token_transfer', label: 'Token Transfer', description: 'Monitor token transfers and movements' },
  { value: 'nft_mint', label: 'NFT Mint', description: 'React to NFT minting events' },
  { value: 'nft_transfer', label: 'NFT Transfer', description: 'Monitor NFT transfers' },
  { value: 'defi_transaction', label: 'DeFi Transaction', description: 'Monitor DeFi protocol interactions' },
  { value: 'governance_proposal', label: 'Governance', description: 'Track governance proposals and votes' },
  { value: 'account_balance_change', label: 'Balance Change', description: 'Monitor account balance changes' },
  { value: 'dialect_message', label: 'Dialect Message', description: 'React to Dialect messages' },
  { value: 'webhook', label: 'Webhook', description: 'Custom webhook triggers' },
  { value: 'scheduled', label: 'Scheduled', description: 'Time-based triggers' },
  { value: 'custom_event', label: 'Custom Event', description: 'Custom event patterns' },
];

// Action type options for UI
export const ACTION_TYPE_OPTIONS: { value: ActionType; label: string; description: string }[] = [
  { value: 'ai_response', label: 'AI Analysis', description: 'Generate AI-powered analysis and insights' },
  { value: 'send_notification', label: 'Send Notification', description: 'Send alerts via various channels' },
  { value: 'send_message', label: 'Send Message', description: 'Send messages through Dialect or other platforms' },
  { value: 'call_webhook', label: 'Webhook Call', description: 'Call external APIs or webhooks' },
  { value: 'execute_transaction', label: 'Execute Transaction', description: 'Execute on-chain transactions' },
  { value: 'data_query', label: 'Data Query', description: 'Query and analyze blockchain data' },
  { value: 'custom_script', label: 'Custom Script', description: 'Execute custom JavaScript code' },
];