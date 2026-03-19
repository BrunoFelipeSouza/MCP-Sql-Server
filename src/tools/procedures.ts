import { executeQuery } from './query.js';

export interface ProcedureInfo {
  schema: string;
  procedureName: string;
  objectType: 'P' | 'FN' | 'IF' | 'TF' | 'TR';
  objectTypeDesc: string;
  createDate: string;
  modifyDate: string;
}

export interface ProcedureParameter {
  name: string;
  dataType: string;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
  isOutput: boolean;
  hasDefaultValue: boolean;
  defaultValue: string | null;
  parameterOrder: number;
}

export interface ProcedureDefinition {
  schema: string;
  objectName: string;
  objectType: string;
  definition: string;
  parameters: ProcedureParameter[];
  createDate: string;
  modifyDate: string;
  isEncrypted: boolean;
}

export interface ProcedureDependency {
  referencedSchema: string | null;
  referencedObject: string;
  referencedType: string;
  referenceClass: string;
}

/**
 * Lists all stored procedures (and optionally functions) in a database.
 */
export async function listProcedures(
  database: string,
  schema?: string,
  includeSystemObjects = false
): Promise<ProcedureInfo[]> {
  const schemaFilter = schema ? `AND SCHEMA_NAME(o.schema_id) = '${schema.replace(/'/g, "''")}'` : '';
  const systemFilter = includeSystemObjects ? '' : 'AND o.is_ms_shipped = 0';

  const query = `
    SELECT
        SCHEMA_NAME(o.schema_id)  AS [schema],
        o.name                    AS procedureName,
        o.type                    AS objectType,
        o.type_desc               AS objectTypeDesc,
        o.create_date             AS createDate,
        o.modify_date             AS modifyDate
    FROM sys.objects o
    WHERE o.type IN ('P', 'FN', 'IF', 'TF')
      ${systemFilter}
      ${schemaFilter}
    ORDER BY SCHEMA_NAME(o.schema_id), o.name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    schema: String(r['schema'] ?? ''),
    procedureName: String(r['procedureName'] ?? ''),
    objectType: String(r['objectType']).trim() as ProcedureInfo['objectType'],
    objectTypeDesc: String(r['objectTypeDesc'] ?? ''),
    createDate: String(r['createDate'] ?? ''),
    modifyDate: String(r['modifyDate'] ?? ''),
  }));
}

/**
 * Returns the full definition and parameters of a stored procedure or function.
 */
export async function getProcedureDefinition(
  database: string,
  schema: string,
  procedureName: string
): Promise<ProcedureDefinition> {
  const objectId = `'${schema.replace(/'/g, "''")}.${procedureName.replace(/'/g, "''")}'`;

  const definitionQuery = `
    SELECT
        SCHEMA_NAME(o.schema_id)  AS [schema],
        o.name                    AS objectName,
        o.type_desc               AS objectType,
        sm.definition             AS definition,
        CAST(0 AS BIT)            AS isEncrypted,
        o.create_date             AS createDate,
        o.modify_date             AS modifyDate
    FROM sys.objects o
    INNER JOIN sys.sql_modules sm ON sm.object_id = o.object_id
    WHERE o.object_id = OBJECT_ID(${objectId});
  `;

  const paramsQuery = `
    SELECT
        p.name                      AS name,
        tp.name                     AS dataType,
        p.max_length                AS maxLength,
        p.precision                 AS precision,
        p.scale                     AS scale,
        p.is_output                 AS isOutput,
        p.has_default_value         AS hasDefaultValue,
        CAST(p.default_value AS NVARCHAR(MAX)) AS defaultValue,
        p.parameter_id              AS parameterOrder
    FROM sys.parameters p
    INNER JOIN sys.types tp ON tp.user_type_id = p.user_type_id
    WHERE p.object_id = OBJECT_ID(${objectId})
    ORDER BY p.parameter_id;
  `;

  const [defResult, paramsResult] = await Promise.all([
    executeQuery(definitionQuery, database),
    executeQuery(paramsQuery, database),
  ]);

  const def = defResult.rows[0];
  if (!def) {
    throw new Error(`Object '${schema}.${procedureName}' not found in database '${database}'.`);
  }

  const parameters: ProcedureParameter[] = paramsResult.rows.map((r) => ({
    name: String(r['name'] ?? ''),
    dataType: String(r['dataType'] ?? ''),
    maxLength: r['maxLength'] != null ? Number(r['maxLength']) : null,
    precision: r['precision'] != null ? Number(r['precision']) : null,
    scale: r['scale'] != null ? Number(r['scale']) : null,
    isOutput: r['isOutput'] === true || r['isOutput'] === 1,
    hasDefaultValue: r['hasDefaultValue'] === true || r['hasDefaultValue'] === 1,
    defaultValue: r['defaultValue'] != null ? String(r['defaultValue']) : null,
    parameterOrder: Number(r['parameterOrder'] ?? 0),
  }));

  return {
    schema: String(def['schema'] ?? ''),
    objectName: String(def['objectName'] ?? ''),
    objectType: String(def['objectType'] ?? ''),
    definition: String(def['definition'] ?? ''),
    parameters,
    createDate: String(def['createDate'] ?? ''),
    modifyDate: String(def['modifyDate'] ?? ''),
    isEncrypted: def['isEncrypted'] === true || def['isEncrypted'] === 1,
  };
}

/**
 * Returns all objects that a procedure/function depends on (tables, views, other procs…).
 */
export async function getProcedureDependencies(
  database: string,
  schema: string,
  procedureName: string
): Promise<ProcedureDependency[]> {
  const query = `
    SELECT DISTINCT
        COALESCE(re.referenced_schema_name, '')  AS referencedSchema,
        re.referenced_entity_name                AS referencedObject,
        ISNULL(o.type_desc, 'UNKNOWN')           AS referencedType,
        re.referenced_class_desc                 AS referenceClass
    FROM sys.sql_expression_dependencies re
    LEFT JOIN sys.objects o
        ON o.object_id = re.referenced_id
    WHERE re.referencing_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${procedureName.replace(/'/g, "''")}')
    ORDER BY re.referenced_class_desc, re.referenced_entity_name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    referencedSchema: r['referencedSchema'] ? String(r['referencedSchema']) : null,
    referencedObject: String(r['referencedObject'] ?? ''),
    referencedType: String(r['referencedType'] ?? ''),
    referenceClass: String(r['referenceClass'] ?? ''),
  }));
}

/**
 * Returns a list of procedures/objects that depend ON a given object
 * (i.e., reverse dependency – who calls this?).
 */
export async function getReverseDependencies(
  database: string,
  schema: string,
  objectName: string
): Promise<{ callerSchema: string; callerName: string; callerType: string }[]> {
  const query = `
    SELECT DISTINCT
        SCHEMA_NAME(o.schema_id)    AS callerSchema,
        o.name                      AS callerName,
        o.type_desc                 AS callerType
    FROM sys.sql_expression_dependencies re
    INNER JOIN sys.objects o ON o.object_id = re.referencing_id
    WHERE re.referenced_id = OBJECT_ID('${schema.replace(/'/g, "''")}.${objectName.replace(/'/g, "''")}')
    ORDER BY o.name;
  `;

  const result = await executeQuery(query, database);
  return result.rows.map((r) => ({
    callerSchema: String(r['callerSchema'] ?? ''),
    callerName: String(r['callerName'] ?? ''),
    callerType: String(r['callerType'] ?? ''),
  }));
}
