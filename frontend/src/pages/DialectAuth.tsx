import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Wallet, 
  Shield, 
  Bell, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Mail,
  Smartphone,
  Globe,
  MessageSquare
} from 'lucide-react';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: {
    walletAddress: string;
    isAuthenticated: boolean;
  } | null;
}

interface Subscription {
  id: string;
  appId: string;
  appName: string;
  enabled: boolean;
  channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  subscribedAt: string;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  appName: string;
}

interface ChannelConfig {
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

export default function DialectAuth() {
  const { publicKey, connected, signMessage } = useWallet();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    user: null,
  });
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');

  // Check if user is already authenticated
  useEffect(() => {
    const token = localStorage.getItem('dialect_token');
    if (token && publicKey) {
      verifyToken(token);
    }
  }, [publicKey]);

  const verifyToken = async (token: string) => {
    try {
      const response = await fetch('/api/dialect/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const user = await response.json();
        setAuthState({
          isAuthenticated: true,
          token,
          user,
        });
        loadUserData(token);
      } else {
        localStorage.removeItem('dialect_token');
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem('dialect_token');
    }
  };

  const loadUserData = async (token: string) => {
    try {
      // Load subscriptions
      const subsResponse = await fetch('/api/dialect/auth/subscriptions', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (subsResponse.ok) {
        const subsData = await subsResponse.json();
        setSubscriptions(subsData.subscriptions || []);
      }

      // Load notifications
      const notifResponse = await fetch('/api/dialect/inbox/notifications?limit=10', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (notifResponse.ok) {
        const notifData = await notifResponse.json();
        setNotifications(notifData.notifications || []);
      }

      // Load channels
      const channelsResponse = await fetch('/api/dialect/inbox/channels', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (channelsResponse.ok) {
        const channelsData = await channelsResponse.json();
        setChannels(channelsData.channels || []);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const handleAuthentication = async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected or does not support message signing');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Prepare authentication
      const prepareResponse = await fetch('/api/dialect/auth/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toString() }),
      });

      if (!prepareResponse.ok) {
        throw new Error('Failed to prepare authentication');
      }

      const { message } = await prepareResponse.json();

      // Step 2: Sign message
      const signature = await signMessage(new TextEncoder().encode(message));

      // Step 3: Verify authentication
      const verifyResponse = await fetch('/api/dialect/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          signature: Array.from(signature).join(','),
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error('Authentication verification failed');
      }

      const authData = await verifyResponse.json();
      
      // Store token and update state
      localStorage.setItem('dialect_token', authData.token);
      setAuthState({
        isAuthenticated: true,
        token: authData.token,
        user: authData.user,
      });

      setSuccess('Successfully authenticated with Dialect!');
      await loadUserData(authData.token);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dialect_token');
    setAuthState({
      isAuthenticated: false,
      token: null,
      user: null,
    });
    setSubscriptions([]);
    setNotifications([]);
    setChannels([]);
    setSuccess('Logged out successfully');
  };

  const handleEmailVerification = async () => {
    if (!authState.token || !email) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/dialect/inbox/channels/email/prepare', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSuccess('Verification email sent! Check your inbox.');
      } else {
        throw new Error('Failed to send verification email');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Email verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailCodeVerification = async () => {
    if (!authState.token || !emailCode) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/dialect/inbox/channels/email/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: emailCode }),
      });

      if (response.ok) {
        setSuccess('Email verified successfully!');
        setEmail('');
        setEmailCode('');
        // Reload channels
        await loadUserData(authState.token);
      } else {
        throw new Error('Invalid verification code');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Email verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'EMAIL': return <Mail className="w-4 h-4" />;
      case 'PUSH': return <Smartphone className="w-4 h-4" />;
      case 'TELEGRAM': return <MessageSquare className="w-4 h-4" />;
      case 'IN_APP': return <Globe className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!connected) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Wallet className="w-5 h-5 mr-2" />
              Wallet Connection Required
            </CardTitle>
            <CardDescription>
              Please connect your Solana wallet to access Dialect authentication
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Connect your wallet using the wallet button in the header to continue.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dialect Authentication</h1>
          <p className="text-muted-foreground">
            Manage your Dialect account, subscriptions, and notifications
          </p>
        </div>
        {authState.isAuthenticated && (
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        )}
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

      {!authState.isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Authenticate with Dialect
            </CardTitle>
            <CardDescription>
              Sign a message with your wallet to authenticate with Dialect
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Wallet className="w-4 h-4" />
              <span className="text-sm font-mono">
                {publicKey ? `${publicKey.toString().slice(0, 8)}...${publicKey.toString().slice(-8)}` : ''}
              </span>
            </div>
            <Button 
              onClick={handleAuthentication} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Authenticating...' : 'Authenticate with Dialect'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Authentication</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Authenticated</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {authState.user?.walletAddress}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Subscriptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{subscriptions.length}</div>
                  <p className="text-xs text-muted-foreground">Active subscriptions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Notifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {notifications.filter(n => !n.isRead).length}
                  </div>
                  <p className="text-xs text-muted-foreground">Unread notifications</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.map((subscription) => (
                <Card key={subscription.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{subscription.appName}</CardTitle>
                      <Badge variant={subscription.enabled ? "default" : "secondary"}>
                        {subscription.enabled ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {subscription.channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="text-xs">
                          {channel}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Subscribed: {formatDate(subscription.subscribedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card key={notification.id} className={!notification.isRead ? "border-l-4 border-l-blue-500" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{notification.title}</h4>
                          {!notification.isRead && (
                            <Badge variant="secondary" className="text-xs">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.body}
                        </p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                          <span>{notification.appName}</span>
                          <span>{formatDate(notification.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="channels" className="space-y-4">
            <div className="space-y-4">
              {channels.map((channel) => (
                <Card key={channel.type}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getChannelIcon(channel.type)}
                        <CardTitle className="text-lg">{channel.type}</CardTitle>
                      </div>
                      <Badge variant={channel.enabled ? "default" : "secondary"}>
                        {channel.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {channel.type === 'EMAIL' && (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Input
                            placeholder="Enter email address"
                            value={email}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                            className="flex-1"
                          />
                          <Button onClick={handleEmailVerification} disabled={isLoading}>
                            Verify
                          </Button>
                        </div>
                        {channel.settings?.email?.verified && (
                          <div className="flex items-center space-x-2">
                            <Input
                              placeholder="Enter verification code"
                              value={emailCode}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailCode(e.target.value)}
                              className="flex-1"
                            />
                            <Button onClick={handleEmailCodeVerification} disabled={isLoading}>
                              Confirm
                            </Button>
                          </div>
                        )}
                        {channel.settings?.email?.address && (
                          <p className="text-sm text-muted-foreground">
                            Email: {channel.settings.email.address}
                          </p>
                        )}
                      </div>
                    )}
                    {channel.type === 'PUSH' && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Push notifications are configured automatically when you enable them in your browser.
                        </p>
                        {channel.settings?.push?.deviceId && (
                          <p className="text-sm text-muted-foreground">
                            Device ID: {channel.settings.push.deviceId}
                          </p>
                        )}
                      </div>
                    )}
                    {channel.type === 'IN_APP' && (
                      <p className="text-sm text-muted-foreground">
                        In-app notifications are always available when authenticated.
                      </p>
                    )}
                    {channel.type === 'TELEGRAM' && (
                      <p className="text-sm text-muted-foreground">
                        Telegram integration requires additional setup.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
