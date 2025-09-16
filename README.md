# AI SDK 5 Vector Application

A complete AI-powered application built with AI SDK 5, Bun, and SQLite with vector embeddings. This project provides a robust foundation for building intelligent applications with document search, chat capabilities, and vector similarity matching.

## 🌟 Features

- **AI SDK 5 Integration**: Support for multiple AI providers (OpenAI, Anthropic)
- **AI Agent Management**: Create, configure, and manage intelligent blockchain agents
- **Dialect Integration**: Real-time Solana blockchain event monitoring via Dialect protocol
- **Event-Driven Automation**: Agents respond to blockchain events with customizable actions
- **Vector Embeddings**: OpenAI text embeddings with similarity search via AI SDK
- **SQLite Database**: High-performance SQLite database with vector storage
- **RAG (Retrieval-Augmented Generation)**: Enhanced AI responses with document context
- **Streaming Responses**: Real-time AI response streaming
- **Chat Management**: Interactive conversations with AI agents
- **Document Processing**: Automatic text chunking and embedding generation
- **React Dashboard**: Modern frontend interface for agent management and monitoring
- **WebSocket Support**: Real-time event streaming and agent status updates
- **Fast Runtime**: Built on Bun for exceptional performance
- **TypeScript**: Full type safety throughout the application
- **RESTful API**: Complete REST API with comprehensive endpoints

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0.0 or higher
- Node.js v18+ (for compatibility)
- OpenAI API key and/or Anthropic API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd test
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your API keys and configuration
   ```

   **Important**: This application is configured to use an AI Gateway instead of direct OpenAI API calls. Configure your AI Gateway settings:
   - `AI_GATEWAY_URL`: Your AI Gateway endpoint (e.g., `https://your-gateway.com/v1`)
   - `AI_GATEWAY_API_KEY`: Your AI Gateway API key
   - `OPENAI_API_KEY`: Fallback OpenAI API key (optional)

4. **Initialize the database**
   ```bash
   bun run db:setup
   ```

5. **Seed with sample data** (optional)
   ```bash
   bun run db:seed
   ```

6. **Start the development server**
   ```bash
   bun run dev
   ```

The server will start at `http://localhost:3000`

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# AI Provider API Keys (at least one required)
OPENAI_API_KEY=sk-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here

# Database Configuration
DATABASE_PATH=./data/app.db
DATABASE_URL=sqlite:./data/app.db

# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# Vector Embeddings Configuration  
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
VECTOR_SIMILARITY_THRESHOLD=0.7

# Dialect & Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
DIALECT_API_URL=https://api.dialect.to
DIALECT_WS_URL=wss://api.dialect.to/ws
DIALECT_API_KEY=your-dialect-api-key-here

# Application Settings
APP_NAME=AI SDK Vector App
APP_VERSION=1.0.0
LOG_LEVEL=info

# CORS Settings
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true
```

### Supported AI Models

**OpenAI Models:**
- `gpt-4-turbo` (default)
- `gpt-4`
- `gpt-3.5-turbo`
- `gpt-4o`
- `gpt-4o-mini`

**Anthropic Models:**
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

**OpenAI Embedding Models:**
- `text-embedding-3-small` (default, 1536 dimensions)
- `text-embedding-3-large` (3072 dimensions)  
- `text-embedding-ada-002` (1536 dimensions)

## 📊 Database Schema

The application uses SQLite with the following main tables:

- **documents**: Store document content and metadata
- **embeddings**: Store text chunks and their vector embeddings
- **conversations**: Manage chat conversations
- **messages**: Store individual messages in conversations
- **agents**: Store AI agent configurations and settings
- **chat_sessions**: Manage agent-specific chat sessions
- **agent_executions**: Track agent execution history and results

## 🔌 API Endpoints

### Health Check
```http
GET /health
```
Returns service health status and statistics.

### Chat Completions
```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "model": "gpt-4-turbo",
  "temperature": 0.7,
  "stream": false,
  "enableRag": true,
  "conversationId": "optional-conversation-id"
}
```

### Document Management
```http
# Create document
POST /api/documents
{
  "title": "Document Title",
  "content": "Document content...",
  "metadata": {"category": "example"}
}

# List documents
GET /api/documents

# Get specific document
GET /api/documents/{id}

# Delete document
DELETE /api/documents/{id}
```

### Vector Search
```http
POST /api/search
{
  "query": "search query",
  "limit": 10,
  "threshold": 0.7,
  "documentIds": ["optional", "document", "ids"]
}
```

### Conversation Management
```http
# Create conversation
POST /api/conversations
{
  "title": "Conversation Title",
  "userId": "optional-user-id"
}

