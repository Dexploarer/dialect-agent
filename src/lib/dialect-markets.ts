import { z } from "zod";

// Dialect Markets API Types
export interface DialectMarket {
  id: string;
  protocol: string;
  type: 'lending' | 'multiply' | 'leverage' | 'liquidity';
  token: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logo?: string;
  };
  apy: {
    supply: number;
    borrow?: number;
    net?: number;
  };
  tvl: number;
  totalSupply: number;
  totalBorrow?: number;
  utilizationRate?: number;
  borrowLimit?: number;
  collateralFactor?: number;
  liquidationThreshold?: number;
  metadata: {
    description?: string;
    website?: string;
    documentation?: string;
  };
  blinks?: {
    deposit?: string;
    withdraw?: string;
    borrow?: string;
    repay?: string;
  };
}

export interface DialectMarketsResponse {
  markets: DialectMarket[];
  total: number;
  protocols: string[];
}

export interface DialectMarketsConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface MarketFilters {
  protocol?: string;
  type?: 'lending' | 'multiply' | 'leverage' | 'liquidity';
  tokenSymbol?: string;
  minApy?: number;
  maxApy?: number;
  minTvl?: number;
  maxTvl?: number;
}

export class DialectMarketsService {
  private config: DialectMarketsConfig;
  private baseUrl: string;

  constructor(config: DialectMarketsConfig) {
    this.config = {
      baseUrl: 'https://api.dialect.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://api.dialect.to';
  }

  /**
   * Get all markets with optional filtering
   */
  async getMarkets(filters?: MarketFilters): Promise<DialectMarketsResponse> {
    const queryParams = new URLSearchParams();
    
    if (filters?.protocol) queryParams.append('protocol', filters.protocol);
    if (filters?.type) queryParams.append('type', filters.type);
    if (filters?.tokenSymbol) queryParams.append('token', filters.tokenSymbol);
    if (filters?.minApy !== undefined) queryParams.append('minApy', filters.minApy.toString());
    if (filters?.maxApy !== undefined) queryParams.append('maxApy', filters.maxApy.toString());
    if (filters?.minTvl !== undefined) queryParams.append('minTvl', filters.minTvl.toString());
    if (filters?.maxTvl !== undefined) queryParams.append('maxTvl', filters.maxTvl.toString());

    const url = `${this.baseUrl}/v0/markets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-dialect-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Dialect Markets API error: ${response.status} - ${response.statusText} ${errorText}`);
    }

    const data = await response.json();
    
    return {
      markets: data.markets || [],
      total: data.total || 0,
      protocols: data.protocols || [],
    };
  }

  /**
   * Get mock markets data for development
   */
  // Removed mock markets response; failures will now throw errors

  /**
   * Get markets grouped by type
   */
  async getMarketsGroupedByType(): Promise<Record<string, DialectMarket[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/v0/markets/grouped-by-type`, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect Markets API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      return data.markets || {};
    } catch (error) {
      console.error('Failed to fetch grouped markets:', error);
      throw error;
    }
  }

  /**
   * Get markets by protocol
   */
  async getMarketsByProtocol(protocol: string): Promise<DialectMarket[]> {
    const result = await this.getMarkets({ protocol });
    return result.markets;
  }

  /**
   * Get lending markets only
   */
  async getLendingMarkets(): Promise<DialectMarket[]> {
    const result = await this.getMarkets({ type: 'lending' });
    return result.markets;
  }

  /**
   * Get markets with high APY
   */
  async getHighYieldMarkets(minApy: number = 10): Promise<DialectMarket[]> {
    const result = await this.getMarkets({ minApy });
    return result.markets.sort((a, b) => b.apy.supply - a.apy.supply);
  }

  /**
   * Get markets by token symbol
   */
  async getMarketsByToken(tokenSymbol: string): Promise<DialectMarket[]> {
    const result = await this.getMarkets({ tokenSymbol });
    return result.markets;
  }

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<{
    totalMarkets: number;
    totalProtocols: number;
    totalTvl: number;
    averageApy: number;
    topProtocols: Array<{ protocol: string; tvl: number; marketCount: number }>;
  }> {
    try {
      const markets = await this.getMarkets();
      
      const totalTvl = markets.markets.reduce((sum, market) => sum + market.tvl, 0);
      const averageApy = markets.markets.length > 0 
        ? markets.markets.reduce((sum, market) => sum + market.apy.supply, 0) / markets.markets.length
        : 0;

      // Group by protocol
      const protocolStats = markets.markets.reduce((acc, market) => {
        if (!acc[market.protocol]) {
          acc[market.protocol] = { tvl: 0, count: 0 };
        }
        const protocol = acc[market.protocol];
        if (protocol) {
          protocol.tvl += market.tvl;
          protocol.count += 1;
        }
        return acc;
      }, {} as Record<string, { tvl: number; count: number }>);

      const topProtocols = Object.entries(protocolStats)
        .map(([protocol, stats]) => ({
          protocol,
          tvl: stats.tvl,
          marketCount: stats.count,
        }))
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 10);

      return {
        totalMarkets: markets.total,
        totalProtocols: markets.protocols.length,
        totalTvl,
        averageApy,
        topProtocols,
      };
    } catch (error) {
      console.error('Failed to get market stats:', error);
      throw error;
    }
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string): Promise<DialectMarket[]> {
    const allMarkets = await this.getMarkets();
    
    const searchTerm = query.toLowerCase();
    return allMarkets.markets.filter(market => 
      market.token.symbol.toLowerCase().includes(searchTerm) ||
      market.token.name.toLowerCase().includes(searchTerm) ||
      market.protocol.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Get market by ID
   */
  async getMarketById(marketId: string): Promise<DialectMarket | null> {
    const markets = await this.getMarkets();
    return markets.markets.find(market => market.id === marketId) || null;
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectMarketsConfig> }> {
    try {
      // Try to fetch a small amount of data to verify API connectivity
      await this.getMarkets({ minTvl: 0 });
      
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

// Factory function to create Dialect Markets service
export function createDialectMarketsService(config?: Partial<DialectMarketsConfig>): DialectMarketsService {
  const fullConfig: DialectMarketsConfig = {
    apiKey: process.env.DIALECT_API_KEY || '',
    baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
    ...config,
  };

  if (!fullConfig.apiKey) {
    throw new Error('DIALECT_API_KEY environment variable is required');
  }

  return new DialectMarketsService(fullConfig);
}

export default DialectMarketsService;
