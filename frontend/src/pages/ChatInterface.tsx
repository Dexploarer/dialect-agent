import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperAirplaneIcon,
  BeakerIcon,
  UserIcon,
  ExclamationCircleIcon,
  ClockIcon,
  CheckIcon,
  ArrowPathIcon,
  PlusIcon,
  CogIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  isActive: boolean;
  isOnline: boolean;
  responseTime: number;
  personality?: {
    traits: string[];
    communicationStyle: string;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  metadata?: {
    responseTime?: number;
    actionsExecuted?: string[];
    eventTriggered?: boolean;
  };
}

// interface ChatSession {
//   id: string;
//   agentId: string;
//   messages: ChatMessage[];
//   isActive: boolean;
//   createdAt: string;
//   updatedAt: string;
// }

// Mock data
const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'DeFi Monitor',
    description: 'Specialized in DeFi protocol monitoring and alerts',
    avatar: '🏦',
    isActive: true,
    isOnline: true,
    responseTime: 200,
    personality: {
      traits: ['analytical', 'proactive'],
      communicationStyle: 'professional',
    },
  },
  {
    id: '2',
    name: 'Token Tracker',
    description: 'Tracks token transfers and price movements',
    avatar: '💰',
    isActive: true,
    isOnline: true,
    responseTime: 150,
    personality: {
      traits: ['helpful', 'precise'],
      communicationStyle: 'friendly',
    },
  },
  {
    id: '3',
    name: 'NFT Watcher',
    description: 'Monitors NFT marketplace activities',
    avatar: '🖼️',
    isActive: false,
    isOnline: false,
    responseTime: 300,
    personality: {
      traits: ['creative', 'enthusiastic'],
      communicationStyle: 'casual',
    },
  },
];

function AgentSelector({
  agents,
  selectedAgent,
  onSelectAgent
}: {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 w-80 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BeakerIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          AI Agents
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Select an agent to start chatting
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {agents.map((agent) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectAgent(agent)}
            className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
              selectedAgent?.id === agent.id
                ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-lg">
                    {agent.avatar || agent.name.charAt(0)}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                    agent.isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">
                    {agent.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {agent.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                  agent.isActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {agent.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ~{agent.responseTime}ms
                </span>
              </div>
            </div>

            {agent.personality && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-1">
                  {agent.personality.traits.slice(0, 2).map((trait) => (
                    <span
                      key={trait}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-center hover:border-primary-300 dark:hover:border-primary-600 transition-colors cursor-pointer group"
        >
          <PlusIcon className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2 group-hover:text-primary-500 transition-colors" />
          <p className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            Create New Agent
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const timestamp = new Date(message.timestamp);

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return <ArrowPathIcon className="w-3 h-3 text-gray-400 animate-spin" />;
      case 'sent':
        return <CheckIcon className="w-3 h-3 text-gray-400" />;
      case 'delivered':
        return <CheckIcon className="w-3 h-3 text-green-500" />;
      case 'error':
        return <ExclamationCircleIcon className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[70%]`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
            🤖
          </div>
        )}
        {isUser && (
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 flex-shrink-0">
            <UserIcon className="w-5 h-5" />
          </div>
        )}

        <div className={`relative px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
        }`}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>

          {message.metadata?.responseTime && !isUser && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <ClockIcon className="w-3 h-3" />
                <span>{message.metadata.responseTime}ms</span>
                {message.metadata.actionsExecuted && message.metadata.actionsExecuted.length > 0 && (
                  <>
                    <BoltIcon className="w-3 h-3 ml-2" />
                    <span>{message.metadata.actionsExecuted.length} actions</span>
                  </>
                )}
                {message.metadata.eventTriggered && (
                  <>
                    <SparklesIcon className="w-3 h-3 ml-2 text-yellow-500" />
                    <span>Event triggered</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={`flex items-center gap-1 mt-2 ${
            isUser ? 'justify-end' : 'justify-start'
          }`}>
            <span className="text-xs opacity-70">
              {format(timestamp, 'HH:mm')}
            </span>
            {isUser && getStatusIcon()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start mb-4"
    >
      <div className="flex items-end gap-2 max-w-[70%]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-medium">
          🤖
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ChatArea({
  agent,
  messages,
  isTyping,
  onSendMessage
}: {
  agent: Agent;
  messages: ChatMessage[];
  isTyping: boolean;
  onSendMessage: (content: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const content = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    try {
      await onSendMessage(content);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Chat Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-lg">
                {agent.avatar || agent.name.charAt(0)}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                agent.isOnline ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {agent.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {agent.isOnline ? 'Online' : 'Offline'} • {agent.description}
              </p>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <CogIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-2xl mb-4">
              {agent.avatar || '🤖'}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Start a conversation with {agent.name}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              {agent.description}. Ask questions, request analysis, or get help with blockchain monitoring.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-md">
              {[
                "What's my portfolio status?",
                "Monitor token transfers",
                "Set up price alerts",
                "Analyze recent transactions"
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInputValue(suggestion)}
                  className="p-3 text-left text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <AnimatePresence>
              {isTyping && <TypingIndicator />}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name}...`}
              rows={1}
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              disabled={isLoading || !agent.isOnline}
            />
            {inputValue.trim() && (
              <div className="absolute right-2 top-2">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Enter to send
                </span>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || !agent.isOnline}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const [agents] = useState<Agent[]>(mockAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  // const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);

  const handleSelectAgent = async (agent: Agent) => {
    if (!agent.isActive || !agent.isOnline) return;

    setSelectedAgent(agent);
    setMessages([]);

    // TODO: Start new chat session with API
    // const session = await startChatSession(agent.id);
    // setCurrentSession(session);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedAgent) return;

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMessage]);

    // Call actual AI API
    setIsTyping(true);
    const startTime = Date.now();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are ${selectedAgent.name}, ${selectedAgent.description}. ${selectedAgent.personality ? `Your personality traits are: ${selectedAgent.personality.traits.join(', ')}. Use a ${selectedAgent.personality.communicationStyle} communication style.` : ''} Be helpful and provide actionable insights related to blockchain monitoring and analysis.`
            },
            {
              role: 'user',
              content: content
            }
          ],
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 1000,
          enableRag: true
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      // Update user message status
      setMessages(prev => prev.map(msg =>
        msg.id === userMessage.id
          ? { ...msg, status: 'delivered' as const }
          : msg
      ));

      // Add agent response
      const agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: data.content,
        timestamp: new Date().toISOString(),
        metadata: {
          responseTime,
          actionsExecuted: data.ragContext ? ['rag_search'] : [],
          eventTriggered: false,
        },
      };

      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Update user message status to error
      setMessages(prev => prev.map(msg =>
        msg.id === userMessage.id
          ? { ...msg, status: 'error' as const }
          : msg
      ));

      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'agent',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date().toISOString(),
        metadata: {
          responseTime: Date.now() - startTime,
          actionsExecuted: [],
          eventTriggered: false,
        },
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <AgentSelector
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={handleSelectAgent}
      />

      {selectedAgent ? (
        <ChatArea
          agent={selectedAgent}
          messages={messages}
          isTyping={isTyping}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <BeakerIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Select an AI Agent
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Choose an agent from the sidebar to start chatting
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
