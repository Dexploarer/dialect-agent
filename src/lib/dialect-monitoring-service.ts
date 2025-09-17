/**
 * Dialect Monitoring Service
 * 
 * Advanced event monitoring and detection service that integrates with
 * Dialect's monitoring infrastructure for real-time blockchain event detection
 */

import { EventEmitter } from 'events';
import { z } from 'zod';

// Event schemas
export const EventSchema = z.object({
  id: z.string(),
  type: z.enum(['price_change', 'liquidation', 'deposit', 'withdraw', 'swap', 'stake', 'unstake', 'custom']),
  timestamp: z.string(),
  data: z.record(z.any()),
  source: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  walletAddress: z.string().optional(),
  tokenAddress: z.string().optional(),
  amount: z.number().optional(),
  price: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export const MonitoringConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  webhookUrl: z.string().optional(),
  monitoringInterval: z.number().default(30000), // 30 seconds
  maxRetries: z.number().default(3),
  retryDelay: z.number().default(5000),
});

export type Event = z.infer<typeof EventSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

export interface EventFilter {
  type?: string[];
  severity?: string[];
  walletAddress?: string;
  tokenAddress?: string;
  minAmount?: number;
  maxAmount?: number;
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    type: string;
    operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'regex';
    value: any;
    field: string;
  }[];
  actions: {
    type: 'alert' | 'webhook' | 'email' | 'sms';
    config: Record<string, any>;
  }[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  averageProcessingTime: number;
  lastEventTime: string | null;
  activeRules: number;
  failedEvents: number;
}

export class DialectMonitoringService extends EventEmitter {
  private config: MonitoringConfig;
  private baseUrl: string;
  private isRunning: boolean = false;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private eventBuffer: Event[] = [];
  private rules: Map<string, MonitoringRule> = new Map();
  private stats: MonitoringStats = {
    totalEvents: 0,
    eventsByType: {},
    eventsBySeverity: {},
    averageProcessingTime: 0,
    lastEventTime: null,
    activeRules: 0,
    failedEvents: 0,
  };

  constructor(config: MonitoringConfig) {
    super();
    this.config = MonitoringConfigSchema.parse(config);
    this.baseUrl = this.config.baseUrl || 'https://api.dialect.to';
  }

