import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Zap, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  DollarSign,
  Shield,
  BookOpen,
  Play,
  Eye
} from 'lucide-react';

interface BlinkAction {
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

interface BlinkParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'address';
  required: boolean;
  description: string;
  defaultValue?: any;
}

interface MarketData {
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

interface MCPServiceStatus {
  connected: boolean;
  config: {
    baseUrl: string;
    hasApiKey: boolean;
    hasClientKey: boolean;
    hasAppId: boolean;
  };
  capabilities: string[];
}

export default function DialectMCP() {
  const [status, setStatus] = useState<MCPServiceStatus | null>(null);
  const [blinks, setBlinks] = useState<BlinkAction[]>([]);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  
  // Blink execution states
  const [selectedBlink, setSelectedBlink] = useState<BlinkAction | null>(null);
  const [blinkParameters, setBlinkParameters] = useState<Record<string, any>>({});
  const [walletAddress, setWalletAddress] = useState('');
  const [executionResult, setExecutionResult] = useState<any>(null);
  
  // Documentation search
  const [docQuery, setDocQuery] = useState('');
  const [docResults, setDocResults] = useState<any[]>([]);

  useEffect(() => {
    fetchMCPServiceStatus();
    fetchAvailableBlinks();
    fetchMarketData();
  }, []);

  const fetchMCPServiceStatus = async () => {
    try {
      const response = await fetch('/api/dialect/mcp/status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch MCP status:', error);
    }
  };

  const fetchAvailableBlinks = async (category?: string) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      
      const response = await fetch(`/api/dialect/mcp/blinks?${params}`);
      const data = await response.json();
      setBlinks(data.blinks || []);
    } catch (error) {
      console.error('Failed to fetch Blinks:', error);
      setError('Failed to fetch available Blinks');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMarketData = async (filters?: any) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filters?.protocol) params.append('protocol', filters.protocol);
      if (filters?.token) params.append('token', filters.token);
      if (filters?.minApy) params.append('minApy', filters.minApy.toString());
      if (filters?.maxApy) params.append('maxApy', filters.maxApy.toString());
      
