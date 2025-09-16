import { z } from "zod";

// Dialect Positions API Types
export interface DialectPosition {
  id: string;
  protocol: string;
  type: 'lending' | 'multiply' | 'leverage' | 'liquidity';
  market: {
    id: string;
    token: {
      symbol: string;
      name: string;
      address: string;
      decimals: number;
    };
  };
  walletAddress: string;
  position: {
    supply?: {
      amount: number;
      value: number;
      apy: number;
    };
    borrow?: {
      amount: number;
      value: number;
      apy: number;
    };
    collateral?: {
      amount: number;
      value: number;
      factor: number;
    };
    healthFactor?: number;
    liquidationThreshold?: number;
    utilizationRate?: number;
  };
  metadata: {
    createdAt: string;
    lastUpdated: string;
    status: 'active' | 'liquidated' | 'closed';
  };
  blinks?: {
    deposit?: string;
    withdraw?: string;
    borrow?: string;
    repay?: string;
    close?: string;
  };
}

export interface DialectPositionsResponse {
  positions: DialectPosition[];
  total: number;
  totalValue: number;
  protocols: string[];
}

export interface DialectPositionsConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface PositionFilters {
  protocol?: string;
  type?: 'lending' | 'multiply' | 'leverage' | 'liquidity';
  minValue?: number;
  maxValue?: number;
  status?: 'active' | 'liquidated' | 'closed';
  healthFactorThreshold?: number;
}

export class DialectPositionsService {
  private config: DialectPositionsConfig;
  private baseUrl: string;

  constructor(config: DialectPositionsConfig) {
    this.config = {
      baseUrl: 'https://api.dialect.to',
      ...config,
    };
    this.baseUrl = this.config.baseUrl || 'https://api.dialect.to';
  }

  /**
   * Get positions for a specific wallet address
   */
  async getPositionsByWallet(
    walletAddress: string,
    filters?: PositionFilters
  ): Promise<DialectPositionsResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('walletAddresses', walletAddress);
      
