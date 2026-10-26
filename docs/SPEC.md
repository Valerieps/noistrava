# Spec

O que o app faz. É a fonte da verdade: quando outro documento diverge daqui, vale o spec.

- **Entra aqui:** o que o app é, para quem, as fases e qual arquivo de `spec/` cobre cada feature.
- **Não entra aqui:** as regras em si (ficam em `spec/`), o que falta construir (`ROADMAP.md`) e
  como o app é construído (`ARQUITETURA.md` e `adr/`).

## O app

<Duas ou três frases, em primeira pessoa: o que eu faço com o app, com quem e por quê.>

## Fases

Cada fase precisa ser usável sozinha. Cada regra em `spec/` diz de que fase vale, como *(1)*.

| Fase | O que entra |
| --- | --- |
| 1 | <a menor versão útil> |
| 2 | <o que vem depois> |

## Arquivos

| Arquivo | O que cobre |
| --- | --- |
| [spec/acesso-e-membros.md](spec/acesso-e-membros.md) | Login com Google, convites, papéis e membros |
| [spec/_modelo.md](spec/_modelo.md) | Modelo para um arquivo de feature novo |

Os termos estão definidos em [GLOSSARIO.md](GLOSSARIO.md).
