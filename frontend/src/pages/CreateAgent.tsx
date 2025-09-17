import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
  CogIcon,
} from '@heroicons/react/24/outline';
import { AgentService, CreateAgentRequest, Agent, DEFAULT_AI_CONFIG, DEFAULT_SETTINGS } from '../services/agents';

// Step components
interface StepProps {
  data: CreateAgentRequest;
  onChange: (data: Partial<CreateAgentRequest>) => void;
  errors: Record<string, string>;
}

// Step 1: Basic Information
function BasicInfoStep({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Basic Information
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Let's start with the basics. Give your agent a name and describe what it should do.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Agent Name *
        </label>
        <input
          type="text"
          id="name"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          } bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
          placeholder="e.g., DeFi Monitor, Price Alert Bot, Trading Assistant"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Description *
        </label>
        <textarea
          id="description"
          rows={4}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            errors.description ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          } bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
          placeholder="Describe what your agent will do, what events it should monitor, and how it should respond..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
        )}
      </div>

      <div>
        <label htmlFor="model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          AI Model
        </label>
        <select
          id="model"
          value={data.aiConfig?.model || DEFAULT_AI_CONFIG.model}
          onChange={(e) => onChange({ 
            aiConfig: { 
              ...data.aiConfig, 
              model: e.target.value,
              provider: e.target.value.includes('openai') ? 'openai' : 'anthropic'
            } 
          })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="openai/gpt-4o">GPT-4o (Recommended)</option>
          <option value="openai/gpt-4o-mini">GPT-4o Mini (Faster)</option>
          <option value="anthropic/claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
          <option value="anthropic/claude-3-haiku-20240307">Claude 3 Haiku (Faster)</option>
        </select>
      </div>

      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          System Prompt
        </label>
        <textarea
          id="systemPrompt"
          rows={3}
          value={data.aiConfig?.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt}
          onChange={(e) => onChange({ 
            aiConfig: { 
              ...data.aiConfig, 
              systemPrompt: e.target.value 
            } 
          })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Instructions for how the AI should behave and respond..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Temperature ({data.aiConfig?.temperature || DEFAULT_AI_CONFIG.temperature})
          </label>
          <input
            type="range"
            id="temperature"
            min="0"
            max="1"
            step="0.1"
            value={data.aiConfig?.temperature || DEFAULT_AI_CONFIG.temperature}
            onChange={(e) => onChange({ 
              aiConfig: { 
                ...data.aiConfig, 
                temperature: parseFloat(e.target.value) 
              } 
            })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
        <div>
          <label htmlFor="maxTokens" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Max Tokens
          </label>
          <input
            type="number"
            id="maxTokens"
            min="100"
            max="4000"
            step="100"
            value={data.aiConfig?.maxTokens || DEFAULT_AI_CONFIG.maxTokens}
            onChange={(e) => onChange({ 
              aiConfig: { 
                ...data.aiConfig, 
                maxTokens: parseInt(e.target.value) 
              } 
            })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}

// Step 2: Event Triggers (Placeholder for now)
function EventTriggersStep({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Event Triggers
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Configure what events should trigger your agent to take action.
        </p>
      </div>

      <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <CogIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          Event trigger builder coming soon! For now, your agent will be created with basic example triggers.
        </p>
      </div>
    </div>
  );
}

// Step 3: Actions (Placeholder for now)
function ActionsStep({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Actions
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Define what actions your agent should take when events occur.
        </p>
      </div>

      <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <RocketLaunchIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          Action builder coming soon! For now, your agent will be created with AI analysis and notification actions.
        </p>
      </div>
    </div>
  );
}

// Step 4: Review
function ReviewStep({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Review & Create
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Review your agent configuration and create it when ready.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white">Agent Name</h4>
          <p className="text-gray-600 dark:text-gray-400">{data.name || 'Unnamed Agent'}</p>
        </div>
        
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white">Description</h4>
          <p className="text-gray-600 dark:text-gray-400">{data.description || 'No description provided'}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white">AI Model</h4>
          <p className="text-gray-600 dark:text-gray-400">{data.aiConfig?.model || DEFAULT_AI_CONFIG.model}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white">Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Temperature:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {data.aiConfig?.temperature || DEFAULT_AI_CONFIG.temperature}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Max Tokens:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {data.aiConfig?.maxTokens || DEFAULT_AI_CONFIG.maxTokens}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start">
          <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-blue-800 dark:text-blue-300 mb-2">
              <strong>Note:</strong> Your agent will be created with default event triggers and actions.
            </p>
            <ul className="text-blue-700 dark:text-blue-400 space-y-1">
              <li>• Price change monitoring for SOL token</li>
              <li>• Trending token analysis</li>
              <li>• AI-powered event analysis</li>
              <li>• In-app notifications</li>
            </ul>
            <p className="text-blue-700 dark:text-blue-400 mt-2">
              You can customize these after creation in the agent management interface.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateAgent() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: '',
    description: '',
    aiConfig: {
      ...DEFAULT_AI_CONFIG,
    },
    settings: {
      ...DEFAULT_SETTINGS,
    },
  });

  const steps = [
    { title: 'Basic Info', component: BasicInfoStep },
    { title: 'Event Triggers', component: EventTriggersStep },
    { title: 'Actions', component: ActionsStep },
    { title: 'Review', component: ReviewStep },
  ];

  // Load existing agent data if editing
  useEffect(() => {
    if (isEditing && id) {
      setIsLoading(true);
      AgentService.getAgent(id)
        .then((agent: Agent) => {
          setFormData({
            name: agent.name,
            description: agent.description,
            aiConfig: agent.aiConfig,
            settings: agent.settings,
            eventTriggers: Array.isArray(agent.eventTriggers) ? agent.eventTriggers : undefined,
            actions: Array.isArray(agent.actions) ? agent.actions : undefined,
          });
        })
        .catch((error) => {
          toast.error('Failed to load agent data');
          navigate('/agents');
        })
        .finally(() => setIsLoading(false));
    }
  }, [isEditing, id, navigate]);

  const handleDataChange = (newData: Partial<CreateAgentRequest>) => {
    setFormData(prev => ({
      ...prev,
      ...newData,
      aiConfig: {
        ...prev.aiConfig,
        ...newData.aiConfig,
      },
      settings: {
        ...prev.settings,
        ...newData.settings,
      },
    }));
    
    // Clear errors for changed fields
    const changedFields = Object.keys(newData);
    setErrors(prev => {
      const newErrors = { ...prev };
      changedFields.forEach(field => {
        delete newErrors[field];
      });
      return newErrors;
    });
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.name.trim()) {
        newErrors.name = 'Agent name is required';
      }
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSave = async () => {
    if (!validateStep(currentStep)) return;

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await AgentService.updateAgent(id, formData);
      } else {
        await AgentService.createAgent(formData);
      }
      navigate('/agents');
    } catch (error) {
      // Error is already handled by the service with toast
    } finally {
      setIsSaving(false);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/agents')}
          className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back to Agents
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {isEditing ? 'Edit Agent' : 'Create New Agent'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {isEditing 
            ? 'Modify your agent configuration and behavior.' 
            : 'Set up an intelligent agent to monitor blockchain events and automate responses.'
          }
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center ${
                index < steps.length - 1 ? 'flex-1' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentStep
                    ? 'bg-primary-600 text-white'
                    : index === currentStep
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {index < currentStep ? (
                  <CheckIcon className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={`ml-2 text-sm font-medium ${
                index <= currentStep 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {step.title}
              </span>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 ${
                  index < currentStep 
                    ? 'bg-primary-600' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700 mb-8"
      >
        <CurrentStepComponent
          data={formData}
          onChange={handleDataChange}
          errors={errors}
        />
      </motion.div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="flex items-center px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Previous
        </button>

        <div className="flex gap-3">
          {currentStep < steps.length - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Next
              <ArrowRightIcon className="w-5 h-5 ml-2" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <CheckIcon className="w-5 h-5 mr-2" />
                  {isEditing ? 'Update Agent' : 'Create Agent'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}