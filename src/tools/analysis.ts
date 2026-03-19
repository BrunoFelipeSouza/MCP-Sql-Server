import { executeQuery } from './query.js';

export interface BusinessRuleHint {
  type: 'CHECK_CONSTRAINT' | 'TRANSACTION' | 'ERROR_HANDLING' | 'CURSOR' | 'TEMP_TABLE' | 'DYNAMIC_SQL' | 'LINKED_SERVER' | 'RAISERROR' | 'THROW' | 'MERGE' | 'OUTPUT_CLAUSE';
  description: string;
  occurrences: number;
}

export interface ProcedureMetrics {
  linesOfCode: number;
  statementCount: number;
  complexityIndicators: BusinessRuleHint[];
  usedTables: string[];
  usedViews: string[];
  calledProcedures: string[];
  outputParameters: string[];
  tempTables: string[];
  cursors: string[];
  hasDynamicSql: boolean;
  hasLinkedServer: boolean;
  hasErrorHandling: boolean;
  hasTransactions: boolean;
  hasMerge: boolean;
}

export interface CheckConstraintInfo {
  schema: string;
  tableName: string;
  constraintName: string;
  definition: string;
  columnName: string | null;
  isDisabled: boolean;
}

export interface ExtendedPropertyInfo {
  objectType: string;
  schema: string;
  objectName: string;
  propertyName: string;
  propertyValue: string;
}

/**
 * Performs a static analysis of a stored procedure definition and extracts
 * metrics, patterns and complexity indicators useful for reverse engineering.
 */
