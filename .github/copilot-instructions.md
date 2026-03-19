# MCP SQL Server — Instruções do Repositório

Este repositório contém o **MCP Server para SQL Server**, que expõe ferramentas de banco de dados via Model Context Protocol (MCP) para uso por agentes de IA e GitHub Copilot.

## Contexto do Projeto

- **Linguagem**: TypeScript (Node.js ≥ 18)
- **Protocolo**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Driver SQL**: `mssql` com suporte a SQL Server 2016+
- **Estrutura de código**:
  - `src/index.ts` – servidor MCP, registro de ferramentas e roteamento
  - `src/config.ts` – configuração e pool de conexão
  - `src/tools/query.ts` – execução de queries e informações do servidor
  - `src/tools/schema.ts` – metadados de tabelas, índices, FKs, views, triggers
  - `src/tools/procedures.ts` – SPs, funções, dependências
  - `src/tools/analysis.ts` – análise estática, constraints, extended properties, busca

## Convenções de Código

- Usar `async/await` em vez de callbacks ou `.then()`.
- Não executar comandos DML/DDL via MCP — apenas leitura (`SELECT`, sys-views).
- Toda query que aceita parâmetros deve sanitizar com `replace(/'/g, "''")` para evitar SQL injection.
- Manter cada ferramenta focada em uma responsabilidade.
- Retornar JSON estruturado como `text` content no response MCP.

## Agentes Disponíveis

- **`prompt-genius`**: Melhora e cria prompts para GitHub Copilot Agents.
- **`sql-server-reverse-engineer`**: Engenharia reversa completa de bancos SQL Server.
