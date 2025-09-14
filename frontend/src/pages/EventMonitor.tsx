import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartBarIcon,
  BoltIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  SignalIcon,
  CpuChipIcon,
  GlobeAltIcon,
  FireIcon,
  SparklesIcon,
  BeakerIcon,
  UserIcon,
  CurrencyDollarIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

interface BlockchainEvent {
  id: string;
  type: 'dialect_message' | 'token_transfer' | 'account_balance_change' | 'nft_mint' | 'nft_transfer' | 'defi_transaction';
  timestamp: string;
  signature: string;
  slot: number;
  blockTime: number;
  parsedData: Record<string, any>;
  processed: boolean;
  processingError?: string;
  agentTriggered?: boolean;
  agentIds?: string[];
}

interface MonitoringStats {
  eventsReceived: number;
  eventsProcessed: number;
  eventsFailed: number;
  uptime: number;
  subscriptions: number;
  triggers: number;
  isConnected: boolean;
  lastEventTime: number;
}

type EventFilter = 'all' | 'dialect_message' | 'token_transfer' | 'account_balance_change' | 'nft_mint' | 'nft_transfer' | 'defi_transaction';

// Mock data
const mockStats: MonitoringStats = {
  eventsReceived: 15847,
  eventsProcessed: 15823,
  eventsFailed: 24,
  uptime: 99.85,
  subscriptions: 12,
  triggers: 23,
  isConnected: true,
  lastEventTime: Date.now() - 2000,
};

const mockEvents: BlockchainEvent[] = [
  {
    id: '1',
    type: 'token_transfer',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    signature: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
    slot: 245678901,
    blockTime: Date.now() - 30000,
    parsedData: {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      source: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      destination: '8UJgxaiQx5nTuDqd4d4D8V9RvYu5JQQyXYYYX8oX8oXY',
      amount: 1500000000,
      decimals: 6,
      symbol: 'USDC',
    },
    processed: true,
    agentTriggered: true,
    agentIds: ['agent-1'],
  },
  {
    id: '2',
    type: 'nft_mint',
    timestamp: new Date(Date.now() - 45000).toISOString(),
    signature: 'def456ghi789jkl012mno345pqr678stu901vwx234yzabc123',
    slot: 245678900,
    blockTime: Date.now() - 45000,
    parsedData: {
      mint: '7XYZ789ABC012DEF345GHI678JKL901MNO234PQR567STU890',
      metadata: {
        name: 'Cool NFT #1234',
        symbol: 'COOL',
        uri: 'https://example.com/metadata/1234.json',
      },
      recipient: '5UJgxaiQx5nTuDqd4d4D8V9RvYu5JQQyXYYYX8oX8oXY',
    },
    processed: true,
    agentTriggered: false,
  },
  {
    id: '3',
    type: 'dialect_message',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    signature: 'ghi789jkl012mno345pqr678stu901vwx234yzabc123def456',
    slot: 245678899,
    blockTime: Date.now() - 60000,
    parsedData: {
      messageId: 'msg_abc123',
      sender: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      recipient: '8UJgxaiQx5nTuDqd4d4D8V9RvYu5JQQyXYYYX8oX8oXY',
      content: 'Hello from Dialect!',
      encrypted: false,
    },
    processed: true,
    agentTriggered: true,
    agentIds: ['agent-2'],
  },
  {
    id: '4',
    type: 'account_balance_change',
    timestamp: new Date(Date.now() - 75000).toISOString(),
    signature: 'account_change_event',
    slot: 245678898,
    blockTime: Date.now() - 75000,
    parsedData: {
      account: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      lamports: 2500000000,
      previous_lamports: 2000000000,
      change: 500000000,
    },
    processed: false,
    processingError: 'Agent processing timeout',
  },
];

function EventTypeIcon({ type }: { type: BlockchainEvent['type'] }) {
  const iconProps = { className: 'w-5 h-5' };

  switch (type) {
    case 'dialect_message':
      return <SparklesIcon {...iconProps} />;
    case 'token_transfer':
      return <CurrencyDollarIcon {...iconProps} />;
    case 'account_balance_change':
      return <ChartBarIcon {...iconProps} />;
    case 'nft_mint':
    case 'nft_transfer':
      return <PhotoIcon {...iconProps} />;
    case 'defi_transaction':
      return <BoltIcon {...iconProps} />;
    default:
      return <CpuChipIcon {...iconProps} />;
  }
}

