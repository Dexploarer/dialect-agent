import { z } from "zod";

// Dialect Alerts API Types
export interface DialectAlertRecipient {
  type: 'subscriber' | 'all';
  walletAddress?: string;
}

export interface DialectAlertMessage {
  title: string;
  body: string;
  image?: string;
  actions?: Array<{
    type: string;
    label: string;
    url: string;
  }>;
}

export interface DialectAlertRequest {
  recipient: DialectAlertRecipient;
  channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  message: DialectAlertMessage;
  topicId?: string;
  data?: Record<string, unknown>;
  push?: {
    showNotification: boolean;
    playNotificationSound: boolean;
  };
}

export interface DialectBatchAlertRequest {
  alerts: Array<DialectAlertRequest & {
    recipient: DialectAlertRecipient & {
      walletAddress: string;
    };
  }>;
}

export interface DialectAlertResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DialectBatchAlertResponse {
  success: boolean;
  results: Array<{
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export interface DialectAlertsConfig {
  apiKey: string;
  appId: string;
  baseUrl?: string;
}

export class DialectAlertsService {
  private config: DialectAlertsConfig;
  private baseUrl: string;

  constructor(config: DialectAlertsConfig) {
    this.config = {
      baseUrl: 'https://alerts-api.dial.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://alerts-api.dial.to';
  }

  /**
   * Send a single alert to a user
   */
  async sendAlert(alert: DialectAlertRequest): Promise<DialectAlertResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/${this.config.appId}/send`, {
        method: 'POST',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error('Failed to send Dialect alert:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send multiple alerts in a batch (up to 500)
   */
  async sendBatchAlerts(batchRequest: DialectBatchAlertRequest): Promise<DialectBatchAlertResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/${this.config.appId}/send-batch`, {
        method: 'POST',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        results: result.results || [],
      };
    } catch (error) {
      console.error('Failed to send Dialect batch alerts:', error);
      return {
        success: false,
        results: [],
      };
    }
  }

  /**
   * Send a price alert notification
   */
  async sendPriceAlert(
    walletAddress: string,
    tokenSymbol: string,
    priceChange: number,
    currentPrice: number,
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP']
  ): Promise<DialectAlertResponse> {
    const direction = priceChange > 0 ? '📈' : '📉';
    const changeText = priceChange > 0 ? 'increased' : 'decreased';
    
    const alert: DialectAlertRequest = {
      recipient: {
        type: 'subscriber',
        walletAddress,
      },
      channels,
      message: {
        title: `${tokenSymbol} Price Alert ${direction}`,
        body: `${tokenSymbol} has ${changeText} by ${Math.abs(priceChange).toFixed(2)}% to $${currentPrice.toFixed(2)}`,
        actions: [
          {
            type: 'view',
            label: 'View Details',
            url: `https://your-app.com/token/${tokenSymbol}`,
          },
        ],
      },
      topicId: 'price-alerts',
      data: {
        tokenSymbol,
        priceChange,
        currentPrice,
        timestamp: new Date().toISOString(),
      },
      push: {
        showNotification: true,
        playNotificationSound: true,
      },
    };

    return this.sendAlert(alert);
  }

  /**
   * Send a liquidation warning
   */
  async sendLiquidationWarning(
    walletAddress: string,
    protocol: string,
    collateralToken: string,
    healthFactor: number,
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['PUSH', 'IN_APP']
  ): Promise<DialectAlertResponse> {
    const alert: DialectAlertRequest = {
      recipient: {
        type: 'subscriber',
        walletAddress,
      },
      channels,
      message: {
        title: '⚠️ Liquidation Warning',
        body: `Your ${protocol} position with ${collateralToken} is at risk. Health factor: ${healthFactor.toFixed(2)}`,
        actions: [
          {
            type: 'action',
            label: 'Add Collateral',
            url: `https://your-app.com/protocol/${protocol}/add-collateral`,
          },
          {
            type: 'action',
            label: 'Repay Debt',
            url: `https://your-app.com/protocol/${protocol}/repay`,
          },
        ],
      },
      topicId: 'liquidation-warnings',
      data: {
        protocol,
        collateralToken,
        healthFactor,
        timestamp: new Date().toISOString(),
      },
      push: {
        showNotification: true,
        playNotificationSound: true,
      },
    };

    return this.sendAlert(alert);
  }

  /**
   * Send a trading opportunity alert
   */
  async sendTradingOpportunity(
    walletAddress: string,
    tokenSymbol: string,
    opportunity: string,
    potentialGain: number,
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP']
  ): Promise<DialectAlertResponse> {
    const alert: DialectAlertRequest = {
      recipient: {
        type: 'subscriber',
        walletAddress,
      },
      channels,
      message: {
        title: '🎯 Trading Opportunity',
        body: `${tokenSymbol}: ${opportunity}. Potential gain: ${potentialGain.toFixed(2)}%`,
        actions: [
          {
            type: 'action',
            label: 'View Analysis',
            url: `https://your-app.com/analysis/${tokenSymbol}`,
          },
          {
            type: 'action',
            label: 'Execute Trade',
            url: `https://your-app.com/trade/${tokenSymbol}`,
          },
        ],
      },
      topicId: 'trading-opportunities',
      data: {
        tokenSymbol,
        opportunity,
        potentialGain,
        timestamp: new Date().toISOString(),
      },
      push: {
        showNotification: true,
        playNotificationSound: false,
      },
    };

    return this.sendAlert(alert);
  }

  /**
   * Send a system status notification
   */
  async sendSystemNotification(
    walletAddress: string,
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'error' = 'info',
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP']
  ): Promise<DialectAlertResponse> {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
    }[severity];

    const alert: DialectAlertRequest = {
      recipient: {
        type: 'subscriber',
        walletAddress,
      },
      channels,
      message: {
        title: `${emoji} ${title}`,
        body: message,
        actions: [
          {
            type: 'view',
            label: 'View Details',
            url: 'https://your-app.com/status',
          },
        ],
      },
      topicId: 'system-notifications',
      data: {
        severity,
        timestamp: new Date().toISOString(),
      },
      push: {
        showNotification: severity !== 'info',
        playNotificationSound: severity === 'error',
      },
    };

    return this.sendAlert(alert);
  }