# List conversations
GET /api/conversations?userId=optional-user-id

# Get conversation with messages
GET /api/conversations/{id}

# Delete conversation
DELETE /api/conversations/{id}
```

### Content Summarization
```http
POST /api/summarize
{
  "content": "Long text content to summarize..."
}
```

### Database Statistics
```http
GET /api/stats
```

## 🤖 AI Agent Management

### Create Agent
```http
POST /api/agents
{
  "name": "DeFi Monitor",
  "description": "Monitors DeFi protocols and sends alerts",
  "aiConfig": {
    "model": "gpt-4-turbo",
    "temperature": 0.7,
    "systemPrompt": "You are a DeFi monitoring specialist...",
    "personality": {
      "traits": ["analytical", "proactive"],
      "communicationStyle": "professional"
    }
  },
  "eventTriggers": [{
    "name": "Token Transfer Alert",
    "eventType": "token_transfer",
    "conditions": [{
      "field": "parsedData.amount",
      "operator": "greater_than",
      "value": 1000000
    }],
    "actions": ["send_notification"]
  }],
  "actions": [{
    "name": "Send Notification",
    "type": "send_notification",
    "configuration": {
      "template": "Large transfer detected: {{amount}} tokens",
      "channel": "discord"
    }
  }]
}
```

### Agent Chat
```http
# Start chat session
POST /api/agents/{agent_id}/chat

# Send message
POST /api/chat/{session_id}/messages
{
  "content": "What's the current status of my DeFi positions?"
}

# Get chat history
GET /api/chat/{session_id}
```

### Event Monitoring
```http
# Get recent blockchain events
GET /api/events?limit=100&type=token_transfer

# Get monitoring status
GET /api/events/status

# Get agent execution history
GET /api/agents/{agent_id}/executions
```

## 💻 Usage Examples

### Basic Chat Example

```javascript
const response = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Explain machine learning' }
    ],
    enableRag: true
  })
});

const data = await response.json();
console.log(data.content); // AI response with RAG context
```

### Streaming Chat Example

```javascript
const response = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Tell me a story' }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  console.log(chunk); // Stream chunks as they arrive
}
```

### Document Processing Example

```javascript
// Add a document
const doc = await fetch('http://localhost:3000/api/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Document',
    content: 'This is the document content...',
    metadata: { category: 'documentation' }
  })
});

// Search similar content
const search = await fetch('http://localhost:3000/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'document content',
    limit: 5,
    threshold: 0.7
  })
});

const results = await search.json();
console.log(results.results); // Similar content chunks
```

### AI Agent Management Example

```javascript
// Create a new AI agent
const agent = await fetch('http://localhost:3000/api/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'DeFi Monitor',
    description: 'Monitors DeFi protocols and token transfers',
    aiConfig: {
      model: 'gpt-4-turbo',
      temperature: 0.7,
      systemPrompt: 'You are a DeFi monitoring specialist...'
    },
    eventTriggers: [{
      name: 'Large Transfer Alert',
      eventType: 'token_transfer',
      conditions: [{
        field: 'parsedData.amount',
        operator: 'greater_than',
        value: 1000000
      }]
    }]
  })
});

const agentData = await agent.json();
console.log('Agent created:', agentData.agent);

// Start a chat session with the agent
const session = await fetch(`http://localhost:3000/api/agents/${agentData.agent.id}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const chatSession = await session.json();

// Send a message to the agent
const message = await fetch(`http://localhost:3000/api/chat/${chatSession.session.id}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'What DeFi protocols are you currently monitoring?'
  })
});

const response = await message.json();
console.log('Agent response:', response.message.content);
```

## 🛠️ Development

### Available Scripts

```bash
# Development
bun run dev          # Start development server with hot reload
bun run start        # Start production server
bun run build        # Build the application

# Database
bun run db:setup     # Initialize database and create tables
bun run db:seed      # Seed database with sample data

# Frontend Development
cd frontend
bun install         # Install frontend dependencies
bun run dev         # Start frontend development server (port 3001)

# Testing
bun run test         # Run tests (if configured)
```

### Project Structure

```
src/
├── db/              # Database related files
│   ├── connection.ts    # Database connection and management
│   ├── schema.ts       # Database schema and types
│   ├── setup.ts        # Database initialization script
│   └── seed.ts         # Database seeding script
├── lib/             # Core library files
│   ├── ai.ts           # AI SDK integration and providers
│   └── embeddings.ts   # Vector embeddings service
├── routes/          # API route handlers
├── types/           # TypeScript type definitions
│   └── index.ts        # Exported types
├── agents/          # AI agent system
│   ├── types.ts        # Agent type definitions
│   ├── agent-manager.ts # Agent management service
│   └── dialect-monitor.ts # Dialect event monitoring
├── utils/           # Utility functions
│   └── index.ts        # Helper utilities
└── index.ts         # Main application entry point

