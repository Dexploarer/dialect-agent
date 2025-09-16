import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BeakerIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  PlayIcon,
  PauseIcon,
  ChartBarIcon,
  ClockIcon,
  BoltIcon,
  UserGroupIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
// import { useWallet } from '@solana/wallet-adapter-react';

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  aiConfig: {
    model: string;
    provider: 'openai' | 'anthropic';
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  };
  stats: {
    totalTriggers: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageResponseTime: number;
    lastActivity: string;
    uptime: number;
  };
  eventTriggers: number;
  actions: number;
}

// No mock agents; list fetched from the backend.

type FilterType = 'all' | 'active' | 'inactive';
type SortType = 'name' | 'created' | 'activity' | 'performance';

function AgentCard({ agent, onToggleActive, onEdit, onDelete, onView }: {
  agent: Agent;
  onToggleActive: (agent: Agent) => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onView: (agent: Agent) => void;
}) {
  const successRate = agent.stats.totalTriggers > 0
    ? Math.round((agent.stats.successfulExecutions / agent.stats.totalTriggers) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200 hover:shadow-lg"
    >
      {/* Agent Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-xl">
            {agent.avatar || agent.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
              {agent.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
              {agent.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 text-xs rounded-full font-medium ${
            agent.isActive
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {agent.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Agent Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <BoltIcon className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Success Rate
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {successRate}%
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <ClockIcon className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Response
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {agent.stats.averageResponseTime}ms
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-4">
        <div className="flex items-center gap-4">
          <span>{agent.eventTriggers} triggers</span>
          <span>{agent.actions} actions</span>
        </div>
        <span>Updated {new Date(agent.updatedAt).toLocaleDateString()}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleActive(agent)}
            className={`p-2 rounded-lg transition-colors ${
              agent.isActive
                ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
            }`}
            title={agent.isActive ? 'Pause agent' : 'Start agent'}
          >
            {agent.isActive ? (
              <PauseIcon className="w-4 h-4" />
            ) : (
              <PlayIcon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => onEdit(agent)}
            className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 transition-colors"
            title="Edit agent"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onView(agent)}
            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 transition-colors"
            title="View details"
          >
            <EyeIcon className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => onDelete(agent)}
          className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors"
          title="Delete agent"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function StatsOverview({ agents }: { agents: Agent[] }) {
  const activeAgents = agents.filter(a => a.isActive).length;
  const totalTriggers = agents.reduce((sum, a) => sum + a.stats.totalTriggers, 0);
  const totalSuccessful = agents.reduce((sum, a) => sum + a.stats.successfulExecutions, 0);
  const avgSuccessRate = totalTriggers > 0 ? Math.round((totalSuccessful / totalTriggers) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Agents</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{agents.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <PlayIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Active Agents</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeAgents}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <BoltIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgSuccessRate}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <ChartBarIcon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Executions</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalTriggers}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentManager() {
  // const { publicKey } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('name');
  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort agents
  const filteredAgents = agents
    .filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           agent.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === 'all' ||
                           (filterType === 'active' && agent.isActive) ||
                           (filterType === 'inactive' && !agent.isActive);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortType) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'activity':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'performance':
          const aSuccess = a.stats.totalTriggers > 0 ? (a.stats.successfulExecutions / a.stats.totalTriggers) : 0;
          const bSuccess = b.stats.totalTriggers > 0 ? (b.stats.successfulExecutions / b.stats.totalTriggers) : 0;
          return bSuccess - aSuccess;
        default:
          return 0;
      }
    });

  useEffect(() => {
    // TODO: Fetch agents from API
    const fetchAgents = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/agents');
        const data = await response.json();
        setAgents(data.agents);
        console.log('Agents fetched:', data.agents);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const handleToggleActive = async (agent: Agent) => {
    try {
      // TODO: API call to toggle agent status
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, isActive: !a.isActive } : a
      ));
    } catch (error) {
      console.error('Failed to toggle agent status:', error);
    }
  };

  const handleEdit = (agent: Agent) => {
    // TODO: Navigate to edit page or open modal
    console.log('Edit agent:', agent.id);
  };

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return;
    }

    try {
      // TODO: API call to delete agent
      setAgents(prev => prev.filter(a => a.id !== agent.id));
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  const handleView = (agent: Agent) => {
    // TODO: Navigate to agent details page
    console.log('View agent details:', agent.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BeakerIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            AI Agent Manager
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create, configure, and manage your intelligent blockchain agents
          </p>
        </div>
        <Link
          to="/agents/create"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Create Agent
        </Link>
      </div>

      {/* Stats Overview */}
      <StatsOverview agents={agents} />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Agents</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        {/* Sort */}
        <select
          value={sortType}
          onChange={(e) => setSortType(e.target.value as SortType)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="name">Sort by Name</option>
          <option value="created">Sort by Created</option>
          <option value="activity">Sort by Activity</option>
          <option value="performance">Sort by Performance</option>
        </select>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-12">
          <BeakerIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {agents.length === 0 ? 'No agents found' : 'No agents match your filters'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            {agents.length === 0
              ? 'Get started by creating your first AI agent to monitor blockchain events and automate responses.'
              : 'Try adjusting your search terms or filters to find the agents you\'re looking for.'
            }
          </p>
          {agents.length === 0 && (
            <Link
              to="/agents/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create Your First Agent
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onToggleActive={handleToggleActive}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={handleView}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state for search */}
      {filteredAgents.length === 0 && searchQuery && (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">
            No agents found matching "{searchQuery}"
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
