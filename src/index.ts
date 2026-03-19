import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { closeConnection } from './config.js';
import { executeQuery, assertReadOnlyQuery, validateIdentifier, listDatabases, getServerInfo } from './tools/query.js';
import {
  listTables,
  getTableSchema,
  getIndexes,
  getForeignKeys,
  listViews,
  listTriggers,
} from './tools/schema.js';
import {
  listProcedures,
  getProcedureDefinition,
  getProcedureDependencies,
  getReverseDependencies,
} from './tools/procedures.js';
import {
  analyzeProcedureDefinition,
  getCheckConstraints,
  getExtendedProperties,
  searchInProcedures,
} from './tools/analysis.js';

// ──────────────────────────────────────────────────────────────────────────────
// Tool schemas (Zod → JSON Schema for MCP)
// ──────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'execute_query',
    description:
      'Executes a read-only SQL query against the connected SQL Server and returns the result set. ' +
      'Use only SELECT statements – DML/DDL will be rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The SQL SELECT query to execute.' },
        database: {
          type: 'string',
          description: 'Optional target database. Uses connection default if omitted.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_databases',
    description: 'Lists all user databases on the connected SQL Server instance.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_server_info',
    description: 'Returns SQL Server version, server name, and current database.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tables',
    description: 'Lists all tables (and views) in a database, with optional schema filter.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Target database name.' },
        schema: {
          type: 'string',
          description: 'Optional schema filter (e.g. "dbo").',
        },
      },
      required: ['database'],
    },
  },
  {
    name: 'get_table_schema',
    description:
      'Returns detailed column metadata for a table: data types, nullability, PKs, FKs, ' +
      'identity, computed columns, and MS_Description extended properties.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string', description: 'Table schema (e.g. "dbo").' },
        table_name: { type: 'string', description: 'Table name.' },
      },
      required: ['database', 'schema', 'table_name'],
    },
  },
  {
    name: 'get_indexes',
    description: 'Returns all indexes for a specific table, including columns and filter definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        table_name: { type: 'string' },
      },
      required: ['database', 'schema', 'table_name'],
    },
  },
  {
    name: 'get_foreign_keys',
    description: 'Returns all foreign key constraints for a table with referenced tables and cascade actions.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        table_name: { type: 'string' },
      },
      required: ['database', 'schema', 'table_name'],
    },
  },
  {
    name: 'list_views',
    description: 'Lists all views in a database with their definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string', description: 'Optional schema filter.' },
      },
      required: ['database'],
    },
  },
  {
    name: 'list_triggers',
    description: 'Lists all triggers in a database, optionally filtered by schema and/or table.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        table_name: { type: 'string' },
      },
      required: ['database'],
    },
  },
  {
    name: 'list_procedures',
    description:
      'Lists all stored procedures and functions in a database. ' +
      'Returns name, schema, type (P/FN/IF/TF), and dates.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string', description: 'Optional schema filter.' },
        include_system_objects: {
          type: 'boolean',
          description: 'Include system-shipped objects. Default: false.',
        },
      },
      required: ['database'],
    },
  },
  {
    name: 'get_procedure_definition',
    description:
      'Returns the full T-SQL source code and parameter list of a stored procedure or function.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        procedure_name: { type: 'string' },
      },
      required: ['database', 'schema', 'procedure_name'],
    },
  },
  {
    name: 'get_procedure_dependencies',
    description:
      'Returns all objects that a procedure/function references (tables, views, other procs). ' +
      'Essential for impact analysis and reverse engineering.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        procedure_name: { type: 'string' },
      },
      required: ['database', 'schema', 'procedure_name'],
    },
  },
  {
    name: 'get_reverse_dependencies',
    description:
      'Returns all procedures/functions that reference a given object ' +
      '(reverse dependency – "who calls this?").',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        object_name: { type: 'string' },
      },
      required: ['database', 'schema', 'object_name'],
    },
  },
  {
    name: 'analyze_procedure',
    description:
      'Performs static analysis on a stored procedure: counts lines, detects transactions, ' +
      'error handling, cursors, dynamic SQL, temp tables, MERGE patterns, and extracts ' +
      'referenced tables and called procedures. Returns structured complexity metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        procedure_name: { type: 'string' },
      },
      required: ['database', 'schema', 'procedure_name'],
    },
  },
  {
    name: 'get_check_constraints',
    description: 'Returns all CHECK constraints in a database with their definitions (business rules encoded as constraints).',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        table_name: { type: 'string' },
      },
      required: ['database'],
    },
  },
  {
    name: 'get_extended_properties',
    description:
      'Returns extended properties (MS_Description and custom) for database objects. ' +
      'These often contain developer documentation and business rules.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
        object_name: { type: 'string' },
      },
      required: ['database'],
    },
  },
  {
    name: 'search_in_procedures',
    description:
      'Searches for a keyword, table name, or column name across all procedure/function definitions ' +
      'in a database. Returns matching objects sorted by match count.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        search_term: { type: 'string', description: 'Text to search for inside procedure bodies.' },
      },
      required: ['database', 'search_term'],
    },
  },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Parameter validation helpers (throw McpError InvalidParams on bad input)