frontend/            # React frontend application
├── src/
│   ├── components/     # React components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom React hooks
│   └── lib/           # Frontend utilities
└── package.json       # Frontend dependencies

data/                # Database files (created automatically)
└── app.db          # SQLite database file
```

### Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server     │    │   AI Providers  │
│   (Your App)    │◄──►│   (Hono)        │◄──►│   (OpenAI, etc) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   SQLite DB      │
                       │   + Vector       │
                       │   Embeddings     │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   OpenAI         │
                       │   Embeddings     │
                       │   (via AI SDK)   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   AI Agents      │
                       │   Management     │
                       │   & Automation   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Dialect        │
                       │   Event Monitor  │
                       │   (Blockchain)   │
                       └──────────────────┘
```

### Key Components

1. **Hono Server**: Fast, lightweight web framework for API endpoints
2. **SQLite Database**: Stores documents, conversations, agents, and vector embeddings
3. **AI SDK 5**: Handles multiple AI provider integrations
4. **Vector Embeddings**: OpenAI embeddings via AI SDK
5. **RAG System**: Retrieval-Augmented Generation for enhanced responses
6. **AI Agent System**: Intelligent agents that respond to blockchain events
7. **Dialect Monitor**: Real-time Solana blockchain event monitoring
8. **React Dashboard**: Modern frontend for agent management and chat interface

## 🔧 Advanced Configuration

### Custom Embedding Models

You can configure different OpenAI embedding models by setting the `EMBEDDING_MODEL` environment variable:

```env  
# OpenAI embedding models:
EMBEDDING_MODEL=text-embedding-3-small  # 1536 dimensions (default)
EMBEDDING_MODEL=text-embedding-3-large  # 3072 dimensions  
EMBEDDING_MODEL=text-embedding-ada-002  # 1536 dimensions (legacy)
```

### Database Tuning

The SQLite database is configured with optimized settings:
- WAL (Write-Ahead Logging) mode for better concurrency
- Foreign key constraints enabled
- Automatic vacuuming and analysis

### Performance Optimization

- **Batch Processing**: Embeddings are processed in configurable batches
- **Connection Pooling**: Efficient database connection management
- **Caching**: Built-in response caching for similar queries
- **Indexing**: Optimized database indexes for common query patterns

## 🚨 Troubleshooting

### Common Issues

**1. "No AI providers configured" error**
- Ensure at least one API key is set: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Check that the API keys are valid and have sufficient credits

**2. Embedding service fails to initialize**
- Verify your OpenAI API key is set and valid
- Check that you have sufficient API credits
- Ensure network connectivity to OpenAI's API

**3. Dialect monitor connection errors**
- Verify Solana RPC and WebSocket URLs are accessible
- Check if Dialect API key is valid (if required)
- Ensure network connectivity to Solana nodes

**4. Database connection errors**
- Ensure the data directory exists and is writable
- Check file permissions on the database file
- Run `bun run db:setup` to reinitialize

**5. Memory issues with large documents**
- Reduce `EMBEDDING_BATCH_SIZE` in configuration
- Increase system memory or use smaller documents
- Consider chunking documents before processing

**6. Agent execution failures**
- Check agent configuration and event triggers
- Verify action configurations are valid
- Review agent execution logs for detailed error messages

### Performance Issues

**Slow embeddings generation:**
- Use `text-embedding-3-small` instead of `text-embedding-3-large`  
- Reduce batch size in configuration
- Check OpenAI API rate limits

**Slow database queries:**
- Check if indexes are being used (`EXPLAIN QUERY PLAN`)
- Run `VACUUM` and `ANALYZE` on the database
- Consider increasing cache size

## 📝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add type definitions for new features
- Write comprehensive error handling
- Include JSDoc comments for public APIs
- Test your changes thoroughly

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [AI SDK](https://sdk.vercel.ai/) for the excellent AI integration framework
- [Bun](https://bun.sh/) for the blazing fast JavaScript runtime
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings) for high-quality text embeddings
- [Hono](https://hono.dev/) for the lightweight web framework
- [Dialect Protocol](https://docs.dialect.to/) for blockchain event monitoring
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/) for Solana blockchain interaction
- [React](https://react.dev/) and [Tailwind CSS](https://tailwindcss.com/) for the frontend interface

---

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Search through existing GitHub issues
3. Create a new issue with detailed information
4. Join our community discussions

**Happy coding! 🚀**