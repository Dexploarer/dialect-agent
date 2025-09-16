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
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  DollarSign,
  Shield,
  RefreshCw
} from 'lucide-react';

interface Blink {
  title: string;
  description: string;
  image: string;
  cta: string;
  context: {
    category: string;
    provider: {
      name: string;
      icon: string;
    };
  };
  links: {
    blink: string;
  };
}

interface BlinkPreview {
  title: string;
  description: string;
  image: string;
  cta: string;
  context: {
    category: string;
    provider: {
      name: string;
      icon: string;
    };
  };
  links: {
    blink: string;
  };
}

export default function DialectBlinks() {
  const [popularBlinks, setPopularBlinks] = useState<Blink[]>([]);
  const [searchResults, setSearchResults] = useState<Blink[]>([]);
  const [blinkPreview] = useState<BlinkPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Blink execution state
  const [blinkUrl, setBlinkUrl] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [executionResult, setExecutionResult] = useState<any>(null);

  // Load popular blinks
  const loadPopularBlinks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dialect/blinks/popular');
      if (response.ok) {
        const data = await response.json();
        setPopularBlinks(data.blinks || []);
      }
    } catch (error) {
      console.error('Failed to load popular blinks:', error);
      setError('Failed to load popular blinks');
    } finally {
      setIsLoading(false);
    }
  };

  // Search blinks
  const searchBlinks = async () => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/dialect/blinks/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.blinks || []);
      }
    } catch (error) {
      console.error('Failed to search blinks:', error);
      setError('Failed to search blinks');
    } finally {
      setIsLoading(false);
    }
  };


  // Execute blink
  const executeBlink = async () => {
    if (!blinkUrl || !walletAddress) {
      setError('Please enter both blink URL and wallet address');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/dialect/blinks/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blinkUrl,
          walletAddress,
          parameters: {},
        }),
      });

      const result = await response.json();
      if (result.success) {
        setExecutionResult(result);
        setSuccess('Blink executed successfully!');
      } else {
        setError(result.error || 'Failed to execute blink');
      }
    } catch (error) {
      console.error('Failed to execute blink:', error);
      setError('Failed to execute blink');
    } finally {
      setIsLoading(false);
    }
  };


  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'trading': return <TrendingUp className="w-4 h-4" />;
      case 'defi': return <DollarSign className="w-4 h-4" />;
      case 'nft': return <Shield className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const renderBlinkCard = (blink: Blink, index: number) => (
    <Card key={index} className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-3">
          <img
            src={blink.context.provider.icon}
            alt={blink.context.provider.name}
            className="w-8 h-8 rounded"
          />
          <div>
            <CardTitle className="text-lg">{blink.title}</CardTitle>
            <CardDescription>{blink.context.provider.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{blink.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getCategoryIcon(blink.context.category)}
            <Badge variant="outline">{blink.context.category}</Badge>
          </div>
          <Button size="sm" asChild>
            <a href={blink.links.blink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              {blink.cta}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  useEffect(() => {
    loadPopularBlinks();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dialect Blinks</h1>
          <p className="text-muted-foreground">
            Discover and execute blockchain actions with Blinks
          </p>
        </div>
        <Button onClick={loadPopularBlinks} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="discover" className="space-y-4">
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Popular Blinks</h3>
            <Badge variant="secondary">{popularBlinks.length} available</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {popularBlinks.map((blink, index) => renderBlinkCard(blink, index))}
          </div>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Input
                placeholder="Search blinks..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && searchBlinks()}
              />
            </div>
            <Button onClick={searchBlinks} disabled={isLoading}>
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((blink, index) => renderBlinkCard(blink, index))}
            </div>
          )}

          {searchQuery && searchResults.length === 0 && !isLoading && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>No blinks found for "{searchQuery}"</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="execute" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" />
                  Execute Blink
                </CardTitle>
                <CardDescription>
                  Execute a blink action with your wallet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Blink URL</label>
                  <Input
                    placeholder="Enter blink URL"
                    value={blinkUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBlinkUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Wallet Address</label>
                  <Input
                    placeholder="Enter wallet address"
                    value={walletAddress}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalletAddress(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={executeBlink} 
                  disabled={isLoading || !blinkUrl || !walletAddress}
                  className="w-full"
                >
                  {isLoading ? 'Executing...' : 'Execute Blink'}
                </Button>
              </CardContent>
            </Card>

            {blinkPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Blink Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <img
                        src={blinkPreview.context.provider.icon}
                        alt={blinkPreview.context.provider.name}
                        className="w-8 h-8 rounded"
                      />
                      <div>
                        <h4 className="font-medium">{blinkPreview.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {blinkPreview.context.provider.name}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm">{blinkPreview.description}</p>
                    <Badge variant="outline">{blinkPreview.context.category}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {executionResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Execution Result</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Success</span>
                    </div>
                    {executionResult.transaction && (
                      <div className="text-sm">
                        <span className="font-medium">Transaction:</span>
                        <span className="font-mono ml-2">
                          {executionResult.transaction.slice(0, 8)}...{executionResult.transaction.slice(-8)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
