# Nome do app

<Uma frase sobre o que o app faz.>

## Usar o template

Este repositório é um template para apps web de grupo construídos com o Claude Code: Vite + React +
TypeScript no navegador, um Cloudflare Worker com um banco SQLite (Durable Object) no servidor,
login com Google só para quem tem convite, atualização ao vivo, testes com Vitest, CI no GitHub
Actions e deploy pelo Cloudflare Workers Builds, com as docs organizadas para o Claude ler só o que
precisa. Para um app que guarda tudo no navegador, sem servidor, use o
[claude-web-app-template](https://github.com/Valerieps/claude-web-app-template).

1. No GitHub, **Use this template > Create a new repository**.
2. Clone o repositório novo e rode `npm ci`.
3. Abra o Claude Code na pasta e diga **"leia o BOOTSTRAP.md e siga"**. Ele faz uma entrevista
   sobre o app, preenche as docs, configura o repositório e abre o primeiro PR. O que só você pode
   fazer (Google Cloud e Cloudflare) está na seção 3 do `BOOTSTRAP.md`.

Um template não copia labels, proteção de branch nem configurações do repositório: o
`npm run setup:repo` faz isso (o bootstrap já roda).

## Rodar

```bash
cp .dev.vars.example .dev.vars
```

Ponha seu e-mail em `BOOTSTRAP_ADMIN_EMAILS` no `.dev.vars` e gere o `dist/` uma vez (o Worker
local precisa dele):

```bash
npm run build
```

Depois, em dois terminais:

```bash
npm run dev:api
```

```bash
npm run dev
```

Abra o endereço do `npm run dev` e entre pelo formulário "Entrar sem Google", que só existe neste
computador. `npm test` roda os testes; `npm run preview` serve o app como em produção.

## Onde está cada coisa

- `CLAUDE.md`: instruções para o Claude Code e o mapa das docs.
- `docs/SPEC.md` e `docs/spec/`: o que o app faz.
- `docs/ROADMAP.md`: o que falta.
- `docs/ARQUITETURA.md` e `docs/adr/`: como o app é construído e por quê.
- `docs/SEGURANCA.md`: as regras de segurança.