// ──────────────────────────────────────────────────────────────────────────────

function requireParam(val: unknown, fieldName: string): string {
  try {
    return validateIdentifier(String(val ?? ''), fieldName);
  } catch (e) {
    throw new McpError(ErrorCode.InvalidParams, e instanceof Error ? e.message : String(e));
  }
}

function optionalParam(val: unknown, fieldName: string): string | undefined {
  if (val == null || String(val).trim() === '') return undefined;
  return requireParam(val, fieldName);
}

// ──────────────────────────────────────────────────────────────────────────────
// Server bootstrap
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new Server(
    { name: 'mcp-sql-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // ── List tools ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // ── Call tool ───────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'execute_query': {
          const query = String(a['query'] ?? '').trim();
          if (!query) throw new McpError(ErrorCode.InvalidParams, "'query' must not be empty.");
          try {
            assertReadOnlyQuery(query);
          } catch (e) {
            throw new McpError(ErrorCode.InvalidParams, e instanceof Error ? e.message : String(e));
          }
          const database = optionalParam(a['database'], 'database');
          const result = await executeQuery(query, database);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'list_databases': {
          const dbs = await listDatabases();
          return { content: [{ type: 'text', text: JSON.stringify(dbs, null, 2) }] };
        }

        case 'get_server_info': {
          const info = await getServerInfo();
          return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
        }

        case 'list_tables': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const tables = await listTables(database, schema);
          return { content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }] };
        }

        case 'get_table_schema': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const tableName = requireParam(a['table_name'], 'table_name');
          const columns = await getTableSchema(database, schema, tableName);
          return { content: [{ type: 'text', text: JSON.stringify(columns, null, 2) }] };
        }

        case 'get_indexes': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const tableName = requireParam(a['table_name'], 'table_name');
          const indexes = await getIndexes(database, schema, tableName);
          return { content: [{ type: 'text', text: JSON.stringify(indexes, null, 2) }] };
        }

        case 'get_foreign_keys': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const tableName = requireParam(a['table_name'], 'table_name');
          const fks = await getForeignKeys(database, schema, tableName);
          return { content: [{ type: 'text', text: JSON.stringify(fks, null, 2) }] };
        }

        case 'list_views': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const views = await listViews(database, schema);
          return { content: [{ type: 'text', text: JSON.stringify(views, null, 2) }] };
        }

        case 'list_triggers': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const tableName = optionalParam(a['table_name'], 'table_name');
          const triggers = await listTriggers(database, schema, tableName);
          return { content: [{ type: 'text', text: JSON.stringify(triggers, null, 2) }] };
        }

        case 'list_procedures': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const procs = await listProcedures(database, schema, a['include_system_objects'] === true);
          return { content: [{ type: 'text', text: JSON.stringify(procs, null, 2) }] };
        }

        case 'get_procedure_definition': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const procedureName = requireParam(a['procedure_name'], 'procedure_name');
          const def = await getProcedureDefinition(database, schema, procedureName);
          return { content: [{ type: 'text', text: JSON.stringify(def, null, 2) }] };
        }

        case 'get_procedure_dependencies': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const procedureName = requireParam(a['procedure_name'], 'procedure_name');
          const deps = await getProcedureDependencies(database, schema, procedureName);
          return { content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }] };
        }

        case 'get_reverse_dependencies': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const objectName = requireParam(a['object_name'], 'object_name');
          const revDeps = await getReverseDependencies(database, schema, objectName);
          return { content: [{ type: 'text', text: JSON.stringify(revDeps, null, 2) }] };
        }

        case 'analyze_procedure': {
          const database = requireParam(a['database'], 'database');
          const schema = requireParam(a['schema'], 'schema');
          const procedureName = requireParam(a['procedure_name'], 'procedure_name');
          const def = await getProcedureDefinition(database, schema, procedureName);
          const metrics = analyzeProcedureDefinition(def.definition);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ procedureInfo: def, metrics }, null, 2),
              },
            ],
          };
        }

        case 'get_check_constraints': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const tableName = optionalParam(a['table_name'], 'table_name');
          const constraints = await getCheckConstraints(database, schema, tableName);
          return { content: [{ type: 'text', text: JSON.stringify(constraints, null, 2) }] };
        }

        case 'get_extended_properties': {
          const database = requireParam(a['database'], 'database');
          const schema = optionalParam(a['schema'], 'schema');
          const objectName = optionalParam(a['object_name'], 'object_name');
          const props = await getExtendedProperties(database, schema, objectName);
          return { content: [{ type: 'text', text: JSON.stringify(props, null, 2) }] };
        }

        case 'search_in_procedures': {
          const database = requireParam(a['database'], 'database');
          const searchTerm = String(a['search_term'] ?? '').trim();
          if (!searchTerm) throw new McpError(ErrorCode.InvalidParams, "'search_term' must not be empty.");
          if (searchTerm.length > 200) throw new McpError(ErrorCode.InvalidParams, "'search_term' exceeds maximum length of 200 characters.");
          const matches = await searchInProcedures(database, searchTerm);
          return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (err) {
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Tool '${name}' failed: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', async () => {
    await closeConnection();
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
