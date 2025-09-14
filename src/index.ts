import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { streamText } from "hono/streaming";
import { z } from "zod";
import { nanoid } from "nanoid";
import { config } from "dotenv";

// Load environment variables
config();

// Import our services
import {
  initializeDatabase,
  getDatabaseManager,
  setupGracefulShutdown,
} from "./db/connection.js";
import {
  initializeEmbeddingService,
  getEmbeddingService,
} from "./lib/embeddings.js";
import { initializeAIService, getAIService } from "./lib/ai.js";

// Import types
import type { CoreMessage } from "ai";
import type { Document, Message, Conversation } from "./db/schema.js";

// Import agent system
import AgentManager from "./agents/agent-manager.js";
import type {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  ChatSession,
  AgentChatMessage,
} from "./agents/types.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: Boolean(process.env.CORS_CREDENTIALS) || true,
  }),
);

// Request validation schemas
const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  stream: z.boolean().optional(),
  enableRag: z.boolean().optional(),
  conversationId: z.string().optional(),
});

const DocumentRequestSchema = z.object({
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
});

const SearchRequestSchema = z.object({
  query: z.string(),
  limit: z.number().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
});

const ConversationRequestSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
});

// Health check endpoint
app.get("/health", async (c) => {
  try {
    const dbStats = getDatabaseManager().getStats();
    const aiHealth = await getAIService().healthCheck();
    const embeddingService = getEmbeddingService();

    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: "healthy",
          stats: dbStats,
        },
        ai: aiHealth,
        embeddings: {
          status: embeddingService.isReady() ? "healthy" : "initializing",
          config: embeddingService.getConfig(),
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

// Chat completion endpoint
app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();
    const {
      messages,
      model,
      temperature,
      maxTokens,
      stream,
      enableRag,
      conversationId,
    } = ChatRequestSchema.parse(body);

    const aiService = getAIService();
    const dbManager = getDatabaseManager();

    // Handle streaming response
    if (stream) {
      return streamText(c, async (stream) => {
        try {
          const { stream: textStream, ragContext } =
            await aiService.generateStreamingCompletion(
              messages as CoreMessage[],
              { model, temperature, maxTokens, enableRag },
            );

          let fullResponse = "";

          for await (const chunk of textStream.textStream) {
            fullResponse += chunk;
            await stream.write(chunk);
          }

          // Save conversation if ID provided
          if (conversationId) {
            const messageId = nanoid();
            dbManager.run(
              "INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)",
              messageId,
              conversationId,
              "assistant",
              fullResponse,
              JSON.stringify({ ragContext }),
            );
          }
        } catch (error) {
          await stream.write(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    }

    // Handle non-streaming response
    const { content, ragContext } = await aiService.generateChatCompletion(
      messages as CoreMessage[],
      { model, temperature, maxTokens, enableRag },
    );

    // Save conversation if ID provided
    if (conversationId) {
      const messageId = nanoid();
      dbManager.run(
        "INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)",
        messageId,
        conversationId,
        "assistant",
        content,
        JSON.stringify({ ragContext }),
      );
    }

    return c.json({
      content,
      ragContext: ragContext
        ? {
            query: ragContext.query,
            totalResults: ragContext.totalResults,
            sources: ragContext.results.map((r) => ({
              document_id: r.document_id,
              similarity: r.similarity,
              content: r.chunk.content.substring(0, 200) + "...",
            })),
          }
        : undefined,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500,
    );
  }
});

// Document management endpoints
app.post("/api/documents", async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, metadata } = DocumentRequestSchema.parse(body);

    const documentId = nanoid();
    const dbManager = getDatabaseManager();
    const embeddingService = getEmbeddingService();

    // Save document to database
    dbManager.run(
      "INSERT INTO documents (id, title, content, metadata) VALUES (?, ?, ?, ?)",
      documentId,
      title,
      content,
      JSON.stringify(metadata || {}),
    );

    // Generate and store embeddings
    await embeddingService.processDocument(
      documentId,
      content,
      title,
      metadata,
    );

    const document = dbManager.get(
      "SELECT * FROM documents WHERE id = ?",
      documentId,
    );

    return c.json(
      {
        document: {
          ...document,
          metadata: JSON.parse(document.metadata),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Document creation error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create document",
      },
      500,
    );
  }
});

app.get("/api/documents", async (c) => {
  try {
    const dbManager = getDatabaseManager();
    const documents = dbManager.query(
      "SELECT * FROM documents ORDER BY created_at DESC",
    );

    return c.json({
      documents: documents.map((doc) => ({
        ...doc,
        metadata: JSON.parse(doc.metadata),
      })),
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch documents",
      },
      500,
    );
  }
});

app.get("/api/documents/:id", async (c) => {
  try {
    const documentId = c.req.param("id");
    const dbManager = getDatabaseManager();
    const document = dbManager.get(
      "SELECT * FROM documents WHERE id = ?",
      documentId,
    );

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({
      document: {
        ...document,
        metadata: JSON.parse(document.metadata),
      },
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch document",
      },
      500,
    );
  }
});

app.delete("/api/documents/:id", async (c) => {
  try {
    const documentId = c.req.param("id");
    const dbManager = getDatabaseManager();
    const embeddingService = getEmbeddingService();

    // Delete document and associated embeddings
    dbManager.run("DELETE FROM documents WHERE id = ?", documentId);
    await embeddingService.deleteDocumentEmbeddings(documentId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete document",
      },
      500,
    );
  }
});

// Vector search endpoint
app.post("/api/search", async (c) => {
  try {
    const body = await c.req.json();
    const { query, limit, threshold, documentIds } =
      SearchRequestSchema.parse(body);

    const embeddingService = getEmbeddingService();
    const results = await embeddingService.searchSimilar(query, {
      limit: limit || 10,
      threshold: threshold || 0.7,
      documentIds,
    });

    return c.json({
      query,
      results: results.map((result) => ({
        document_id: result.document_id,
        chunk_id: result.chunk.id,
        content: result.chunk.content,
        similarity: result.similarity,
        metadata: result.metadata,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
      },
      500,
    );
  }
});

// Conversation management endpoints
app.post("/api/conversations", async (c) => {
  try {
    const body = await c.req.json();
    const { title, userId } = ConversationRequestSchema.parse(body);

    const conversationId = nanoid();
    const dbManager = getDatabaseManager();

    dbManager.run(
      "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
      conversationId,
      userId || null,
      title || null,
    );

    const conversation = dbManager.get(
      "SELECT * FROM conversations WHERE id = ?",
      conversationId,
    );

    return c.json({ conversation }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create conversation",
      },
      500,
    );
  }
});

app.get("/api/conversations", async (c) => {
  try {
    const userId = c.req.query("userId");
    const dbManager = getDatabaseManager();

    let conversations;
    if (userId) {
      conversations = dbManager.query(
        "SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC",
        userId,
      );
    } else {
      conversations = dbManager.query(
        "SELECT * FROM conversations ORDER BY created_at DESC",
      );
    }

    return c.json({ conversations });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch conversations",
      },
      500,
    );
  }
});

app.get("/api/conversations/:id", async (c) => {
  try {
    const conversationId = c.req.param("id");
    const dbManager = getDatabaseManager();

    const conversation = dbManager.get(
      "SELECT * FROM conversations WHERE id = ?",
      conversationId,
    );
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    const messages = dbManager.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      conversationId,
    );

    return c.json({
      conversation,
      messages: messages.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
      })),
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch conversation",
      },
      500,
    );
  }
});

