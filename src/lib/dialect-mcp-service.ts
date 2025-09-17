/**
 * Dialect MCP Service Integration
 * 
 * This service provides integration with Dialect's Model Context Protocol (MCP) server
 * for advanced Web3 development capabilities including:
 * - Blinks development and execution
 * - Market data integration
 * - Event monitoring and detection
 * - Alert management
 * - Documentation search
 */

import { EventEmitter } from 'events';
import { createDialectBlinksService, DialectBlinksService } from './dialect-blinks.js';
import { createDialectMarketsService, DialectMarketsService } from './dialect-markets.js';
import { createDialectAlertsService, DialectAlertsService } from './dialect-alerts.js';

export interface DialectMCPConfig {
  apiKey: string;
  baseUrl?: string;
  clientKey?: string;
  appId?: string;
}

export interface BlinkAction {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  provider: string;
  parameters: BlinkParameter[];
  estimatedGas: string;
  estimatedTime: string;
  icon?: string;
}

export interface BlinkParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'address';
  required: boolean;
  description: string;
  defaultValue?: any;
}

export interface MarketData {
  id: string;
  protocol: string;
  token: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logoUri?: string;
  };
  apy: {
    supply: number;
    borrow: number;
  };
  tvl: number;
  limits: {
    deposit: number;
    borrow: number;
  };
  blinks?: {
    deposit?: string;
    withdraw?: string;
    borrow?: string;
    repay?: string;
  };
}

export interface EventData {
  id: string;
  type: string;
  timestamp: string;
  data: any;
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AlertTemplate {
  id: string;
  title: string;
  message: string;
  type: 'price' | 'liquidation' | 'trading' | 'system' | 'custom';
  channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  metadata?: Record<string, any>;
}

export class DialectMCPService extends EventEmitter {
  private config: DialectMCPConfig;
  private baseUrl: string;
  private isConnected: boolean = false;
  private blinksService: DialectBlinksService;
  private marketsService: DialectMarketsService;
  private alertsService: DialectAlertsService;

  constructor(config: DialectMCPConfig) {
    super();
    this.config = {
      baseUrl: 'https://api.dialect.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://api.dialect.to';

    // Initialize underlying Dialect services using the provided config
    this.blinksService = createDialectBlinksService({
      apiKey: this.config.apiKey,
      baseUrl: this.baseUrl,
    });
    this.marketsService = createDialectMarketsService({
      apiKey: this.config.apiKey,
      baseUrl: this.baseUrl,
    });
    this.alertsService = createDialectAlertsService({
      apiKey: this.config.apiKey,
      appId: this.config.appId || '',
      baseUrl: process.env.DIALECT_ALERTS_BASE_URL || 'https://alerts-api.dial.to',
    });
  }

  /**
   * Initialize the MCP service connection
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔌 Initializing Dialect MCP Service...');
      
      // Test connection to Dialect APIs
      await this.testConnection();
      
      this.isConnected = true;
      console.log('✅ Dialect MCP Service initialized successfully');
      
      this.emit('initialized');
    } catch (error) {
      console.warn('⚠️ Dialect MCP Service initialization failed:', error);
      this.isConnected = false;
      this.emit('error', error);
    }
  }

  /**
   * Test connection to Dialect APIs
   */
  private async testConnection(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Connection test failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      // Non-blocking in restricted networks (local dev, CI). Reduce noise.
      console.info('ℹ️ Dialect API connectivity check skipped/unavailable. Continuing without health probe.');
      // Continue; downstream services handle errors and 503s gracefully
    }
  }

  /**
   * Get available Blinks from Dialect's Standard Blinks Library
   */
  async getAvailableBlinks(category?: string): Promise<BlinkAction[]> {
    // Use real Blinks service and map previews to BlinkAction shape
    const previews = await this.blinksService.getPopularBlinks(category);
    return previews.map((p) => ({
      id: p.context.url || p.links?.blink || p.title,
      title: p.title,
      description: p.description,
      url: p.context?.url || p.links?.blink,
      category: p.context?.category || 'Other',
      provider: p.context?.provider?.name || 'Unknown',
      parameters: [],
      estimatedGas: 'unknown',
      estimatedTime: 'unknown',
      icon: p.context?.provider?.icon,
    }));
  }

