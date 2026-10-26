# <Nome do app> - Claude Code Context & Instructions

<!-- BOOTSTRAP.md fills this paragraph: what the app is, for whom, and its core loop. -->
<One paragraph: what the app does, who uses it, the loop a member repeats every day.>

## Docs

### What to read

Do not read every doc up front. Read only what the task needs, and only the relevant section:
find it with Grep on the doc's headings (`^#`) or a key term, then Read with `offset`/`limit`.
The owner edits docs between messages: re-read a doc before editing it and preserve what she wrote.

| Task | Read |
| --- | --- |
| Any code change | The hard rules below; `docs/SEGURANCA.md` when the change touches storage, network, dependencies or rendered user text |
| Implementing or changing a feature | Its file in `docs/spec/` (the table in `docs/SPEC.md` says which); its rows in `docs/ROADMAP.md`; the ADRs found by grepping `docs/adr/` |
| Changing the data model, events or migrations | `docs/ARQUITETURA.md` and the ADRs it cites |
| Answering a product question or deciding a rule | The relevant file in `docs/spec/` and its "Em aberto"; `docs/GLOSSARIO.md` for the terms |
| Working on an issue | `gh issue view <n>` and the `docs/spec/` files it cites |
| Reviewing or reorganizing the docs | All of them |

Hard rules from `docs/SEGURANCA.md`, valid for every change:
- The app talks only to its own origin (the Worker) and the origins in `network-policy.ts`; secrets (the Google client secret, any API key) live only in the Worker, never in the bundle.
- The app never reaches the database: every read and write goes through the API, which checks the session and the role on the server.
- Only invited e-mails get in; Google is the only sign-in (the test sign-in of ADR-007 exists only on localhost).
- Never insert user text as HTML; links open with `target="_blank" rel="noopener noreferrer"`.
- Minimize dependencies; pin exact versions; bundle them, never load from a CDN.
- `network-policy.ts` is the only place that says which servers the app and the Worker may talk to.

### Where information lives

Each kind of information has exactly one home. Before writing anything into a doc, find its home
here. Never copy content between docs: link to the home instead. If two docs disagree, the home
wins: fix the other doc in the same change.

| Kind of information | Home | Notes |
| --- | --- | --- |
| Product rules (what the app does) | `docs/spec/`, one file per feature | Source of truth. `docs/SPEC.md` is the index and lists the phases. Each rule says from which phase it applies, as *(1b)*. When the reason for a rule is not obvious, a "Por quê:" line sits right under it |
| Open product questions | Top of the relevant file in `docs/spec/` ("Em aberto") | Other docs point to them, never restate them |
| Terms | `docs/GLOSSARIO.md` | One term, one meaning. Use these names in UI text and docs |
| What is missing, where code lags behind the spec, what is deferred | `docs/ROADMAP.md` | Only what is NOT done. When something is built, its row leaves the roadmap; git and closed issues keep the history |
| Technical design the code does not show | `docs/ARQUITETURA.md` | Invariants, the data model, the event flow and migrations. Not a tour of the files: the code shows that |
| Technical decisions | `docs/adr/`, one file per decision | Each ADR has a `**Status:**` line and a unique number; there is no separate index. Find ADRs by grepping `docs/adr/` |
| Security rules | `docs/SEGURANCA.md` | Short; enforced by `src/security.test.ts` wherever a rule can be tested |
| Feature requests not yet decided | GitHub issues, `t:enhancement` + a size label | When decided: rule to `docs/spec/`, row to `docs/ROADMAP.md`, issue closed |
| Bugs, technical debt, known limitations, checks only the owner can do | GitHub issues, `t:bug` or `t:debito-tecnico` + a priority (`p:`) + a size (`s:`) | Close the issue when resolved; open one when you knowingly leave something behind |
| Open questions on an issue | A comment on the issue + `q:perguntas em aberto`; ready to build: `q:SEM perguntas em aberto` | Swap the label once answered |
| Screen drafts and briefs | `docs/rascunhos/` | `docs/rascunhos/README.md` gives each draft's status; the spec wins. Delete a draft once its screen is built |

Exception for visual-only tweaks (colors, spacing, icons, sizes, layout) that change no behavior:
do not update `docs/spec/` or `docs/ROADMAP.md` after each one; record the batch once, when the
owner asks to commit or open the PR.

New docs start with what goes in them and what does not ("Entra aqui" / "Não entra aqui").
Product docs are written in Brazilian Portuguese; ADRs, code and this file in English.

## Working with the owner
- She answers questions as a numbered list in the chat, or as nested items under each "Em aberto"
  question. Fold each answer into the text of its section and remove the answered question.
- Open questions sit at the top of each section, as a checklist.
- The spec is written in the first person ("eu posso..."), in Brazilian Portuguese, in her voice.
- Business-rule questions found during a task go in one batch, before implementing.
- When she asks what you think of the app, she wants a frank assessment, including the risks.
- Verify with the typecheck and unit tests; use the browser only when she asks.
- Merge your own PR once its build passes.

### Fewer rounds, fewer tokens
Each step rereads the whole conversation, so long sessions and back-and-forth cost the most.
- One session per task. When a task ends and the next one is unrelated, offer a new session
  instead of continuing here.
