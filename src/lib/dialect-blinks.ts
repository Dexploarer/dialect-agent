import { z } from "zod";

// Dialect Blinks API Types
export interface DialectBlinkPreview {
  title: string;
  description: string;
  image: string;
  cta: string;
  context: {
    category: string;
    url: string;
    websiteUrl: string;
    provider: {
      name: string;
      icon: string;
    };
  };
  links: {
    blink: string;
    dataTable: string;
  };
}

export interface DialectBlinkData {
  rows: Array<{
    key: string;
    title: string;
    value: string;
    icon?: string;
    url?: string;
  }>;
  extendedDescription: string;
}

export interface DialectBlink {
  preview: DialectBlinkPreview;
  data: DialectBlinkData;
  actions: Array<{
    id: string;
    type: string;
    label: string;
    url: string;
    method: 'GET' | 'POST';
    parameters?: Record<string, unknown>;
  }>;
}

export interface DialectBlinkConfig {
  apiKey: string;
  baseUrl?: string;
  clientKey?: string;
}

export interface BlinkFilters {
  category?: string;
  provider?: string;
  type?: string;
}

export class DialectBlinksService {
  private config: DialectBlinkConfig;
  private baseUrl: string;

  constructor(config: DialectBlinkConfig) {
    this.config = {
      baseUrl: 'https://api.dialect.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://api.dialect.to';
  }

  /**
   * Get blink preview by URL
   */
  async getBlinkPreview(blinkUrl: string): Promise<DialectBlinkPreview> {
    const encodedUrl = encodeURIComponent(blinkUrl);
    const response = await fetch(`${this.baseUrl}/v1/blink-preview?apiUrl=${encodedUrl}`, {
      method: 'GET',
      headers: {
        'x-dialect-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        ...(this.config.clientKey ? { 'x-blink-client-key': this.config.clientKey } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Dialect Blinks API error: ${response.status} - ${response.statusText} ${errorText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get mock blink preview data for development
   */
  // Removed mock preview generator; failures will now throw errors

  /**
   * Get full blink data by URL
   */
  async getBlink(blinkUrl: string): Promise<DialectBlink> {
    try {
      const encodedUrl = encodeURIComponent(blinkUrl);
      const response = await fetch(`${this.baseUrl}/v1/blink?apiUrl=${encodedUrl}`, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...(this.config.clientKey ? { 'x-blink-client-key': this.config.clientKey } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect Blinks API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch blink:', error);
      throw error;
    }
  }

  /**
   * Get blink data table by URL
   */
  async getBlinkDataTable(blinkUrl: string): Promise<DialectBlinkData> {
    try {
      const encodedUrl = encodeURIComponent(blinkUrl);
      const response = await fetch(`${this.baseUrl}/v1/blink-data-table?apiUrl=${encodedUrl}`, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...(this.config.clientKey ? { 'x-blink-client-key': this.config.clientKey } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect Blinks API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch blink data table:', error);
      throw error;
    }
  }

  /**
   * Execute a blink action (POST request to blink provider)
   */
  async executeBlinkAction(
    actionUrl: string,
    walletAddress: string,
    parameters?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    transaction?: string;
    error?: string;
  }> {
    try {
      const requestBody = {
        account: walletAddress,
        ...parameters,
      };

      const response = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-blockchain-ids': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Blink action error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        transaction: data.transaction,
      };
    } catch (error) {
      console.error('Failed to execute blink action:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get popular blinks by category
   */
  async getPopularBlinks(category?: string): Promise<DialectBlinkPreview[]> {
    try {
      // This would typically be a curated list or fetched from a directory
      // For now, we'll return some common blink URLs that can be fetched
      const popularBlinkUrls = [
        'https://jito.dial.to/stake',
        'https://marinade.dial.to/stake',
        'https://kamino.dial.to/deposit',
        'https://marginfi.dial.to/deposit',
      ];

      const previews: DialectBlinkPreview[] = [];
      
      for (const url of popularBlinkUrls) {
        try {
          const preview = await this.getBlinkPreview(url);
          if (!category || preview.context.category.toLowerCase().includes(category.toLowerCase())) {
            previews.push(preview);
          }
        } catch (error) {
          console.warn(`Failed to fetch preview for ${url}:`, error);
        }
      }

      return previews;
    } catch (error) {
      console.error('Failed to fetch popular blinks:', error);
      throw error;
    }
  }

  /**
   * Search blinks by query
   */
  async searchBlinks(query: string): Promise<DialectBlinkPreview[]> {
    try {
      const popularBlinks = await this.getPopularBlinks();
      const searchTerm = query.toLowerCase();
      
      return popularBlinks.filter(blink => 
        blink.title.toLowerCase().includes(searchTerm) ||
        blink.description.toLowerCase().includes(searchTerm) ||
        blink.context.provider.name.toLowerCase().includes(searchTerm) ||
        blink.context.category.toLowerCase().includes(searchTerm)
      );
    } catch (error) {
      console.error('Failed to search blinks:', error);
      throw error;
    }
  }

  /**
   * Get blinks by provider
   */
  async getBlinksByProvider(provider: string): Promise<DialectBlinkPreview[]> {
    try {
      const popularBlinks = await this.getPopularBlinks();
      return popularBlinks.filter(blink => 
        blink.context.provider.name.toLowerCase().includes(provider.toLowerCase())
      );
    } catch (error) {
      console.error('Failed to fetch blinks by provider:', error);
      throw error;
    }
  }

  /**
   * Validate blink URL
   */
  isValidBlinkUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('dial.to') || urlObj.hostname.includes('dialect.to');
    } catch {
      return false;
    }
  }

  /**
   * Extract blink metadata from URL
   */
  extractBlinkMetadata(blinkUrl: string): {
    provider?: string;
    action?: string;
    parameters?: Record<string, string>;
  } {
    try {
      const url = new URL(blinkUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      const metadata: {
        provider?: string;
        action?: string;
        parameters?: Record<string, string>;
      } = {};

      if (pathParts.length > 0) {
        metadata.provider = pathParts[0]!;
      }
      
      if (pathParts.length > 1) {
        metadata.action = pathParts[1]!;
      }

      // Extract query parameters
      const params: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      if (Object.keys(params).length > 0) {
        metadata.parameters = params;
      }

      return metadata;
    } catch {
      return {};
    }
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectBlinkConfig> }> {
    try {
      // Try to fetch a known blink to verify API connectivity
      await this.getBlinkPreview('https://jito.dial.to/stake');
      
      return {
        status: 'healthy',
        config: {
          baseUrl: this.baseUrl,
          // Don't expose API key in health check
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

// Factory function to create Dialect Blinks service
export function createDialectBlinksService(config?: Partial<DialectBlinkConfig>): DialectBlinksService {
  const fullConfig: DialectBlinkConfig = {
    apiKey: process.env.DIALECT_API_KEY || '',
    baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
    clientKey: process.env.DIALECT_CLIENT_KEY || undefined,
    ...config,
  };

  if (!fullConfig.apiKey) {
    throw new Error('DIALECT_API_KEY environment variable is required');
  }

  return new DialectBlinksService(fullConfig);
}

export default DialectBlinksService;
