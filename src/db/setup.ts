import { config } from "dotenv";
import { resolve, dirname } from "path";
import { existsSync, mkdirSync } from "fs";
import { initializeDatabase, getDatabaseManager } from "./connection.js";

// Load environment variables
config();

async function setupDatabase() {
  console.log("🔧 Starting database setup...");

  try {
    // Ensure data directory exists
    const dbPath = process.env.DATABASE_PATH || "./data/app.db";
    const dbDir = dirname(resolve(dbPath));

    if (!existsSync(dbDir)) {
      console.log(`📁 Creating data directory: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database
    console.log("🗄️ Initializing database connection...");
    const dbManager = await initializeDatabase({
      path: dbPath,
      verbose: true,
    });

    console.log("✅ Database connection established");

    // Get database instance
    const db = dbManager.getDatabase();

    // Verify tables were created
    const tables = dbManager.query(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    );

    console.log("📋 Created tables:");
    tables.forEach((table: any) => {
      console.log(`  - ${table.name}`);
    });

    // Get indexes
    const indexes = dbManager.query(
      `SELECT name, tbl_name FROM sqlite_master
       WHERE type='index' AND name NOT LIKE 'sqlite_%'
       ORDER BY tbl_name, name`,
    );

    console.log("🔍 Created indexes:");
    indexes.forEach((index: any) => {
      console.log(`  - ${index.name} on ${index.tbl_name}`);
    });

    // Get database info
    const dbInfo = {
      path: dbPath,
      pageSize: dbManager.get("PRAGMA page_size")?.page_size || "unknown",
      journalMode:
        dbManager.get("PRAGMA journal_mode")?.journal_mode || "unknown",
      synchronous:
        dbManager.get("PRAGMA synchronous")?.synchronous || "unknown",
      foreignKeys:
        dbManager.get("PRAGMA foreign_keys")?.foreign_keys || "unknown",
      cacheSize: dbManager.get("PRAGMA cache_size")?.cache_size || "unknown",
      tempStore: dbManager.get("PRAGMA temp_store")?.temp_store || "unknown",
    };

    console.log("⚙️ Database configuration:");
    Object.entries(dbInfo).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });

    // Run a simple test query
    console.log("🧪 Running connection test...");
    const testResult = dbManager.get("SELECT 1 as test");
    if (testResult?.test === 1) {
      console.log("✅ Database test query successful");
    }

    // Get initial stats
    const stats = dbManager.getStats();
    console.log("📊 Initial database statistics:");
    console.log(`  - Documents: ${stats.documents}`);
    console.log(`  - Embeddings: ${stats.embeddings}`);
    console.log(`  - Conversations: ${stats.conversations}`);
    console.log(`  - Messages: ${stats.messages}`);
    console.log(`  - Database size: ${stats.dbSizeMB} MB`);

    // Create a test document to verify everything works
    console.log("🔬 Creating test document...");
    const testDocId = "test-doc-" + Date.now();

    dbManager.run(
      "INSERT INTO documents (id, title, content, metadata) VALUES (?, ?, ?, ?)",
      testDocId,
      "Test Document",
      "This is a test document to verify the database setup is working correctly.",
      "{}",
    );

    const testDoc = dbManager.get(
      "SELECT * FROM documents WHERE id = ?",
      testDocId,
    );
    if (testDoc) {
      console.log("✅ Test document created successfully");

      // Clean up test document
      dbManager.run("DELETE FROM documents WHERE id = ?", testDocId);
      console.log("🧹 Test document cleaned up");
    }

    console.log("🎉 Database setup completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Set up your environment variables (.env file)");
    console.log("2. Run the seed script to add sample data: bun run db:seed");
    console.log("3. Start the server: bun run dev");
  } catch (error) {
    console.error("❌ Database setup failed:", error);

    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }

    process.exit(1);
  }
}

// Handle script execution
if (import.meta.main) {
  setupDatabase().catch((error) => {
    console.error("❌ Setup script failed:", error);
    process.exit(1);
  });
}

export { setupDatabase };
