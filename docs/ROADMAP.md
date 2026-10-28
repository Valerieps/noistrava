# Roadmap

O que ainda não está pronto.

- **Entra aqui:** o que falta construir, onde o código ainda não segue o spec, o que foi adiado de
  propósito e as lacunas do spec que o agente decidiu sozinho.
- **Não entra aqui:** o que já está pronto (quando uma linha fica pronta, ela sai daqui; o git e as
  issues fechadas guardam o histórico), bugs e débito técnico (issues do GitHub) e as regras (`spec/`).

## Falta construir

| Feature | Fase | Spec | Observação |
| --- | --- | --- | --- |
| Jornada: postal de cada marco (foto e resumo do lugar), "Onde estamos" e números do caminho (países, rios) | 1 | `spec/desafio-horas.md` | Estão nos rascunhos; precisam de dados que o servidor não tem |
| Notificações | 2 | `spec/desafio-horas.md` | Regras em aberto |

## O código ainda não segue o spec

- O comando de criar e editar aceita a jornada que o app manda: o servidor confere o formato, mas
  não recalcula a rota (ADR-009).
- A imagem ilustrativa do desafio, que os rascunhos mostram, não existe no servidor: a tela mostra
  só o fundo listrado.

## Revisar as lacunas que o agente decidiu

- [ ] A meta é um número inteiro de horas, de 1 a 10.000 (`spec/desafio-horas.md`).
- [ ] O início pode estar no passado; o término não (`spec/desafio-horas.md`).
- [ ] No rascunho, dá para mudar se eu sou Senhora até ativar (`spec/desafio-horas.md`).
- [ ] O admin não vê nem apaga os rascunhos das outras (`spec/desafio-horas.md`).
- [ ] Quem entra no grupo durante um desafio pode aceitar (`spec/desafio-horas.md`).
- [ ] Depois do término, ninguém muda a resposta (`spec/desafio-horas.md`).
- [ ] Sem fuso de ninguém, o período vale em UTC (`spec/desafio-horas.md`).
- [ ] Com a meta batida antes do fim do período, contam só as atividades de antes desse momento
  (`spec/desafio-horas.md`).
- [ ] Uma atividade dura no máximo 24 horas; no registro manual, a modalidade vem de uma lista e o
  início não pode estar no futuro (`spec/atividades.md`).
- [ ] "No ritmo" é estar a até 1% da meta do programado; a reta final são os 5 últimos dias do
  período (`spec/desafio-horas.md`, "Andamento").
- [ ] A busca mostra até 5 lugares (`spec/desafio-horas.md`, "Jornada").
- [ ] Paradas: cada nova entra antes da chegada, na ordem em que eu acrescento; no máximo 20; um
  lugar não se repete; inverter a viagem inverte as paradas (`spec/desafio-horas.md`, "Jornada").
- [ ] As setas do ranking comparam com 24 horas atrás; o log mostra as 4 atividades mais recentes e
  "Ver tudo" abre o resto (`spec/desafio-horas.md`, "Andamento").

## Adiado

- Identidade visual: as cores são a paleta "framboesa" dos rascunhos (e "noite" no tema escuro); o
  ícone só trocou de cor. As fontes dos rascunhos (Figtree e Bricolage Grotesque) ainda não estão
  no bundle: o app usa a fonte do sistema até elas entrarem como arquivos próprios.
- [ ] Uma atividade do Strava excluída no app não volta (`spec/atividades.md`).
- [ ] Desconectar o Strava mantém as atividades que já vieram (`spec/strava.md`).
