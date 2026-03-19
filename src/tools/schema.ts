import { getConnection } from '../config.js';
import { executeQuery } from './query.js';

export interface TableColumn {
  columnName: string;
  dataType: string;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isIdentity: boolean;
  isComputed: boolean;
  computedDefinition: string | null;
  description: string | null;
}

export interface TableInfo {
  schema: string;
  tableName: string;
  tableType: string;
  rowCount: number | null;
  sizeKB: number | null;
  createDate: string;
  modifyDate: string;
}

export interface IndexInfo {
  indexName: string;
  indexType: string;
  isUnique: boolean;
  isPrimaryKey: boolean;
  columns: string[];
  includedColumns: string[];
  filterDefinition: string | null;
}

export interface ForeignKeyInfo {
  constraintName: string;
  columnName: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
  deleteAction: string;
  updateAction: string;
}

/**
 * Lists all tables in a given database and schema.
 */
export async function listTables(
  database: string,
  schema?: string
): Promise<TableInfo[]> {
  const schemaFilter = schema ? `AND t.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'` : '';

  const query = `
    USE [${database}];
    SELECT
        t.TABLE_SCHEMA       AS [schema],
        t.TABLE_NAME         AS tableName,
        t.TABLE_TYPE         AS tableType,
        o.create_date        AS createDate,
        o.modify_date        AS modifyDate
    FROM INFORMATION_SCHEMA.TABLES t
    INNER JOIN sys.objects o
        ON o.name = t.TABLE_NAME
        AND o.schema_id = SCHEMA_ID(t.TABLE_SCHEMA)
    WHERE 1=1 ${schemaFilter}
    ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;
  `;

  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    tableName: String(r['tableName'] ?? ''),
    tableType: String(r['tableType'] ?? ''),
    rowCount: null,
    sizeKB: null,
    createDate: String(r['createDate'] ?? ''),
    modifyDate: String(r['modifyDate'] ?? ''),
  }));
}

/**
 * Returns detailed column information for a specific table.
 */
export async function getTableSchema(
  database: string,
  schema: string,
  tableName: string
): Promise<TableColumn[]> {
  const query = `
    USE [${database}];
    SELECT
        c.COLUMN_NAME                               AS columnName,
        c.DATA_TYPE                                 AS dataType,
        c.CHARACTER_MAXIMUM_LENGTH                  AS maxLength,
        c.NUMERIC_PRECISION                         AS precision,
        c.NUMERIC_SCALE                             AS scale,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS isNullable,
        c.COLUMN_DEFAULT                            AS defaultValue,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
        CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isForeignKey,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity')  AS isIdentity,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsComputed')  AS isComputed,
        cc.definition                               AS computedDefinition,
        ep.value                                    AS description
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
            AND tc.TABLE_NAME = ku.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND tc.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
            AND tc.TABLE_NAME  = '${tableName.replace(/'/g, "''")}'
    ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
    LEFT JOIN (
        SELECT DISTINCT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
            AND tc.TABLE_NAME = ku.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND tc.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
            AND tc.TABLE_NAME  = '${tableName.replace(/'/g, "''")}'
    ) fk ON fk.COLUMN_NAME = c.COLUMN_NAME
    LEFT JOIN sys.computed_columns cc
        ON cc.object_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${tableName.replace(/'/g, "''")}')
        AND cc.name = c.COLUMN_NAME
    LEFT JOIN sys.extended_properties ep
        ON ep.major_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${tableName.replace(/'/g, "''")}')
        AND ep.minor_id = COLUMNPROPERTY(OBJECT_ID('${schema.replace(/'/g, "''")}.${tableName.replace(/'/g, "''")}'), c.COLUMN_NAME, 'ColumnId')
        AND ep.name = 'MS_Description'
        AND ep.class = 1
    WHERE c.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
      AND c.TABLE_NAME   = '${tableName.replace(/'/g, "''")}'
    ORDER BY c.ORDINAL_POSITION;
  `;

  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    columnName: String(r['columnName'] ?? ''),
    dataType: String(r['dataType'] ?? ''),
    maxLength: r['maxLength'] != null ? Number(r['maxLength']) : null,
    precision: r['precision'] != null ? Number(r['precision']) : null,
    scale: r['scale'] != null ? Number(r['scale']) : null,
    isNullable: r['isNullable'] === 1 || r['isNullable'] === true,
    defaultValue: r['defaultValue'] != null ? String(r['defaultValue']) : null,
    isPrimaryKey: r['isPrimaryKey'] === 1 || r['isPrimaryKey'] === true,
    isForeignKey: r['isForeignKey'] === 1 || r['isForeignKey'] === true,
    isIdentity: r['isIdentity'] === 1 || r['isIdentity'] === true,
    isComputed: r['isComputed'] === 1 || r['isComputed'] === true,
    computedDefinition: r['computedDefinition'] != null ? String(r['computedDefinition']) : null,
    description: r['description'] != null ? String(r['description']) : null,
  }));
}

/**
 * Returns all indexes for a specific table.
 */
