import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { getDatabaseManager } from '../db/connection.js';
import { getAIService } from '../lib/ai.js';
import { getEmbeddingService } from '../lib/embeddings.js';
import DialectEventMonitor from './dialect-monitor.js';
import type { DialectAlertsService } from '../lib/dialect-alerts.js';
import type { DialectMarketsService } from '../lib/dialect-markets.js';
import type { DialectPositionsService } from '../lib/dialect-positions.js';
import type { DialectBlinksService } from '../lib/dialect-blinks.js';
import type {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentChatMessage,
  ChatSession,
  ExecutionContext,
  ExecutionResult,
  ActionResult,
  AgentAction,
  EventTrigger,
  SolanaEvent,
  AgentStats,
  Job,
  MonitoringMetrics,
  ActionType,
  SendMessageActionConfig,
  WebhookActionConfig,
  TransactionActionConfig,
  AgentError,
} from './types.js';
import type { CoreMessage } from 'ai';

export interface AgentManagerConfig {
  maxConcurrentAgents: number;
  defaultExecutionTimeout: number;
  enableDetailedLogging: boolean;
  queueEnabled: boolean;
  monitoringInterval: number;
}

export class AgentManager extends EventEmitter {
  private config: AgentManagerConfig;
  private agents = new Map<string, Agent>();
  private chatSessions = new Map<string, ChatSession>();
  private activeExecutions = new Map<string, ExecutionContext>();
  private executionQueue: Job[] = [];
  private dialectMonitor: DialectEventMonitor;
  
  // Dialect services
  private dialectAlerts?: DialectAlertsService;
  private dialectMarkets?: DialectMarketsService;
  private dialectPositions?: DialectPositionsService;
  private dialectBlinks?: DialectBlinksService;

  // Monitoring
  private monitoringTimer: NodeJS.Timeout | null = null;
  private metrics = new Map<string, MonitoringMetrics[]>();

  // Statistics
  private globalStats = {
    totalAgents: 0,
    activeAgents: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageResponseTime: 0,
    uptime: Date.now(),
  };

  constructor(config: Partial<AgentManagerConfig> = {}) {
    super();

    this.config = {
      maxConcurrentAgents: 50,
      defaultExecutionTimeout: 30000,
      enableDetailedLogging: true,
      queueEnabled: true,
      monitoringInterval: 60000,
      ...config,
    };

    this.dialectMonitor = new DialectEventMonitor();
    this.setupEventHandlers();
  }

  /**
   * Set Dialect services for the agent manager
   */
  setDialectServices(services: {
    alerts?: DialectAlertsService;
    markets?: DialectMarketsService;
    positions?: DialectPositionsService;
    blinks?: DialectBlinksService;
  }): void {
    if (services.alerts) this.dialectAlerts = services.alerts;
    if (services.markets) this.dialectMarkets = services.markets;
    if (services.positions) this.dialectPositions = services.positions;
    if (services.blinks) this.dialectBlinks = services.blinks;
    
    console.log('🔗 Dialect services configured for Agent Manager');
  }

  /**
   * Send notification through Dialect Alerts
   */
  async sendDialectNotification(
    walletAddress: string,
    title: string,
    message: string,
    type: 'price' | 'liquidation' | 'trading' | 'system' = 'system',
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP'],
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.dialectAlerts) {
      console.warn('⚠️ Dialect Alerts service not available');
      return false;
    }

