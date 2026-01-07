import mysql from 'mysql2/promise';

// Build connection config from environment variables
function getDbConfig(): mysql.ConnectionOptions {
  const config: mysql.ConnectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'testes1',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  // If DATABASE_URL is provided, parse it
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      config.host = url.hostname;
      config.port = parseInt(url.port || '3306');
      config.user = url.username;
      config.password = url.password;
      config.database = url.pathname.slice(1); // Remove leading /
    } catch (error) {
      console.error('Error parsing DATABASE_URL:', error);
    }
  }

  return config;
}

// Create connection pool
const pool = mysql.createPool(getDbConfig());

// Export pool for queries
export { pool };

// Get a connection from the pool
export async function getConnection() {
  return await pool.getConnection();
}

// Execute a query
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  try {
    const [rows] = await pool.execute<T[]>(sql, params);
    return rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Execute a query that returns a single row
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Execute an insert/update/delete query and return affected rows
export async function execute(
  sql: string,
  params?: any[]
): Promise<{ affectedRows: number; insertId?: number }> {
  try {
    const [result] = await pool.execute(sql, params) as any;
    return {
      affectedRows: result.affectedRows || 0,
      insertId: result.insertId,
    };
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
}

// Helper to get pool for transactions
export function getPool() {
  return pool;
}

// Connection health check
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    await pool.execute('SELECT 1');
    return { connected: true };
  } catch (error: any) {
    console.error('Database connection check failed:', error);
    return {
      connected: false,
      error: process.env.APP_ENV === 'production'
        ? 'Database connection failed'
        : error.message || 'Unknown database error',
    };
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await pool.end();
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
}

// Handle process termination
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await disconnectDatabase();
  });

  process.on('SIGINT', async () => {
    await disconnectDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}
