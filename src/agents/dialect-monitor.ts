import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  SolanaEvent,
  DialectEvent,
  TokenTransferEvent,
  EventTrigger,
  EventType,
  WebSocketMessage,
  EventMessage,
  StatusMessage,
  DialectSubscription,
  EventCondition,
} from './types.js';

export interface DialectMonitorConfig {
  solanaRpcUrl: string;
  solanaWsUrl: string;
  dialectApiUrl: string;
  dialectWebSocketUrl: string;
  apiKey?: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  eventBufferSize: number;
}

export class DialectEventMonitor extends EventEmitter {
  private config: DialectMonitorConfig;
  private solanaConnection: Connection;
  private dialectWs: WebSocket | null = null;
  private solanaWs: WebSocket | null = null;

  private subscriptions = new Map<string, DialectSubscription>();
  private eventTriggers = new Map<string, EventTrigger[]>();
  private eventBuffer: SolanaEvent[] = [];

  private isConnected = false;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Statistics
  private stats = {
    eventsReceived: 0,
    eventsProcessed: 0,
    eventsFailed: 0,
    uptime: Date.now(),
    lastEventTime: 0,
  };

  constructor(config: Partial<DialectMonitorConfig> = {}) {
    super();

    this.config = {
      solanaRpcUrl: process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'),
      solanaWsUrl: process.env.SOLANA_WS_URL || 'wss://api.devnet.solana.com',
      dialectApiUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
      dialectWebSocketUrl: process.env.DIALECT_WS_URL || 'wss://api.dialect.to/ws',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      eventBufferSize: 1000,
      ...config,
    };

    this.solanaConnection = new Connection(this.config.solanaRpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: this.config.solanaWsUrl,
    });

