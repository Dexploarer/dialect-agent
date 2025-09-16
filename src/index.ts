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

// Import Dialect services
import { createDialectAlertsService } from "./lib/dialect-alerts.js";
import { createDialectMarketsService } from "./lib/dialect-markets.js";
import { createDialectPositionsService } from "./lib/dialect-positions.js";
import { createDialectBlinksService } from "./lib/dialect-blinks.js";
import { createDialectAuthService } from "./lib/dialect-auth.js";
import { createDialectInboxService } from "./lib/dialect-inbox.js";
import { createDialectMCPService } from "./lib/dialect-mcp-service.js";
import { createDialectMonitoringService } from "./lib/dialect-monitoring-service.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
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
              { 
                ...(model && { model }), 
                ...(temperature !== undefined && { temperature }), 
                ...(maxTokens !== undefined && { maxTokens }), 
                ...(enableRag !== undefined && { enableRag })
              },
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
      { 
        ...(model && { model }), 
        ...(temperature !== undefined && { temperature }), 
        ...(maxTokens !== undefined && { maxTokens }), 
        ...(enableRag !== undefined && { enableRag })
      },
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
      documents: documents.map((doc: any) => ({
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
      ...(documentIds && { documentIds }),
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
      messages: messages.map((msg: any) => ({
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

// AI Service
let aiService: ReturnType<typeof getAIService> | null = null;

// Dialect Services
let dialectAlertsService: ReturnType<typeof createDialectAlertsService>;
let dialectMarketsService: ReturnType<typeof createDialectMarketsService>;
let dialectPositionsService: ReturnType<typeof createDialectPositionsService>;
let dialectBlinksService: ReturnType<typeof createDialectBlinksService>;
let dialectAuthService: ReturnType<typeof createDialectAuthService>;
let dialectInboxService: ReturnType<typeof createDialectInboxService>;
let dialectMCPService: ReturnType<typeof createDialectMCPService>;
let dialectMonitoringService: ReturnType<typeof createDialectMonitoringService>;

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

// Dialect Webhook Endpoint
app.post("/api/webhooks/dialect", async (c) => {
  try {
    const webhookData = await c.req.json();
    
    // Process the webhook data through the DialectEventMonitor
    if (agentManager && agentManager["dialectMonitor"]) {
      agentManager["dialectMonitor"].processDialectWebhook(webhookData);
    }
    
    // Always respond with 200 OK as required by Dialect
    return c.text("OK", 200);
  } catch (error) {
    console.error("❌ Dialect webhook error:", error);
    // Still return 200 OK to prevent Dialect from retrying
    return c.text("OK", 200);
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

// Dialect Alerts Routes

// Send alert
app.post("/api/dialect/alerts/send", async (c) => {
  try {
    const body = await c.req.json();
    const result = await dialectAlertsService.sendAlert(body);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send alert",
      },
      500,
    );
  }
});

// Send batch alerts
app.post("/api/dialect/alerts/send-batch", async (c) => {
  try {
    const body = await c.req.json();
    const result = await dialectAlertsService.sendBatchAlerts(body);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send batch alerts",
      },
      500,
    );
  }
});

// Send price alert
app.post("/api/dialect/alerts/price", async (c) => {
  try {
    const { walletAddress, tokenSymbol, priceChange, currentPrice, channels } = await c.req.json();
    const result = await dialectAlertsService.sendPriceAlert(
      walletAddress,
      tokenSymbol,
      priceChange,
      currentPrice,
      channels
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send price alert",
      },
      500,
    );
  }
});

// Send liquidation warning
app.post("/api/dialect/alerts/liquidation", async (c) => {
  try {
    const { walletAddress, protocol, collateralToken, healthFactor, channels } = await c.req.json();
    const result = await dialectAlertsService.sendLiquidationWarning(
      walletAddress,
      protocol,
      collateralToken,
      healthFactor,
      channels
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send liquidation warning",
      },
      500,
    );
  }
});

// Broadcast message
app.post("/api/dialect/alerts/broadcast", async (c) => {
  try {
    const { title, body, channels, topicId } = await c.req.json();
    const result = await dialectAlertsService.broadcastMessage(title, body, channels, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to broadcast message",
      },
      500,
    );
  }
});

// Dialect Markets Routes

// Get all markets
app.get("/api/dialect/markets", async (c) => {
  try {
    const protocol = c.req.query("protocol");
    const type = c.req.query("type");
    const tokenSymbol = c.req.query("token");
    const minApy = c.req.query("minApy") ? parseFloat(c.req.query("minApy")!) : undefined;
    const maxApy = c.req.query("maxApy") ? parseFloat(c.req.query("maxApy")!) : undefined;
    const minTvl = c.req.query("minTvl") ? parseFloat(c.req.query("minTvl")!) : undefined;
    const maxTvl = c.req.query("maxTvl") ? parseFloat(c.req.query("maxTvl")!) : undefined;

    const filters = {
      ...(protocol && { protocol }),
      ...(type && { type: type as any }),
      ...(tokenSymbol && { tokenSymbol }),
      ...(minApy !== undefined && { minApy }),
      ...(maxApy !== undefined && { maxApy }),
      ...(minTvl !== undefined && { minTvl }),
      ...(maxTvl !== undefined && { maxTvl }),
    };

    const result = await dialectMarketsService.getMarkets(filters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch markets",
      },
      500,
    );
  }
});

// Get markets grouped by type
app.get("/api/dialect/markets/grouped", async (c) => {
  try {
    const result = await dialectMarketsService.getMarketsGroupedByType();
    return c.json({ markets: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch grouped markets",
      },
      500,
    );
  }
});

// Get market statistics
app.get("/api/dialect/markets/stats", async (c) => {
  try {
    const result = await dialectMarketsService.getMarketStats();
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch market stats",
      },
      500,
    );
  }
});