  /**
   * Broadcast a message to all subscribers
   */
  async broadcastMessage(
    title: string,
    body: string,
    channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP'],
    topicId?: string
  ): Promise<DialectAlertResponse> {
    const alert: DialectAlertRequest = {
      recipient: {
        type: 'all',
      },
      channels,
      message: {
        title,
        body,
        actions: [
          {
            type: 'view',
            label: 'Learn More',
            url: 'https://your-app.com',
          },
        ],
      },
      ...(topicId && { topicId }),
      data: {
        broadcast: true,
        timestamp: new Date().toISOString(),
      },
      push: {
        showNotification: true,
        playNotificationSound: false,
      },
    };

    return this.sendAlert(alert);
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectAlertsConfig> }> {
    return {
      status: 'healthy',
      config: {
        appId: this.config.appId,
        baseUrl: this.baseUrl,
        // Don't expose API key in health check
      },
    };
  }
}

// Factory function to create Dialect Alerts service
export function createDialectAlertsService(config?: Partial<DialectAlertsConfig>): DialectAlertsService {
  const fullConfig: DialectAlertsConfig = {
    apiKey: process.env.DIALECT_API_KEY || '',
    appId: process.env.DIALECT_APP_ID || '',
    baseUrl: process.env.DIALECT_ALERTS_BASE_URL || 'https://alerts-api.dial.to',
    ...config,
  };

  if (!fullConfig.apiKey) {
    throw new Error('DIALECT_API_KEY environment variable is required');
  }

  if (!fullConfig.appId) {
    throw new Error('DIALECT_APP_ID environment variable is required');
  }

  return new DialectAlertsService(fullConfig);
}

export default DialectAlertsService;