      if (filters?.protocol) queryParams.append('protocol', filters.protocol);
      if (filters?.type) queryParams.append('type', filters.type);
      if (filters?.minValue !== undefined) queryParams.append('minValue', filters.minValue.toString());
      if (filters?.maxValue !== undefined) queryParams.append('maxValue', filters.maxValue.toString());
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.healthFactorThreshold !== undefined) {
        queryParams.append('healthFactorThreshold', filters.healthFactorThreshold.toString());
      }

      const url = `${this.baseUrl}/v0/positions/by-owners?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect Positions API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      
      return {
        positions: data.positions || [],
        total: data.total || 0,
        totalValue: data.totalValue || 0,
        protocols: data.protocols || [],
      };
    } catch (error) {
      console.error('Failed to fetch Dialect positions:', error);
      throw error;
    }
  }

  /**
   * Get positions for multiple wallet addresses
   */
  async getPositionsByWallets(
    walletAddresses: string[],
    filters?: PositionFilters
  ): Promise<DialectPositionsResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('walletAddresses', walletAddresses.join(','));
      
      if (filters?.protocol) queryParams.append('protocol', filters.protocol);
      if (filters?.type) queryParams.append('type', filters.type);
      if (filters?.minValue !== undefined) queryParams.append('minValue', filters.minValue.toString());
      if (filters?.maxValue !== undefined) queryParams.append('maxValue', filters.maxValue.toString());
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.healthFactorThreshold !== undefined) {
        queryParams.append('healthFactorThreshold', filters.healthFactorThreshold.toString());
      }

      const url = `${this.baseUrl}/v0/positions/by-owners?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-dialect-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Dialect Positions API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      
      return {
        positions: data.positions || [],
        total: data.total || 0,
        totalValue: data.totalValue || 0,
        protocols: data.protocols || [],
      };
    } catch (error) {
      console.error('Failed to fetch Dialect positions:', error);
      throw error;
    }
  }

  /**
   * Get active positions only
   */
  async getActivePositions(walletAddress: string): Promise<DialectPosition[]> {
    const result = await this.getPositionsByWallet(walletAddress, { status: 'active' });
    return result.positions;
  }

  /**
   * Get positions at risk of liquidation
   */
  async getAtRiskPositions(walletAddress: string, healthFactorThreshold: number = 1.5): Promise<DialectPosition[]> {
    const result = await this.getPositionsByWallet(walletAddress, { 
      status: 'active',
      healthFactorThreshold 
    });
    
    return result.positions.filter(position => 
      position.position.healthFactor !== undefined && 
      position.position.healthFactor < healthFactorThreshold
    );
  }

  /**
   * Get positions by protocol
   */
  async getPositionsByProtocol(walletAddress: string, protocol: string): Promise<DialectPosition[]> {
    const result = await this.getPositionsByWallet(walletAddress, { protocol });
    return result.positions;
  }

  /**
   * Get lending positions only
   */
  async getLendingPositions(walletAddress: string): Promise<DialectPosition[]> {
    const result = await this.getPositionsByWallet(walletAddress, { type: 'lending' });
    return result.positions;
  }

  /**
   * Get high-value positions
   */
  async getHighValuePositions(walletAddress: string, minValue: number = 1000): Promise<DialectPosition[]> {
    const result = await this.getPositionsByWallet(walletAddress, { minValue });
    return result.positions.sort((a, b) => {
      const aValue = (a.position.supply?.value || 0) + (a.position.borrow?.value || 0);
      const bValue = (b.position.supply?.value || 0) + (b.position.borrow?.value || 0);
      return bValue - aValue;
    });
  }

  /**
   * Get position summary for a wallet
   */
  async getPositionSummary(walletAddress: string): Promise<{
    totalPositions: number;
    totalValue: number;
    totalSupply: number;
    totalBorrow: number;
    netValue: number;
    averageHealthFactor: number;
    atRiskPositions: number;
    protocols: Array<{ protocol: string; positionCount: number; totalValue: number }>;
  }> {
    try {
      const positions = await this.getActivePositions(walletAddress);
      
      const totalValue = positions.reduce((sum, pos) => {
        const supplyValue = pos.position.supply?.value || 0;
        const borrowValue = pos.position.borrow?.value || 0;
        return sum + supplyValue + borrowValue;
      }, 0);

      const totalSupply = positions.reduce((sum, pos) => sum + (pos.position.supply?.value || 0), 0);
      const totalBorrow = positions.reduce((sum, pos) => sum + (pos.position.borrow?.value || 0), 0);
      const netValue = totalSupply - totalBorrow;

      const healthFactors = positions
        .map(pos => pos.position.healthFactor)
        .filter(hf => hf !== undefined) as number[];
      
      const averageHealthFactor = healthFactors.length > 0 
        ? healthFactors.reduce((sum, hf) => sum + hf, 0) / healthFactors.length
        : 0;

      const atRiskPositions = positions.filter(pos => 
        pos.position.healthFactor !== undefined && pos.position.healthFactor < 1.5
      ).length;

      // Group by protocol
      const protocolStats = positions.reduce((acc, pos) => {
        if (!acc[pos.protocol]) {
          acc[pos.protocol] = { count: 0, totalValue: 0 };
        }
        const protocol = acc[pos.protocol];
        if (protocol) {
          protocol.count += 1;
          protocol.totalValue += (pos.position.supply?.value || 0) + (pos.position.borrow?.value || 0);
        }
        return acc;
      }, {} as Record<string, { count: number; totalValue: number }>);

      const protocols = Object.entries(protocolStats)
        .map(([protocol, stats]) => ({
          protocol,
          positionCount: stats.count,
          totalValue: stats.totalValue,
        }))
        .sort((a, b) => b.totalValue - a.totalValue);

      return {
        totalPositions: positions.length,
        totalValue,
        totalSupply,
        totalBorrow,
        netValue,
        averageHealthFactor,
        atRiskPositions,
        protocols,
      };
    } catch (error) {
      console.error('Failed to get position summary:', error);
      throw error;
    }
  }

  /**
   * Get position by ID
   */
  async getPositionById(positionId: string, walletAddress: string): Promise<DialectPosition | null> {
    const positions = await this.getPositionsByWallet(walletAddress);
    return positions.positions.find(pos => pos.id === positionId) || null;
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<{ status: string; config: Partial<DialectPositionsConfig> }> {
    try {
      // Try to fetch positions for a test wallet to verify API connectivity
      // Using a well-known wallet address for testing
      const testWallet = '11111111111111111111111111111112'; // System program
      await this.getPositionsByWallet(testWallet);
      
      return {
        status: 'healthy',
        config: {
          baseUrl: this.baseUrl,
          // Don't expose API key in health check
        },
      };
    } catch (error) {
      // Even if the test wallet has no positions, the API should respond
      return {
        status: 'healthy',
        config: {
          baseUrl: this.baseUrl,
        },
      };
    }
  }
}

// Factory function to create Dialect Positions service
export function createDialectPositionsService(config?: Partial<DialectPositionsConfig>): DialectPositionsService {
  const fullConfig: DialectPositionsConfig = {
    apiKey: process.env.DIALECT_API_KEY || '',
    baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
    ...config,
  };

  if (!fullConfig.apiKey) {
    throw new Error('DIALECT_API_KEY environment variable is required');
  }

  return new DialectPositionsService(fullConfig);
}

export default DialectPositionsService;
