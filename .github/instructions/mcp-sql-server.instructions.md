---
applyTo: "src/**/*.ts"
---

# Instruções de Uso do MCP SQL Server

## Ferramentas Disponíveis e Quando Usá-las

### Informações do Servidor
- Use `get_server_info` no início de qualquer sessão para confirmar a conexão e versão do SQL Server.
- Use `list_databases` para descobrir bancos disponíveis quando o usuário não especificar.

### Exploração de Esquema
- Use `list_tables` com filtro de schema (`dbo`) quando o banco tem muitas tabelas.
- Use `get_table_schema` para entender a estrutura de uma tabela antes de criar queries.
- Combine `get_indexes` + `get_foreign_keys` para análise completa de uma tabela.

### Procedures e Funções
- Sempre use `get_procedure_definition` antes de `analyze_procedure` para ter o código disponível.
- Use `get_procedure_dependencies` para mapear impacto antes de propor mudanças.
- Use `get_reverse_dependencies` para entender quem será afetado por uma alteração.
- Use `search_in_procedures` para encontrar onde uma tabela ou coluna específica é usada.

### Análise de Regras de Negócio
- `get_check_constraints` — regras validadas no nível de tabela.
- `get_extended_properties` — documentação existente no banco (MS_Description).
- `analyze_procedure` — retorna métricas de complexidade e padrões T-SQL detectados.

## Limitações Importantes

- O servidor MCP aceita apenas queries `SELECT` no `execute_query`.
- Não modifique dados ou estrutura via MCP — apenas leitura.
- Para queries com parâmetros dinâmicos, sempre use `sp_executesql` parametrizado.

## Padrão de Resposta JSON

Todas as ferramentas retornam JSON. Ao apresentar resultados ao usuário:
- Use tabelas Markdown para conjuntos de dados tabulares.
- Use blocos de código com `sql` syntax highlight para código T-SQL.
- Use `mermaid` para fluxogramas e diagramas ER.