export async function getIndexes(
  database: string,
  schema: string,
  tableName: string
): Promise<IndexInfo[]> {
  const query = `
    USE [${database}];
    SELECT
        i.name                          AS indexName,
        i.type_desc                     AS indexType,
        i.is_unique                     AS isUnique,
        i.is_primary_key                AS isPrimaryKey,
        STRING_AGG(
            CASE WHEN ic.is_included_column = 0 THEN c.name END,
            ', '
        ) WITHIN GROUP (ORDER BY ic.key_ordinal) AS indexColumns,
        STRING_AGG(
            CASE WHEN ic.is_included_column = 1 THEN c.name END,
            ', '
        )                               AS includedColumns,
        i.filter_definition             AS filterDefinition
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${tableName.replace(/'/g, "''")}')
      AND i.name IS NOT NULL
    GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key, i.filter_definition
    ORDER BY i.is_primary_key DESC, i.name;
  `;

  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    indexName: String(r['indexName'] ?? ''),
    indexType: String(r['indexType'] ?? ''),
    isUnique: r['isUnique'] === true || r['isUnique'] === 1,
    isPrimaryKey: r['isPrimaryKey'] === true || r['isPrimaryKey'] === 1,
    columns: String(r['indexColumns'] ?? '').split(', ').filter(Boolean),
    includedColumns: String(r['includedColumns'] ?? '').split(', ').filter(Boolean),
    filterDefinition: r['filterDefinition'] != null ? String(r['filterDefinition']) : null,
  }));
}

/**
 * Returns all foreign keys for a specific table.
 */
export async function getForeignKeys(
  database: string,
  schema: string,
  tableName: string
): Promise<ForeignKeyInfo[]> {
  const query = `
    USE [${database}];
    SELECT
        fk.name                             AS constraintName,
        c.name                              AS columnName,
        SCHEMA_NAME(rt.schema_id)           AS referencedSchema,
        rt.name                             AS referencedTable,
        rc.name                             AS referencedColumn,
        fk.delete_referential_action_desc   AS deleteAction,
        fk.update_referential_action_desc   AS updateAction
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc
        ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id
        AND c.column_id = fkc.parent_column_id
    INNER JOIN sys.tables rt
        ON rt.object_id = fkc.referenced_object_id
    INNER JOIN sys.columns rc
        ON rc.object_id = fkc.referenced_object_id
        AND rc.column_id = fkc.referenced_column_id
    WHERE fk.parent_object_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${tableName.replace(/'/g, "''")}')
    ORDER BY fk.name, fkc.constraint_column_id;
  `;

  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    constraintName: String(r['constraintName'] ?? ''),
    columnName: String(r['columnName'] ?? ''),
    referencedSchema: String(r['referencedSchema'] ?? ''),
    referencedTable: String(r['referencedTable'] ?? ''),
    referencedColumn: String(r['referencedColumn'] ?? ''),
    deleteAction: String(r['deleteAction'] ?? ''),
    updateAction: String(r['updateAction'] ?? ''),
  }));
}

/**
 * Lists all views in a given database and schema.
 */
export async function listViews(
  database: string,
  schema?: string
): Promise<{ schema: string; viewName: string; definition: string }[]> {
  const schemaFilter = schema ? `AND SCHEMA_NAME(v.schema_id) = '${schema.replace(/'/g, "''")}'` : '';
  const query = `
    USE [${database}];
    SELECT
        SCHEMA_NAME(v.schema_id) AS [schema],
        v.name                   AS viewName,
        sm.definition            AS definition
    FROM sys.views v
    INNER JOIN sys.sql_modules sm ON sm.object_id = v.object_id
    WHERE 1=1 ${schemaFilter}
    ORDER BY SCHEMA_NAME(v.schema_id), v.name;
  `;
  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    viewName: String(r['viewName'] ?? ''),
    definition: String(r['definition'] ?? ''),
  }));
}

/**
 * Lists all triggers in a given database for a specific table (or all tables).
 */
export async function listTriggers(
  database: string,
  schema?: string,
  tableName?: string
): Promise<{ schema: string; tableName: string; triggerName: string; event: string; definition: string }[]> {
  const schemaFilter = schema ? `AND SCHEMA_NAME(t.schema_id) = '${schema.replace(/'/g, "''")}'` : '';
  const tableFilter = tableName ? `AND t.name = '${tableName.replace(/'/g, "''")}'` : '';

  const query = `
    USE [${database}];
    SELECT
        SCHEMA_NAME(t.schema_id) AS [schema],
        t.name                   AS tableName,
        tr.name                  AS triggerName,
        te.type_desc             AS event,
        sm.definition            AS definition
    FROM sys.triggers tr
    INNER JOIN sys.objects t  ON t.object_id = tr.parent_id
    INNER JOIN sys.trigger_events te ON te.object_id = tr.object_id
    INNER JOIN sys.sql_modules sm ON sm.object_id = tr.object_id
    WHERE tr.is_ms_shipped = 0
      ${schemaFilter}
      ${tableFilter}
    ORDER BY t.name, tr.name;
  `;

  const result = await executeQuery(query);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    tableName: String(r['tableName'] ?? ''),
    triggerName: String(r['triggerName'] ?? ''),
    event: String(r['event'] ?? ''),
    definition: String(r['definition'] ?? ''),
  }));
}