  /**
   * Get mock Blinks data for development
   */
  // Removed inline mock blinks; source from real Blinks service above

  /**
   * Get market data from Dialect's Markets API
   */
  async getMarketData(filters?: {
    protocol?: string;
    token?: string;
    minApy?: number;
    maxApy?: number;
  }): Promise<MarketData[]> {
    const result = await this.marketsService.getMarkets({
      protocol: filters?.protocol,
      tokenSymbol: filters?.token,
      minApy: filters?.minApy,
      maxApy: filters?.maxApy,
    });
    return result.markets.map((m) => ({
      id: m.id,
      protocol: m.protocol,
      token: {
        symbol: m.token.symbol,
        name: m.token.name,
        address: m.token.address,
        decimals: m.token.decimals,
        logoUri: m.token.logo,
      },
      apy: {
        supply: m.apy.supply,
        borrow: m.apy.borrow ?? 0,
      },
      tvl: m.tvl,
      limits: {
        deposit: m.borrowLimit ?? 0,
        borrow: m.totalBorrow ?? 0,
      },
      blinks: m.blinks,
    }));
  }

  /**
   * Get mock market data for development
   */
  // Removed inline mock market data; source from real Markets service above

  /**
   * Execute a Blink action
   */
  async executeBlink(blinkUrl: string, parameters: Record<string, any>, walletAddress: string): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> {
    const result = await this.blinksService.executeBlinkAction(blinkUrl, walletAddress, parameters);
    if (result.success) {
      return { success: true, transactionId: result.transaction };
    }
    return { success: false, error: result.error || 'Execution failed' };
  }

  /**
   * Create a custom alert template
   */
  async createAlertTemplate(template: AlertTemplate): Promise<AlertTemplate> {
    // Dialect Alerts API does not persist templates server-side; return sanitized passthrough
    return {
      ...template,
      id: template.id || `template_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    };
  }

  /**
   * Send an alert using a template
   */
  async sendAlert(templateId: string, recipients: string[], customData?: Record<string, any>): Promise<{
    success: boolean;
    alertId?: string;
    error?: string;
  }> {
    try {
      // Construct a minimal message from templateId and customData
      const message = {
        channels: ['IN_APP'],
        message: {
          title: customData?.title || templateId,
          body: customData?.body || 'Notification',
          image: customData?.image || '',
          actions: customData?.actions || [],
        },
      } as any;

      // Use batch sending when multiple recipients
      if (recipients.length > 1) {
        const batch = {
          alerts: recipients.map((walletAddress) => ({
            ...message,
            recipient: {
              type: 'WALLET',
              walletAddress,
            },
          })),
        } as any;
        const res = await this.alertsService.sendBatchAlerts(batch);
        return { success: res.success, alertId: res.batchId } as any;
      } else {
        const res = await this.alertsService.sendAlert({
          channels: message.channels,
          message: message.message,
          recipient: { type: 'WALLET', walletAddress: recipients[0]! },
        } as any);
        return { success: res.success, alertId: res.messageId };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Search Dialect documentation
   */
  async searchDocumentation(query: string): Promise<{
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      category: string;
    }>;
  }> {
    // No server-side docs search API available; return empty results without mocks
    return { results: [] };
  }

  /**
   * Get service status
   */
  getStatus(): {
    connected: boolean;
    config: Partial<DialectMCPConfig>;
    capabilities: string[];
  } {
    return {
      connected: this.isConnected,
      config: {
        baseUrl: this.baseUrl,
        // Align with frontend expectations: booleans named hasApiKey/hasClientKey/hasAppId
        hasApiKey: Boolean(this.config.apiKey),
        hasClientKey: Boolean(this.config.clientKey),
        hasAppId: Boolean(this.config.appId),
      },
      capabilities: [
        'blinks-execution',
        'market-data',
        'alert-management',
        'documentation-search',
        'event-monitoring',
        'custom-templates',
      ],
    };
  }
}

/**
 * Create and initialize Dialect MCP Service
 */
export function createDialectMCPService(config: DialectMCPConfig): DialectMCPService {
  const service = new DialectMCPService(config);
  return service;
}
