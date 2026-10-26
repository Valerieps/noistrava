# Arquitetura

O desenho técnico que o código não mostra sozinho.

- **Entra aqui:** as invariantes (o que precisa ser sempre verdade), o modelo de dados, o fluxo de
  eventos e as migrações.
- **Não entra aqui:** um passeio pelos arquivos (o código mostra), o porquê de cada decisão (`adr/`),
  o que falta construir (`ROADMAP.md`) e as regras de produto (`spec/`).

## Visão geral

- **App:** web app (Vite + React + TypeScript), instalável (PWA). Fala só com a própria origem.
- **Servidor:** um Cloudflare Worker serve os arquivos do app, a API em `/api`, a conexão ao vivo e
  o cron. Todos os dados do grupo ficam num único Durable Object, `Group`, com SQLite. Ver ADR-004.
- **Login:** Google, pelo fluxo de código OAuth no Worker, com cookie de sessão. Ver ADR-005.

```
app (celular) ──POST /api/query|command──► Worker ──RPC──► Group (Durable Object, SQLite)
     ▲                                       ▲                    │
     └──────── WebSocket /api/live ──────────┘                    │ "mudou: members, invites…"
                                             cron 5 min ──► tick  ▼
                                                     todos os apps abertos refazem a consulta
```

## Camadas

`domain` ← `application` ← `infrastructure` e `ui`, no app e no servidor.

- `src/domain/`: regras puras e os textos da interface (`strings.ts`). O app e o servidor usam o
  mesmo código.
- `src/application/api-contract.ts`: os nomes, entradas e saídas das consultas e dos comandos. É só
  tipo; o servidor importa com `import type`.
- `server/application/`: os casos de uso do servidor. Síncronos, dependem só das portas `Sql`,
  `Clock` e `IdGenerator`; os testes rodam sobre `node:sqlite`.
- `server/infrastructure/` e `server/entry/`: Cloudflare, Google, cookies. Finos.
- A interface chama `Backend` e `LiveUpdates` (portas em `src/application/ports.ts`), nunca a rede
  direto.

## Invariantes

- Só o servidor grava. O app não tem acesso ao banco; toda escrita é um comando que o `Group`
  confere (sessão, papel, regra) e grava numa transação só.
- Um comando roda sozinho: o Durable Object processa uma chamada por vez, e tudo o que o comando
  causa entra junto ou não entra.
- Papéis são conferidos no servidor, nunca só na interface.
- Sempre existe pelo menos um admin.
- A sessão vale só enquanto o membro está ativo. Remover alguém apaga as sessões dele e fecha os
  WebSockets abertos (o comando devolve `disconnect`), então o acesso acaba na hora.
- Um comando devolve os tópicos (`Topic`) que mudou; o `Group` avisa todos os apps abertos, que
  refazem as consultas desses tópicos.

## Modelo de dados

| Tabela | Campos principais | Observação |
| --- | --- | --- |
| `members` | `id`, `google_sub`, `email`, `name`, `photo_url`, `roles` (JSON), `active` | Removido fica com `active = 0`; um convite novo traz o mesmo membro de volta |
| `sessions` | `token_hash`, `member_id`, `expires_at` | Só o SHA-256 do token; o cron apaga as vencidas |
| `invites` | `email`, `invited_by`, `state` (`pending`, `accepted`, `revoked`) | Um por e-mail |

## Fluxo de eventos

<Se o app tem histórico de eventos (um feed, transições de estado): quais tipos existem, quem grava,
quem lê. Todo evento é gravado na mesma transação do comando que o causa.>

## Migrações

`MIGRATIONS` em `server/application/schema.ts` é uma lista numerada; o `Group` aplica as que faltam
ao iniciar, cada uma numa transação, e registra em `schema_migrations`. Uma migração publicada nunca
muda: a mudança seguinte é uma migração nova. Remover uma coluna leva duas versões: primeiro o código
para de usar, depois a coluna sai. A classe do Durable Object tem suas próprias migrações no
`wrangler.jsonc` (`tag`), que também só crescem.
