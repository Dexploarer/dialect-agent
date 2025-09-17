import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  SolanaEvent,
  DialectEvent,
  TokenTransferEvent,
  EventTrigger,
  EventType,
  DialectSubscription,
  EventCondition,
} from './types.js';

export interface DialectMonitorConfig {
  solanaRpcUrl: string;
  solanaWsUrl: string;
  dialectApiUrl: string;
  dialectWebhookUrl: string;
  apiKey?: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  eventBufferSize: number;
}

export interface DialectWebhookEvent {
  event: string;
  timestamp: string;
  token?: {
    symbol: string;
    address: string;
    name?: string;
  };
  // Price change events may send either legacy or new fields
  change?: {
    direction: 'up' | 'down';
    // Newer schema
    from?: { timestamp: string; value: number };
    to?: { timestamp: string; value: number };
    absolute?: number;
    percentage?: number;
    // Legacy schema
    percentage_change?: number;
    price_before?: number;
    price_after?: number;
  };
  // Trigger details
  trigger?: {
    type?: string;
    window?: { duration: string };
    threshold?: number;
  };
  // Trending token events
  metrics?: Record<string, any>;
  // Extra payload data
  data?: Record<string, unknown>;
}

export class DialectEventMonitor extends EventEmitter {
  private config: DialectMonitorConfig;
  private solanaWs: WebSocket | null = null;