// Search markets
app.get("/api/dialect/markets/search", async (c) => {
  try {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }
    const result = await dialectMarketsService.searchMarkets(query);
    return c.json({ markets: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to search markets",
      },
      500,
    );
  }
});

// Dialect Positions Routes

// Get positions by wallet
app.get("/api/dialect/positions/:walletAddress", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const protocol = c.req.query("protocol");
    const type = c.req.query("type");
    const minValue = c.req.query("minValue") ? parseFloat(c.req.query("minValue")!) : undefined;
    const maxValue = c.req.query("maxValue") ? parseFloat(c.req.query("maxValue")!) : undefined;
    const status = c.req.query("status");
    const healthFactorThreshold = c.req.query("healthFactorThreshold") 
      ? parseFloat(c.req.query("healthFactorThreshold")!) 
      : undefined;

    const filters = {
      ...(protocol && { protocol }),
      ...(type && { type: type as any }),
      ...(minValue !== undefined && { minValue }),
      ...(maxValue !== undefined && { maxValue }),
      ...(status && { status: status as any }),
      ...(healthFactorThreshold !== undefined && { healthFactorThreshold }),
    };

    const result = await dialectPositionsService.getPositionsByWallet(walletAddress, filters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch positions",
      },
      500,
    );
  }
});

// Get position summary
app.get("/api/dialect/positions/:walletAddress/summary", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const result = await dialectPositionsService.getPositionSummary(walletAddress);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch position summary",
      },
      500,
    );
  }
});

// Get at-risk positions
app.get("/api/dialect/positions/:walletAddress/at-risk", async (c) => {
  try {
    const walletAddress = c.req.param("walletAddress");
    const threshold = c.req.query("threshold") ? parseFloat(c.req.query("threshold")!) : 1.5;
    const result = await dialectPositionsService.getAtRiskPositions(walletAddress, threshold);
    return c.json({ positions: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch at-risk positions",
      },
      500,
    );
  }
});

// Dialect Blinks Routes

// Get blink preview
app.get("/api/dialect/blinks/preview", async (c) => {
  try {
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlinkPreview(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink preview",
      },
      500,
    );
  }
});

// Get full blink data
app.get("/api/dialect/blinks/data", async (c) => {
  try {
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlink(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink data",
      },
      500,
    );
  }
});

// Get blink data table
app.get("/api/dialect/blinks/data-table", async (c) => {
  try {
    const blinkUrl = c.req.query("url");
    if (!blinkUrl) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const result = await dialectBlinksService.getBlinkDataTable(blinkUrl);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blink data table",
      },
      500,
    );
  }
});

// Execute blink action
app.post("/api/dialect/blinks/execute", async (c) => {
  try {
    const { blinkUrl, walletAddress, parameters } = await c.req.json();
    
    if (!blinkUrl || !walletAddress) {
      return c.json({ error: "blinkUrl and walletAddress are required" }, 400);
    }
    
    const result = await dialectBlinksService.executeBlinkAction(blinkUrl, walletAddress, parameters);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute blink action",
      },
      500,
    );
  }
});

