# Spec

O que o app faz. É a fonte da verdade: quando outro documento diverge daqui, vale o spec.

- **Entra aqui:** o que o app é, para quem, as fases e qual arquivo de `spec/` cobre cada feature.
- **Não entra aqui:** as regras em si (ficam em `spec/`), o que falta construir (`ROADMAP.md`) e
  como o app é construído (`ARQUITETURA.md` e `adr/`).

## O app

Eu uso o Senhoras com um grupo pequeno e fechado de amigas e amigos, cada um num canto do mundo, para
fazer desafios de exercício juntos. A cada desafio, alguém do grupo cria uma meta de horas para um
período; quem topa vira Senhora, e o resto vira torcida. Minhas atividades chegam sozinhas do Strava
(ou eu registro à mão), somam no total do grupo, e todo mundo acompanha e manda coração. O nome vem
das 100 horas que costumamos tentar fazer coletivamente.

## Fases

Cada fase precisa ser usável sozinha. Cada regra em `spec/` diz de que fase vale, como *(1)*.

| Fase | O que entra |
| --- | --- |
| 1 | Acesso, desafio de horas colaborativas (com ou sem jornada), atividades manuais e do Strava, log com corações, histórico |
| 2 | Notificações; outros tipos de desafio (o primeiro é a corrente); acompanhamento individual no perfil |

## Arquivos

| Arquivo | O que cobre |
| --- | --- |
| [spec/acesso-e-membros.md](spec/acesso-e-membros.md) | Login com Google, convites, papéis do grupo, integrantes e perfil |
| [spec/desafio-horas.md](spec/desafio-horas.md) | Desafio de horas colaborativas: papéis, período, meta, jornada, log e histórico |
| [spec/desafio-corrente.md](spec/desafio-corrente.md) | Desafio da corrente: elo do dia, quebras salvas e perdidas, término e o calendário |
| [spec/atividades.md](spec/atividades.md) | Atividades: registro manual, editar e excluir |
| [spec/strava.md](spec/strava.md) | Conexão com o Strava e o aceite de compartilhar |
| [spec/acompanhamento.md](spec/acompanhamento.md) | Acompanhamento individual no perfil: o meu ritmo, a minha contribuição e os selos |
| [spec/_modelo.md](spec/_modelo.md) | Modelo para um arquivo de feature novo |

Os termos estão definidos em [GLOSSARIO.md](GLOSSARIO.md).