export function analyzeProcedureDefinition(definition: string): ProcedureMetrics {
  const upper = definition.toUpperCase();
  const lines = definition.split('\n');

  const countOccurrences = (pattern: RegExp): number =>
    (definition.match(pattern) ?? []).length;

  const extractMatches = (pattern: RegExp): string[] =>
    [...definition.matchAll(pattern)].map((m) => m[1] ?? m[0]).filter(Boolean);

  const complexityIndicators: BusinessRuleHint[] = [];

  const addHint = (
    type: BusinessRuleHint['type'],
    description: string,
    count: number
  ) => {
    if (count > 0) complexityIndicators.push({ type, description, occurrences: count });
  };

  addHint('TRANSACTION', 'Uses explicit transactions (BEGIN TRAN / COMMIT / ROLLBACK)', countOccurrences(/BEGIN\s+TRAN/gi));
  addHint('ERROR_HANDLING', 'Uses TRY/CATCH error handling', countOccurrences(/BEGIN\s+TRY/gi));
  addHint('RAISERROR', 'Uses RAISERROR for custom error messages', countOccurrences(/RAISERROR\s*\(/gi));
  addHint('THROW', 'Uses THROW for re-raising errors', countOccurrences(/\bTHROW\b/gi));
  addHint('CURSOR', 'Uses CURSORs (potential performance concern)', countOccurrences(/DECLARE\s+\w+\s+CURSOR/gi));
  addHint('DYNAMIC_SQL', 'Uses dynamic SQL via EXEC or sp_executesql', countOccurrences(/EXEC\s*\(|sp_executesql/gi));
  addHint('LINKED_SERVER', 'References linked server (cross-server query)', countOccurrences(/\[\w+\]\.\[/g));
  addHint('MERGE', 'Uses MERGE statement (upsert pattern)', countOccurrences(/\bMERGE\b/gi));
  addHint('OUTPUT_CLAUSE', 'Uses OUTPUT clause (captures inserted/deleted rows)', countOccurrences(/\bOUTPUT\b/gi));
  addHint('TEMP_TABLE', 'Uses temporary tables (#temp or @table variable)', countOccurrences(/#\w+|DECLARE\s+@\w+\s+TABLE/gi));

  const usedTables = extractMatches(/(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?\b/gi)
    .filter((t) => !['WHERE', 'ON', 'AND', 'OR', 'SET', 'SELECT'].includes(t.toUpperCase()))
    .filter((v, i, a) => a.indexOf(v) === i);

  const tempTables = extractMatches(/(#\w+)/g).filter((v, i, a) => a.indexOf(v) === i);

  const cursors = extractMatches(/DECLARE\s+(\w+)\s+CURSOR/gi).filter(
    (v, i, a) => a.indexOf(v) === i
  );

  const calledProcedures = extractMatches(/EXEC(?:UTE)?\s+(?:\[?\w+\]?\.)?(?:\[?\w+\]?\.)?\[?(\w+)\]?\s/gi)
    .filter((v, i, a) => a.indexOf(v) === i);

  const outputParameters = extractMatches(/@(\w+)\s+\w+.*OUTPUT/gi)
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    linesOfCode: lines.length,
    statementCount: countOccurrences(/;/g),
    complexityIndicators,
    usedTables,
    usedViews: [],
    calledProcedures,
    outputParameters,
    tempTables,
    cursors,
    hasDynamicSql: upper.includes('SP_EXECUTESQL') || /EXEC\s*\(/.test(upper),
    hasLinkedServer: /\[\w+\]\.\[/.test(definition),
    hasErrorHandling: upper.includes('BEGIN TRY'),
    hasTransactions: upper.includes('BEGIN TRAN'),
    hasMerge: upper.includes(' MERGE '),
  };
}

/**
 * Returns all CHECK constraints in a database (optionally filtered by table).
 */
export async function getCheckConstraints(
  database: string,
  schema?: string,
  tableName?: string
): Promise<CheckConstraintInfo[]> {
  const schemaFilter = schema ? `AND SCHEMA_NAME(t.schema_id) = '${schema.replace(/'/g, "''")}'` : '';
  const tableFilter = tableName ? `AND t.name = '${tableName.replace(/'/g, "''")}'` : '';

  const query = `
    SELECT
        SCHEMA_NAME(t.schema_id)    AS [schema],
        t.name                      AS tableName,
        cc.name                     AS constraintName,
        cc.definition               AS definition,
        c.name                      AS columnName,
        cc.is_disabled              AS isDisabled
    FROM sys.check_constraints cc
    INNER JOIN sys.objects t ON t.object_id = cc.parent_object_id
    LEFT JOIN sys.columns c
        ON c.object_id = cc.parent_object_id
        AND c.column_id = cc.parent_column_id
    WHERE cc.is_ms_shipped = 0
      ${schemaFilter}
      ${tableFilter}
    ORDER BY t.name, cc.name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    tableName: String(r['tableName'] ?? ''),
    constraintName: String(r['constraintName'] ?? ''),
    definition: String(r['definition'] ?? ''),
    columnName: r['columnName'] != null ? String(r['columnName']) : null,
    isDisabled: r['isDisabled'] === true || r['isDisabled'] === 1,
  }));
}

/**
 * Returns extended properties (MS_Description and others) for database objects.
 */
export async function getExtendedProperties(
  database: string,
  schema?: string,
  objectName?: string
): Promise<ExtendedPropertyInfo[]> {
  const schemaFilter = schema ? `AND SCHEMA_NAME(o.schema_id) = '${schema.replace(/'/g, "''")}'` : '';
  const objectFilter = objectName ? `AND o.name = '${objectName.replace(/'/g, "''")}'` : '';

  const query = `
    SELECT
        o.type_desc         AS objectType,
        SCHEMA_NAME(o.schema_id) AS [schema],
        o.name              AS objectName,
        ep.name             AS propertyName,
        CAST(ep.value AS NVARCHAR(MAX)) AS propertyValue
    FROM sys.extended_properties ep
    INNER JOIN sys.objects o ON o.object_id = ep.major_id
    WHERE ep.class = 1
      AND ep.minor_id = 0
      ${schemaFilter}
      ${objectFilter}
    ORDER BY o.name, ep.name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    objectType: String(r['objectType'] ?? ''),
    schema: String(r['schema'] ?? ''),
    objectName: String(r['objectName'] ?? ''),
    propertyName: String(r['propertyName'] ?? ''),
    propertyValue: String(r['propertyValue'] ?? ''),
  }));
}

/**
 * Searches for patterns (table names, keywords, column names) across all stored
 * procedure definitions in the database – useful for impact analysis.
 */
export async function searchInProcedures(
  database: string,
  searchTerm: string
): Promise<{ schema: string; objectName: string; objectType: string; matchCount: number }[]> {
  if (!searchTerm || searchTerm.trim().length === 0) {
    throw new Error('Search term cannot be empty.');
  }
  if (searchTerm.length > 200) {
    throw new Error('Search term exceeds maximum length of 200 characters.');
  }

  // Escape single quotes for SQL string literals.
  const escaped = searchTerm.replace(/'/g, "''");
  // Escape LIKE wildcard characters (%, _, [) so the term is a literal pattern.
  const likeEscaped = escaped
    .replace(/!/g, '!!')
    .replace(/%/g, '!%')
    .replace(/_/g, '!_')
    .replace(/\[/g, '![');

  const query = `
    SELECT
        SCHEMA_NAME(o.schema_id)    AS [schema],
        o.name                      AS objectName,
        o.type_desc                 AS objectType,
        (
            LEN(sm.definition) - LEN(REPLACE(UPPER(sm.definition), UPPER('${escaped}'), ''))
        ) / NULLIF(LEN('${escaped}'), 0) AS matchCount
    FROM sys.sql_modules sm
    INNER JOIN sys.objects o ON o.object_id = sm.object_id
    WHERE sm.definition LIKE '%${likeEscaped}%' ESCAPE '!'
      AND o.is_ms_shipped = 0
    ORDER BY matchCount DESC, o.name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    objectName: String(r['objectName'] ?? ''),
    objectType: String(r['objectType'] ?? ''),
    matchCount: Number(r['matchCount'] ?? 0),
  }));
}
