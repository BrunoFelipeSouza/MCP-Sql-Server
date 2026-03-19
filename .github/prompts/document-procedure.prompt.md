---
mode: agent
description: >
  Documenta uma stored procedure do SQL Server de forma completa:
  parâmetros, fluxo de execução, regras de negócio, tabelas acessadas,
  dependências, tratamento de erros e fluxograma Mermaid.
tools:
  - mcp_mcp-sql-server_get_procedure_definition
  - mcp_mcp-sql-server_analyze_procedure
  - mcp_mcp-sql-server_get_procedure_dependencies
  - mcp_mcp-sql-server_get_reverse_dependencies
  - mcp_mcp-sql-server_get_table_schema
  - mcp_mcp-sql-server_get_check_constraints
  - mcp_mcp-sql-server_get_extended_properties
---

Você é um especialista em SQL Server e documentação técnica.

Documente completamente a stored procedure **`${input:schema:dbo}`.`${input:procedure_name}`** no banco **`${input:database}`**.

## Passos obrigatórios (execute na ordem):

1. Use `get_procedure_definition` para obter o código-fonte e parâmetros.
2. Use `analyze_procedure` para obter métricas de complexidade.
3. Use `get_procedure_dependencies` para listar objetos referenciados.
4. Use `get_reverse_dependencies` para saber quem chama esta procedure.
5. Para cada tabela principal identificada, use `get_table_schema` e `get_check_constraints`.
6. Use `get_extended_properties` para recuperar documentação existente.

## Documento de Saída

Produza a documentação **em Markdown**, seguindo esta estrutura:

### `[${input:schema:dbo}].[${input:procedure_name}]`

#### Resumo Executivo
(2-3 linhas descrevendo o propósito de negócio)

#### Informações Gerais
Tabela com: Database, Schema, Tipo, Data de criação, Última modificação, LOC, SQL Dinâmico, Transações, TRY/CATCH.

#### Parâmetros
Tabela: `#`, `Nome`, `Tipo`, `Direção`, `Obrigatório`, `Padrão`, `Descrição`.

#### Fluxo de Execução
Diagrama **Mermaid flowchart TD** representando o fluxo principal (validações → lógica → tratamento de erros).

#### Regras de Negócio
Lista numerada (RN001, RN002…) com origem no código T-SQL citado.

#### Tabelas Acessadas
Tabela: `Tabela`, `Operação (R/W)`, `Filtro/Condição Principal`.

#### Tratamento de Erros
Tabela: `Erro/Mensagem`, `Causa`, `Comportamento`.

#### Dependências Diretas
Lista de objetos referenciados com tipo.

#### Dependências Reversas
Lista de objetos que chamam esta procedure.

#### ⚠️ Issues e Anti-Patterns
Problemas identificados com severidade (Alta/Média/Baixa) e recomendação.
Se nenhum problema encontrado, escreva "Nenhum issue crítico identificado."
