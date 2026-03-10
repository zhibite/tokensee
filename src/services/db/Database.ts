import pg from 'pg';
import { env } from '../../config/index.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = getPool();
  return client.query<T>(text, values);
}

export async function queryOne<T extends pg.QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

// Namespaced db object for convenience
export const db = { query, queryOne };
