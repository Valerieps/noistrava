# Strava

Minhas atividades chegam sozinhas do Strava, sem eu precisar registrar.

- **Entra aqui:** conectar e desconectar o Strava, o aceite, o que o app traz e quando.
- **Não entra aqui:** o que fazer com a atividade depois que ela chega ([atividades.md](atividades.md)).
  Os detalhes técnicos estão no ADR-008.

## Conectar

- Eu conecto o Strava pelas configurações, com um botão "Conectar com Strava". *(1)*
- Antes de conectar, eu aceito que o grupo veja o início, o tempo total e a modalidade das minhas
  atividades. Sem o aceite, eu não conecto e registro à mão. *(1)*
  Por quê: pelas regras do Strava, os dados de uma pessoa só podem ser mostrados a outras com o
  consentimento explícito dela.
- Na conexão, eu escolho se as minhas atividades privadas do Strava também entram. *(1)*
- O app guarda do Strava só o início, o tempo total e a modalidade. Nunca título, mapa, distância
  nem fotos. *(1)*

## O que chega

- Uma atividade nova, editada ou apagada no Strava chega ao app em poucos minutos. *(1)*
- O tempo que conta é o tempo total da atividade no Strava. *(1)*
- Ao conectar, e ao entrar num desafio já começado, o app traz as minhas atividades desde o início do
  desafio. Atividades de antes do período não vêm. *(1)*
- A partir da fase 2, ao conectar, o app traz as minhas atividades dos últimos 90 dias, e toda
  atividade nova chega, com ou sem desafio ativo. As que ficam fora de qualquer desafio só eu vejo,
  no meu acompanhamento. *(2)*
  Por quê: o acompanhamento ([acompanhamento.md](acompanhamento.md)) precisa das semanas entre um
  desafio e outro.

## Desconectar

- Eu desconecto o Strava pelas configurações, ou tirando o acesso do app no próprio Strava. *(1)*
- Ao desconectar, as atividades que já vieram continuam; as novas não chegam mais. *(1)*
