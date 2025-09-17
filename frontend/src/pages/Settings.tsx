import { useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import Tooltip from '@/components/Tooltip';
import { toast } from 'react-hot-toast';
import { 
  CogIcon, 
  KeyIcon, 
  GlobeAltIcon, 
  ShieldCheckIcon,
  BellIcon,
  CircleStackIcon,
  CloudIcon
} from '@heroicons/react/24/outline';

interface SettingsData {
  // API Configuration
  openaiApiKey: string;
  anthropicApiKey: string;
  
  // Solana Configuration
  solanaRpcUrl: string;
  solanaNetwork: 'devnet' | 'testnet' | 'mainnet-beta';
  
  // Dialect Configuration
  dialectApiUrl: string;
  dialectApiKey: string;
  
  // Database Configuration
  databasePath: string;
  
  // Notification Settings
  enableNotifications: boolean;
  notificationTypes: {
    agentTriggers: boolean;
    systemAlerts: boolean;
    errorReports: boolean;
  };
  
  // Security Settings
  enableEncryption: boolean;
  sessionTimeout: number;
  maxConcurrentAgents: number;
}

const defaultSettings: SettingsData = {
  openaiApiKey: '',
  anthropicApiKey: '',
  solanaRpcUrl: 'https://api.devnet.solana.com',
  solanaNetwork: 'devnet',
  dialectApiUrl: 'https://dialectapi.to',
  dialectApiKey: '',
  databasePath: './data/app.db',
  enableNotifications: true,
  notificationTypes: {
    agentTriggers: true,
    systemAlerts: true,
    errorReports: false,
  },
  enableEncryption: true,
  sessionTimeout: 3600, // 1 hour
  maxConcurrentAgents: 10,
};

export default function Settings() {
  const { connection } = useConnection();
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'api' | 'blockchain' | 'notifications' | 'security'>('api');
  const [textModels, setTextModels] = useState<Array<{ id: string; label: string }>>([]);
  const [embeddingModels, setEmbeddingModels] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedTextModel, setSelectedTextModel] = useState<string>('');
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState<string>('');
  const [ragEnabled, setRagEnabled] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(1000);
  const [webFetchUnrestricted, setWebFetchUnrestricted] = useState<boolean>(false);
  const [webFetchAllowlist, setWebFetchAllowlist] = useState<string>("");
  const [webFetchMaxBytes, setWebFetchMaxBytes] = useState<number>(1000000);
  const [webFetchTimeoutMs, setWebFetchTimeoutMs] = useState<number>(10000);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // TODO: Load settings from API
      // const response = await fetch('/api/settings');
      // const data = await response.json();
      // setSettings(data);
      
      // For now, use default settings
      setSettings(defaultSettings);
      // Load AI model lists and current selection from backend
      try {
        const modelsRes = await fetch('/api/ai/models');
        const models = await modelsRes.json();
        setTextModels(models.textModels || []);
        setEmbeddingModels(models.embeddingModels || []);
      } catch {}
      try {
        const cfgRes = await fetch('/api/ai/config');
        const cfg = await cfgRes.json();
        setSelectedTextModel(cfg.textModel || 'openai/gpt-4o');
        setSelectedEmbeddingModel(cfg.embeddingModel || 'openai/text-embedding-3-small');
        if (typeof cfg.ragEnabled === 'boolean') setRagEnabled(cfg.ragEnabled);
        if (typeof cfg.temperature === 'number') setTemperature(cfg.temperature);
        if (typeof cfg.maxTokens === 'number') setMaxTokens(cfg.maxTokens);
        if (typeof cfg.webFetchUnrestricted === 'boolean') setWebFetchUnrestricted(cfg.webFetchUnrestricted);
        if (Array.isArray(cfg.webFetchAllowlist)) setWebFetchAllowlist(cfg.webFetchAllowlist.join(','));
        if (typeof cfg.webFetchMaxBytes === 'number') setWebFetchMaxBytes(cfg.webFetchMaxBytes);
        if (typeof cfg.webFetchTimeoutMs === 'number') setWebFetchTimeoutMs(cfg.webFetchTimeoutMs);
      } catch {}
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // TODO: Save settings to API
      // const response = await fetch('/api/settings', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(settings),
      // });
      
      // Persist AI config
      await fetch('/api/ai/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textModel: selectedTextModel,
          embeddingModel: selectedEmbeddingModel,
          ragEnabled,
          temperature,
          maxTokens,
          webFetchUnrestricted,
          webFetchAllowlist: webFetchAllowlist
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          webFetchMaxBytes,
          webFetchTimeoutMs,
        }),
      });
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof SettingsData, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNestedInputChange = (parent: keyof SettingsData, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as any),
        [field]: value,
      },
    }));
  };

  const testConnection = async () => {
    try {
      const version = await connection.getVersion();
      toast.success(`Connected to Solana ${version['solana-core']}`);
    } catch (error) {
      toast.error('Failed to connect to Solana');
    }
  };

  const tabs = [
    { id: 'api', name: 'API Configuration', icon: KeyIcon },
    { id: 'blockchain', name: 'Blockchain', icon: GlobeAltIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
          <CogIcon className="h-8 w-8 mr-3" />
          Settings
        </h1>
        <div className="flex items-center justify-between mt-2">
          <p className="text-gray-600 dark:text-gray-400">
            Configure your AI agents and system preferences
          </p>
          <div className="flex items-center gap-2">
            {selectedTextModel && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" title="Active text model">
                {selectedTextModel}
              </span>
            )}
            {selectedEmbeddingModel && (
              <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" title="Active embedding model">
                {selectedEmbeddingModel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-5 w-5 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <KeyIcon className="h-5 w-5 mr-2" />
                AI Provider & Models
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default Text Model (Vercel AI Gateway)
                  </label>
                  <select
                    value={selectedTextModel}
                    onChange={(e) => setSelectedTextModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    {textModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Namespaced provider/model id (provider/model), routed via Vercel AI Gateway.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Embedding Model
                  </label>
                  <select
                    value={selectedEmbeddingModel}
                    onChange={(e) => setSelectedEmbeddingModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    {embeddingModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Provider-native id for embeddings (OpenAI embedding models).
                  </p>
                </div>

                {/* Web Fetch Tool Configuration */}
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                    <GlobeAltIcon className="h-4 w-4 mr-2" />
                    Web Fetch Tool
                  </h4>
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      id="web-fetch-unrestricted"
                      type="checkbox"
                      checked={webFetchUnrestricted}
                      onChange={(e) => setWebFetchUnrestricted(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="web-fetch-unrestricted" className="text-sm text-gray-700 dark:text-gray-300">
                      Allow any site (unrestricted)
                    </label>
                  </div>
                  {!webFetchUnrestricted && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Allowed Domains (comma-separated, e.g. example.com, docs.vercel.ai)
                      </label>
                      <input
                        type="text"
                        value={webFetchAllowlist}
                        onChange={(e) => setWebFetchAllowlist(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="example.com, vercel.com"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Bytes
                      </label>
                      <input
                        type="number"
                        value={webFetchMaxBytes}
                        onChange={(e) => setWebFetchMaxBytes(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Timeout (ms)
                      </label>
                      <input
                        type="number"
                        value={webFetchTimeoutMs}
                        onChange={(e) => setWebFetchTimeoutMs(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="ragEnabled"
                    type="checkbox"
                    checked={ragEnabled}
                    onChange={(e) => setRagEnabled(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="ragEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                    Enable Retrieval-Augmented Generation (RAG)
                  </label>
                  <Tooltip content={'RAG improves answers by retrieving relevant context from your stored documents and including it in the system prompt.'} />
                </div>

                <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <span>Temperature ({temperature})</span>
                  <Tooltip content={'Lower = more deterministic; higher = more creative. Typical range 0.2–1.0'} />
                </label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Controls randomness (0 = deterministic, 2 = very creative)
                  </p>
                </div>

                <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <span>Max Tokens</span>
                  <Tooltip content={'Upper bound for response length. Provider/model limits may cap further.'} />
                </label>
                  <input
                    type="number"
                    min={1}
                    max={8000}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value || '0'))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Upper bound for response length; model/provider limits may cap output.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <CircleStackIcon className="h-5 w-5 mr-2" />
                Database Configuration
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Database Path
                </label>
                <input
                  type="text"
                  value={settings.databasePath}
                  onChange={(e) => handleInputChange('databasePath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="./data/app.db"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'blockchain' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <GlobeAltIcon className="h-5 w-5 mr-2" />
                Solana Configuration
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    RPC URL
                  </label>
                  <input
                    type="text"
                    value={settings.solanaRpcUrl}
                    onChange={(e) => handleInputChange('solanaRpcUrl', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="https://api.devnet.solana.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Network
                  </label>
                  <select
                    value={settings.solanaNetwork}
                    onChange={(e) => handleInputChange('solanaNetwork', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="devnet">Devnet</option>
                    <option value="testnet">Testnet</option>
                    <option value="mainnet-beta">Mainnet Beta</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-4">
                <button
                  onClick={testConnection}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Test Connection
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <CloudIcon className="h-5 w-5 mr-2" />
                Dialect Configuration
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API URL
                  </label>
                  <input
                    type="text"
                    value={settings.dialectApiUrl}
                    onChange={(e) => handleInputChange('dialectApiUrl', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="https://dialectapi.to"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.dialectApiKey}
                    onChange={(e) => handleInputChange('dialectApiKey', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Your Dialect API key"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <BellIcon className="h-5 w-5 mr-2" />
                Notification Preferences
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Notifications
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Receive system notifications
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableNotifications}
                    onChange={(e) => handleInputChange('enableNotifications', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                
                <div className="space-y-3 pl-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Agent Triggers
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationTypes.agentTriggers}
                      onChange={(e) => handleNestedInputChange('notificationTypes', 'agentTriggers', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      System Alerts
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationTypes.systemAlerts}
                      onChange={(e) => handleNestedInputChange('notificationTypes', 'systemAlerts', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Error Reports
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationTypes.errorReports}
                      onChange={(e) => handleNestedInputChange('notificationTypes', 'errorReports', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <ShieldCheckIcon className="h-5 w-5 mr-2" />
                Security Settings
              </h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Encryption
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Encrypt sensitive data in the database
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableEncryption}
                    onChange={(e) => handleInputChange('enableEncryption', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Session Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    min="300"
                    max="86400"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Concurrent Agents
                  </label>
                  <input
                    type="number"
                    value={settings.maxConcurrentAgents}
                    onChange={(e) => handleInputChange('maxConcurrentAgents', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={saveSettings}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
