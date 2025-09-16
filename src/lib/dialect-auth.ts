import { z } from "zod";

// Dialect Authentication Types
export interface DialectAuthConfig {
  clientKey: string;
  baseUrl?: string;
}

export interface AuthPrepareRequest {
  walletAddress: string;
}

export interface AuthPrepareResponse {
  message: string;
  nonce: string;
  timestamp: number;
}

export interface AuthVerifyRequest {
  message: string;
  signature: string;
}

export interface AuthVerifyResponse {
  token: string;
  expiresAt: string;
  user: {
    walletAddress: string;
    isAuthenticated: boolean;
  };
}

export interface AuthenticatedUser {
  walletAddress: string;
  isAuthenticated: boolean;
  token: string;
  expiresAt: string;
}

export interface SubscriptionInfo {
  id: string;
  appId: string;
  appName: string;
  enabled: boolean;
  channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  topics: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
  }>;
  subscribedAt: string;
  lastActiveAt: string;
}

export interface UserPreferences {
  globalChannels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  defaultTopics: string[];
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string;   // HH:MM format
    timezone: string;
  };
  language: string;
  frequency: 'immediate' | 'digest' | 'daily' | 'weekly';
}

export class DialectAuthService {
  private config: DialectAuthConfig;
  private baseUrl: string;

  constructor(config: DialectAuthConfig) {
    this.config = {
      baseUrl: 'https://alerts-api.dial.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://alerts-api.dial.to';
  }

  /**
   * Prepare authentication message for wallet signing
   */
  async prepareAuth(walletAddress: string): Promise<AuthPrepareResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/auth/solana/prepare`, {
        method: 'POST',
        headers: {
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Auth prepare error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to prepare auth:', error);
      throw error;
    }
  }

  /**
   * Verify signed message and get JWT token
   */
  async verifyAuth(message: string, signature: string): Promise<AuthVerifyResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/auth/solana/verify`, {
        method: 'POST',
        headers: {
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Auth verify error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to verify auth:', error);
      throw error;
    }
  }

  /**
   * Get authenticated user information
   */
  async getAuthenticatedUser(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get user error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get authenticated user:', error);
      throw error;
    }
  }

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(token: string): Promise<SubscriptionInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/subscriptions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get subscriptions error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.subscriptions || [];
    } catch (error) {
      console.error('Failed to get user subscriptions:', error);
      throw error;
    }
  }

  /**
   * Subscribe user to an app
   */
  async subscribeToApp(token: string, appId: string, channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'> = ['IN_APP']): Promise<SubscriptionInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId,
          channels,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Subscribe error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.subscription;
    } catch (error) {
      console.error('Failed to subscribe to app:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from an app
   */
  async unsubscribeFromApp(token: string, subscriptionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Unsubscribe error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from app:', error);
      throw error;
    }
  }

  /**
   * Update subscription preferences
   */
  async updateSubscription(token: string, subscriptionId: string, updates: {
    enabled?: boolean;
    channels?: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
    topics?: string[];
  }): Promise<SubscriptionInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Update subscription error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.subscription;
    } catch (error) {
      console.error('Failed to update subscription:', error);
      throw error;
    }
  }

  /**
   * Get available apps for subscription
   */
  async getAvailableApps(token: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    websiteUrl: string;
    category: string;
    isSubscribed: boolean;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/apps`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get apps error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.apps || [];
    } catch (error) {
      console.error('Failed to get available apps:', error);
      throw error;
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(token: string): Promise<UserPreferences> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Get preferences error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.preferences;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      throw error;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(token: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/user/preferences`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Dialect-Client-Key': this.config.clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Update preferences error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.preferences;
    } catch (error) {
      console.error('Failed to update user preferences:', error);
      throw error;
    }
  }

  /**
   * Validate JWT token
   */
  isTokenValid(token: string): boolean {
    try {
      if (!token) return false;
      
      // Basic JWT structure validation
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      // Decode payload to check expiration
      const payload = JSON.parse(atob(parts[1]!));
      const now = Math.floor(Date.now() / 1000);
      
      return payload.exp > now;
    } catch {
      return false;
    }
  }

  /**
   * Extract wallet address from JWT token
   */
  getWalletAddressFromToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]!));
      return payload.walletAddress || null;
    } catch {
      return null;
    }
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectAuthConfig> }> {
    try {
      // Try to prepare auth to verify API connectivity
      await this.prepareAuth('test-wallet-address');
      
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

// Factory function to create Dialect Auth service
export function createDialectAuthService(config?: Partial<DialectAuthConfig>): DialectAuthService {
  const fullConfig: DialectAuthConfig = {
    clientKey: process.env.DIALECT_CLIENT_KEY || '',
    baseUrl: process.env.DIALECT_ALERTS_BASE_URL || 'https://alerts-api.dial.to',
    ...config,
  };

  if (!fullConfig.clientKey) {
    throw new Error('DIALECT_CLIENT_KEY environment variable is required');
  }

  return new DialectAuthService(fullConfig);
}

export default DialectAuthService;
