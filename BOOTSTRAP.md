# Bootstrap

Roteiro da primeira sessão com o Claude Code num repositório criado a partir deste template.
Para começar, abra o Claude Code na pasta do repositório e diga: **"leia o BOOTSTRAP.md e siga"**.

- **Entra aqui:** a entrevista inicial e os passos para transformar o template num app.
- **Não entra aqui:** regras do app (vão para `docs/spec/`) e decisões técnicas (`docs/adr/`).

Este arquivo é apagado no fim do bootstrap.

## O que já vem pronto

Um app de grupo fechado: login com Google, só entra quem tem convite, papel de admin, lista de
membros, convites, atualização ao vivo entre os aparelhos e um Worker do Cloudflare com um banco
SQLite (um Durable Object). Ver `docs/spec/acesso-e-membros.md` e `docs/ARQUITETURA.md`. A
entrevista decide o que o app faz em cima disso.

## Instruções para o Claude

Faça a entrevista abaixo numa mensagem só, com as perguntas numeradas, e espere as respostas.
Pergunte de novo só o que ficar ambíguo. Depois siga os passos, numa branch `bootstrap`, e abra um PR.

## 1. Entrevista

**O app**
1. Qual é o nome do app? E o endereço que você quer (`<nome>.<sua-conta>.workers.dev` ou um domínio seu)?
2. Que problema ele resolve, e para quem? Quem está no grupo, e mais ou menos quantas pessoas?
3. O que cada pessoa faz nele todo dia (o ciclo principal), em duas ou três frases?
4. Qual é a menor versão que já seria útil? E o que vem depois, em fases?
5. Que palavras você usa para as coisas do app? (Elas viram o glossário e os textos da interface.)

**Pessoas e acesso**
6. Quais e-mails entram como os primeiros admins?
7. Além de admin e membro, há outros papéis? O que cada um pode fazer?
8. O que um membro vê dos outros (nome, foto, e-mail, o que fizeram no app)?

**Dados e integrações**
9. Que dados o app guarda? Algum é sensível (saúde, dinheiro, trabalho)? Precisa exportar os dados?
10. O app precisa falar com outros serviços (uma API, um webhook, e-mail, notificações no celular)?
    Cada um vira uma origem em `network-policy.ts` e um ADR.
11. Algo acontece sozinho com o tempo (lembretes, vencimentos, resumos)? Em que fuso horário?

**Onde e como**
12. Em que aparelhos: celular, computador? Precisa ser instalável na tela de início?
13. A interface é em português? Algum outro idioma?
14. O repositório vai ser público ou privado? (Repositório privado no plano gratuito do GitHub não
    tem proteção de branch; o CI continua rodando, mas o merge não fica bloqueado.)

**Como você trabalha**
15. Quer que eu teste no navegador depois de cada mudança, ou só com o typecheck e os testes?
16. Quer que eu faça o merge dos meus PRs quando o build passar?

## 2. Passos depois da entrevista

1. **Nome:** `package.json` (`name`), `wrangler.jsonc` (`name`), `index.html` (`<title>`),
   `public/manifest.webmanifest`, `strings.appName` e `strings.signIn.tagline` em
   `src/domain/strings.ts`, títulos do `CLAUDE.md` e do `README.md`.
2. **Acesso:** ajuste `docs/spec/acesso-e-membros.md` com as respostas 6 a 8. Papéis novos entram em
   `src/domain/group/roles.ts` (com testes) e na tela de membros.
3. **Rede:** cada serviço da resposta 10 vai para `SERVER_ORIGINS` (ou `ALLOWED_ORIGINS`/`IMAGE_ORIGINS`)
   em `network-policy.ts`, com um ADR. Escreva em `docs/SEGURANCA.md` quais dados o app guarda.
4. **Produto:** escreva o `docs/SPEC.md` (o que o app é, as fases) e um arquivo em `docs/spec/` por
   feature da primeira fase, a partir de `docs/spec/_modelo.md`, em primeira pessoa e na voz da dona.
   As dúvidas que sobrarem vão para o "Em aberto" de cada arquivo.
5. **Termos:** `docs/GLOSSARIO.md` com as palavras da pergunta 5.
6. **Roadmap:** `docs/ROADMAP.md` com as features da primeira fase como "falta construir".
7. **Arquitetura:** o parágrafo de abertura do `CLAUDE.md`; as tabelas novas em `docs/ARQUITETURA.md`
   (só o desenho; as migrações vêm com as features).
8. **Identidade:** cores em `src/ui/theme/tokens.css`, e as mesmas em `index.html`, no manifest e nos
   ícones (`src/app-identity.test.ts` confere).
9. **Preferências:** ajuste "Working with the owner" no `CLAUDE.md` com as respostas 15 e 16.
10. **Exemplo:** a tela `Home` e `src/domain/greeting.ts` são de exemplo; troque pela primeira tela
    de verdade quando ela existir.
11. **Repositório:** rode `npm run setup:repo` (labels, merge automático, proteção da `main`).
12. **Verificação:** `npm run build` e `npm run docs:check` passam.
13. **Fim:** apague este arquivo e a seção "Usar o template" do `README.md`, e abra o PR.

## 3. O que só a dona faz

Abra uma issue `t:debito-tecnico` para cada item que ficar pendente. Até o passo 2 terminar, o app
roda no computador com o login de teste (`.dev.vars` com `DEV_SIGN_IN=1`, ADR-007).

1. **Google Cloud** (console.cloud.google.com): crie um projeto; em "Google Auth Platform", configure
   a tela de consentimento (tipo "Externo", só os escopos `openid`, `email` e `profile`) e crie um
   cliente OAuth do tipo "Aplicativo da Web" com os URIs de redirecionamento
   `https://<endereço do app>/api/auth/callback` e `http://localhost:5173/api/auth/callback`.
   Enquanto o app estiver "Em teste", só os usuários de teste listados lá conseguem entrar:
   publique o app (sem verificação, já que os escopos são básicos) quando o grupo for usar.
2. **Configuração:** o ID do cliente vai em `GOOGLE_CLIENT_ID` no `wrangler.jsonc` (é público).
   Os segredos vão com `npx wrangler secret put GOOGLE_CLIENT_SECRET` e
   `npx wrangler secret put BOOTSTRAP_ADMIN_EMAILS`, e no `.dev.vars` para rodar localmente.
3. **Cloudflare** (dash.cloudflare.com > Workers & Pages > Create > Import a repository): conecte o
   repositório; build `npm run build`, deploy `npx wrangler deploy`, com builds de branches ligados
   (cada branch ganha uma prévia). O plano Workers Free basta para começar (ADR-004).
4. **Conferir** no celular dela o que o Claude não consegue testar: o login com Google de verdade, a
   instalação na tela de início e o app aberto em dois aparelhos ao mesmo tempo.
