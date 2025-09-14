import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
  EyeIcon,
  BoltIcon,
  CpuChipIcon,
  GlobeAltIcon,
  UserGroupIcon,
  FireIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  totalExecutions: number;
  successfulExecutions: number;
  eventsProcessed: number;
  averageResponseTime: number;
  uptime: number;
}

interface RecentActivity {
  id: string;
  type: 'agent_created' | 'execution_success' | 'execution_failed' | 'event_processed';
  message: string;
  timestamp: string;
  agentName?: string;
  status?: 'success' | 'error' | 'warning';
}

interface Agent {
  id: string;
  name: string;
  isActive: boolean;
  stats: {
    totalTriggers: number;
    successfulExecutions: number;
    failedExecutions: number;
    lastActivity: string;
  };
}

// Mock data - replace with actual API calls
const mockStats: DashboardStats = {
  totalAgents: 12,
  activeAgents: 8,
  totalExecutions: 1247,
  successfulExecutions: 1198,
  eventsProcessed: 3456,
  averageResponseTime: 245,
  uptime: 99.8,
};

const mockRecentActivity: RecentActivity[] = [
  {
    id: '1',
    type: 'agent_created',
    message: 'New agent "DeFi Monitor" created',
    timestamp: '2 minutes ago',
    agentName: 'DeFi Monitor',
    status: 'success',
  },
  {
    id: '2',
    type: 'execution_success',
    message: 'Token transfer alert triggered successfully',
    timestamp: '5 minutes ago',
    agentName: 'Token Tracker',
    status: 'success',
  },
  {
    id: '3',
    type: 'event_processed',
    message: 'Processed 15 Dialect events',
    timestamp: '10 minutes ago',
    status: 'success',
  },
  {
    id: '4',
    type: 'execution_failed',
    message: 'Webhook action failed - timeout',
    timestamp: '15 minutes ago',
    agentName: 'Price Alert Bot',
    status: 'error',
  },
];

const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'DeFi Monitor',
    isActive: true,
    stats: {
      totalTriggers: 145,
      successfulExecutions: 142,
      failedExecutions: 3,
      lastActivity: '2 minutes ago',
    },
  },
  {
    id: '2',
    name: 'Token Tracker',
    isActive: true,
    stats: {
      totalTriggers: 89,
      successfulExecutions: 87,
      failedExecutions: 2,
      lastActivity: '5 minutes ago',
    },
  },
  {
    id: '3',
    name: 'Price Alert Bot',
    isActive: false,
    stats: {
      totalTriggers: 23,
      successfulExecutions: 20,
      failedExecutions: 3,
      lastActivity: '1 hour ago',
    },
  },
];

function StatCard({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease';
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200 hover:shadow-lg"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {change && (
            <div className="flex items-center mt-2">
              {changeType === 'increase' ? (
                <ArrowTrendingUpIcon className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span
                className={`text-sm font-medium ${
                  changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {change}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

function ActivityItem({ activity }: { activity: RecentActivity }) {
  const getStatusIcon = () => {
    switch (activity.status) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
    >
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white">{activity.message}</p>
        {activity.agentName && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Agent: {activity.agentName}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {activity.timestamp}
        </p>
      </div>
    </motion.div>
  );
}

function AgentStatusCard({ agent }: { agent: Agent }) {
  const successRate = Math.round(
    (agent.stats.successfulExecutions / agent.stats.totalTriggers) * 100
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <h3 className="font-medium text-gray-900 dark:text-white truncate">
            {agent.name}
          </h3>
        </div>
        <span
          className={`px-2 py-1 text-xs rounded-full font-medium ${
            agent.isActive
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {agent.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {successRate}%
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Executions</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {agent.stats.totalTriggers}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Last Active</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {agent.stats.lastActivity}
          </span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <Link
          to={`/agents/${agent.id}`}
          className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
        >
          <EyeIcon className="w-4 h-4" />
          View Details
        </Link>
      </div>
    </motion.div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Link
        to="/agents"
        className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200 hover:shadow-md group"
      >
        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg group-hover:bg-primary-200 dark:group-hover:bg-primary-900/50 transition-colors">
          <PlusIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">Create Agent</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Add new AI agent
          </p>
        </div>
      </Link>

      <Link
        to="/chat"
        className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600 transition-all duration-200 hover:shadow-md group"
      >
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">Start Chat</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Talk to an agent
          </p>
        </div>
      </Link>

      <Link
        to="/events"
        className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 hover:shadow-md group"
      >
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
          <ChartBarIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">View Events</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Monitor activity
          </p>
        </div>
      </Link>

      <Link
        to="/settings"
        className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600 transition-all duration-200 hover:shadow-md group"
      >
        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition-colors">
          <CpuChipIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">Settings</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure system
          </p>
        </div>
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(mockStats);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>(mockRecentActivity);
  const [agents, setAgents] = useState<Agent[]>(mockAgents);

  useEffect(() => {
    // TODO: Fetch real data from API
    const fetchDashboardData = async () => {
      try {
        // const response = await fetch('/api/stats');
        // const data = await response.json();
        // setStats(data.stats);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };

    fetchDashboardData();

    // Set up polling for real-time updates
    const interval = setInterval(fetchDashboardData, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const successRate = Math.round((stats.successfulExecutions / stats.totalExecutions) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Overview of your AI agents and blockchain monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Agents"
          value={stats.totalAgents}
          change="+2 this week"
          changeType="increase"
          icon={BeakerIcon}
          color="blue"
        />
        <StatCard
          title="Active Agents"
          value={stats.activeAgents}
          change={`${Math.round((stats.activeAgents / stats.totalAgents) * 100)}% active`}
          changeType="increase"
          icon={BoltIcon}
          color="green"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          change="+2.3% vs last week"
          changeType="increase"
          icon={CheckCircleIcon}
          color="purple"
        />
        <StatCard
          title="Response Time"
          value={`${stats.averageResponseTime}ms`}
          change="-15ms vs last week"
          changeType="decrease"
          icon={ClockIcon}
          color="orange"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          Quick Actions
        </h2>
        <QuickActions />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FireIcon className="w-5 h-5 text-orange-500" />
                Recent Activity
              </h2>
            </div>
            <div className="p-6 space-y-1 max-h-96 overflow-y-auto">
              {recentActivity.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </div>

        {/* Agent Status */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-blue-500" />
                Agent Status
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {agents.slice(0, 3).map((agent) => (
                <AgentStatusCard key={agent.id} agent={agent} />
              ))}
              <Link
                to="/agents"
                className="block w-full text-center py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
              >
                View All Agents
              </Link>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <GlobeAltIcon className="w-5 h-5 text-green-500" />
                System Status
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Dialect Monitor
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Online
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  AI Services
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Online
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Database
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Online
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Uptime
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {stats.uptime}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