    try {
      let result;
      
      switch (type) {
        case 'price':
          result = await this.dialectAlerts.sendPriceAlert(
            walletAddress,
            metadata?.tokenSymbol as string || 'Unknown',
            metadata?.priceChange as number || 0,
            metadata?.currentPrice as number || 0,
            channels
          );
          break;
        case 'liquidation':
          result = await this.dialectAlerts.sendLiquidationWarning(
            walletAddress,
            metadata?.protocol as string || 'Unknown',
            metadata?.collateralToken as string || 'Unknown',
            metadata?.healthFactor as number || 0,
            channels
          );
          break;
        case 'trading':
          result = await this.dialectAlerts.sendTradingOpportunity(
            walletAddress,
            metadata?.tokenSymbol as string || 'Unknown',
            metadata?.opportunity as string || 'Trading opportunity detected',
            metadata?.potentialGain as number || 0,
            channels
          );
          break;
        default:
          result = await this.dialectAlerts.sendSystemNotification(
            walletAddress,
            title,
            message,
            metadata?.severity as 'info' | 'warning' | 'error' || 'info',
            channels
          );
      }

      if (result.success) {
        console.log(`✅ Dialect notification sent to ${walletAddress}: ${title}`);
        return true;
      } else {
        console.error(`❌ Failed to send Dialect notification: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending Dialect notification:', error);
      return false;
    }
  }

  /**
   * Get market data for agents
   */
  async getMarketData(filters?: {
    protocol?: string;
    type?: 'lending' | 'multiply' | 'leverage' | 'liquidity';
    tokenSymbol?: string;
    minApy?: number;
  }): Promise<any[]> {
    if (!this.dialectMarkets) {
      console.warn('⚠️ Dialect Markets service not available');
      return [];
    }

    try {
      const result = await this.dialectMarkets.getMarkets(filters);
      return result.markets;
    } catch (error) {
      console.error('❌ Error fetching market data:', error);
      return [];
    }
  }

  /**
   * Get position data for a wallet
   */
  async getWalletPositions(walletAddress: string, filters?: {
    protocol?: string;
    type?: 'lending' | 'multiply' | 'leverage' | 'liquidity';
    status?: 'active' | 'liquidated' | 'closed';
  }): Promise<any[]> {
    if (!this.dialectPositions) {
      console.warn('⚠️ Dialect Positions service not available');
      return [];
    }

    try {
      const result = await this.dialectPositions.getPositionsByWallet(walletAddress, filters);
      return result.positions;
    } catch (error) {
      console.error('❌ Error fetching position data:', error);
      return [];
    }
  }

  /**
   * Execute a blink action
   */
  async executeBlinkAction(
    blinkUrl: string,
    walletAddress: string,
    parameters?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    transaction?: string;
    error?: string;
  }> {
    if (!this.dialectBlinks) {
      console.warn('⚠️ Dialect Blinks service not available');
      return { success: false, error: 'Blinks service not available' };
    }

    try {
      const result = await this.dialectBlinks.executeBlinkAction(blinkUrl, walletAddress, parameters);
      return result;
    } catch (error) {
      console.error('❌ Error executing blink action:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Initialize the agent manager
   */
  async initialize(): Promise<void> {
    console.log('🤖 Initializing Agent Manager...');

    try {
      // Load existing agents from database
      await this.loadAgentsFromDatabase();

      // Initialize Dialect monitor (non-blocking)
      try {
        await this.dialectMonitor.start();
      } catch (monitorError) {
        console.warn('⚠️ Dialect monitor failed to start, continuing without monitoring:', monitorError);
        // Continue without monitoring
      }

      // Start monitoring
      this.startMonitoring();

      console.log(`✅ Agent Manager initialized with ${this.agents.size} agents`);
      this.emit('initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Agent Manager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the agent manager
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Agent Manager...');

    // Stop monitoring
    this.stopMonitoring();

    // Stop Dialect monitor
    await this.dialectMonitor.stop();

    // Cancel active executions
    for (const [contextId, context] of this.activeExecutions) {
      console.log(`⏸️ Cancelling execution: ${contextId}`);
      this.activeExecutions.delete(contextId);
    }

    console.log('✅ Agent Manager shut down');
    this.emit('shutdown');
  }

  /**
   * Create a new agent
   */
  async createAgent(request: CreateAgentRequest, userId?: string): Promise<Agent> {
    console.log(`🆕 Creating new agent: ${request.name}`);

    // Validate request
    this.validateCreateAgentRequest(request);

    const agentId = nanoid();
    const now = new Date().toISOString();

    const agent: Agent = {
      id: agentId,
      name: request.name,
      description: request.description,
      avatar: request.aiConfig.personality?.traits?.[0] ? this.generateAvatar(request.aiConfig.personality.traits[0]) : "",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      userId: userId || "",

      aiConfig: {
        model: 'gpt-4-turbo',
        provider: 'openai' as const,
        temperature: 0.7,
        maxTokens: 1000,
        systemPrompt: this.generateSystemPrompt(request),
        enableRag: true,
        contextMemory: 10,
        ...request.aiConfig,
      },

      eventTriggers: (request.eventTriggers || []).map(trigger => ({
        ...trigger,
        id: nanoid(),
      })),

      actions: (request.actions || []).map(action => ({
        ...action,
        id: nanoid(),
        executionCount: 0,
        successRate: 100,
      })),

      stats: {
        totalTriggers: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageResponseTime: 0,
        lastActivity: now,
        uptime: 100,
        eventsProcessed: {} as Record<string, number>,
        popularActions: [],
      },

      settings: {
        maxConcurrentActions: 5,
        executionTimeout: this.config.defaultExecutionTimeout,
        rateLimitPerMinute: 60,
        enableDetailedLogging: this.config.enableDetailedLogging,
        alertOnFailure: true,
        allowedOrigins: ['*'],
        requireAuthentication: false,
        maxMemoryUsage: 512,
        ...request.settings,
      },
    };

    // Save to database
    await this.saveAgentToDatabase(agent);

    // Add to memory
    this.agents.set(agentId, agent);

    // Update Dialect monitor with event triggers
    if (agent.eventTriggers.length > 0) {
      this.dialectMonitor.addEventTriggers(agentId, agent.eventTriggers);
    }

    // Update statistics
    this.globalStats.totalAgents++;
    if (agent.isActive) {
      this.globalStats.activeAgents++;
    }

    console.log(`✅ Created agent: ${agent.name} (${agentId})`);
    this.emit('agent_created', agent);

    return agent;
  }

  /**
   * Update an existing agent
   */
  async updateAgent(agentId: string, request: UpdateAgentRequest): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new ValidationError(`Agent not found: ${agentId}`, agentId, 'AGENT_NOT_FOUND', 'agentId', agentId);
    }

    console.log(`📝 Updating agent: ${agent.name}`);

    // Update fields
    const updatedAgent: Agent = {
      ...agent,
      ...request,
      updatedAt: new Date().toISOString(),
    } as Agent;

    // Merge AI config if provided
    if (request.aiConfig) {
      updatedAgent.aiConfig = {
        ...agent.aiConfig,
        ...request.aiConfig,
      };
    }

    // Update event triggers
    if (request.eventTriggers) {
      updatedAgent.eventTriggers = request.eventTriggers;
      this.dialectMonitor.addEventTriggers(agentId, request.eventTriggers);
    }

    // Update actions
    if (request.actions) {
      updatedAgent.actions = request.actions;
    }

    // Merge settings if provided
    if (request.settings) {
      updatedAgent.settings = {
        ...agent.settings,
        ...request.settings,
      };
    }

    // Save to database
    await this.saveAgentToDatabase(updatedAgent);

    // Update in memory
    this.agents.set(agentId, updatedAgent);

    // Update global stats if activity status changed
    if (agent.isActive !== updatedAgent.isActive) {
      if (updatedAgent.isActive) {
        this.globalStats.activeAgents++;
      } else {
        this.globalStats.activeAgents--;
      }
    }

    console.log(`✅ Updated agent: ${updatedAgent.name}`);
    this.emit('agent_updated', updatedAgent);

    return updatedAgent;
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new ValidationError(`Agent not found: ${agentId}`, agentId, 'AGENT_NOT_FOUND', 'agentId', agentId);
    }

    console.log(`🗑️ Deleting agent: ${agent.name}`);

    // Remove from Dialect monitor
    this.dialectMonitor.removeEventTriggers(agentId);

    // Cancel any active executions
    for (const [contextId, context] of this.activeExecutions) {
      if (context.agentId === agentId) {
        this.activeExecutions.delete(contextId);
      }
    }

    // Remove from database
    await this.deleteAgentFromDatabase(agentId);

    // Remove from memory
    this.agents.delete(agentId);

    // Update statistics
    this.globalStats.totalAgents--;
    if (agent.isActive) {
      this.globalStats.activeAgents--;
    }

    console.log(`✅ Deleted agent: ${agent.name}`);
    this.emit('agent_deleted', agentId);
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by user
   */
  getAgentsByUser(userId: string): Agent[] {
    return Array.from(this.agents.values()).filter(agent => agent.userId === userId);
  }

  /**
   * Start chat session with agent
   */
  async startChatSession(agentId: string, userId?: string): Promise<ChatSession> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new ValidationError(`Agent not found: ${agentId}`, agentId, 'AGENT_NOT_FOUND', 'agentId', agentId);
    }

    const sessionId = nanoid();
    const session: ChatSession = {
      id: sessionId,
      agentId,
      userId: userId || "",
      messages: [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.chatSessions.set(sessionId, session);

    console.log(`💬 Started chat session with agent ${agent.name}: ${sessionId}`);
    this.emit('chat_session_started', session);

    return session;
  }

  /**
   * Send message to agent
   */
  async sendMessage(sessionId: string, content: string, userId?: string): Promise<AgentChatMessage> {
    const session = this.chatSessions.get(sessionId);
    if (!session || !session.isActive) {
      throw new ValidationError(`Chat session not found: ${sessionId}`, sessionId, 'SESSION_NOT_FOUND', 'sessionId', sessionId);
    }

    const agent = this.agents.get(session.agentId);
    if (!agent) {
      throw new ValidationError(`Agent not found: ${session.agentId}`, session.agentId, 'AGENT_NOT_FOUND', 'agentId', session.agentId);
    }

    console.log(`💬 Processing message for agent ${agent.name}`);

    const startTime = Date.now();

    // Add user message
    const userMessage: AgentChatMessage = {
      id: nanoid(),
      agentId: agent.id,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    session.messages.push(userMessage);

    try {
      // Prepare conversation context
      const messages: CoreMessage[] = [
        { role: 'system', content: agent.aiConfig.systemPrompt },
        ...session.messages.slice(-agent.aiConfig.contextMemory * 2).map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        })),
      ];

      // Generate AI response
      const aiService = getAIService();
      const response = await aiService.generateChatCompletion(messages, {
        model: agent.aiConfig.model,
        temperature: agent.aiConfig.temperature,
        maxTokens: agent.aiConfig.maxTokens,
        enableRag: agent.aiConfig.enableRag,
      });

      const responseTime = Date.now() - startTime;

      // Create agent message
      const agentMessage: AgentChatMessage = {
        id: nanoid(),
        agentId: agent.id,
        role: 'agent',
        content: response.content,
        timestamp: new Date().toISOString(),
        metadata: {
          responseTime,
          eventTriggered: false,
          actionsExecuted: [],
        },
      };

      session.messages.push(agentMessage);
      session.updatedAt = new Date().toISOString();

      // Update agent statistics
      agent.stats.averageResponseTime =
        (agent.stats.averageResponseTime + responseTime) / 2;
      agent.stats.lastActivity = new Date().toISOString();

      // Save session
      await this.saveChatSessionToDatabase(session);

      console.log(`✅ Generated response for agent ${agent.name} in ${responseTime}ms`);
      this.emit('message_sent', agentMessage);

      return agentMessage;

    } catch (error) {
      console.error(`❌ Failed to generate response for agent ${agent.name}:`, error);

      const errorMessage: AgentChatMessage = {
        id: nanoid(),
        agentId: agent.id,
        role: 'agent',
        content: 'I apologize, but I encountered an error while processing your message. Please try again.',
        timestamp: new Date().toISOString(),
        metadata: {
          responseTime: Date.now() - startTime,
          eventTriggered: false,
          actionsExecuted: [],
        },
      };

      session.messages.push(errorMessage);
      session.updatedAt = new Date().toISOString();

      this.emit('message_error', { sessionId, error, userId });
      throw error;
    }
  }

  /**
   * Execute agent actions based on event trigger
   */
  async executeAgent(agentId: string, triggerId: string, event: SolanaEvent): Promise<ExecutionResult> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.isActive) {
      throw new ValidationError(`Agent not found or inactive: ${agentId}`, agentId, 'AGENT_NOT_FOUND', 'agentId', agentId);
    }

    const trigger = agent.eventTriggers.find(t => t.id === triggerId);
    if (!trigger) {
      throw new ValidationError(`Trigger not found: ${triggerId}`, agentId, 'TRIGGER_NOT_FOUND', 'triggerId', triggerId);
    }

    const contextId = nanoid();
    const startTime = Date.now();

    const context: ExecutionContext = {
      agentId,
      eventId: event.id,
      triggerId,
      timestamp: new Date().toISOString(),
      event,
      variables: this.extractEventVariables(event),
      metadata: {},
    };

    this.activeExecutions.set(contextId, context);

    console.log(`🎯 Executing agent ${agent.name} for trigger ${trigger.name}`);

    try {
      const actionResults: ActionResult[] = [];

      // Execute actions in sequence
      for (const actionId of trigger.actions) {
        const action = agent.actions.find(a => a.id === actionId);
        if (!action || !action.isActive) {
          console.warn(`⚠️ Action not found or inactive: ${actionId}`);
          continue;
        }

        const actionResult = await this.executeAction(action, context);
        actionResults.push(actionResult);

        // Update action statistics
        action.executionCount++;
        if (actionResult.success) {
          action.successRate = ((action.successRate * (action.executionCount - 1)) + 100) / action.executionCount;
        } else {
          action.successRate = ((action.successRate * (action.executionCount - 1)) + 0) / action.executionCount;
        }
      }

      const totalExecutionTime = Date.now() - startTime;
      const success = actionResults.every(result => result.success);

      const result: ExecutionResult = {
        contextId,
        agentId,
        success,
        actionResults,
        totalExecutionTime,
        timestamp: new Date().toISOString(),
      };

      // Update agent statistics
      agent.stats.totalTriggers++;
      if (success) {
        agent.stats.successfulExecutions++;
        this.globalStats.successfulExecutions++;
      } else {
        agent.stats.failedExecutions++;
        this.globalStats.failedExecutions++;
      }

      agent.stats.averageResponseTime =
        (agent.stats.averageResponseTime + totalExecutionTime) / 2;
      agent.stats.lastActivity = new Date().toISOString();

      // Update event type statistics
      const eventType = event.type;
      agent.stats.eventsProcessed[eventType] = (agent.stats.eventsProcessed[eventType] || 0) + 1;

      // Save agent updates
      await this.saveAgentToDatabase(agent);

      this.globalStats.totalExecutions++;
      this.activeExecutions.delete(contextId);

      console.log(`${success ? '✅' : '❌'} Execution completed for agent ${agent.name} in ${totalExecutionTime}ms`);
      this.emit('agent_executed', result);

      // Persist execution result
      try { await this.saveExecutionToDatabase(result); } catch (e) {
        console.warn('⚠️ Failed to persist execution:', e);
      }

      return result;

    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;

      const result: ExecutionResult = {
        contextId,
        agentId,
        success: false,
        actionResults: [],
        totalExecutionTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };

      agent.stats.failedExecutions++;
      this.globalStats.failedExecutions++;
      this.globalStats.totalExecutions++;

      this.activeExecutions.delete(contextId);

      console.error(`❌ Execution failed for agent ${agent.name}:`, error);
      this.emit('execution_error', { result, error });

      // Persist failed execution
      try { await this.saveExecutionToDatabase(result); } catch (e) {
        console.warn('⚠️ Failed to persist failed execution:', e);
      }

      throw new ExecutionError(`Execution failed for agent ${agentId}`, agentId, 'EXECUTION_FAILED', { context, error });
    }
  }

  /**
   * Execute individual action
   */
  private async executeAction(action: AgentAction, context: ExecutionContext): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      console.log(`🔧 Executing action: ${action.name} (${action.type})`);

      let result: any;

      switch (action.type) {
        case 'send_message':
          result = await this.executeSendMessageAction(action, context);
          break;
        case 'send_notification':
          result = await this.executeSendNotificationAction(action, context);
          break;
        case 'execute_transaction':
          result = await this.executeTransactionAction(action, context);
          break;
        case 'call_webhook':
          result = await this.executeWebhookAction(action, context);
          break;
        case 'ai_response':
          result = await this.executeAIResponseAction(action, context);
          break;
        case 'data_query':
          result = await this.executeDataQueryAction(action, context);
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        actionId: action.id,
        success: true,
        result,
        executionTime,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        actionId: action.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute send message action
   */
  private async executeSendMessageAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    const config = action.configuration as SendMessageActionConfig;

    // Replace variables in message template
    const message = this.replaceVariables(config.template, context.variables);

    // For now, just log the message (implement actual messaging later)
    console.log(`📤 Sending message to ${config.recipient}: ${message}`);

    return {
      recipient: config.recipient,
      message,
      channel: config.channel,
      sent: true,
    };
  }

  /**
   * Execute webhook action
   */
  private async executeWebhookAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    const config = action.configuration as WebhookActionConfig;

    // Prepare request data
    const requestData = {
      method: config.method,
      url: config.url,
      headers: config.headers,
      timeout: config.timeout,
    };

    if (config.body) {
      (requestData as any).data = this.replaceVariables(JSON.stringify(config.body), context.variables);
    }

    // Make HTTP request (implement actual HTTP client)
    console.log(`🌐 Making webhook request to ${config.url}`);

    return {
      url: config.url,
      method: config.method,
      status: 200,
      response: 'OK',
    };
  }

  /**
   * Execute AI response action
   */
  private async executeAIResponseAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    const aiService = getAIService();
    const agent = this.agents.get(context.agentId)!;

    const prompt = `
Based on the following blockchain event, provide an intelligent analysis:

Event Type: ${context.event.type}
Event Data: ${JSON.stringify(context.event.parsedData, null, 2)}
Timestamp: ${context.event.timestamp}

Please provide insights about what this event means and any recommended actions.
    `;

    const messages: CoreMessage[] = [
      { role: 'system', content: agent.aiConfig.systemPrompt },
      { role: 'user', content: prompt },
    ];

    const response = await aiService.generateChatCompletion(messages, {
      model: agent.aiConfig.model,
      temperature: agent.aiConfig.temperature,
      maxTokens: agent.aiConfig.maxTokens,
    });

    return {
      analysis: response.content,
      model: agent.aiConfig.model,
      contextUsed: response.ragContext ? true : false,
    };
  }

  /**
   * Execute other action types (stubs for now)
   */
  private async executeSendNotificationAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    const config = action.configuration as any;

    if (!this.dialectAlerts) {
      console.warn('⚠️ Dialect Alerts service not available');
      return { sent: false, reason: 'alerts_service_unavailable' };
    }

    // Build title/body from templates with variables from context
    const variables = {
      ...context.variables,
      eventType: context.event.type,
      tokenSymbol: context.event.parsedData?.token?.symbol,
      percentage: context.event.parsedData?.changeNormalized?.percentage,
      direction: context.event.parsedData?.change?.direction,
      window: context.event.parsedData?.changeNormalized?.window,
    } as Record<string, any>;

    const channels = Array.isArray(config?.channels) && config.channels.length
      ? config.channels
      : ['IN_APP'];

    const titleTemplate = config?.titleTemplate
      ?? (context.event.type === 'token_price_change'
        ? '{{tokenSymbol}} Price {{direction}} {{percentage}}%'
        : 'Event: {{eventType}}');

    const bodyTemplate = config?.bodyTemplate
      ?? (context.event.type === 'token_price_change'
        ? '{{tokenSymbol}} moved {{percentage}}% in the last {{window}}.'
        : 'A Dialect event was detected: {{eventType}}');

    const title = this.replaceVariables(String(titleTemplate), variables);
    const body = this.replaceVariables(String(bodyTemplate), variables);

    const walletAddress = config?.walletAddress
      || variables.walletAddress
      || variables.owner
      || variables.recipient;

    const type = (config?.type as 'price' | 'liquidation' | 'trading' | 'system')
      || (context.event.type === 'token_price_change' ? 'price' : 'system');

    try {
      if (!walletAddress) {
        // Fallback: broadcast if no recipient provided
        const res = await this.dialectAlerts.broadcastMessage(title, body, channels);
        return { sent: res.success, broadcast: true, messageId: res.messageId };
      }

      // Metadata hints for specialized notifications
      const metadata: Record<string, unknown> = {
        tokenSymbol: variables.tokenSymbol,
        priceChange: variables.percentage,
        direction: variables.direction,
        window: variables.window,
        eventType: context.event.type,
      };

      const ok = await this.sendDialectNotification(
        String(walletAddress),
        title,
        body,
        type,
        channels,
        metadata,
      );

      return { sent: ok, broadcast: false };
    } catch (error) {
      console.error('❌ Error sending Dialect notification:', error);
      return { sent: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async executeTransactionAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    console.log(`⛓️ Executing transaction for action: ${action.name}`);
    return { executed: true, type: 'transaction' };
  }

  private async executeDataQueryAction(action: AgentAction, context: ExecutionContext): Promise<any> {
    console.log(`📊 Executing data query for action: ${action.name}`);
    return { queried: true, type: 'data_query' };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle Dialect monitor events
    this.dialectMonitor.on('trigger_matched', this.handleTriggerMatched.bind(this));
    this.dialectMonitor.on('error', this.handleMonitorError.bind(this));
    this.dialectMonitor.on('status', this.handleMonitorStatus.bind(this));
  }

  /**
   * Handle trigger matched events from Dialect monitor
   */
  private async handleTriggerMatched(data: any): Promise<void> {
    const { agentId, trigger, event } = data;

    try {
      await this.executeAgent(agentId, trigger.id, event);
    } catch (error) {
      console.error(`❌ Failed to execute agent ${agentId} for trigger ${trigger.id}:`, error);
    }
  }

  /**
   * Handle monitor errors
   */
  private handleMonitorError(error: any): void {
    console.error('❌ Dialect Monitor Error:', error);
    this.emit('monitor_error', error);
  }

  /**
   * Handle monitor status updates
   */
  private handleMonitorStatus(status: any): void {
    this.emit('monitor_status', status);
  }

  /**
   * Utility methods
   */
  private validateCreateAgentRequest(request: CreateAgentRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new ValidationError('Agent name is required', '', 'VALIDATION_ERROR', 'name', request.name);
    }

    if (!request.description || request.description.trim().length === 0) {
      throw new ValidationError('Agent description is required', '', 'VALIDATION_ERROR', 'description', request.description);
    }

    if (!request.aiConfig) {
      throw new ValidationError('AI configuration is required', '', 'VALIDATION_ERROR', 'aiConfig', request.aiConfig);
    }
  }

  private generateSystemPrompt(request: CreateAgentRequest): string {
    const personality = request.aiConfig.personality;
    let prompt = `You are ${request.name}, ${request.description}`;

    if (personality) {
      prompt += `\n\nPersonality traits: ${personality.traits?.join(', ')}`;
      prompt += `\nCommunication style: ${personality.communicationStyle}`;
      prompt += `\nExpertise areas: ${personality.expertise?.join(', ')}`;
    }

    prompt += '\n\nYou are monitoring blockchain events and can take actions based on triggers. Always be helpful, accurate, and provide actionable insights.';

    return prompt;
  }

  private generateAvatar(trait: string): string {
    // Simple avatar generation based on trait
    const avatars = {
      'helpful': '🤖',
      'analytical': '🔍',
      'proactive': '⚡',
      'friendly': '😊',
      'professional': '💼',
    };

    return avatars[trait as keyof typeof avatars] || '🤖';
  }

  private extractEventVariables(event: SolanaEvent): Record<string, any> {
    return {
      eventId: event.id,
      eventType: event.type,
      timestamp: event.timestamp,
      signature: event.signature,
      slot: event.slot,
      blockTime: event.blockTime,
      ...event.parsedData,
    };
  }

  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);
  }

  private stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  private collectMetrics(): void {
    const timestamp = new Date().toISOString();

    for (const agent of this.agents.values()) {
      const metrics: MonitoringMetrics = {
        timestamp,
        agentId: agent.id,
        cpuUsage: 0, // TODO: Implement actual CPU monitoring
        memoryUsage: 0, // TODO: Implement actual memory monitoring
        responseTime: agent.stats.averageResponseTime,
        eventsReceived: Object.values(agent.stats.eventsProcessed).reduce((sum, count) => sum + count, 0),
        eventsProcessed: agent.stats.successfulExecutions,
        eventsFailed: agent.stats.failedExecutions,
        actionsExecuted: agent.stats.totalTriggers,
        actionsSucceeded: agent.stats.successfulExecutions,
        actionsFailed: agent.stats.failedExecutions,
      };

      const agentMetrics = this.metrics.get(agent.id) || [];
      agentMetrics.push(metrics);

      // Keep only last 100 metrics per agent
      if (agentMetrics.length > 100) {
        agentMetrics.shift();
      }

      this.metrics.set(agent.id, agentMetrics);
    }

    this.emit('metrics_collected', this.metrics);
  }

  /**
   * Database operations
   */
  private async loadAgentsFromDatabase(): Promise<void> {
    const dbManager = getDatabaseManager();

    try {
      const agents = dbManager.query(
        'SELECT * FROM agents ORDER BY created_at DESC'
      );

      for (const agentData of agents) {
        const agent: Agent = {
          ...agentData,
          aiConfig: JSON.parse(agentData.ai_config),
          eventTriggers: JSON.parse(agentData.event_triggers || '[]'),
          actions: JSON.parse(agentData.actions || '[]'),
          stats: JSON.parse(agentData.stats),
          settings: JSON.parse(agentData.settings),
        };

        this.agents.set(agent.id, agent);

        // Restore event triggers in monitor
        if (agent.eventTriggers.length > 0) {
          this.dialectMonitor.addEventTriggers(agent.id, agent.eventTriggers);
        }
      }

      console.log(`📥 Loaded ${agents.length} agents from database`);

    } catch (error) {
      // Table might not exist yet, create it
      console.log('📋 Creating agents table...');
      await this.createAgentsTable();
    }
  }

  private async createAgentsTable(): Promise<void> {
    const dbManager = getDatabaseManager();

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        avatar TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user_id TEXT,
        ai_config TEXT NOT NULL,
        event_triggers TEXT DEFAULT '[]',
        actions TEXT DEFAULT '[]',
        stats TEXT NOT NULL,
        settings TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_id TEXT,
        messages TEXT DEFAULT '[]',
        is_active BOOLEAN DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        trigger_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        execution_time INTEGER NOT NULL,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents (user_id);
      CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents (created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent_id ON chat_sessions (agent_id);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions (agent_id);
    `;

    dbManager.getDatabase().exec(createTableSQL);
    console.log('✅ Created agents tables');
  }

  private async saveAgentToDatabase(agent: Agent): Promise<void> {
    const dbManager = getDatabaseManager();

    dbManager.run(`
      INSERT OR REPLACE INTO agents (
        id, name, description, avatar, is_active, created_at, updated_at,
        user_id, ai_config, event_triggers, actions, stats, settings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      agent.id,
      agent.name,
      agent.description,
      agent.avatar,
      agent.isActive ? 1 : 0,
      agent.createdAt,
      agent.updatedAt,
      agent.userId,
      JSON.stringify(agent.aiConfig),
      JSON.stringify(agent.eventTriggers),
      JSON.stringify(agent.actions),
      JSON.stringify(agent.stats),
      JSON.stringify(agent.settings)
    );
  }

  private async deleteAgentFromDatabase(agentId: string): Promise<void> {
    const dbManager = getDatabaseManager();

    // Delete agent and all related data (cascading deletes will handle sessions and executions)
    dbManager.run('DELETE FROM agents WHERE id = ?', agentId);
  }

  private async saveChatSessionToDatabase(session: ChatSession): Promise<void> {
    const dbManager = getDatabaseManager();

    dbManager.run(`
      INSERT OR REPLACE INTO chat_sessions (
        id, agent_id, user_id, messages, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      session.id,
      session.agentId,
      session.userId,
      JSON.stringify(session.messages),
      session.isActive ? 1 : 0,
      session.createdAt,
      session.updatedAt
    );
  }

  private async saveExecutionToDatabase(result: ExecutionResult): Promise<void> {
    const dbManager = getDatabaseManager();

    dbManager.run(`
      INSERT INTO agent_executions (
        id, agent_id, trigger_id, event_id, success, execution_time, result, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      nanoid(),
      result.agentId,
      result.contextId, // Using contextId as trigger reference
      result.contextId, // Using contextId as event reference
      result.success ? 1 : 0,
      result.totalExecutionTime,
      JSON.stringify(result.actionResults),
      result.error,
      result.timestamp
    );
  }

  /**
   * Get agent execution history
   */
  getAgentExecutions(agentId: string, limit = 50): any[] {
    const dbManager = getDatabaseManager();

    return dbManager.query(`
      SELECT * FROM agent_executions
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, agentId, limit);
  }

  /**
   * Get recent executions across all agents
   */
  getRecentExecutions(limit = 50): any[] {
    const dbManager = getDatabaseManager();

    return dbManager.query(`
      SELECT * FROM agent_executions
      ORDER BY created_at DESC
      LIMIT ?
    `, limit);
  }

  /**
   * Get chat session
   */
  getChatSession(sessionId: string): ChatSession | null {
    const session = this.chatSessions.get(sessionId);
    if (session) return session;

    // Try loading from database
    const dbManager = getDatabaseManager();
    const sessionData = dbManager.get(
      'SELECT * FROM chat_sessions WHERE id = ?',
      sessionId
    );

    if (sessionData) {
      const session: ChatSession = {
        id: sessionData.id,
        agentId: sessionData.agent_id,
        userId: sessionData.user_id,
        messages: JSON.parse(sessionData.messages),
        isActive: Boolean(sessionData.is_active),
        createdAt: sessionData.created_at,
        updatedAt: sessionData.updated_at,
      };

      this.chatSessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    return {
      ...this.globalStats,
      uptime: Date.now() - this.globalStats.uptime,
      dialectMonitor: this.dialectMonitor.getStats(),
      activeExecutions: this.activeExecutions.size,
      queueSize: this.executionQueue.length,
    };
  }

  /**
   * Get agent metrics
   */
  getAgentMetrics(agentId: string): MonitoringMetrics[] {
    return this.metrics.get(agentId) || [];
  }

  /**
   * Get all active chat sessions
   */
  getActiveChatSessions(): ChatSession[] {
    return Array.from(this.chatSessions.values()).filter(session => session.isActive);
  }

  /**
   * Close chat session
   */
  async closeChatSession(sessionId: string): Promise<void> {
    const session = this.chatSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.updatedAt = new Date().toISOString();

      await this.saveChatSessionToDatabase(session);
      this.emit('chat_session_closed', session);
    }
  }
}

// Error classes
class ValidationError extends Error implements ValidationError {
  agentId: string;
  code: string;
  context?: Record<string, any>;
  timestamp: string;
  field: string;
  value: any;

  constructor(message: string, agentId: string, code: string, field: string, value: any, context?: Record<string, any>) {
    super(message);
    this.name = 'ValidationError';
    this.agentId = agentId;
    this.code = code;
    this.field = field;
    this.value = value;
    this.context = context || {};
    this.timestamp = new Date().toISOString();
  }
}

class ExecutionError extends Error implements ExecutionError {
  agentId: string;
  code: string;
  context?: Record<string, any>;
  timestamp: string;
  actionId?: string;
  triggerId?: string;

  constructor(message: string, agentId: string, code: string, context?: Record<string, any>) {
    super(message);
    this.name = 'ExecutionError';
    this.agentId = agentId;
    this.code = code;
    this.context = context || {};
    this.timestamp = new Date().toISOString();
  }
}

export default AgentManager;