app.delete("/api/conversations/:id", async (c) => {
  try {
    const conversationId = c.req.param("id");
    const dbManager = getDatabaseManager();

    dbManager.run("DELETE FROM conversations WHERE id = ?", conversationId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete conversation",
      },
      500,
    );
  }
});

// Summary generation endpoint
app.post("/api/summarize", async (c) => {
  try {
    const body = await c.req.json();
    const { content } = z.object({ content: z.string() }).parse(body);

    const aiService = getAIService();
    const summary = await aiService.summarizeDocument(content);

    return c.json({ summary });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate summary",
      },
      500,
    );
  }
});

// Database stats endpoint
app.get("/api/stats", async (c) => {
  try {
    const stats = getDatabaseManager().getStats();
    return c.json({ stats });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      500,
    );
  }
});

// Agent Management Routes
let agentManager: AgentManager;

// Create agent
app.post("/api/agents", async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.req.header("X-User-ID"); // Optional user identification

    const agent = await agentManager.createAgent(
      body as CreateAgentRequest,
      userId,
    );
    return c.json({ agent }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      500,
    );
  }
});

// Get all agents
app.get("/api/agents", async (c) => {
  try {
    const userId = c.req.query("userId");
    const agents = userId
      ? agentManager.getAgentsByUser(userId)
      : agentManager.getAllAgents();

    return c.json({ agents });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch agents",
      },
      500,
    );
  }
});

// Get agent by ID
app.get("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const agent = agentManager.getAgent(agentId);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json({ agent });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch agent",
      },
      500,
    );
  }
});

// Update agent
app.put("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    const body = await c.req.json();

    const agent = await agentManager.updateAgent(
      agentId,
      body as UpdateAgentRequest,
    );
    return c.json({ agent });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update agent",
      },
      500,
    );
  }
});

// Delete agent
app.delete("/api/agents/:id", async (c) => {
  try {
    const agentId = c.req.param("id");
    await agentManager.deleteAgent(agentId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete agent",
      },
      500,
    );
  }
});

// Agent Chat Routes

