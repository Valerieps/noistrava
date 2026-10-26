# Roadmap

O que ainda não está pronto.

- **Entra aqui:** o que falta construir, onde o código ainda não segue o spec, o que foi adiado de
  propósito e as lacunas do spec que o agente decidiu sozinho.
- **Não entra aqui:** o que já está pronto (quando uma linha fica pronta, ela sai daqui; o git e as
  issues fechadas guardam o histórico), bugs e débito técnico (issues do GitHub) e as regras (`spec/`).

## Falta construir

| Feature | Fase | Spec | Observação |
| --- | --- | --- | --- |
| App envia o fuso do aparelho ao abrir | 1 | `spec/acesso-e-membros.md` | O servidor já guarda (`member.setTimezone`) |
| Telas de atividades: registro manual, editar, excluir | 1 | `spec/atividades.md` | Os comandos e a consulta `activities` já existem; falta o nome de cada modalidade em `strings.ts` |
| Strava no Worker: webhook, trazer as atividades desde o início do desafio, renovar os tokens, desconectar | 1 | `spec/strava.md` | ADR-008. O `Group` já recebe a atividade (`importStravaActivity`) |
| Telas do desafio: criar (com os fusos e as horas em cada um), responder, andamento, editar, cancelar, apagar, log com coração, histórico | 1 | `spec/desafio-horas.md` | Os comandos e as consultas já existem |
| Jornada: busca de lugares e rota no Worker, mapa | 1 | `spec/desafio-horas.md` | ADR-009. Hoje o comando aceita a rota pronta do app; o Worker precisa calculá-la |
| Primeira tela de verdade no lugar da `Home` de exemplo | 1 | — | Sai `src/domain/greeting.ts` junto |
| Notificações | 2 | `spec/desafio-horas.md` | Regras em aberto |

## O código ainda não segue o spec

- Nada por enquanto: o que já existe (acesso e integrantes) segue o spec.

## Revisar as lacunas que o agente decidiu

- [ ] A meta é um número inteiro de horas, de 1 a 10.000 (`spec/desafio-horas.md`).
- [ ] O início pode estar no passado; o término não (`spec/desafio-horas.md`).
- [ ] Quem entra no grupo durante um desafio pode aceitar (`spec/desafio-horas.md`).
- [ ] Depois do término, ninguém muda a resposta (`spec/desafio-horas.md`).
- [ ] Sem fuso de ninguém, o período vale em UTC (`spec/desafio-horas.md`).
- [ ] Com a meta batida antes do fim do período, contam só as atividades de antes desse momento
  (`spec/desafio-horas.md`).
- [ ] Uma atividade dura no máximo 24 horas; no registro manual, a modalidade vem de uma lista e o
  início não pode estar no futuro (`spec/atividades.md`).

## Adiado

- Identidade visual (cores e ícones) — continuam as do template até a dona escolher entre opções.
- [ ] Uma atividade do Strava excluída no app não volta (`spec/atividades.md`).
- [ ] Desconectar o Strava mantém as atividades que já vieram (`spec/strava.md`).