function EventCard({ event }: { event: BlockchainEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = () => {
    if (event.processingError) return 'text-red-500';
    if (event.processed && event.agentTriggered) return 'text-green-500';
    if (event.processed) return 'text-blue-500';
    return 'text-yellow-500';
  };

  const getStatusIcon = () => {
    if (event.processingError) return <ExclamationCircleIcon className="w-4 h-4 text-red-500" />;
    if (event.processed && event.agentTriggered) return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    if (event.processed) return <CheckCircleIcon className="w-4 h-4 text-blue-500" />;
    return <ClockIcon className="w-4 h-4 text-yellow-500" />;
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const renderEventData = () => {
    switch (event.type) {
      case 'token_transfer':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Amount: {(event.parsedData.amount / Math.pow(10, event.parsedData.decimals)).toLocaleString()} {event.parsedData.symbol}</p>
            <p>From: {formatAddress(event.parsedData.source)}</p>
            <p>To: {formatAddress(event.parsedData.destination)}</p>
          </div>
        );
      case 'nft_mint':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>NFT: {event.parsedData.metadata?.name || 'Unknown NFT'}</p>
            <p>Recipient: {formatAddress(event.parsedData.recipient)}</p>
          </div>
        );
      case 'dialect_message':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Message: "{event.parsedData.content}"</p>
            <p>From: {formatAddress(event.parsedData.sender)}</p>
            <p>To: {formatAddress(event.parsedData.recipient)}</p>
          </div>
        );
      case 'account_balance_change':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Account: {formatAddress(event.parsedData.account)}</p>
            <p>Balance: {(event.parsedData.lamports / 1000000000).toFixed(4)} SOL</p>
            <p>Change: {event.parsedData.change > 0 ? '+' : ''}{(event.parsedData.change / 1000000000).toFixed(4)} SOL</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 ${getStatusColor()}`}>
            <EventTypeIcon type={event.type} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white capitalize">
              {event.type.replace('_', ' ')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {new Date(event.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          {event.agentTriggered && event.agentIds && (
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs rounded-full font-medium">
              {event.agentIds.length} agent{event.agentIds.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <EyeIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      <div className="mb-3">
        {renderEventData()}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span>Slot: {event.slot.toLocaleString()}</span>
          <span>Signature: {formatAddress(event.signature)}</span>
        </div>
        {event.processingError && (
          <span className="text-red-500">Error: {event.processingError}</span>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Raw Event Data</h4>
            <pre className="text-xs bg-gray-100 dark:bg-gray-700 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(event.parsedData, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatsGrid({ stats }: { stats: MonitoringStats }) {
  const successRate = stats.eventsReceived > 0
    ? Math.round(((stats.eventsReceived - stats.eventsFailed) / stats.eventsReceived) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <ChartBarIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Events Processed</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.eventsProcessed.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{successRate}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <BeakerIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Active Triggers</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.triggers}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <GlobeAltIcon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Uptime</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.uptime}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventMonitor() {
  const [events, setEvents] = useState<BlockchainEvent[]>(mockEvents);
  const [stats, setStats] = useState<MonitoringStats>(mockStats);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Filter events
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.signature.includes(searchQuery) ||
                         event.type.includes(searchQuery.toLowerCase()) ||
                         JSON.stringify(event.parsedData).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = eventFilter === 'all' || event.type === eventFilter;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    // TODO: Setup WebSocket connection for real-time events
    const connectWebSocket = () => {
      // const ws = new WebSocket('ws://localhost:3000/events');
      // ws.onmessage = (event) => {
      //   const eventData = JSON.parse(event.data);
      //   setEvents(prev => [eventData, ...prev.slice(0, 99)]);
      // };
    };

    // TODO: Fetch initial data
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // const [eventsRes, statsRes] = await Promise.all([
        //   fetch('/api/events?limit=50'),
        //   fetch('/api/events/status')
        // ]);
        // const eventsData = await eventsRes.json();
        // const statsData = await statsRes.json();
        // setEvents(eventsData.events);
        // setStats(statsData.monitoring);
      } catch (error) {
        console.error('Failed to fetch event data:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    connectWebSocket();

    // Simulate real-time updates
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        lastEventTime: Date.now(),
        eventsReceived: prev.eventsReceived + Math.floor(Math.random() * 3),
        eventsProcessed: prev.eventsProcessed + Math.floor(Math.random() * 2),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <SignalIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            Event Monitor
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Real-time blockchain event monitoring via Dialect Protocol
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isConnected
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid stats={stats} />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search events, signatures, addresses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value as EventFilter)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Events</option>
            <option value="dialect_message">Dialect Messages</option>
            <option value="token_transfer">Token Transfers</option>
            <option value="account_balance_change">Balance Changes</option>
            <option value="nft_mint">NFT Mints</option>
            <option value="nft_transfer">NFT Transfers</option>
            <option value="defi_transaction">DeFi Transactions</option>
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FireIcon className="w-5 h-5 text-orange-500" />
            Recent Events
            <span className="ml-auto text-sm font-normal text-gray-500 dark:text-gray-400">
              {filteredEvents.length} events
            </span>
          </h2>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <ChartBarIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No events found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery || eventFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria'
                  : 'Waiting for blockchain events to arrive...'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {filteredEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CpuChipIcon className="w-5 h-5 text-blue-500" />
            System Status
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Dialect Connection</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-600 dark:text-green-400 text-sm">Connected</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Solana RPC</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-600 dark:text-green-400 text-sm">Online</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">WebSocket</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-600 dark:text-green-400 text-sm">Active</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Subscriptions</span>
            <span className="text-gray-900 dark:text-white font-medium">{stats.subscriptions}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Last Event</span>
            <span className="text-gray-900 dark:text-white font-medium">
              {Math.floor((Date.now() - stats.lastEventTime) / 1000)}s ago
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Failed Events</span>
            <span className={`font-medium ${stats.eventsFailed > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {stats.eventsFailed}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
