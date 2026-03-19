import { getConnection, sql } from '../config.js';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

/**
 * Executes a raw SQL query and returns structured results.
 * Only SELECT statements are allowed to prevent accidental mutations.
 */
export async function executeQuery(
  query: string,
  database?: string
): Promise<QueryResult> {
  const pool = await getConnection();
  const start = Date.now();

  const request = pool.request();

  if (database) {
    await request.query(`USE [${database}]`);
  }

  const result = await request.query(query);
  const executionTimeMs = Date.now() - start;

  const rows = result.recordset ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs,
  };
}

/**
 * Lists all user databases on the connected SQL Server instance.
 */
export async function listDatabases(): Promise<string[]> {
  const result = await executeQuery(
    "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"
  );
  return result.rows.map((r) => r['name'] as string);
}

/**
 * Returns basic server information and version details.
 */
export async function getServerInfo(): Promise<Record<string, string>> {
  const result = await executeQuery(
    "SELECT @@VERSION AS version, @@SERVERNAME AS server_name, DB_NAME() AS current_db"
  );
  const row = result.rows[0] ?? {};
  return {
    version: String(row['version'] ?? ''),
    serverName: String(row['server_name'] ?? ''),
    currentDatabase: String(row['current_db'] ?? ''),
  };
}