// Get popular blinks
app.get("/api/dialect/blinks/popular", async (c) => {
  try {
    const category = c.req.query("category");
    const result = await dialectBlinksService.getPopularBlinks(category);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch popular blinks",
      },
      500,
    );
  }
});

// Search blinks
app.get("/api/dialect/blinks/search", async (c) => {
  try {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }
    
    const result = await dialectBlinksService.searchBlinks(query);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to search blinks",
      },
      500,
    );
  }
});

// Get blinks by provider
app.get("/api/dialect/blinks/provider/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");
    const result = await dialectBlinksService.getBlinksByProvider(provider);
    return c.json({ blinks: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch blinks by provider",
      },
      500,
    );
  }
});

// Validate blink URL
app.get("/api/dialect/blinks/validate", async (c) => {
  try {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "URL parameter is required" }, 400);
    }
    
    const isValid = dialectBlinksService.isValidBlinkUrl(url);
    const metadata = dialectBlinksService.extractBlinkMetadata(url);
    
    return c.json({
      isValid,
      metadata,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to validate blink URL",
      },
      500,
    );
  }
});

// Dialect Authentication Routes

// Prepare authentication
app.post("/api/dialect/auth/prepare", async (c) => {
  try {
    const { walletAddress } = await c.req.json();
    
    if (!walletAddress) {
      return c.json({ error: "walletAddress is required" }, 400);
    }
    
    const result = await dialectAuthService.prepareAuth(walletAddress);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to prepare authentication",
      },
      500,
    );
  }
});

// Verify authentication
app.post("/api/dialect/auth/verify", async (c) => {
  try {
    const { message, signature } = await c.req.json();
    
    if (!message || !signature) {
      return c.json({ error: "message and signature are required" }, 400);
    }
    
    const result = await dialectAuthService.verifyAuth(message, signature);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to verify authentication",
      },
      500,
    );
  }
});

// Get authenticated user
app.get("/api/dialect/auth/me", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getAuthenticatedUser(token);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get authenticated user",
      },
      500,
    );
  }
});

// Get user subscriptions
app.get("/api/dialect/auth/subscriptions", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getUserSubscriptions(token);
    return c.json({ subscriptions: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get user subscriptions",
      },
      500,
    );
  }
});

// Subscribe to app
app.post("/api/dialect/auth/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { appId, channels } = await c.req.json();
    
    if (!appId) {
      return c.json({ error: "appId is required" }, 400);
    }
    
    const result = await dialectAuthService.subscribeToApp(token, appId, channels);
    return c.json({ subscription: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to app",
      },
      500,
    );
  }
});

// Unsubscribe from app
app.delete("/api/dialect/auth/subscribe/:subscriptionId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const subscriptionId = c.req.param("subscriptionId");
    
    const result = await dialectAuthService.unsubscribeFromApp(token, subscriptionId);
    return c.json({ success: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from app",
      },
      500,
    );
  }
});

// Get available apps
app.get("/api/dialect/auth/apps", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectAuthService.getAvailableApps(token);
    return c.json({ apps: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get available apps",
      },
      500,
    );
  }
});

// Dialect Inbox Routes

// Get notification history
app.get("/api/dialect/inbox/notifications", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.query("appId");
    const limit = c.req.query("limit");
    const cursor = c.req.query("cursor");
    const unreadOnly = c.req.query("unreadOnly") === "true";
    
    const result = await dialectInboxService.getNotificationHistory(token, {
      ...(appId && { appId }),
      ...(limit && { limit: parseInt(limit) }),
      ...(cursor && { cursor }),
      ...(unreadOnly && { unreadOnly }),
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get notification history",
      },
      500,
    );
  }
});

// Get notification summary
app.get("/api/dialect/inbox/summary", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.query("appId");
    
    const result = await dialectInboxService.getNotificationSummary(token, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get notification summary",
      },
      500,
    );
  }
});

// Mark notifications as read
app.post("/api/dialect/inbox/read", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const request = await c.req.json();
    
    const result = await dialectInboxService.markNotificationsRead(token, request);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to mark notifications as read",
      },
      500,
    );
  }
});

// Clear notification history
app.post("/api/dialect/inbox/clear", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const request = await c.req.json();
    
    const result = await dialectInboxService.clearNotificationHistory(token, request);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear notification history",
      },
      500,
    );
  }
});

