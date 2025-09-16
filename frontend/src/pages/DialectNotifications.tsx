import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Bell, 
  Send, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Mail,
  Smartphone,
  MessageSquare,
  Globe,
  TrendingUp,
  TrendingDown,
  RefreshCw
} from 'lucide-react';

interface NotificationTemplate {
  id: string;
  name: string;
  type: 'price' | 'liquidation' | 'trading' | 'system' | 'custom';
  title: string;
  body: string;
  channels: Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>;
  metadata?: Record<string, unknown>;
}

interface NotificationHistory {
  id: string;
  title: string;
  body: string;
  type: string;
  recipient: string;
  channels: string[];
  status: 'sent' | 'delivered' | 'failed';
  sentAt: string;
  deliveredAt?: string;
  error?: string;
}

interface PriceAlert {
  id: string;
  token: string;
  condition: 'above' | 'below';
  price: number;
  currentPrice: number;
  isActive: boolean;
  createdAt: string;
}

export default function DialectNotifications() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form states
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Array<'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH'>>(['IN_APP']);
  const [recipientWallet, setRecipientWallet] = useState('');
  const [topicId, setTopicId] = useState('');
  
  // Price alert form
  const [alertToken, setAlertToken] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertPrice, setAlertPrice] = useState('');
  
  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Load notification templates
  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      // Mock templates - in real implementation, these would come from the backend
      const mockTemplates: NotificationTemplate[] = [
        {
          id: 'price-up',
          name: 'Price Increase Alert',
          type: 'price',
          title: '🚀 {token} Price Alert',
          body: '{token} has increased to ${price}! Time to take action.',
          channels: ['IN_APP', 'PUSH'],
          metadata: { token: 'SOL', price: 100 }
        },
        {
          id: 'liquidation-warning',
          name: 'Liquidation Warning',
          type: 'liquidation',
          title: '⚠️ Liquidation Risk',
          body: 'Your {protocol} position is at risk of liquidation. Health factor: {healthFactor}',
          channels: ['IN_APP', 'PUSH', 'EMAIL'],
          metadata: { protocol: 'Kamino', healthFactor: 1.1 }
        },
        {
          id: 'trading-opportunity',
          name: 'Trading Opportunity',
          type: 'trading',
          title: '💡 Trading Opportunity',
          body: 'Great opportunity detected: {action} {token} at {price}',
          channels: ['IN_APP', 'PUSH'],
          metadata: { action: 'Buy', token: 'RAY', price: 2.5 }
        },
        {
          id: 'system-maintenance',
          name: 'System Maintenance',
          type: 'system',
          title: '🔧 System Maintenance',
          body: 'Scheduled maintenance will begin at {time}. Services may be temporarily unavailable.',
          channels: ['IN_APP', 'EMAIL'],
          metadata: { time: '2:00 AM UTC' }
        }
      ];
      setTemplates(mockTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setError('Failed to load notification templates');
    } finally {
      setIsLoading(false);
    }
  };

  // Load notification history
  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dialect/inbox/notifications?limit=50');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      setError('Failed to load notification history');
    } finally {
      setIsLoading(false);
    }
  };

  // Load price alerts
  const loadPriceAlerts = async () => {
    try {
      setIsLoading(true);
      // Mock price alerts - in real implementation, these would come from the backend
      const mockAlerts: PriceAlert[] = [
        {
          id: '1',
          token: 'SOL',
          condition: 'above',
          price: 100,
          currentPrice: 95.5,
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          token: 'RAY',
          condition: 'below',
          price: 2.0,
          currentPrice: 2.3,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ];
      setPriceAlerts(mockAlerts);
    } catch (error) {
      console.error('Failed to load price alerts:', error);
      setError('Failed to load price alerts');
    } finally {
      setIsLoading(false);
    }
  };

  // Send notification
  const sendNotification = async () => {
    if (!recipientWallet) {
      setError('Please enter a recipient wallet address');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template && (!customTitle || !customBody)) {
      setError('Please select a template or enter custom title and body');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const notificationData = {
        recipient: {
          type: 'subscriber',
          walletAddress: recipientWallet,
        },
        channels: selectedChannels,
        message: {
          title: template ? template.title : customTitle,
          body: template ? template.body : customBody,
        },
        ...(topicId && { topicId }),
        data: template?.metadata || {},
      };

      const response = await fetch('/api/dialect/alerts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationData),
      });

      const result = await response.json();
      if (result.success) {
        setSuccess('Notification sent successfully!');
        setRecipientWallet('');
        setCustomTitle('');
        setCustomBody('');
        setSelectedTemplate('');
        setTopicId('');
        loadHistory();
      } else {
        setError(result.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      setError('Failed to send notification');
    } finally {
      setIsLoading(false);
    }
  };

  // Create price alert
  const createPriceAlert = async () => {
    if (!alertToken || !alertPrice) {
      setError('Please enter token and price');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const alertData = {
        token: alertToken,
        condition: alertCondition,
        price: parseFloat(alertPrice),
        channels: ['IN_APP', 'PUSH'],
      };

      const response = await fetch('/api/dialect/alerts/price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alertData),
      });

      const result = await response.json();
      if (result.success) {
        setSuccess('Price alert created successfully!');
        setAlertToken('');
        setAlertPrice('');
        loadPriceAlerts();
      } else {
        setError(result.error || 'Failed to create price alert');
      }
    } catch (error) {
      console.error('Failed to create price alert:', error);
      setError('Failed to create price alert');
    } finally {
      setIsLoading(false);
    }
  };

  // Send broadcast message
  const sendBroadcast = async () => {
    if (!customTitle || !customBody) {
      setError('Please enter title and body for broadcast');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const broadcastData = {
        channels: selectedChannels,
        message: {
          title: customTitle,
          body: customBody,
        },
        ...(topicId && { topicId }),
      };

      const response = await fetch('/api/dialect/alerts/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(broadcastData),
      });

      const result = await response.json();
      if (result.success) {
        setSuccess('Broadcast sent successfully!');
        setCustomTitle('');
        setCustomBody('');
        setTopicId('');
        loadHistory();
      } else {
        setError(result.error || 'Failed to send broadcast');
      }
    } catch (error) {
      console.error('Failed to send broadcast:', error);
      setError('Failed to send broadcast');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setCustomTitle(template.title);
      setCustomBody(template.body);
      setSelectedChannels(template.channels);
    }
  };

  const handleChannelToggle = (channel: 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH') => {
    setSelectedChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'EMAIL': return <Mail className="w-4 h-4" />;
      case 'PUSH': return <Smartphone className="w-4 h-4" />;
      case 'TELEGRAM': return <MessageSquare className="w-4 h-4" />;
      case 'IN_APP': return <Globe className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Send className="w-4 h-4 text-blue-500" />;
      case 'delivered': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
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

  const filteredHistory = history.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         notification.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || notification.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    loadTemplates();
    loadHistory();
    loadPriceAlerts();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dialect Notifications</h1>
          <p className="text-muted-foreground">
            Manage notifications, alerts, and broadcast messages
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={loadHistory} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
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

      <Tabs defaultValue="send" className="space-y-4">
        <TabsList>
          <TabsTrigger value="send">Send Notifications</TabsTrigger>
          <TabsTrigger value="alerts">Price Alerts</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Send className="w-5 h-5 mr-2" />
                  Send Notification
                </CardTitle>
                <CardDescription>
                  Send a notification to a specific wallet address
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Recipient Wallet</label>
                  <Input
                    placeholder="Enter wallet address"
                    value={recipientWallet}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientWallet(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Template</label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                  >
                    <option value="">Select a template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    placeholder="Notification title"
                    value={customTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Body</label>
                  <textarea
                    className="w-full p-2 border rounded-md h-20"
                    placeholder="Notification body"
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Channels</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(['IN_APP', 'PUSH', 'EMAIL', 'TELEGRAM'] as const).map((channel) => (
                      <Button
                        key={channel}
                        variant={selectedChannels.includes(channel) ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleChannelToggle(channel)}
                        className="flex items-center space-x-1"
                      >
                        {getChannelIcon(channel)}
                        <span>{channel}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Topic ID (Optional)</label>
                  <Input
                    placeholder="Enter topic ID"
                    value={topicId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicId(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={sendNotification} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Sending...' : 'Send Notification'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="w-5 h-5 mr-2" />
                  Notification Templates
                </CardTitle>
                <CardDescription>
                  Pre-configured notification templates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTemplate === template.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{template.name}</h4>
                      <Badge variant="outline">{template.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.title}
                    </p>
                    <div className="flex items-center space-x-1 mt-2">
                      {template.channels.map((channel) => (
                        <div key={channel} className="flex items-center space-x-1">
                          {getChannelIcon(channel)}
                          <span className="text-xs">{channel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Create Price Alert
                </CardTitle>
                <CardDescription>
                  Set up price alerts for tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Token</label>
                  <Input
                    placeholder="e.g., SOL, RAY, USDC"
                    value={alertToken}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAlertToken(e.target.value.toUpperCase())}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Condition</label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={alertCondition}
                    onChange={(e) => setAlertCondition(e.target.value as 'above' | 'below')}
                  >
                    <option value="above">Price goes above</option>
                    <option value="below">Price goes below</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Price (USD)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Enter target price"
                    value={alertPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAlertPrice(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={createPriceAlert} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Creating...' : 'Create Price Alert'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Active Price Alerts
                </CardTitle>
                <CardDescription>
                  Your current price alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {priceAlerts.map((alert) => (
                  <div key={alert.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{alert.token}</span>
                        <Badge variant={alert.isActive ? "default" : "secondary"}>
                          {alert.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {alert.condition === 'above' ? '>' : '<'} ${alert.price}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Current: ${alert.currentPrice}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 mt-2">
                      {alert.condition === 'above' ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        Created: {formatDate(alert.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="broadcast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                Broadcast Message
              </CardTitle>
              <CardDescription>
                Send a message to all subscribers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Broadcast title"
                  value={customTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Message</label>
                <textarea
                  className="w-full p-2 border rounded-md h-24"
                  placeholder="Broadcast message"
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Channels</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(['IN_APP', 'PUSH', 'EMAIL', 'TELEGRAM'] as const).map((channel) => (
                    <Button
                      key={channel}
                      variant={selectedChannels.includes(channel) ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleChannelToggle(channel)}
                      className="flex items-center space-x-1"
                    >
                      {getChannelIcon(channel)}
                      <span>{channel}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Topic ID (Optional)</label>
                <Input
                  placeholder="Enter topic ID for targeted broadcast"
                  value={topicId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicId(e.target.value)}
                />
              </div>

              <Button 
                onClick={sendBroadcast} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Sending...' : 'Send Broadcast'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="p-2 border rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredHistory.map((notification) => (
              <Card key={notification.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(notification.status)}
                        <h4 className="font-medium">{notification.title}</h4>
                        <Badge variant="outline">{notification.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.body}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                        <span>To: {notification.recipient.slice(0, 8)}...{notification.recipient.slice(-8)}</span>
                        <span>Sent: {formatDate(notification.sentAt)}</span>
                        {notification.deliveredAt && (
                          <span>Delivered: {formatDate(notification.deliveredAt)}</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 mt-2">
                        {notification.channels.map((channel) => (
                          <div key={channel} className="flex items-center space-x-1">
                            {getChannelIcon(channel)}
                            <span className="text-xs">{channel}</span>
                          </div>
                        ))}
                      </div>
                      {notification.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                          Error: {notification.error}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
