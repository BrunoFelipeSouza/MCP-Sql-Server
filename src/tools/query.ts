import { getConnection, sql } from '../config.js';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

/** Escapes a SQL Server bracket-delimited identifier (e.g. database name). */
function sanitizeDbName(name: string): string {
  return name.replace(/]/g, ']]');
}

/**
 * Validates a user-supplied SQL Server identifier (database, schema, or object name).
 * Trims whitespace, rejects empty values, and enforces SQL Server's 128-char sysname limit.
 */
export function validateIdentifier(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`'${fieldName}' must not be empty.`);
  if (trimmed.length > 128) {
    throw new Error(`'${fieldName}' exceeds SQL Server's maximum identifier length of 128 characters.`);
  }
  return trimmed;
}

/** Strips SQL single-line/multi-line comments and string literals before keyword scanning. */
function stripStringsAndComments(query: string): string {
  return query
    .replace(/--[^\n]*/g, ' ')           // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // multi-line comments
    .replace(/'(?:[^']|'')*'/g, "''");   // string literals
}

/**
 * Validates that a user-supplied query is a plain read-only SELECT.
 * Throws if the query contains DML/DDL, multi-statement constructs, or
 * dangerous system keywords.
 */
export function assertReadOnlyQuery(query: string): void {
  const clean = stripStringsAndComments(query);

  if (!/^\s*SELECT\b/i.test(clean)) {
    throw new Error('Only SELECT statements are allowed.');
  }

  // Block multi-statement execution (semicolons not at the very end).
  const withoutTrailingSemicolon = clean.trimEnd().replace(/;\s*$/, '');
  if (/;/.test(withoutTrailingSemicolon)) {
    throw new Error('Multi-statement queries are not allowed.');
  }

  // Block dangerous DML / DDL / procedural / admin keywords.
  const blockedPattern =
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|DROP|CREATE|ALTER|EXEC(?:UTE)?|GRANT|REVOKE|DENY|SHUTDOWN|KILL|BULK|OPENROWSET|OPENDATASOURCE|OPENQUERY|WRITETEXT|UPDATETEXT|READTEXT|RECONFIGURE|RESTORE|BACKUP)\b|xp_\w+/i;
  if (blockedPattern.test(clean)) {
    throw new Error('Query contains disallowed keywords for security reasons.');
  }
}

/**
 * Executes a SQL SELECT query and returns structured results.
 * Validates that the query is strictly read-only (SELECT only, no DML/DDL, no
 * multi-statement) and wraps execution in a READ_COMMITTED transaction that is
 * always rolled back — ensuring no writes can ever be persisted.
 */
export async function executeQuery(
  query: string,
  database?: string
): Promise<QueryResult> {
  assertReadOnlyQuery(query);

  const pool = await getConnection();
  const start = Date.now();

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const request = new sql.Request(transaction);

    if (database) {
      await request.query(`USE [${sanitizeDbName(database)}]`);
    }

    const result = await request.query(query);
    const executionTimeMs = Date.now() - start;

    const rows = result.recordset ?? [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { columns, rows, rowCount: rows.length, executionTimeMs };
  } finally {
    try {
      await transaction.rollback();
    } catch {
      // Ignore: transaction may already be in an error state.
    }
  }
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
