# Brief: visual "topo de cor + folha" (direção C) na tela Desafio

- **Entra aqui:** o que muda no visual da tela Desafio e em que ordem construir.
- **Não entra aqui:** regras de produto (ficam em `docs/spec/`). Este brief não muda nenhuma regra: só a aparência.

Referência visual: o canvas [Senhoras — Desafio, direções visuais](https://claude.ai/artifact/TAVEa9iGFpdvFZ2AWqPr77), linha "Direção C, aprofundada". Não é preciso abrir: tudo o que importa está aqui.

## A ideia

Hoje cada seção é um quadrado com borda arredondada (`.panel`, `.tile`, `.message`), e isso deixa o app com cara de amador. Na direção C:

1. **Topo de cor.** O cabeçalho do desafio vira um bloco cheio na cor da marca, com o texto em branco. Ele traz o tipo e o prazo ("Horas colaborativas · faltam 9 dias"), o nome do desafio e o número principal (o anel e o total; na jornada, os km e a barra; na corrente, os dias seguidos). A estampa que a criadora escolhe (`banner-stripes|dots|checks|zigzag|grid`) passa a ser desenhada em branco a 8–13% de opacidade por cima dessa cor.
2. **Folha.** Logo abaixo do topo, uma folha branca com o canto superior arredondado (28px) e sem nenhum outro canto arredondado. Ela vai até o fim da tela.
3. **Seções sem caixa.** Dentro da folha, as seções são separadas por uma **faixa** cinza de 8px de altura, na largura toda. O título da seção tem 20px e peso 800. As listas (ranking, atividades) são linhas sem borda, com 40px de avatar e 20px de margem lateral.
4. **Números sem caixa.** Os três números do ritmo (`PaceTiles`, `ChainPanel` tiles) ficam lado a lado, sem fundo e sem borda: o valor em 20px, peso 800, e a nota em 12px, na cor secundária.
5. **Recado sem caixa.** O recado de ritmo (`PaceMessage`, `ChainMessage`) vira uma linha com um ícone redondo de 40px à esquerda (fundo `--color-accent-soft`, ícone `--color-accent-ink`), o título em 16px/700 e o texto em 14px na cor secundária.

O resto do app (Perfil, Histórico, formulários) **não muda nesta tarefa**. Por isso, nada de alterar `.panel`, `.tile` ou `.message` globalmente: crie classes novas usadas só na tela Desafio.

## Tokens novos (`src/ui/theme/tokens.css`)

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-hero` | `#c2185b` | `#8e1043` | fundo do topo |
| `--color-on-hero` | `#ffffff` | `#ffffff` | texto principal do topo |
| `--color-on-hero-muted` | `#fde3ee` | `#f6cfdf` | texto secundário do topo (≥4.5:1 sobre o fundo) |
| `--color-sheet` | `#ffffff` | `#19131f` | a folha |
| `--color-band` | `#f5f1f7` | `#110d15` | a faixa entre seções |
| `--color-hairline` | `#efeaf2` | `#2c2337` | fios dentro de listas, quando houver |
| `--radius-sheet` | `28px` | — | só o topo da folha |

As cores de avatar seguem a paleta `TONES` já existente (`src/ui/palette.ts`). Elas usam o par fundo claro + tinta escura no tema claro e o inverso no escuro.

## Fase 1: horas colaborativas sem jornada (esta tarefa)

Na `ChallengeScreen.tsx`, quando o desafio não tem jornada nem corrente:

- **Topo** (`.hero` → novo bloco):
  - A linha da barra superior ("Senhoras" + o menu de opções) fica em branco sobre a cor.
  - Depois vem o rótulo "Horas colaborativas · faltam N dias" (`--color-on-hero-muted`, 13px/600) e o nome do desafio (30px, 800).
  - Em seguida, uma linha com o anel (132px, traço de 12px) e o total ao lado: "38h12" em 40px/800 e "de 60h · programado hoje 42h35" em 14px.
  - O anel tem três camadas: o trilho em branco a 22%, o programado em branco a 45% e o efetivo em branco cheio, com o percentual no centro.
- **O seletor barra/anel/curva sai do topo.** O anel fica fixo no topo. A curva pode virar uma seção da folha mais tarde (fora desta fase); se for simples, deixe o seletor só dentro de uma seção "Andamento" na folha. Na dúvida, mantenha só o anel e registre a decisão.
- **Folha**, em ordem:
  1. Erro ou aviso, se houver.
  2. O convite (`Response`), como está hoje, mas sem caixa: título, texto e botões direto na folha. A barra fixa embaixo é para a fase 2.
  3. O recado de ritmo.
  4. Os três números.
  5. A faixa.
  6. Ranking: o título "Ranking" à esquerda e, à direita, o seletor Horas/Atividades/Dias ativos como texto com uma setinha (um `<select>` estilizado ou um menu). Cada linha mostra o avatar, "1. Ana" e, embaixo, "30% do total · ▲1"; o valor fica à direita.
  7. A faixa.
  8. Atividades: o título e "Ver todas" à direita. Cada linha mostra o avatar, "**Bia** fez 52min de corrida" e "hoje, 7:12" embaixo; o coração e a contagem ficam à direita. O coração aparece cheio, na cor da marca, quando eu já curti.
  9. Os destaques (`Highlights`) entram como mais uma seção, depois de uma faixa, no mesmo estilo de lista.
- **Botão de registrar:** um círculo de 60px na cor do topo, com o ícone de mais e um `aria-label` "Registrar atividade" (o texto já está em `strings.ts`).

Pronto quando: a tela de um desafio de horas sem jornada segue o descrito acima, nos dois temas, sem nenhum `.panel` ou `.tile` com borda; as outras telas continuam iguais; e o typecheck, os testes e `npm run build` passam. Pela exceção de ajustes visuais do CLAUDE.md, não é preciso mexer em `docs/spec/` nem em `docs/ROADMAP.md`.

## Fase 2: os outros estados (outra tarefa)

- **Jornada:**
  - No topo, os km ("154 km" em 48px e "de 240 km"), uma barra branca de 8px com o programado a 40% e a linha "38h12 de 60h · 64%" e "programado: km 171".
  - O mapa entra colado no início da folha, na largura toda, sem caixa, com o botão "Trechos por Senhora" flutuando no canto.
  - "Pelo caminho" vira uma lista com um trilho vertical: a etiqueta em caixa-alta de 12px e o km à direita.
  - O ranking da jornada mostra os km à direita e as horas embaixo deles.
- **Corrente:**
  - No topo, "25 dias seguidos" em 56px e a corrente dos últimos 10 dias desenhada em SVG: elos com contorno branco, o dia em risco tracejado em `--color-accent` e hoje esmaecido.
  - Na folha, o calendário passa a ter círculos de 38px no lugar dos quadrados:
    - dia com elo: cheio na cor da marca;
    - quebra salva: fundo `--color-accent-soft` com borda de 2px de `--color-accent`;
    - dia em risco: borda tracejada;
    - hoje: borda escura;
    - dia que ainda vem: fundo `--color-band`.
  - "Quebras salvas" vira uma lista.
- **Convite pendente:** a pergunta "Topa ser Senhora neste desafio?" vai para uma barra fixa embaixo, com os botões "Fico na torcida" (contorno) e "Topo!" (cheio) lado a lado. A lista de quem já respondeu fica na folha.
- **Resultado:**
  - O topo vira o resultado, com um selo redondo e branco de ✓, "Meta batida!" e a frase. Embaixo vêm três números: total, atividades e um terceiro.
  - Na folha entram o aviso de tolerância, se houver, e "Como a gente chegou lá". **Sem pódio:** uma barra única com o total do grupo, dividida no pedaço de cada Senhora, e uma lista sem posição (bolinha de cor, nome, atividades e horas).
- **Tema escuro:** vem dos tokens. Confira só o contraste do texto secundário sobre o topo.