    this.setupEventHandlers();
  }

  /**
   * Start monitoring Dialect and Solana events
   */
  async start(): Promise<void> {
    console.log('🚀 Starting Dialect Event Monitor...');

    try {
      await this.connectDialect();
      await this.connectSolana();
      this.startHeartbeat();

      console.log('✅ Dialect Event Monitor started successfully');
      this.emit('started');

    } catch (error) {
      console.error('❌ Failed to start Dialect Event Monitor:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop monitoring and cleanup connections
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Dialect Event Monitor...');

    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.dialectWs) {
      this.dialectWs.close();
      this.dialectWs = null;
    }

    if (this.solanaWs) {
      this.solanaWs.close();
      this.solanaWs = null;
    }

    console.log('✅ Dialect Event Monitor stopped');
    this.emit('stopped');
  }

  /**
   * Add subscription for monitoring specific accounts/programs
   */
  addSubscription(subscription: DialectSubscription): void {
    console.log(`📡 Adding subscription: ${subscription.name}`);
    this.subscriptions.set(subscription.id, subscription);

    if (this.isConnected) {
      this.sendSubscriptionUpdate();
    }

    this.emit('subscription_added', subscription);
  }

  /**
   * Remove subscription
   */
  removeSubscription(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      console.log(`📡 Removing subscription: ${subscription.name}`);
      this.subscriptions.delete(subscriptionId);

      if (this.isConnected) {
        this.sendSubscriptionUpdate();
      }

      this.emit('subscription_removed', subscription);
    }
  }

  /**
   * Add event triggers for an agent
   */
  addEventTriggers(agentId: string, triggers: EventTrigger[]): void {
    console.log(`🎯 Adding ${triggers.length} event triggers for agent ${agentId}`);
    this.eventTriggers.set(agentId, triggers);
    this.emit('triggers_updated', agentId, triggers);
  }

  /**
   * Remove event triggers for an agent
   */
  removeEventTriggers(agentId: string): void {
    console.log(`🎯 Removing event triggers for agent ${agentId}`);
    this.eventTriggers.delete(agentId);
    this.emit('triggers_removed', agentId);
  }

  /**
   * Get current monitoring statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.uptime,
      subscriptions: this.subscriptions.size,
      triggers: Array.from(this.eventTriggers.values()).reduce((sum, triggers) => sum + triggers.length, 0),
      isConnected: this.isConnected,
      eventBufferSize: this.eventBuffer.length,
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('event', this.handleEvent.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  /**
   * Connect to Dialect WebSocket
   */
  private async connectDialect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Dialect WebSocket...');

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      this.dialectWs = new WebSocket(this.config.dialectWebSocketUrl, { headers });

      this.dialectWs.on('open', () => {
        console.log('✅ Connected to Dialect WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.sendSubscriptionUpdate();
        resolve();
      });

      this.dialectWs.on('message', (data: WebSocket.Data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleDialectMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse Dialect message:', error);
          this.emit('error', error);
        }
      });

      this.dialectWs.on('close', (code: number, reason: Buffer) => {
        console.log(`🔌 Dialect WebSocket closed: ${code} - ${reason.toString()}`);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.dialectWs.on('error', (error: Error) => {
        console.error('❌ Dialect WebSocket error:', error);
        reject(error);
      });
    });
  }

  /**
   * Connect to Solana WebSocket for real-time transaction monitoring
   */
  private async connectSolana(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Solana WebSocket...');

      this.solanaWs = new WebSocket(this.config.solanaWsUrl);

      this.solanaWs.on('open', () => {
        console.log('✅ Connected to Solana WebSocket');
        this.subscribeSolanaEvents();
        resolve();
      });

      this.solanaWs.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleSolanaMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse Solana message:', error);
        }
      });

      this.solanaWs.on('close', () => {
        console.log('🔌 Solana WebSocket closed');
        this.scheduleReconnect();
      });

      this.solanaWs.on('error', (error: Error) => {
        console.error('❌ Solana WebSocket error:', error);
        reject(error);
      });
    });
  }

  /**
   * Subscribe to Solana events based on current subscriptions
   */
  private subscribeSolanaEvents(): void {
    if (!this.solanaWs) return;

    // Subscribe to account changes for monitored addresses
    for (const subscription of this.subscriptions.values()) {
      if (subscription.isActive) {
        const subscribeMessage = {
          jsonrpc: '2.0',
          id: subscription.id,
          method: 'accountSubscribe',
          params: [
            subscription.accountAddress.toString(),
            {
              commitment: 'confirmed',
              encoding: 'base64+zstd',
            },
          ],
        };

        this.solanaWs.send(JSON.stringify(subscribeMessage));
        console.log(`📡 Subscribed to Solana account: ${subscription.accountAddress.toString()}`);
      }
    }
  }

  /**
   * Handle Dialect WebSocket messages
   */
  private handleDialectMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'event':
        this.handleDialectEvent(message as EventMessage);
        break;
      case 'status':
        this.handleStatusMessage(message as StatusMessage);
        break;
      case 'error':
        console.error('❌ Dialect error:', message.payload);
        this.emit('error', new Error(message.payload.message));
        break;
      case 'ping':
        this.sendPong();
        break;
    }
  }

  /**
   * Handle Solana WebSocket messages
   */
  private handleSolanaMessage(message: any): void {
    if (message.method === 'accountNotification') {
      const { subscription, result } = message.params;
      this.handleSolanaAccountChange(subscription, result);
    }
  }

  /**
   * Handle Dialect events
   */
  private handleDialectEvent(message: EventMessage): void {
    const event = message.payload;

    // Add to buffer
    this.addToEventBuffer(event);

    // Update statistics
    this.stats.eventsReceived++;
    this.stats.lastEventTime = Date.now();

    // Emit for processing
    this.emit('event', event);
  }

  /**
   * Handle Solana account changes
   */
  private handleSolanaAccountChange(subscriptionId: string, result: any): void {
    const subscription = Array.from(this.subscriptions.values())
      .find(sub => sub.id === subscriptionId);

    if (!subscription) return;

    // Create synthetic event for account change
    const event: SolanaEvent = {
      id: `${subscriptionId}-${Date.now()}`,
      type: 'account_balance_change',
      timestamp: new Date().toISOString(),
      signature: 'account_change',
      slot: result.context.slot,
      blockTime: Date.now() / 1000,
      transaction: {
        signatures: [],
        message: {
          accountKeys: [subscription.accountAddress],
          instructions: [],
        },
      },
      parsedData: {
        account: subscription.accountAddress.toString(),
        lamports: result.value.lamports,
        data: result.value.data,
        owner: result.value.owner,
        executable: result.value.executable,
        rentEpoch: result.value.rentEpoch,
      },
      processed: false,
    };

    this.addToEventBuffer(event);
    this.stats.eventsReceived++;
    this.emit('event', event);
  }

  /**
   * Handle status messages from Dialect
   */
  private handleStatusMessage(message: StatusMessage): void {
    console.log('📊 Dialect status:', message.payload);
    this.emit('status', message.payload);
  }

  /**
   * Process incoming events and check triggers
   */
  private async handleEvent(event: SolanaEvent): Promise<void> {
    try {
      // Check all agent triggers
      for (const [agentId, triggers] of this.eventTriggers.entries()) {
        for (const trigger of triggers) {
          if (trigger.isActive && this.matchesEventTrigger(event, trigger)) {
            console.log(`🎯 Event ${event.id} triggered action for agent ${agentId}`);
            this.emit('trigger_matched', {
              agentId,
              trigger,
              event,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      this.stats.eventsProcessed++;
      event.processed = true;

    } catch (error) {
      console.error('❌ Failed to process event:', error);
      this.stats.eventsFailed++;
      event.processingError = error instanceof Error ? error.message : String(error);
      this.emit('error', error);
    }
  }

  /**
   * Check if event matches trigger conditions
   */
  private matchesEventTrigger(event: SolanaEvent, trigger: EventTrigger): boolean {
    // Check event type
    if (trigger.eventType !== event.type) {
      return false;
    }

    // Check conditions
    if (trigger.conditions.length === 0) {
      return true;
    }

    return this.evaluateConditions(event, trigger.conditions);
  }

  /**
   * Evaluate trigger conditions against event data
   */
  private evaluateConditions(event: SolanaEvent, conditions: EventCondition[]): boolean {
    if (conditions.length === 0) return true;

    let result = this.evaluateCondition(event, conditions[0]);

    for (let i = 1; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionResult = this.evaluateCondition(event, condition);

      if (condition.logicalOperator === 'OR') {
        result = result || conditionResult;
      } else {
        result = result && conditionResult;
      }
    }

    return result;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(event: SolanaEvent, condition: EventCondition): boolean {
    const value = this.getEventFieldValue(event, condition.field);
    const expectedValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return value === expectedValue;
      case 'not_equals':
        return value !== expectedValue;
      case 'greater_than':
        return Number(value) > Number(expectedValue);
      case 'less_than':
        return Number(value) < Number(expectedValue);
      case 'contains':
        return String(value).includes(String(expectedValue));
      case 'regex':
        return new RegExp(expectedValue).test(String(value));
      default:
        return false;
    }
  }

  /**
   * Extract field value from event using dot notation
   */
  private getEventFieldValue(event: SolanaEvent, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = event;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Add event to buffer with size management
   */
  private addToEventBuffer(event: SolanaEvent): void {
    this.eventBuffer.push(event);

    // Maintain buffer size
    if (this.eventBuffer.length > this.config.eventBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Send subscription updates to Dialect
   */
  private sendSubscriptionUpdate(): void {
    if (!this.dialectWs || this.dialectWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.isActive)
      .map(sub => ({
        id: sub.id,
        account: sub.accountAddress.toString(),
        eventTypes: sub.eventTypes,
      }));

    const message = {
      type: 'subscribe',
      payload: { subscriptions },
      timestamp: new Date().toISOString(),
    };

    this.dialectWs.send(JSON.stringify(message));
    console.log(`📡 Updated ${subscriptions.length} Dialect subscriptions`);
  }

  /**
   * Send pong response to ping
   */
  private sendPong(): void {
    if (this.dialectWs && this.dialectWs.readyState === WebSocket.OPEN) {
      const message = {
        type: 'pong',
        payload: {},
        timestamp: new Date().toISOString(),
      };
      this.dialectWs.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.config.heartbeatInterval);
  }

  /**
   * Send ping to check connection
   */
  private sendPing(): void {
    if (this.dialectWs && this.dialectWs.readyState === WebSocket.OPEN) {
      const message = {
        type: 'ping',
        payload: {},
        timestamp: new Date().toISOString(),
      };
      this.dialectWs.send(JSON.stringify(message));
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('max_reconnect_attempts_reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * this.reconnectAttempts;

    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        console.log('🔄 Attempting to reconnect...');
        await this.start();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Handle monitor errors
   */
  private handleError(error: any): void {
    console.error('❌ Dialect Monitor Error:', error);

    // Emit error with context
    this.emit('monitor_error', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
    });
  }

  /**
   * Get recent events from buffer
   */
  getRecentEvents(limit = 100): SolanaEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: EventType, limit = 100): SolanaEvent[] {
    return this.eventBuffer
      .filter(event => event.type === eventType)
      .slice(-limit);
  }
}

export default DialectEventMonitor;