- Briefs for sessions you start are self-contained, so the child never needs this conversation.
  Start mechanical work (docs, small UI fixes, issues) on Sonnet; keep Opus for design and
  architecture.
- A question ("o que acha", "me ajude a decidir", "vale a pena") gets an answer, not an
  implementation.
- Design or naming choices: show three or four directions side by side in the first round, not
  one at a time.
- Steps she does by hand in a console (Cloudflare, Google Cloud, GitHub settings): give the whole
  checklist at once, with where to click, so she comes back only when stuck.
- Fix what she named. Other problems you notice go in a list at the end, unfixed, unless she
  asked you to fix them too.
- When an artifact comment arrives, read every open thread on that artifact and answer them all
  in one pass.
- In the browser, check only what she asked; prefer page text over screenshots.

## Architecture Overview
- Clean Architecture + Domain Driven Design (DDD).
- Web app (Vite + React) and backend in one Cloudflare Worker; all group data in one SQLite Durable Object (`Group`); live updates over a WebSocket; Google sign-in by OAuth code flow. See `docs/ARQUITETURA.md`, ADR-004 and ADR-005.
- The domain (`src/domain`) is shared: the server imports the same rules the app uses.

## Adding a feature
1. Types in `src/application/api-contract.ts`: a query (read) or a command (write), and the `Topic` it changes.
2. Rules in `src/domain/`, with tests.
3. The use case in `server/application/` (check the actor's role first; return `failure(...)` or `{ ok, value, changed }`), registered in `QUERIES` or `COMMANDS` of `group-service.ts`, with tests on `node:sqlite`.
4. A new table or column: the next entry of `MIGRATIONS` in `schema.ts`, never an edit of a shipped one.
5. The screen in `src/ui/screens/`, reading with `useQuery(name, input, topics)` and writing with `backend.command`; texts in `src/domain/strings.ts`.

## Project Layout
- `src/domain` - entities and rules. Pure TypeScript, no framework imports. Shared with the server. `strings.ts` holds every UI text.
- `src/application` - ports (interfaces the infrastructure implements) and `api-contract.ts`, the API's types.
- `src/infrastructure` - the HTTP backend and the live socket; the only place in `src/` that may use the network.
- `src/ui` - React components. All colors, fonts and spacing live in `src/ui/theme/tokens.css`.
- `server/application` - the server's use cases (`GroupService`), synchronous, on the `Sql`/`Clock`/`IdGenerator` ports; `schema.ts` holds the migrations.
- `server/infrastructure`, `server/entry` - Durable Object, Worker, Google sign-in, cookies. `server/testing` - `node:sqlite` for tests.
- `wrangler.jsonc` - the Worker: assets, Durable Object, cron, vars. Secrets via `wrangler secret put`; locally in `.dev.vars` (see `.dev.vars.example`).
- `public/` - static files: manifest, icons, `_headers`.
- `network-policy.ts` - the servers the app (`ALLOWED_ORIGINS`, `IMAGE_ORIGINS`) and the Worker (`SERVER_ORIGINS`) may talk to.
- `scripts/` - `check-docs.mjs` (run by CI) and `setup-repo.mjs` (once per new repository).

## Commands
- `npm ci` - install exactly what the lockfile pins
- `npm run dev` - Vite dev server (no CSP); proxies `/api` to `npm run dev:api`
- `npm run dev:api` - the Worker locally (wrangler, port 8787); needs `.dev.vars` and a `dist/` (run `npm run build` once)
- `npm test` - unit tests, including `src/security.test.ts`
- `npm run build` - typecheck, unit tests, production build into `dist/` (CSP injected) and a Worker bundle dry run; a failing test stops the deploy
- `npm run preview` - serve the built app and the Worker together, as in production
- `npm run deploy` - deploy the Worker (normally Workers Builds does it from `main`)
- `npm run docs:check` - broken links between docs, ADRs without a status, repeated ADR numbers

## Deployment
Cloudflare Workers Builds, from the GitHub repository. Build command `npm run build`, deploy
command `npx wrangler deploy` for `main`; other branches get a preview version (ADR-004). Sign-in
only works where Google has the redirect URI registered: production and localhost (ADR-005). GitHub Actions (`.github/workflows/ci.yml`) runs the same build and the docs check on every
pull request. Branch protection on `main` requires the `build` check and a branch up to date with
`main` (ADR-003): wait with `gh pr checks <n> --watch`, and if the merge is refused because the
branch is behind, bring it up to date and wait again. No direct pushes to `main`. No `dev` branch:
each branch's Cloudflare preview is the staging.

## Code Conventions
- Keep domain entities free of framework dependencies.
- Code, comments and commit messages in English.
- All user-facing UI text in Brazilian Portuguese, matching the voice of the spec.
- New or changed logic gets unit tests, even when the task did not ask for them.

## Handling Spec Gaps
- A technical gap gets an ADR in `docs/adr/` (copy `000-template.md`).
- A business-rule gap: ask the owner first, all questions in one batch. Only decide alone when
  asking is impossible (an autonomous run). Either way, write the rule into `docs/spec/`, not an
  ADR. When you decided it yourself, also list it under "Revisar as lacunas que o agente decidiu"
  in `docs/ROADMAP.md`, so the owner can review it.
