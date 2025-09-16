import { z } from "zod";

// Dialect Inbox Types
export interface DialectInboxConfig {
  clientKey: string;
  baseUrl?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  image?: string;
  actions?: Array<{
    type: string;
    label: string;
    url: string;
  }>;
  data?: Record<string, unknown>;
  appId: string;
  appName: string;
  topicId?: string;
  topicName?: string;
  channel: 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH';
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface NotificationHistory {
  notifications: Notification[];
  totalCount: number;
  unreadCount: number;
  hasMore: boolean;
  cursor?: string;
}

export interface NotificationSummary {
  unreadCount: number;
  lastReadAt: string;
  totalNotifications: number;
  recentNotifications: Notification[];
}

export interface MarkReadRequest {
  notificationIds?: string[];
  markAll?: boolean;
  appId?: string;
}

export interface ClearHistoryRequest {
  appId?: string;
  olderThan?: string; // ISO date string
}

export interface ChannelConfig {
  type: 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH';
  enabled: boolean;
  settings?: {
    email?: {
      address?: string;
      verified: boolean;
    };
    telegram?: {
      username?: string;
      verified: boolean;
    };
    push?: {
      deviceId?: string;
      fcmToken?: string;
      verified: boolean;
    };
  };
}

export class DialectInboxService {
  private config: DialectInboxConfig;
  private baseUrl: string;

  constructor(config: DialectInboxConfig) {
    this.config = {
      baseUrl: 'https://alerts-api.dial.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://alerts-api.dial.to';
  }

  /**
   * Get notification history with pagination
   */
  async getNotificationHistory(
    token: string,
    options: {
      appId?: string;
      limit?: number;
      cursor?: string;
      unreadOnly?: boolean;
    } = {}
  ): Promise<NotificationHistory> {
    try {
      const params = new URLSearchParams();
      if (options.appId) params.append('appId', options.appId);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.cursor) params.append('cursor', options.cursor);
      if (options.unreadOnly) params.append('unreadOnly', 'true');

      const response = await fetch(`${this.baseUrl}/v2/notifications?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get notifications error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get notification history:', error);
      throw error;
    }
  }

  /**
   * Get notification summary
   */
  async getNotificationSummary(token: string, appId?: string): Promise<NotificationSummary> {
    try {
      const params = new URLSearchParams();
      if (appId) params.append('appId', appId);

      const response = await fetch(`${this.baseUrl}/v2/notifications/summary?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get summary error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get notification summary:', error);
      throw error;
    }
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsRead(token: string, request: MarkReadRequest): Promise<{ success: boolean; count: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/notifications/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Mark read error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      throw error;
    }
  }

  /**
   * Clear notification history
   */
  async clearNotificationHistory(token: string, request: ClearHistoryRequest = {}): Promise<{ success: boolean; count: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/notifications/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Clear history error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to clear notification history:', error);
      throw error;
    }
  }

  /**
   * Get user channels configuration
   */
  async getUserChannels(token: string): Promise<ChannelConfig[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get channels error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.channels || [];
    } catch (error) {
      console.error('Failed to get user channels:', error);
      throw error;
    }
  }

  /**
   * Update channel configuration
   */
  async updateChannel(token: string, channelType: 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH', config: Partial<ChannelConfig>): Promise<ChannelConfig> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels/${channelType.toLowerCase()}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Update channel error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.channel;
    } catch (error) {
      console.error('Failed to update channel:', error);
      throw error;
    }
  }

  /**
   * Prepare email channel for verification
   */
  async prepareEmailChannel(token: string, email: string): Promise<{ success: boolean; verificationSent: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels/email/prepare`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Prepare email error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to prepare email channel:', error);
      throw error;
    }
  }

  /**
   * Verify email channel
   */
  async verifyEmailChannel(token: string, verificationCode: string): Promise<{ success: boolean; verified: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels/email/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Verify email error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to verify email channel:', error);
      throw error;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPushNotifications(
    token: string,
    deviceId: string,
    fcmToken: string,
    appId?: string
  ): Promise<{ success: boolean; subscribed: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels/push/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          fcmToken,
          appId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Subscribe push error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPushNotifications(
    token: string,
    deviceId: string,
    appId?: string
  ): Promise<{ success: boolean; unsubscribed: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/channels/push/unsubscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          appId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Unsubscribe push error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      throw error;
    }
  }

  /**
   * Get available topics for an app
   */
  async getAppTopics(token: string, appId: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    slug: string;
    isSubscribed: boolean;
    category: string;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/apps/${appId}/topics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get topics error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.topics || [];
    } catch (error) {
      console.error('Failed to get app topics:', error);
      throw error;
    }
  }

  /**
   * Subscribe to topic
   */
  async subscribeToTopic(token: string, topicId: string): Promise<{ success: boolean; subscribed: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/topics/${topicId}/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Subscribe topic error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to subscribe to topic:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from topic
   */
  async unsubscribeFromTopic(token: string, topicId: string): Promise<{ success: boolean; unsubscribed: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/topics/${topicId}/unsubscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Unsubscribe topic error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to unsubscribe from topic:', error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectInboxConfig> }> {
    try {
      // Try to get notification summary to verify API connectivity
      await this.getNotificationSummary('test-token');
      
      return {
        status: 'healthy',
        config: {
          baseUrl: this.baseUrl,
          // Don't expose client key in health check
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        config: {
          baseUrl: this.baseUrl,
        },
      };
    }
  }
}

// Factory function to create Dialect Inbox service
export function createDialectInboxService(config?: Partial<DialectInboxConfig>): DialectInboxService {
  const fullConfig: DialectInboxConfig = {
    clientKey: process.env.DIALECT_CLIENT_KEY || '',
    baseUrl: process.env.DIALECT_ALERTS_BASE_URL || 'https://alerts-api.dial.to',
    ...config,
  };

  if (!fullConfig.clientKey) {
    throw new Error('DIALECT_CLIENT_KEY environment variable is required');
  }

  return new DialectInboxService(fullConfig);
}

export default DialectInboxService;