// Get user channels
app.get("/api/dialect/inbox/channels", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const result = await dialectInboxService.getUserChannels(token);
    return c.json({ channels: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get user channels",
      },
      500,
    );
  }
});

// Update channel configuration
app.patch("/api/dialect/inbox/channels/:channelType", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const channelType = c.req.param("channelType") as 'EMAIL' | 'TELEGRAM' | 'IN_APP' | 'PUSH';
    const config = await c.req.json();
    
    const result = await dialectInboxService.updateChannel(token, channelType, config);
    return c.json({ channel: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to update channel",
      },
      500,
    );
  }
});

// Prepare email channel
app.post("/api/dialect/inbox/channels/email/prepare", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({ error: "email is required" }, 400);
    }
    
    const result = await dialectInboxService.prepareEmailChannel(token, email);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to prepare email channel",
      },
      500,
    );
  }
});

// Verify email channel
app.post("/api/dialect/inbox/channels/email/verify", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { code } = await c.req.json();
    
    if (!code) {
      return c.json({ error: "verification code is required" }, 400);
    }
    
    const result = await dialectInboxService.verifyEmailChannel(token, code);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to verify email channel",
      },
      500,
    );
  }
});

// Subscribe to push notifications
app.post("/api/dialect/inbox/channels/push/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { deviceId, fcmToken, appId } = await c.req.json();
    
    if (!deviceId || !fcmToken) {
      return c.json({ error: "deviceId and fcmToken are required" }, 400);
    }
    
    const result = await dialectInboxService.subscribeToPushNotifications(token, deviceId, fcmToken, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to push notifications",
      },
      500,
    );
  }
});

// Unsubscribe from push notifications
app.post("/api/dialect/inbox/channels/push/unsubscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const { deviceId, appId } = await c.req.json();
    
    if (!deviceId) {
      return c.json({ error: "deviceId is required" }, 400);
    }
    
    const result = await dialectInboxService.unsubscribeFromPushNotifications(token, deviceId, appId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from push notifications",
      },
      500,
    );
  }
});

// Get app topics
app.get("/api/dialect/inbox/apps/:appId/topics", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const appId = c.req.param("appId");
    
    const result = await dialectInboxService.getAppTopics(token, appId);
    return c.json({ topics: result });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get app topics",
      },
      500,
    );
  }
});

// Subscribe to topic
app.post("/api/dialect/inbox/topics/:topicId/subscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const topicId = c.req.param("topicId");
    
    const result = await dialectInboxService.subscribeToTopic(token, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to subscribe to topic",
      },
      500,
    );
  }
});

