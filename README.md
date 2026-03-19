# MCP SQL Server

> **Model Context Protocol (MCP) server** dedicado ao SQL Server.  
> Expõe ferramentas de metadados, análise de procedures, extração de regras de negócio e documentação automática para agentes de IA (GitHub Copilot, Claude, etc.).

---

## Visão Geral

O **MCP SQL Server** conecta qualquer cliente MCP (como o GitHub Copilot Coding Agent) diretamente a uma instância do SQL Server, permitindo que agentes de IA:

- Listem databases, tabelas, views, procedures, funções e triggers.
- Inspecionem esquemas (colunas, tipos, PKs, FKs, índices, constraints).
- Leiam o código-fonte de qualquer objeto programático (SP, UDF, trigger).
- Analisem dependências diretas e reversas entre objetos.
- Realizem análise estática de procedures (transações, cursores, SQL dinâmico, padrões MERGE…).
- Pesquisem por termos em todo o código de procedures de um banco.
- Executem consultas SELECT arbitrárias (somente leitura).

---

## Ferramentas Disponíveis

| Ferramenta | Descrição |
|---|---|
| `execute_query` | Executa uma query SELECT e retorna o resultado |
| `list_databases` | Lista todos os databases de usuário |
| `get_server_info` | Versão, nome do servidor e banco atual |
| `list_tables` | Lista tabelas com filtro de schema |
| `get_table_schema` | Metadados de colunas (tipo, PK, FK, identity, computed, MS_Description) |
| `get_indexes` | Índices de uma tabela |
| `get_foreign_keys` | Chaves estrangeiras e ações de cascade |
| `list_views` | Lista views com definição |
| `list_triggers` | Lista triggers com definição e evento |
| `list_procedures` | Lista SPs e funções |
| `get_procedure_definition` | Código-fonte completo e parâmetros |
| `get_procedure_dependencies` | Objetos que a procedure referencia |
| `get_reverse_dependencies` | Quem chama este objeto? |
| `analyze_procedure` | Análise estática: transações, cursores, SQL dinâmico, MERGE… |
| `get_check_constraints` | CHECK constraints (regras de negócio em constraints) |
| `get_extended_properties` | MS_Description e propriedades customizadas |
| `search_in_procedures` | Busca por termo em todos os corpos de procedures |

---

## Instalação

### Pré-requisitos

- Node.js ≥ 18
- Acesso a uma instância SQL Server (Express, Developer, Standard ou Enterprise)

### 1. Clone o repositório

```bash
git clone https://github.com/BrunoFelipeSouza/MCP-Sql-Server.git
cd MCP-Sql-Server
```

### 2. Instale dependências

```bash
npm install
```

### 3. Configure a conexão

```bash
cp .env.example .env
# Edite o arquivo .env com os dados da sua instância SQL Server
```

### 4. Build

```bash
npm run build
```

### 5. Execute

```bash
npm start
```

---

## Configuração como servidor MCP no VS Code / GitHub Copilot

Adicione ao seu arquivo de configuração MCP (`.vscode/mcp.json` ou `~/.config/github-copilot/mcp.json`):

```json
{
  "servers": {
    "sql-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/caminho/para/MCP-Sql-Server/dist/index.js"],
      "env": {
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "meu_banco",
        "SQL_USER": "sa",
        "SQL_PASSWORD": "SuaSenha",
        "SQL_PORT": "1433",
        "SQL_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  }
}
```

---

## Agentes GitHub Copilot

Este repositório inclui dois agentes especializados na pasta `.github/agents/`:

### 🧠 Prompt Genius (`prompt-genius`)
Agente dedicado a melhorar e criar prompts perfeitos para uso no GitHub Copilot Agents.  
Analisa requisitos, identifica ambiguidades e gera prompts estruturados e eficazes.

### 🔍 SQL Server Reverse Engineer (`sql-server-reverse-engineer`)
Agente especialista em SQL Server que usa as ferramentas deste MCP para:
- Extrair regras de negócio de stored procedures
- Identificar bugs e anti-patterns
- Gerar fluxogramas de lógica de procedures
- Documentar bancos de dados completos
- Analisar dependências e impacto de mudanças

Veja a pasta [`.github/agents/`](.github/agents/) para mais detalhes.

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `SQL_SERVER` | `localhost` | Host do SQL Server |
| `SQL_DATABASE` | `master` | Database padrão |
| `SQL_USER` | – | Login SQL Server |
| `SQL_PASSWORD` | – | Senha do login |
| `SQL_PORT` | `1433` | Porta TCP |
| `SQL_ENCRYPT` | `false` | Ativar TLS/SSL |
| `SQL_TRUST_SERVER_CERTIFICATE` | `true` | Confiar no certificado auto-assinado |
| `SQL_WINDOWS_AUTH` | `false` | Usar autenticação Windows (NTLM) |

---

## Desenvolvimento

```bash
# Modo watch (recompila automaticamente)
npm run watch

# Lint
npm run lint

# Testes
npm test
```

---

## Licença

MIT © BrunoFelipeSouza
