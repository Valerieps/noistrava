# Roadmap

O que ainda não está pronto.

- **Entra aqui:** o que falta construir, onde o código ainda não segue o spec, o que foi adiado de
  propósito e as lacunas do spec que o agente decidiu sozinho.
- **Não entra aqui:** o que já está pronto (quando uma linha fica pronta, ela sai daqui; o git e as
  issues fechadas guardam o histórico), bugs e débito técnico (issues do GitHub) e as regras (`spec/`).

## Falta construir

| Feature | Fase | Spec | Observação |
| --- | --- | --- | --- |
| Fuso da integrante, vindo do aparelho | 1 | `spec/acesso-e-membros.md` | O início e o término do desafio dependem dele |
| Sair do grupo apaga as atividades e o Strava | 1 | `spec/acesso-e-membros.md` | Depende de atividades e Strava |
| Atividades: registro manual, editar, excluir | 1 | `spec/atividades.md` | |
| Strava: webhook, trazer as atividades desde o início do desafio, renovar os tokens, desconectar | 1 | `spec/strava.md` | ADR-008. O botão "Conectar com Strava" com o aceite já existe |
| Criar desafio, responder ao convite, papéis no desafio | 1 | `spec/desafio-horas.md` | |
| Período com os fusos mais adiantado e mais atrasado | 1 | `spec/desafio-horas.md` | |
| Meta, término, 24 horas de tolerância, marcos | 1 | `spec/desafio-horas.md` | |
| Jornada no mapa | 1 | `spec/desafio-horas.md` | ADR-009 |
| Editar, cancelar e apagar desafio | 1 | `spec/desafio-horas.md` | |
| Log de atividades com coração | 1 | `spec/desafio-horas.md` | |
| Histórico de desafios | 1 | `spec/desafio-horas.md` | |
| Primeira tela de verdade no lugar da `Home` de exemplo | 1 | — | Sai `src/domain/greeting.ts` junto |
| Notificações | 2 | `spec/desafio-horas.md` | Regras em aberto |

## O código ainda não segue o spec

- Nada por enquanto: o que já existe (acesso e integrantes) segue o spec.

## Adiado

- Identidade visual (cores e ícones) — continuam as do template até a dona escolher entre opções.
- [ ] Uma atividade do Strava excluída no app não volta (`spec/atividades.md`).
- [ ] Desconectar o Strava mantém as atividades que já vieram (`spec/strava.md`).
