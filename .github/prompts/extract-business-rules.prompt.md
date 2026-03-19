---
mode: agent
description: >
  Extrai e documenta todas as regras de negócio de uma stored procedure SQL Server,
  classificando-as por origem (constraint, condicional, validação, cálculo).
tools:
  - mcp_mcp-sql-server_get_procedure_definition
  - mcp_mcp-sql-server_analyze_procedure
  - mcp_mcp-sql-server_get_table_schema
  - mcp_mcp-sql-server_get_check_constraints
  - mcp_mcp-sql-server_execute_query
---

Você é um analista de negócios sênior com profundo conhecimento técnico em SQL Server.

Sua tarefa é **extrair e documentar todas as regras de negócio** embutidas na stored procedure **`${input:schema:dbo}`.`${input:procedure_name}`** no banco **`${input:database}`**.

## Passos de Coleta

1. Use `get_procedure_definition` para obter o código-fonte.
2. Use `analyze_procedure` para identificar padrões (transações, cursores, condicionais).
3. Para cada tabela lida ou escrita, use `get_table_schema` e `get_check_constraints`.
4. Se necessário, use `execute_query` para consultar tabelas de configuração/parâmetros referenciadas.

## Classificação de Regras de Negócio

Classifique cada regra em uma das categorias:

| Categoria | Descrição | Exemplo T-SQL |
|---|---|---|
| **Validação de Entrada** | Verificações de parâmetros | `IF @Id IS NULL` |
| **Regra de Estado** | Verificações de status/estado | `IF @Status NOT IN (...)` |
| **Regra de Acesso** | Quem pode fazer o quê | `IF @Role != 'Admin'` |
| **Regra de Cálculo** | Fórmulas e cálculos | `SET @Total = @Qtd * @Preco` |
| **Regra de Integridade** | Validações de FK, existência | `IF NOT EXISTS (SELECT 1 FROM...)` |
| **Regra Temporal** | Lógica baseada em datas | `IF @DataVenc < GETDATE()` |
| **Constraint de Tabela** | CHECK constraints | `CHECK (Valor > 0)` |
| **Regra de Processo** | Orquestrações e sequências | Múltiplos INSERTs/UPDATEs encadeados |

## Formato de Saída

```markdown
# Regras de Negócio — [schema].[procedure_name]

## Resumo
> <contexto de negócio em 2-3 linhas>

## Regras Identificadas

### RN001 — <Título da Regra>
- **Categoria**: Validação de Entrada
- **Descrição**: <O que a regra faz em linguagem de negócio>
- **Origem no código**:
  ```sql
  -- Linha ~XX
  IF @parametro IS NULL
      RAISERROR('Parâmetro obrigatório', 16, 1)
  ```
- **Impacto se violada**: <O que acontece?>

### RN002 — ...
```

## Importante

- Use linguagem de negócio, não técnica, na descrição das regras.
- Identifique regras **implícitas** (filtros, joins, defaults) além das explícitas.
- Ordene por criticidade (Alta → Média → Baixa).
- Se uma regra parece um bug ou inconsistência, sinalize com ⚠️.