  /**
   * Initialize the monitoring service
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔍 Initializing Dialect Monitoring Service...');
      
      // Load existing monitoring rules
      await this.loadMonitoringRules();
      
      // Start monitoring
      await this.startMonitoring();
      
      console.log('✅ Dialect Monitoring Service initialized');
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Failed to initialize monitoring service:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start monitoring for events
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Monitoring service is already running');
      return;
    }

    console.log('🚀 Starting event monitoring...');
    this.isRunning = true;

    // Start periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      await this.checkForEvents();
    }, this.config.monitoringInterval);

    // Process buffered events
    this.processEventBuffer();

    this.emit('monitoring_started');
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping event monitoring...');
    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Check for new events
   */
  private async checkForEvents(): Promise<void> {
    try {
      // In a real implementation, this would poll Dialect's event API
      // For now, we'll simulate event detection
      const mockEvents = this.generateMockEvents();
      
      for (const event of mockEvents) {
        await this.processEvent(event);
      }
    } catch (error) {
      console.error('❌ Error checking for events:', error);
      this.stats.failedEvents++;
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: Event): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate event
      const validatedEvent = EventSchema.parse(event);
      
      // Add to buffer
      this.eventBuffer.push(validatedEvent);
      
      // Update stats
      this.updateStats(validatedEvent);
      
      // Check against monitoring rules
      await this.checkMonitoringRules(validatedEvent);
      
      // Emit event
      this.emit('event', validatedEvent);
      
      const processingTime = Date.now() - startTime;
      this.stats.averageProcessingTime = 
        (this.stats.averageProcessingTime + processingTime) / 2;
        
    } catch (error) {
      console.error('❌ Error processing event:', error);
      this.stats.failedEvents++;
    }
  }

  /**
   * Check event against monitoring rules
   */
  private async checkMonitoringRules(event: Event): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      const matches = this.evaluateRuleConditions(event, rule);
      if (matches) {
        await this.executeRuleActions(event, rule);
      }
    }
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateRuleConditions(event: Event, rule: MonitoringRule): boolean {
    return rule.conditions.every(condition => {
      const eventValue = this.getEventValue(event, condition.field);
      return this.evaluateCondition(eventValue, condition.operator, condition.value);
    });
  }

  /**
   * Get value from event by field path
   */
  private getEventValue(event: Event, field: string): any {
    const fields = field.split('.');
    let value = event as any;
    
    for (const f of fields) {
      value = value?.[f];
    }
    
    return value;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(value: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'eq': return value === expectedValue;
      case 'gt': return value > expectedValue;
      case 'lt': return value < expectedValue;
      case 'gte': return value >= expectedValue;
      case 'lte': return value <= expectedValue;
      case 'contains': return String(value).includes(String(expectedValue));
      case 'regex': return new RegExp(expectedValue).test(String(value));
      default: return false;
    }
  }

  /**
   * Execute rule actions
   */
  private async executeRuleActions(event: Event, rule: MonitoringRule): Promise<void> {
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'alert':
            await this.sendAlert(event, action.config);
            break;
          case 'webhook':
            await this.sendWebhook(event, action.config);
            break;
          case 'email':
            await this.sendEmail(event, action.config);
            break;
          case 'sms':
            await this.sendSMS(event, action.config);
            break;
        }
      } catch (error) {
        console.error(`❌ Error executing action ${action.type}:`, error);
      }
    }
  }

  /**
   * Send alert
   */
  private async sendAlert(event: Event, config: Record<string, any>): Promise<void> {
    console.log(`🚨 Alert triggered for event ${event.id}:`, {
      type: event.type,
      severity: event.severity,
      message: config.message || 'Event detected',
    });
    
    this.emit('alert', { event, config });
  }

  /**
   * Send webhook
   */
  private async sendWebhook(event: Event, config: Record<string, any>): Promise<void> {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token || this.config.apiKey}`,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          source: 'dialect-monitoring',
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log(`📡 Webhook sent for event ${event.id}`);
    } catch (error) {
      console.error('❌ Webhook error:', error);
    }
  }

  /**
   * Send email (mock implementation)
   */
  private async sendEmail(event: Event, config: Record<string, any>): Promise<void> {
    console.log(`📧 Email alert for event ${event.id} to ${config.recipients}`);
    this.emit('email', { event, config });
  }

  /**
   * Send SMS (mock implementation)
   */
  private async sendSMS(event: Event, config: Record<string, any>): Promise<void> {
    console.log(`📱 SMS alert for event ${event.id} to ${config.recipients}`);
    this.emit('sms', { event, config });
  }

  /**
   * Process buffered events
   */
  private processEventBuffer(): void {
    if (this.eventBuffer.length === 0) return;

    console.log(`📦 Processing ${this.eventBuffer.length} buffered events`);
    
    // Process events in batches
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < this.eventBuffer.length; i += batchSize) {
      batches.push(this.eventBuffer.slice(i, i + batchSize));
    }

    batches.forEach(batch => {
      this.emit('event_batch', batch);
    });

    this.eventBuffer = [];
  }

  /**
   * Update monitoring statistics
   */
  private updateStats(event: Event): void {
    this.stats.totalEvents++;
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;
    this.stats.eventsBySeverity[event.severity] = (this.stats.eventsBySeverity[event.severity] || 0) + 1;
    this.stats.lastEventTime = event.timestamp;
    this.stats.activeRules = Array.from(this.rules.values()).filter(r => r.enabled).length;
  }

  /**
   * Generate mock events for testing
   */
  private generateMockEvents(): Event[] {
    const events: Event[] = [];
    const now = new Date().toISOString();
    
    // Randomly generate 0-3 events per check
    const eventCount = Math.floor(Math.random() * 4);
    
    for (let i = 0; i < eventCount; i++) {
      const eventTypes = ['price_change', 'liquidation', 'deposit', 'withdraw', 'swap'];
      const severities = ['low', 'medium', 'high', 'critical'];
      
      const event: Event = {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: eventTypes[Math.floor(Math.random() * eventTypes.length)] as any,
        timestamp: now,
        data: {
          amount: Math.random() * 1000,
          price: Math.random() * 200,
          token: 'SOL',
        },
        source: 'mock-monitor',
        severity: severities[Math.floor(Math.random() * severities.length)] as any,
        walletAddress: `wallet_${Math.random().toString(36).substr(2, 9)}`,
        tokenAddress: 'So11111111111111111111111111111111111111112',
        metadata: {
          protocol: 'Kamino',
          market: 'lending',
        },
      };
      
      events.push(event);
    }
    
    return events;
  }

  /**
   * Load monitoring rules
   */
  private async loadMonitoringRules(): Promise<void> {
    // In a real implementation, this would load from a database or API
    const defaultRules: MonitoringRule[] = [
      {
        id: 'liquidation-alert',
        name: 'Liquidation Alert',
        description: 'Alert when liquidation events occur',
        conditions: [
          {
            type: 'event_type',
            operator: 'eq',
            value: 'liquidation',
            field: 'type',
          },
        ],
        actions: [
          {
            type: 'alert',
            config: {
              message: 'Liquidation event detected!',
              channels: ['IN_APP', 'PUSH'],
            },
          },
        ],
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'high-value-deposit',
        name: 'High Value Deposit',
        description: 'Alert for deposits over $10,000',
        conditions: [
          {
            type: 'event_type',
            operator: 'eq',
            value: 'deposit',
            field: 'type',
          },
          {
            type: 'amount',
            operator: 'gt',
            value: 10000,
            field: 'data.amount',
          },
        ],
        actions: [
          {
            type: 'alert',
            config: {
              message: 'High value deposit detected!',
              channels: ['IN_APP', 'EMAIL'],
            },
          },
        ],
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    console.log(`📋 Loaded ${this.rules.size} monitoring rules`);
  }

  /**
   * Add a new monitoring rule
   */
  async addRule(rule: Omit<MonitoringRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<MonitoringRule> {
    const newRule: MonitoringRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.rules.set(newRule.id, newRule);
    console.log(`➕ Added monitoring rule: ${newRule.name}`);
    
    this.emit('rule_added', newRule);
    return newRule;
  }

  /**
   * Update an existing monitoring rule
   */
  async updateRule(id: string, updates: Partial<MonitoringRule>): Promise<MonitoringRule | null> {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.rules.set(id, updatedRule);
    console.log(`✏️ Updated monitoring rule: ${updatedRule.name}`);
    
    this.emit('rule_updated', updatedRule);
    return updatedRule;
  }

  /**
   * Delete a monitoring rule
   */
  async deleteRule(id: string): Promise<boolean> {
    const rule = this.rules.get(id);
    if (!rule) {
      return false;
    }

    this.rules.delete(id);
    console.log(`🗑️ Deleted monitoring rule: ${rule.name}`);
    
    this.emit('rule_deleted', rule);
    return true;
  }

  /**
   * Get all monitoring rules
   */
  getRules(): MonitoringRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get monitoring statistics
   */
  getStats(): MonitoringStats {
    return { ...this.stats };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 50): Event[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    rulesCount: number;
    activeRules: number;
    stats: MonitoringStats;
  } {
    return {
      running: this.isRunning,
      rulesCount: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      stats: this.getStats(),
    };
  }
}

/**
 * Create and initialize Dialect Monitoring Service
 */
export function createDialectMonitoringService(config: MonitoringConfig): DialectMonitoringService {
  const service = new DialectMonitoringService(config);
  return service;
}


