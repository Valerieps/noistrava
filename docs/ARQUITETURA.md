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
- Uma atividade é da integrante, nunca de um desafio. O progresso de um desafio é calculado a cada
  leitura a partir das atividades das Senhoras no período e da configuração; não há total acumulado
  para manter em dia. Editar ou apagar uma atividade se reflete sozinho.
- Há no máximo um desafio que não terminou.
- O início e o término de um desafio são gravados como instantes UTC, calculados na criação (e a
  cada edição) a partir dos fusos das integrantes: o início no fuso mais adiantado, o término no
  mais atrasado.
- A janela de contagem vai do `starts_at` ao `ended_at` (meta batida antes, cancelamento) ou, sem
  ele, ao `ends_at`. `settle` (em `server/application/challenges.ts`) recalcula o total a cada
  mudança e grava marcos e estado; nas 24 horas de tolerância o estado segue o total.
- Ao fechar (24 horas depois do término), o desafio grava os totais de cada Senhora em
  `challenge_results`. Depois disso o histórico lê só dali, e apagar as atividades de quem saiu do
  grupo não o altera.
- A corrente (`type = 'corrente'`) não tem meta nem marcos: `settle` calcula os dias com
  `chainDays` (`src/domain/challenge/chain.ts`) a partir das atividades do período e do dia
  seguinte ao término, que pode salvar o último dia. Quebras perdidas acima das permitidas terminam
  e fecham o desafio na hora; no fim do período, ele fecha 48 horas depois. Ao fechar, os dias
  ficam congelados em `chain_result`.
- Do Strava, o servidor guarda só início, fuso, tempo total e modalidade (ADR-008).

## Modelo de dados

| Tabela | Campos principais | Observação |
| --- | --- | --- |
| `members` | `id`, `google_sub`, `email`, `name`, `photo_url`, `roles` (JSON), `active` | Removido fica com `active = 0`; um convite novo traz o mesmo membro de volta |
| `sessions` | `token_hash`, `member_id`, `expires_at` | Só o SHA-256 do token; o cron apaga as vencidas |
| `invites` | `email`, `invited_by`, `state` (`pending`, `accepted`, `revoked`) | Um por e-mail |
| `members` (coluna da migração 3) | `timezone` | IANA, vinda do aparelho |
| `strava_connections` | `member_id`, `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `include_private`, `consented_at`, `active` | Tokens cifrados com AES-GCM (ADR-008) |
| `activities` | `id`, `member_id`, `source` (`manual`, `strava`), `strava_id`, `started_at` (UTC), `timezone`, `duration_seconds`, `sport`, `edited_by_member`, `deleted` | `edited_by_member` faz a edição valer sobre o Strava; `deleted` impede que uma atividade do Strava volte |
| `challenges` | `id`, `type` (`horas_colaborativas`, `corrente`), `name`, `creator_id`, `starts_at`, `ends_at`, `state` (`draft`, `open`, `succeeded`, `failed`, `cancelled`), `ended_at`, `closes_at`, `closed_at`, `config` (JSON), `creator_is_senhora` | `config`: as datas escolhidas, `goalMinutes` e, com jornada, `journey` com a rota simplificada, a distância e as paradas (ADR-009); num rascunho sem rota, `journeyPending`; na corrente, `goalMinutes` 0 e `chain` (quebras permitidas e mínimo por dia). `chain_result` (migração 5): os dias da corrente, gravados ao fechar. `closed_at` marca o resultado fechado. Um `draft` não tem integrantes nem convites: só o criador o vê, e ativá-lo recalcula o período e convida todas |
| `challenge_members` | `challenge_id`, `member_id`, `response` (`pending`, `accepted`, `declined`), `responded_at` | Todas as integrantes ativas na criação; quem entra depois não tem linha e conta como `pending` |
| `challenge_absences` | `challenge_id`, `member_id`, `left_at`, `returned_at` | Cada vez que uma Senhora sai (e volta). Conta a atividade de quem é ou foi Senhora, que começou na janela e fora de uma ausência |
| `reactions` | `activity_id`, `challenge_id`, `member_id` | Um coração por pessoa por atividade |
| `challenge_milestones` | `challenge_id`, `milestone`, `reached_at` | Marco atingido não volta atrás |
| `challenge_results` | `challenge_id`, `member_id`, `name`, `total_seconds` | Gravado ao fechar o desafio |

## Fluxo de eventos

- **Atividade registrada, editada ou apagada** (pelo app ou pelo webhook do Strava): grava em
  `activities`, confere se algum marco foi atingido ou se a meta foi batida, e grava o marco ou o
  término na mesma transação. Avisa os tópicos `activities` e `challenge`. Uma Senhora não edita uma atividade que contou num
  desafio já fechado.
- **Resposta ao convite, edição do desafio:** recalculam o total na mesma transação, então aceitar
  tarde ou baixar a meta pode terminar o desafio com sucesso na hora.
- **Cron (`tick`, a cada 5 minutos):** termina sem sucesso o desafio cujo `ends_at` passou e fecha o
  que passou do `closes_at`, gravando `challenge_results`. Cancelar fecha na hora.
- **Integrante removida:** apaga as atividades dela, os corações e a conexão com o Strava, e
  recalcula os desafios abertos.
- **Webhook do Strava:** o Worker responde na hora e busca a atividade na API depois
  (`ctx.waitUntil`); o resultado entra no `Group` por `importStravaActivity`, com as mesmas regras do
  registro manual.

## Migrações

`MIGRATIONS` em `server/application/schema.ts` é uma lista numerada; o `Group` aplica as que faltam
ao iniciar, cada uma numa transação, e registra em `schema_migrations`. Uma migração publicada nunca
muda: a mudança seguinte é uma migração nova. Remover uma coluna leva duas versões: primeiro o código
para de usar, depois a coluna sai. A classe do Durable Object tem suas próprias migrações no
`wrangler.jsonc` (`tag`), que também só crescem.