// Start chat session
app.post("/api/agents/:id/chat", async (c) => {
  try {
    const agentId = c.req.param("id");
    const userId = c.req.header("X-User-ID");

    const session = await agentManager.startChatSession(agentId, userId);
    return c.json({ session }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start chat session",
      },
      500,
    );
  }
});

// Send message to agent
app.post("/api/chat/:sessionId/messages", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const userId = c.req.header("X-User-ID");

    const { content } = z.object({ content: z.string() }).parse(body);

    const message = await agentManager.sendMessage(sessionId, content, userId);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send message",
      },
      500,
    );
  }
});

// Get chat session
app.get("/api/chat/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = agentManager.getChatSession(sessionId);

    if (!session) {
      return c.json({ error: "Chat session not found" }, 404);
    }

    return c.json({ session });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch chat session",
      },
      500,
    );
  }
});

// Close chat session
app.delete("/api/chat/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    await agentManager.closeChatSession(sessionId);

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to close chat session",
      },
      500,
    );
  }
});

// Event Monitoring Routes

// Get recent events
app.get("/api/events", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "100");
    const eventType = c.req.query("type");

    const events = eventType
      ? agentManager["dialectMonitor"].getEventsByType(eventType as any, limit)
      : agentManager["dialectMonitor"].getRecentEvents(limit);

    return c.json({ events });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch events",
      },
      500,
    );
  }
});

// Get monitoring status
app.get("/api/events/status", async (c) => {
  try {
    const stats = agentManager["dialectMonitor"].getStats();
    const globalStats = agentManager.getGlobalStats();

    return c.json({
      monitoring: stats,
      agents: globalStats,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch monitoring status",
      },
      500,
    );
  }
});

// Get agent execution history
app.get("/api/agents/:id/executions", async (c) => {
  try {
    const agentId = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "50");

    const executions = agentManager.getAgentExecutions(agentId, limit);
    return c.json({ executions });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch agent executions",
      },
      500,
    );
  }
});

// Get agent metrics
app.get("/api/agents/:id/metrics", async (c) => {
  try {
    const agentId = c.req.param("id");
    const metrics = agentManager.getAgentMetrics(agentId);

    return c.json({ metrics });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch agent metrics",
      },
      500,
    );
  }
});

// Initialize services and start server
async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "localhost";

  try {
    console.log("🚀 Initializing services...");

    // Initialize database
    await initializeDatabase();
    console.log("✅ Database initialized");

    // Initialize embedding service
    await initializeEmbeddingService();
    console.log("✅ Embedding service initialized");

    // Initialize AI service
    initializeAIService();
    console.log("✅ AI service initialized");

    // Initialize agent manager
    agentManager = new AgentManager();
    await agentManager.initialize();
    console.log("✅ Agent manager initialized");

    // Setup graceful shutdown
    setupGracefulShutdown();

    console.log(`🌟 Server starting on http://${host}:${port}`);

    // Start the server using Bun's native serve
    Bun.serve({
      fetch: app.fetch,
      port,
      hostname: host,
    });

    console.log(`✨ Server running on http://${host}:${port}`);
    console.log("\nAvailable endpoints:");
    console.log("  GET    /health                 - Health check");
    console.log("  POST   /api/chat               - Chat completions");
    console.log("  POST   /api/documents          - Create document");
    console.log("  GET    /api/documents          - List documents");
    console.log("  GET    /api/documents/:id      - Get document");
    console.log("  DELETE /api/documents/:id      - Delete document");
    console.log("  POST   /api/search             - Vector search");
    console.log("  POST   /api/conversations      - Create conversation");
    console.log("  GET    /api/conversations      - List conversations");
    console.log("  GET    /api/conversations/:id  - Get conversation");
    console.log("  DELETE /api/conversations/:id  - Delete conversation");
    console.log("  POST   /api/summarize          - Generate summary");
    console.log("  GET    /api/stats              - Database statistics");
    console.log("");
    console.log("Agent Management:");
    console.log("  POST   /api/agents             - Create agent");
    console.log("  GET    /api/agents             - List agents");
    console.log("  GET    /api/agents/:id         - Get agent");
    console.log("  PUT    /api/agents/:id         - Update agent");
    console.log("  DELETE /api/agents/:id         - Delete agent");
    console.log("");
    console.log("Agent Chat:");
    console.log("  POST   /api/agents/:id/chat    - Start chat session");
    console.log("  POST   /api/chat/:id/messages  - Send message");
    console.log("  GET    /api/chat/:id           - Get chat session");
    console.log("  DELETE /api/chat/:id           - Close chat session");
    console.log("");
    console.log("Event Monitoring:");
    console.log("  GET    /api/events             - Get recent events");
    console.log("  GET    /api/events/status      - Get monitoring status");
    console.log("  GET    /api/agents/:id/executions - Get agent executions");
    console.log("  GET    /api/agents/:id/metrics - Get agent metrics");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer().catch(console.error);

export default app;
