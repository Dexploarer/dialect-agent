import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Skeleton from '@/components/Skeleton';
import Tooltip from '@/components/Tooltip';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Bell, 
  Wallet, 
  Zap, 
  Search, 
  Send,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield
} from 'lucide-react';

interface Market {
  id: string;
  protocol: string;
  type: string;
  token: {
    symbol: string;
    name: string;
    address: string;
  };
  apy: {
    supply: number;
    borrow?: number;
  };
  tvl: number;
}

interface Position {
  id: string;
  protocol: string;
  type: string;
  market: {
    token: {
      symbol: string;
      name: string;
    };
  };
  position: {
    supply?: {
      value: number;
      apy: number;
    };
    borrow?: {
      value: number;
      apy: number;
    };
    healthFactor?: number;
  };
}

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

export default function DialectDashboard() {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [blinks, setBlinks] = useState<Blink[]>([]);
  const [walletAddress, setWalletAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationSent, setNotificationSent] = useState(false);

  // Fetch markets data
  const fetchMarkets = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dialect/markets');
      if (response.status === 503) {
        const data = await response.json().catch(() => ({}));
        setError(data.hint || 'Dialect Markets not configured. Set DIALECT_API_KEY on backend.');
        setMarkets([]);
        return;
      }
      const data = await response.json();
      if (data.markets) setMarkets(data.markets);
    } catch (error) {
      console.error('Failed to fetch markets:', error);
      setError('Failed to fetch markets data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch positions data
  const fetchPositions = async () => {
    if (!walletAddress) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/dialect/positions/${walletAddress}`);
      const data = await response.json();
      if (data.positions) {
        setPositions(data.positions);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      setError('Failed to fetch positions data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch popular blinks
  const fetchBlinks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dialect/blinks/popular');
      if (response.status === 503) {
        const data = await response.json().catch(() => ({}));
        setError(data.hint || 'Dialect Blinks not configured. Set DIALECT_API_KEY on backend.');
        setBlinks([]);
        return;
      }
      const data = await response.json();
      if (data.blinks) setBlinks(data.blinks);
    } catch (error) {
      console.error('Failed to fetch blinks:', error);
      setError('Failed to fetch blinks data');
    } finally {
      setIsLoading(false);
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    if (!walletAddress) {
      setError('Please enter a wallet address');
      return;
    }

    try {
      const response = await fetch('/api/dialect/alerts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: {
            type: 'subscriber',
            walletAddress: walletAddress,
          },
          channels: ['IN_APP'],
          message: {
            title: 'Test Notification 🚀',
            body: 'This is a test notification from your Dialect dashboard!',
          },
          topicId: 'test-notifications',
        }),
      });

      const result = await response.json();
      if (result.success) {
        setNotificationSent(true);
        setTimeout(() => setNotificationSent(false), 3000);
      } else {
        setError(result.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      setError('Failed to send notification');
    }
  };

  // Search markets
  const searchMarkets = async () => {
    if (!searchQuery) {
      fetchMarkets();
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/dialect/markets/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.markets) {
        setMarkets(data.markets);
      }
    } catch (error) {
      console.error('Failed to search markets:', error);
      setError('Failed to search markets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
    fetchBlinks();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getHealthFactorColor = (healthFactor?: number) => {
    if (!healthFactor) return 'text-gray-500';
    if (healthFactor < 1.2) return 'text-red-500';
    if (healthFactor < 1.5) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dialect Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor markets, positions, and send notifications
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Enter wallet address"
            value={walletAddress}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalletAddress(e.target.value)}
            className="w-64"
          />
          <Button onClick={fetchPositions} disabled={!walletAddress || isLoading}>
            <Wallet className="w-4 h-4 mr-2" />
            Load Positions
          </Button>
          <Button onClick={() => navigate('/dialect/auth')} variant="outline">
            <Shield className="w-4 h-4 mr-2" />
            Authentication
          </Button>
          <Button onClick={() => navigate('/dialect/notifications')} variant="outline">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </Button>
          <Button onClick={() => navigate('/dialect/blinks')} variant="outline">
            <Zap className="w-4 h-4 mr-2" />
            Blinks
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            {/not configured/i.test(error) && (
              <>
                {' '}— Go to{' '}
                <a href="/settings" className="underline hover:opacity-80">Settings</a>
                {' '}to configure Dialect keys.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {notificationSent && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Test notification sent successfully!</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="markets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="blinks">Blinks</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Input
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && searchMarkets()}
              />
            </div>
            <Button onClick={searchMarkets} disabled={isLoading}>
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
            <Tooltip content={'Search by token symbol, name, or protocol'} />
            <Button onClick={fetchMarkets} variant="outline" disabled={isLoading}>
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading && (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`m-skel-${i}`} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <Skeleton className="h-5 w-32 mb-3" />
                  <Skeleton className="h-3 w-48 mb-4" />
                  <Skeleton className="h-3 w-full mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))
            )}
            {!isLoading && markets.map((market) => (
              <motion.div key={market.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{market.token.symbol}</CardTitle>
                      <Badge variant="secondary">{market.protocol}</Badge>
                    </div>
                    <CardDescription>{market.token.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Supply APY</span>
                      <span className="font-medium text-green-600">
                        {formatPercentage(market.apy.supply)}
                      </span>
                    </div>
                    {market.apy.borrow && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Borrow APY</span>
                        <span className="font-medium text-red-600">
                          {formatPercentage(market.apy.borrow)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">TVL</span>
                      <span className="font-medium">{formatCurrency(market.tvl)}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          {!walletAddress ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please enter a wallet address to view positions.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map((position) => (
                <Card key={position.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{position.market.token.symbol}</CardTitle>
                      <Badge variant="secondary">{position.protocol}</Badge>
                    </div>
                    <CardDescription>{position.market.token.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {position.position.supply && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Supply</span>
                        <span className="font-medium">
                          {formatCurrency(position.position.supply.value)}
                        </span>
                      </div>
                    )}
                    {position.position.borrow && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Borrow</span>
                        <span className="font-medium">
                          {formatCurrency(position.position.borrow.value)}
                        </span>
                      </div>
                    )}
                    {position.position.healthFactor && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">Health Factor <Tooltip content={'< 1.0 means liquidation risk; > 1.5 considered safer'} /></span>
                        <span className={`font-medium ${getHealthFactorColor(position.position.healthFactor)}`}>
                          {position.position.healthFactor.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="blinks" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Popular Blinks</h3>
            <Button onClick={fetchBlinks} variant="outline" disabled={isLoading}>
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading && (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`b-skel-${i}`} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <Skeleton className="h-5 w-40 mb-3" />
                  <Skeleton className="h-3 w-24 mb-4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))
            )}
            {!isLoading && blinks.map((blink, index) => {
              const providerName = blink.context?.provider?.name ?? 'Unknown Provider';
              const providerIcon = blink.context?.provider?.icon ?? '/vite.svg';
              const blinkUrl = blink.links?.blink ?? undefined;
              const category = blink.context?.category ?? 'General';

              return (
                <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-3">
                        <img
                          src={providerIcon}
                          alt={providerName}
                          className="w-8 h-8 rounded"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                          <CardTitle className="text-lg">{blink.title ?? 'Untitled Blink'}</CardTitle>
                          <CardDescription>{providerName}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">{blink.description ?? ''}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{category}</Badge>
                        {blinkUrl ? (
                          <Button size="sm" asChild>
                            <a href={blinkUrl} target="_blank" rel="noopener noreferrer">
                              <Zap className="w-4 h-4 mr-2" />
                              {blink.cta ?? 'Open'}
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" disabled>
                            <Zap className="w-4 h-4 mr-2" />
                            Unavailable
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Send Test Notification
              </CardTitle>
              <CardDescription>
                Send a test notification to verify Dialect integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <Input
                  placeholder="Enter wallet address"
                  value={walletAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalletAddress(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={sendTestNotification} disabled={!walletAddress}>
                  <Send className="w-4 h-4 mr-2" />
                  Send Test
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                This will send a test notification to the specified wallet address via Dialect.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