// Unsubscribe from topic
app.post("/api/dialect/inbox/topics/:topicId/unsubscribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: "Authorization header with Bearer token is required" }, 401);
    }
    
    const token = authHeader.substring(7);
    const topicId = c.req.param("topicId");
    
    const result = await dialectInboxService.unsubscribeFromTopic(token, topicId);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to unsubscribe from topic",
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
    try {
      aiService = initializeAIService();
      if (aiService) {
        console.log("✅ AI service initialized");
      } else {
        console.log("⚠️ AI service disabled (no API keys configured)");
      }
    } catch (error) {
      console.error("❌ AI service failed to initialize:", error);
      console.log("⚠️ Continuing without AI service for testing");
      aiService = null;
    }

    // Initialize Dialect services
    try {
      dialectAlertsService = createDialectAlertsService();
      console.log("✅ Dialect Alerts service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Alerts service failed to initialize:", error);
    }

    try {
      dialectMarketsService = createDialectMarketsService();
      console.log("✅ Dialect Markets service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Markets service failed to initialize:", error);
    }

    try {
      dialectPositionsService = createDialectPositionsService();
      console.log("✅ Dialect Positions service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Positions service failed to initialize:", error);
    }

    try {
      dialectBlinksService = createDialectBlinksService();
      console.log("✅ Dialect Blinks service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Blinks service failed to initialize:", error);
    }

    try {
      dialectAuthService = createDialectAuthService();
      console.log("✅ Dialect Auth service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Auth service failed to initialize:", error);
    }

    try {
      dialectInboxService = createDialectInboxService();
      console.log("✅ Dialect Inbox service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Inbox service failed to initialize:", error);
    }

    // Initialize Dialect MCP Service
    try {
      dialectMCPService = createDialectMCPService({
        apiKey: process.env.DIALECT_API_KEY || 'test-key',
        baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
        clientKey: process.env.DIALECT_CLIENT_KEY || 'test-client-key',
        appId: process.env.DIALECT_APP_ID || 'test-app-id',
      });
      await dialectMCPService.initialize();
      console.log("✅ Dialect MCP service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect MCP service failed to initialize:", error);
    }

    // Initialize Dialect Monitoring Service
    try {
      dialectMonitoringService = createDialectMonitoringService({
        apiKey: process.env.DIALECT_API_KEY || 'test-key',
        baseUrl: process.env.DIALECT_API_URL || 'https://api.dialect.to',
        webhookUrl: process.env.DIALECT_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/dialect',
        monitoringInterval: 30000, // 30 seconds
        maxRetries: 3,
        retryDelay: 5000,
      });
      await dialectMonitoringService.initialize();
      console.log("✅ Dialect Monitoring service initialized");
    } catch (error) {
      console.warn("⚠️ Dialect Monitoring service failed to initialize:", error);
    }

    // Initialize agent manager
    agentManager = new AgentManager();
    
    // Configure Dialect services with agent manager
    agentManager.setDialectServices({
      alerts: dialectAlertsService,
      markets: dialectMarketsService,
      positions: dialectPositionsService,
      blinks: dialectBlinksService,
    });
    
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
    console.log("  POST   /api/webhooks/dialect   - Dialect webhook endpoint");
    console.log("  GET    /api/events             - Get recent events");
    console.log("  GET    /api/events/status      - Get monitoring status");
    console.log("  GET    /api/agents/:id/executions - Get agent executions");
    console.log("  GET    /api/agents/:id/metrics - Get agent metrics");
    console.log("");
    console.log("Dialect Alerts:");
    console.log("  POST   /api/dialect/alerts/send - Send alert");
    console.log("  POST   /api/dialect/alerts/send-batch - Send batch alerts");
    console.log("  POST   /api/dialect/alerts/price - Send price alert");
    console.log("  POST   /api/dialect/alerts/liquidation - Send liquidation warning");
    console.log("  POST   /api/dialect/alerts/broadcast - Broadcast message");
    console.log("");
    console.log("Dialect Markets:");
    console.log("  GET    /api/dialect/markets - Get all markets");
    console.log("  GET    /api/dialect/markets/grouped - Get markets grouped by type");
    console.log("  GET    /api/dialect/markets/stats - Get market statistics");
    console.log("  GET    /api/dialect/markets/search - Search markets");
    console.log("");
    console.log("Dialect Positions:");
    console.log("  GET    /api/dialect/positions/:wallet - Get positions by wallet");
    console.log("  GET    /api/dialect/positions/:wallet/summary - Get position summary");
    console.log("  GET    /api/dialect/positions/:wallet/at-risk - Get at-risk positions");
    console.log("");
    console.log("Dialect Blinks:");
    console.log("  GET    /api/dialect/blinks/preview - Get blink preview");
    console.log("  GET    /api/dialect/blinks/data - Get full blink data");
    console.log("  GET    /api/dialect/blinks/data-table - Get blink data table");
    console.log("  POST   /api/dialect/blinks/execute - Execute blink action");
    console.log("  GET    /api/dialect/blinks/popular - Get popular blinks");
    console.log("  GET    /api/dialect/blinks/search - Search blinks");
    console.log("  GET    /api/dialect/blinks/provider/:provider - Get blinks by provider");
    console.log("  GET    /api/dialect/blinks/validate - Validate blink URL");
    console.log("");
    console.log("Dialect Authentication:");
    console.log("  POST   /api/dialect/auth/prepare - Prepare authentication");
    console.log("  POST   /api/dialect/auth/verify - Verify authentication");
    console.log("  GET    /api/dialect/auth/me - Get authenticated user");
    console.log("  GET    /api/dialect/auth/subscriptions - Get user subscriptions");
    console.log("  POST   /api/dialect/auth/subscribe - Subscribe to app");
    console.log("  DELETE /api/dialect/auth/subscribe/:id - Unsubscribe from app");
    console.log("  GET    /api/dialect/auth/apps - Get available apps");
    console.log("");
    console.log("Dialect Inbox:");
    console.log("  GET    /api/dialect/inbox/notifications - Get notification history");
    console.log("  GET    /api/dialect/inbox/summary - Get notification summary");
    console.log("  POST   /api/dialect/inbox/read - Mark notifications as read");
    console.log("  POST   /api/dialect/inbox/clear - Clear notification history");
    console.log("  GET    /api/dialect/inbox/channels - Get user channels");
    console.log("  PATCH  /api/dialect/inbox/channels/:type - Update channel config");
    console.log("  POST   /api/dialect/inbox/channels/email/prepare - Prepare email channel");
    console.log("  POST   /api/dialect/inbox/channels/email/verify - Verify email channel");
    console.log("  POST   /api/dialect/inbox/channels/push/subscribe - Subscribe to push");
    console.log("  POST   /api/dialect/inbox/channels/push/unsubscribe - Unsubscribe from push");
    console.log("  GET    /api/dialect/inbox/apps/:id/topics - Get app topics");
    console.log("  POST   /api/dialect/inbox/topics/:id/subscribe - Subscribe to topic");
    console.log("  POST   /api/dialect/inbox/topics/:id/unsubscribe - Unsubscribe from topic");
    console.log("");
    console.log("Dialect MCP Service:");
    console.log("  GET    /api/dialect/mcp/status - Get MCP service status");
    console.log("  GET    /api/dialect/mcp/blinks - Get available Blinks");
    console.log("  GET    /api/dialect/mcp/markets - Get market data via MCP");
    console.log("  POST   /api/dialect/mcp/blinks/execute - Execute Blink action");
    console.log("  POST   /api/dialect/mcp/alerts/template - Create alert template");
    console.log("  POST   /api/dialect/mcp/alerts/send - Send alert via template");
    console.log("  GET    /api/dialect/mcp/docs/search - Search documentation");
    console.log("");
    console.log("Dialect Monitoring Service:");
    console.log("  GET    /api/dialect/monitoring/status - Get monitoring status");
    console.log("  GET    /api/dialect/monitoring/rules - Get monitoring rules");
    console.log("  POST   /api/dialect/monitoring/rules - Add monitoring rule");
    console.log("  PUT    /api/dialect/monitoring/rules/:id - Update monitoring rule");
    console.log("  DELETE /api/dialect/monitoring/rules/:id - Delete monitoring rule");
    console.log("  GET    /api/dialect/monitoring/events - Get recent events");
    console.log("  GET    /api/dialect/monitoring/stats - Get monitoring stats");
    console.log("  POST   /api/dialect/monitoring/start - Start monitoring");
    console.log("  POST   /api/dialect/monitoring/stop - Stop monitoring");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Dialect MCP Service Routes
