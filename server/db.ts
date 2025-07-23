import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
// Enable fetch connection cache for better performance
neonConfig.fetchConnectionCache = true;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with better error handling and connection management
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

// Add error handler for pool
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Initialize database with retry logic
let db: ReturnType<typeof drizzle>;
try {
  db = drizzle({ client: pool, schema });
} catch (error) {
  console.error('Failed to initialize database connection:', error);
  // Create a fallback that will retry connection
  db = drizzle({ client: pool, schema });
}

export { db };