  private subscriptions = new Map<string, DialectSubscription>();
  private eventTriggers = new Map<string, EventTrigger[]>();
  private eventBuffer: SolanaEvent[] = [];
  private recentWebhookFingerprints: string[] = [];
  private recentWebhookSet: Set<string> = new Set();

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
      solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      solanaWsUrl: process.env.SOLANA_WS_URL || process.env.SOLANA_WEBSOCKET_URL || 'wss://api.devnet.solana.com',
      dialectApiUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
      dialectWebhookUrl: process.env.DIALECT_WEBHOOK_URL || '/api/webhooks/dialect',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      eventBufferSize: 1000,
      ...config,
    };

    this.setupEventHandlers();
  }

  /**
   * Start monitoring Dialect and Solana events
   */
  async start(): Promise<void> {
    console.log('🚀 Starting Dialect Event Monitor...');

    try {
      // Start our webhook endpoint to receive Dialect events
      this.setupDialectWebhook();

      // Try to connect to Solana, but don't fail if it's not available
      try {
        await this.connectSolana();
      } catch (solanaError) {
        console.warn('⚠️ Solana WebSocket connection failed, continuing without Solana monitoring:', solanaError);
        // Continue without Solana connection
      }

      this.startHeartbeat();

      console.log('✅ Dialect Event Monitor started successfully');
      console.log(`📡 Webhook endpoint ready at: ${this.config.dialectWebhookUrl}`);
      this.emit('started');

    } catch (error) {
      console.error('❌ Failed to start Dialect Event Monitor:', error);
      this.emit('error', error);
      // Don't throw error - let server continue without monitoring
      console.warn('⚠️ Continuing server startup without event monitoring...');
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

    if (this.solanaWs) {
      this.solanaWs.close();
      this.solanaWs = null;
    }

    console.log('✅ Dialect Event Monitor stopped');
    this.emit('stopped');
  }

  /**
   * Process incoming Dialect webhook events
   */
  processDialectWebhook(webhookData: DialectWebhookEvent[]): void {
    console.log(`📨 Received ${webhookData.length} Dialect webhook events`);

    for (const webhookEvent of webhookData) {
      try {
        // Deduplicate events by fingerprint of payload
        const fingerprint = this.computeWebhookFingerprint(webhookEvent);
        if (this.recentWebhookSet.has(fingerprint)) {
          console.log('⏭️  Skipping duplicate webhook event');
          continue;
        }
        this.rememberWebhookFingerprint(fingerprint);

        // Convert Dialect webhook event to our internal format
        const event = this.convertWebhookToEvent(webhookEvent);
        
        // Add to buffer
        this.addToEventBuffer(event);

        // Update statistics
        this.stats.eventsReceived++;
        this.stats.lastEventTime = Date.now();

        // Emit for processing
        this.emit('event', event);

        console.log(`📊 Processed Dialect event: ${webhookEvent.event} for ${webhookEvent.token?.symbol || 'unknown token'}`);

      } catch (error) {
        console.error('❌ Failed to process Dialect webhook event:', error);
        this.stats.eventsFailed++;
        this.emit('error', error);
      }
    }
  }

  /**
   * Preview normalized events without mutating internal state
   */
  previewNormalizedEvents(webhookData: DialectWebhookEvent[]): SolanaEvent[] {
    const result: SolanaEvent[] = [];
    for (const evt of webhookData) {
      try {
        const converted = this.convertWebhookToEvent(evt);
        result.push(converted);
      } catch (e) {
        // Skip invalid items
        continue;
      }
    }
    return result;
  }

  /**
   * Convert Dialect webhook event to internal event format
   */
  private convertWebhookToEvent(webhookEvent: DialectWebhookEvent): SolanaEvent {
    const eventId = `dialect-${webhookEvent.event}-${webhookEvent.timestamp}-${this.computeWebhookFingerprint(webhookEvent).slice(0, 16)}`;

    return {
      id: eventId,
      type: this.mapDialectEventType(webhookEvent.event),
      timestamp: webhookEvent.timestamp,
      signature: 'dialect-webhook',
      slot: 0,
      blockTime: new Date(webhookEvent.timestamp).getTime() / 1000,
      transaction: {
        signatures: [],
        message: {
          accountKeys: [],
          instructions: [],
        },
      },
      parsedData: this.normalizeParsedData(webhookEvent),
      processed: false,
    };
  }

  /**
   * Normalize Dialect payload into a stable shape while preserving raw fields
   */
  private normalizeParsedData(evt: DialectWebhookEvent) {
    const change = evt.change || {} as any;

    // Prefer explicit values, but fill convenience fields for consumers
    const percentage =
      typeof change.percentage === 'number' ? change.percentage :
      typeof change.percentage_change === 'number' ? change.percentage_change :
      undefined;

    const absolute =
      typeof change.absolute === 'number' ? change.absolute : undefined;

    const fromPrice =
      typeof change.price_before === 'number' ? change.price_before :
      typeof change.from?.value === 'number' ? change.from.value :
      undefined;

    const toPrice =
      typeof change.price_after === 'number' ? change.price_after :
      typeof change.to?.value === 'number' ? change.to.value :
      undefined;

    return {
      dialectEvent: evt.event,
      token: evt.token,
      trigger: evt.trigger,
      metrics: (evt as any).metrics,
      // Keep original change payload
      change,
      // Normalized helpers for conditions/filters
      changeNormalized: {
        direction: change.direction,
        percentage,
        absolute,
        fromPrice,
        toPrice,
        window: evt.trigger?.window?.duration,
        threshold: evt.trigger?.threshold,
      },
      data: evt.data,
      raw: evt,
    };
  }

  /**
   * Compute a simple deterministic fingerprint for deduplication
   */
  private computeWebhookFingerprint(evt: DialectWebhookEvent): string {
    try {
      const canonical = JSON.stringify({
        event: evt.event,
        token: evt.token || null,
        change: evt.change || null,
        trigger: evt.trigger || null,
        timestamp: evt.timestamp,
        data: evt.data || null,
      });
      // Simple DJB2 hash to avoid adding heavy deps
      let hash = 5381;
      for (let i = 0; i < canonical.length; i++) {
        hash = ((hash << 5) + hash) ^ canonical.charCodeAt(i);
      }
      // Convert to unsigned 32-bit and hex
      return (hash >>> 0).toString(16);
    } catch {
      // Fallback to time-based
      return `${Date.now()}`;
    }
  }

  private rememberWebhookFingerprint(f: string): void {
    this.recentWebhookSet.add(f);
    this.recentWebhookFingerprints.push(f);
    // trim window to last 500 entries
    if (this.recentWebhookFingerprints.length > 500) {
      const removed = this.recentWebhookFingerprints.shift();
      if (removed) this.recentWebhookSet.delete(removed);
    }
  }

  /**
   * Map Dialect event types to our internal event types
   */
  private mapDialectEventType(dialectEvent: string): EventType {
    switch (dialectEvent) {
      case 'token_price_change':
        return 'token_price_change';
      case 'trending_token':
        return 'trending_token';
      default:
        return 'custom_event';
    }
  }

  /**
   * Find all matching triggers for an event (does not execute)
   */
  public findMatchingTriggersForEvent(event: SolanaEvent): Array<{ agentId: string; trigger: EventTrigger }>{
    const matches: Array<{ agentId: string; trigger: EventTrigger }> = [];
    for (const [agentId, triggers] of this.eventTriggers.entries()) {
      for (const trigger of triggers) {
        if (!trigger || !trigger.isActive) continue;
        if ((this as any).matchesEventTrigger(event, trigger)) {
          matches.push({ agentId, trigger });
        }
      }
    }
    return matches;
  }

  /**
   * Add subscription for monitoring specific accounts/programs
   */
  addSubscription(subscription: DialectSubscription): void {
    console.log(`📡 Adding subscription: ${subscription.name}`);
    this.subscriptions.set(subscription.id, subscription);
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
   * Setup Dialect webhook endpoint (this will be handled by the main server)
   */
  private setupDialectWebhook(): void {
    console.log('🔌 Dialect webhook endpoint configured');
    console.log(`📡 Webhook URL: ${this.config.dialectWebhookUrl}`);
    console.log('💡 Register this webhook URL with Dialect to receive events');
  }

  /**
   * Connect to Solana WebSocket for real-time transaction monitoring
   */
  private async connectSolana(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Solana WebSocket...');

      this.solanaWs = new WebSocket(this.config.solanaWsUrl);

      // Set a timeout for connection
      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          console.warn('⚠️ Solana WebSocket connection timeout (continuing without real-time data)');
          this.solanaWs?.close();
          resolve(); // Don't reject, just continue
        }
      }, 5000);

      this.solanaWs.on('open', () => {
        console.log('✅ Connected to Solana WebSocket');
        this.isConnected = true;
        clearTimeout(timeout);
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
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.solanaWs.on('error', (error: Error) => {
        console.warn('⚠️ Solana WebSocket error (continuing without real-time data):', error);
        clearTimeout(timeout);
        resolve(); // Don't reject, just continue without WebSocket
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
   * Handle Solana WebSocket messages
   */
  private handleSolanaMessage(message: any): void {
    if (message.method === 'accountNotification') {
      const { subscription, result } = message.params;
      this.handleSolanaAccountChange(subscription, result);
    }
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

    const firstCondition = conditions[0];
    if (!firstCondition) return true;

    let result = this.evaluateCondition(event, firstCondition);

    for (let i = 1; i < conditions.length; i++) {
      const condition = conditions[i];
      if (!condition) continue;
      
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
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      // Just log status for webhook-based monitoring
      console.log('💓 Dialect Event Monitor heartbeat - webhook endpoint active');
    }, this.config.heartbeatInterval);
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
        await this.connectSolana();
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
