import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { existsSync, mkdirSync } from "fs";
import { createTablesSQL } from "./schema.js";

export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  pragma?: Record<string, string | number | boolean>;
}

export class DatabaseManager {
  private db: Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      verbose: false,
      readonly: false,
      fileMustExist: false,
      timeout: 5000,
      pragma: {
        journal_mode: "WAL",
        synchronous: "NORMAL",
        cache_size: 1000,
        foreign_keys: true,
        temp_store: "memory",
      },
      ...config,
    };
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    try {
      // Ensure database directory exists
      const dbDir = dirname(this.config.path);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection
      this.db = new Database(this.config.path, {
        create: !this.config.fileMustExist,
        readwrite: !this.config.readonly,
      });

      // Set pragma statements for optimization
      if (this.config.pragma) {
        for (const [key, value] of Object.entries(this.config.pragma)) {
          this.db.exec(`PRAGMA ${key} = ${value}`);
        }
      }

      // Create tables and indexes
      this.db.exec(createTablesSQL);

      console.log(`Database initialized at: ${this.config.path}`);
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDatabase(): Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Execute a query and return results
   */
  query(sql: string, ...params: any[]): any {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    const stmt = this.db.query(sql);
    return stmt.all(...params);
  }

  /**
   * Execute a query and return first result
   */
  get(sql: string, ...params: any[]): any {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    const stmt = this.db.query(sql);
    return stmt.get(...params);
  }

  /**
   * Execute a query without returning results
   */
  run(sql: string, ...params: any[]): any {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    const stmt = this.db.query(sql);
    return stmt.run(...params);
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: (db: DatabaseManager) => T): T {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Bun SQLite doesn't have explicit transactions yet, so we'll execute directly
    return fn(this);
  }

  /**
   * Execute multiple operations in a transaction
   */
  batch<T>(operations: Array<() => T>): T[] {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Execute operations sequentially for Bun SQLite
    return operations.map((op) => op());
  }

  /**
   * Backup database to file
   */
  async backup(backupPath: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      // Ensure backup directory exists
      const backupDir = dirname(backupPath);
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      // For Bun SQLite, we'll use a simple file copy for backup
      const fs = await import("fs");
      fs.copyFileSync(this.config.path, backupPath);
      console.log(`Database backed up to: ${backupPath}`);
    } catch (error) {
      console.error("Failed to backup database:", error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const stats = {
      documents: this.get("SELECT COUNT(*) as count FROM documents") as {
        count: number;
      },
      embeddings: this.get("SELECT COUNT(*) as count FROM embeddings") as {
        count: number;
      },
      conversations: this.get(
        "SELECT COUNT(*) as count FROM conversations",
      ) as { count: number },
      messages: this.get("SELECT COUNT(*) as count FROM messages") as {
        count: number;
      },
      dbSize: this.get(
        "SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table') * 1024 as size",
      ) as { size: number },
    };

    return {
      documents: stats.documents.count,
      embeddings: stats.embeddings.count,
      conversations: stats.conversations.count,
      messages: stats.messages.count,
      dbSizeBytes: stats.dbSize.size,
      dbSizeMB: Math.round((stats.dbSize.size / 1024 / 1024) * 100) / 100,
    };
  }

  /**
   * Optimize database (vacuum and analyze)
   */
  optimize(): void {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    console.log("Optimizing database...");
    this.db.exec("VACUUM;");
    this.db.exec("ANALYZE;");
    console.log("Database optimization complete");
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log("Database connection closed");
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.db !== null;
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;

/**
 * Get or create database manager instance
 */
export function getDatabaseManager(config?: DatabaseConfig): DatabaseManager {
  if (!dbManager) {
    if (!config) {
      const defaultPath = process.env.DATABASE_PATH || "./data/app.db";
      config = { path: defaultPath };
    }
    dbManager = new DatabaseManager(config);
  }
  return dbManager;
}

/**
 * Initialize database with default configuration
 */
export async function initializeDatabase(
  config?: DatabaseConfig,
): Promise<DatabaseManager> {
  const manager = getDatabaseManager(config);

  if (!manager.isConnected()) {
    await manager.initialize();
  }

  return manager;
}

/**
 * Get database instance (shorthand)
 */
export function getDB(): Database {
  if (!dbManager) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return dbManager.getDatabase();
}

/**
 * Get database manager (shorthand)
 */
export function getManager(): DatabaseManager {
  if (!dbManager) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return dbManager;
}

/**
 * Execute transaction (shorthand)
 */
export function transaction<T>(fn: (db: DatabaseManager) => T): T {
  if (!dbManager) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return dbManager.transaction(fn);
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(): void {
  const shutdown = () => {
    if (dbManager) {
      console.log("Closing database connection...");
      dbManager.close();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", shutdown);
}