      const response = await fetch(`/api/dialect/mcp/markets?${params}`);
      const data = await response.json();
      setMarkets(data.markets || []);
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      setError('Failed to fetch market data');
    } finally {
      setIsLoading(false);
    }
  };

  const executeBlink = async () => {
    if (!selectedBlink || !walletAddress) {
      setError('Please select a Blink and enter a wallet address');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/dialect/mcp/blinks/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blinkUrl: selectedBlink.url,
          parameters: blinkParameters,
          walletAddress,
        }),
      });

      const result = await response.json();
      setExecutionResult(result);
      
      if (result.success) {
        setSuccess(`Blink executed successfully! Transaction: ${result.transactionId}`);
      } else {
        setError(result.error || 'Failed to execute Blink');
      }
    } catch (error) {
      console.error('Failed to execute Blink:', error);
      setError('Failed to execute Blink');
    } finally {
      setIsLoading(false);
    }
  };

  const searchDocumentation = async () => {
    if (!docQuery.trim()) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/dialect/mcp/docs/search?q=${encodeURIComponent(docQuery)}`);
      const data = await response.json();
      setDocResults(data.results || []);
    } catch (error) {
      console.error('Failed to search documentation:', error);
      setError('Failed to search documentation');
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'defi': return <DollarSign className="w-4 h-4" />;
      case 'trading': return <TrendingUp className="w-4 h-4" />;
      case 'staking': return <Shield className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const filteredBlinks = blinks.filter(blink => {
    const matchesSearch = !searchQuery || 
      blink.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blink.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blink.provider.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !selectedCategory || blink.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const filteredMarkets = markets.filter(market => {
    const matchesProtocol = !selectedProtocol || market.protocol === selectedProtocol;
    return matchesProtocol;
  });

  const categories = [...new Set(blinks.map(blink => blink.category))];
  const protocols = [...new Set(markets.map(market => market.protocol))];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dialect MCP Service</h1>
          <p className="text-muted-foreground">
            Advanced Web3 development with Model Context Protocol integration
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {status && (
            <Badge variant={status.connected ? "default" : "destructive"}>
              {status.connected ? "Connected" : "Disconnected"}
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="blinks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="blinks">Blinks</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
        </TabsList>

        <TabsContent value="blinks" className="space-y-4">
          <div className="flex items-center space-x-4">
            <Input
              placeholder="Search Blinks..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <select
              value={selectedCategory}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <Button onClick={() => fetchAvailableBlinks(selectedCategory)}>
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBlinks.map((blink) => (
              <Card key={blink.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{blink.title}</CardTitle>
                    {getCategoryIcon(blink.category)}
                  </div>
                  <CardDescription>{blink.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Provider:</span>
                      <Badge variant="outline">{blink.provider}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Gas:</span>
                      <span>{blink.estimatedGas}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Time:</span>
                      <span>{blink.estimatedTime}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Parameters:</span>
                      <span>{blink.parameters.length}</span>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-4" 
                    onClick={() => setSelectedBlink(blink)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="markets" className="space-y-4">
          <div className="flex items-center space-x-4">
            <select
              value={selectedProtocol}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedProtocol(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="">All Protocols</option>
              {protocols.map(protocol => (
                <option key={protocol} value={protocol}>{protocol}</option>
              ))}
            </select>
            <Button onClick={() => fetchMarketData({ protocol: selectedProtocol })}>
              <Search className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMarkets.map((market) => (
              <Card key={market.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{market.token.symbol}</CardTitle>
                    <Badge variant="outline">{market.protocol}</Badge>
                  </div>
                  <CardDescription>{market.token.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Supply APY:</span>
                      <span className="text-green-600">{market.apy.supply}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Borrow APY:</span>
                      <span className="text-red-600">{market.apy.borrow}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">TVL:</span>
                      <span>${(market.tvl / 1000000).toFixed(1)}M</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Deposit Limit:</span>
                      <span>${(market.limits.deposit / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="execute" className="space-y-4">
          {selectedBlink ? (
            <Card>
              <CardHeader>
                <CardTitle>Execute Blink: {selectedBlink.title}</CardTitle>
                <CardDescription>{selectedBlink.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Wallet Address</label>
                  <Input
                    placeholder="Enter wallet address"
                    value={walletAddress}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalletAddress(e.target.value)}
                  />
                </div>

                {selectedBlink.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="block text-sm font-medium mb-2">
                      {param.name} {param.required && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      placeholder={param.description}
                      type={param.type === 'number' ? 'number' : 'text'}
                      value={blinkParameters[param.name] || param.defaultValue || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        setBlinkParameters(prev => ({
                          ...prev,
                          [param.name]: param.type === 'number' ? parseFloat(e.target.value) : e.target.value
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">{param.description}</p>
                  </div>
                ))}

                <div className="flex items-center space-x-4">
                  <Button onClick={executeBlink} disabled={isLoading || !walletAddress}>
                    <Play className="w-4 h-4 mr-2" />
                    {isLoading ? 'Executing...' : 'Execute Blink'}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedBlink(null)}>
                    Cancel
                  </Button>
                </div>

                {executionResult && (
                  <div className="mt-4 p-4 border rounded-md">
                    <h4 className="font-medium mb-2">Execution Result:</h4>
                    <pre className="text-sm bg-muted p-2 rounded">
                      {JSON.stringify(executionResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Blink Selected</h3>
                <p className="text-muted-foreground">
                  Select a Blink from the Blinks tab to execute it here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <div className="flex items-center space-x-4">
            <Input
              placeholder="Search documentation..."
              value={docQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDocQuery(e.target.value)}
              className="flex-1"
            />
            <Button onClick={searchDocumentation} disabled={!docQuery.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          <div className="space-y-4">
            {docResults.map((result, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{result.title}</CardTitle>
                    <Badge variant="outline">{result.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">{result.snippet}</p>
                  <Button variant="outline" asChild>
                    <a href={result.url} target="_blank" rel="noopener noreferrer">
                      <BookOpen className="w-4 h-4 mr-2" />
                      View Documentation
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Service Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Connection Status:</span>
                    <Badge variant={status.connected ? "default" : "destructive"}>
                      {status.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Base URL:</span>
                    <span className="text-sm font-mono">{status.config.baseUrl}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>API Key:</span>
                    <Badge variant={status.config.hasApiKey ? "default" : "destructive"}>
                      {status.config.hasApiKey ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Client Key:</span>
                    <Badge variant={status.config.hasClientKey ? "default" : "destructive"}>
                      {status.config.hasClientKey ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>App ID:</span>
                    <Badge variant={status.config.hasAppId ? "default" : "destructive"}>
                      {status.config.hasAppId ? "Configured" : "Missing"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Capabilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {status.capabilities.map((capability) => (
                      <div key={capability} className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm">{capability}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