app.get("/api/dialect/mcp/status", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const status = dialectMCPService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("❌ MCP status error:", error);
    return c.json({ error: "Failed to get MCP status" }, 500);
  }
});

app.get("/api/dialect/mcp/blinks", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const category = c.req.query('category');
    const blinks = await dialectMCPService.getAvailableBlinks(category);
    return c.json({ blinks });
  } catch (error) {
    console.error("❌ MCP blinks error:", error);
    return c.json({ error: "Failed to get available blinks" }, 500);
  }
});

app.get("/api/dialect/mcp/markets", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const protocol = c.req.query('protocol');
    const token = c.req.query('token');
    const minApy = c.req.query('minApy') ? parseFloat(c.req.query('minApy')!) : undefined;
    const maxApy = c.req.query('maxApy') ? parseFloat(c.req.query('maxApy')!) : undefined;

    const markets = await dialectMCPService.getMarketData({
      ...(protocol && { protocol }),
      ...(token && { token }),
      ...(minApy && { minApy }),
      ...(maxApy && { maxApy }),
    });
    return c.json({ markets });
  } catch (error) {
    console.error("❌ MCP markets error:", error);
    return c.json({ error: "Failed to get market data" }, 500);
  }
});

app.post("/api/dialect/mcp/blinks/execute", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const { blinkUrl, parameters, walletAddress } = await c.req.json();

    if (!blinkUrl || !walletAddress) {
      return c.json({ error: "blinkUrl and walletAddress are required" }, 400);
    }

    const result = await dialectMCPService.executeBlink(blinkUrl, parameters || {}, walletAddress);
    return c.json(result);
  } catch (error) {
    console.error("❌ MCP blink execution error:", error);
    return c.json({ error: "Failed to execute blink" }, 500);
  }
});

app.post("/api/dialect/mcp/alerts/template", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const template = await c.req.json();
    const createdTemplate = await dialectMCPService.createAlertTemplate(template);
    return c.json(createdTemplate);
  } catch (error) {
    console.error("❌ MCP alert template error:", error);
    return c.json({ error: "Failed to create alert template" }, 500);
  }
});

app.post("/api/dialect/mcp/alerts/send", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const { templateId, recipients, customData } = await c.req.json();

    if (!templateId || !recipients || !Array.isArray(recipients)) {
      return c.json({ error: "templateId and recipients array are required" }, 400);
    }

    const result = await dialectMCPService.sendAlert(templateId, recipients, customData);
    return c.json(result);
  } catch (error) {
    console.error("❌ MCP alert send error:", error);
    return c.json({ error: "Failed to send alert" }, 500);
  }
});

app.get("/api/dialect/mcp/docs/search", async (c) => {
  try {
    if (!dialectMCPService) {
      return c.json({ error: "MCP service not initialized" }, 500);
    }

    const query = c.req.query('q');
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }

    const results = await dialectMCPService.searchDocumentation(query);
    return c.json(results);
  } catch (error) {
    console.error("❌ MCP docs search error:", error);
    return c.json({ error: "Failed to search documentation" }, 500);
  }
});

// Dialect Monitoring Service Routes
app.get("/api/dialect/monitoring/status", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const status = dialectMonitoringService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("❌ Monitoring status error:", error);
    return c.json({ error: "Failed to get monitoring status" }, 500);
  }
});

app.get("/api/dialect/monitoring/rules", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const rules = dialectMonitoringService.getRules();
    return c.json({ rules });
  } catch (error) {
    console.error("❌ Monitoring rules error:", error);
    return c.json({ error: "Failed to get monitoring rules" }, 500);
  }
});

app.post("/api/dialect/monitoring/rules", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const ruleData = await c.req.json();
    const rule = await dialectMonitoringService.addRule(ruleData);
    return c.json(rule);
  } catch (error) {
    console.error("❌ Add monitoring rule error:", error);
    return c.json({ error: "Failed to add monitoring rule" }, 500);
  }
});

app.put("/api/dialect/monitoring/rules/:id", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const id = c.req.param('id');
    const updates = await c.req.json();
    const rule = await dialectMonitoringService.updateRule(id, updates);
    
    if (!rule) {
      return c.json({ error: "Rule not found" }, 404);
    }
    
    return c.json(rule);
  } catch (error) {
    console.error("❌ Update monitoring rule error:", error);
    return c.json({ error: "Failed to update monitoring rule" }, 500);
  }
});

app.delete("/api/dialect/monitoring/rules/:id", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const id = c.req.param('id');
    const deleted = await dialectMonitoringService.deleteRule(id);
    
    if (!deleted) {
      return c.json({ error: "Rule not found" }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("❌ Delete monitoring rule error:", error);
    return c.json({ error: "Failed to delete monitoring rule" }, 500);
  }
});

app.get("/api/dialect/monitoring/events", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const limit = parseInt(c.req.query('limit') || '50');
    const events = dialectMonitoringService.getRecentEvents(limit);
    return c.json({ events });
  } catch (error) {
    console.error("❌ Monitoring events error:", error);
    return c.json({ error: "Failed to get monitoring events" }, 500);
  }
});

app.get("/api/dialect/monitoring/stats", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    const stats = dialectMonitoringService.getStats();
    return c.json(stats);
  } catch (error) {
    console.error("❌ Monitoring stats error:", error);
    return c.json({ error: "Failed to get monitoring stats" }, 500);
  }
});

app.post("/api/dialect/monitoring/start", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    await dialectMonitoringService.startMonitoring();
    return c.json({ success: true, message: "Monitoring started" });
  } catch (error) {
    console.error("❌ Start monitoring error:", error);
    return c.json({ error: "Failed to start monitoring" }, 500);
  }
});

app.post("/api/dialect/monitoring/stop", async (c) => {
  try {
    if (!dialectMonitoringService) {
      return c.json({ error: "Monitoring service not initialized" }, 500);
    }

    await dialectMonitoringService.stopMonitoring();
    return c.json({ success: true, message: "Monitoring stopped" });
  } catch (error) {
    console.error("❌ Stop monitoring error:", error);
    return c.json({ error: "Failed to stop monitoring" }, 500);
  }
});

// Start the server
startServer().catch(console.error);

export default app;
