# Desafio de horas colaborativas

O grupo soma horas de atividade para bater uma meta num período, com ou sem jornada num mapa.

- **Entra aqui:** criar, guardar como rascunho, ativar, responder, editar, cancelar e apagar um desafio; os papéis no desafio; o
  período e os fusos; a meta, a jornada e os marcos; o log de atividades e as reações; o histórico.
- **Não entra aqui:** o que é uma atividade e como ela chega ([atividades.md](atividades.md) e
  [strava.md](strava.md)); os papéis do grupo ([acesso-e-membros.md](acesso-e-membros.md)).

## Em aberto

- [ ] Quais notificações existem e quando chegam (marcos, novas atividades, lembretes, fim)?

## Papéis no desafio

| Papel | O que pode |
| --- | --- |
| Criador | Editar o desafio até o término; cancelar. Pode também ser Senhora |
| Senhora | Ter as atividades contadas, registrar e editar as próprias atividades, reagir |
| Torcida | Ver tudo do desafio e reagir. Não registra nem edita nada nele |

- Qualquer integrante pode criar um desafio. *(1)*
- Ao criar, eu digo se também sou Senhora. *(1)*
- Quem ainda não respondeu ao convite do desafio vê tudo como a torcida. *(1)*

## Criar

- Só existe um desafio ativo por vez no grupo. Enquanto houver um ativo e não terminado, o que eu
  crio fica como rascunho (ver "Rascunhos"). *(1)*
- Ao criar, eu escolho entre salvar como rascunho e criar já ativo. Criar já ativo só aparece
  quando não há desafio ativo. *(1)*
- O desafio é do tipo "Horas colaborativas" e tem um nome dado por quem cria. *(1)*
- Eu escolho o início, o término e a meta em horas. Com jornada, a meta é a distância da rota (ver
  "Jornada"). *(1)*
- A meta é um número inteiro de horas, de 1 a 10.000. *(1)*
- O início pode ser uma data que já passou; o término não. *(1)*
- Ao criar já ativo, todas as integrantes recebem o convite para o desafio. *(1)*

## Rascunhos

- Cada integrante pode ter quantos rascunhos quiser. *(1)*
- Só quem criou vê o rascunho; para as outras ele não existe até ser ativado. *(1)*
- Salvar um rascunho confere só o formato do nome, das datas e da meta; o término pode já ter
  passado. *(1)*
- Num rascunho com jornada, eu posso salvar sem a rota (por exemplo, se o mapa não responder) e
  calcular depois. *(1)*
- Digo se sou Senhora ao criar o rascunho, e posso mudar enquanto ele for rascunho. *(1)*
- Eu edito o rascunho à vontade e posso apagá-lo sem o admin. *(1)*
  Por quê: ninguém mais viu o rascunho.
- O rascunho vira desafio quando eu toco em "Ativar". Só dá para ativar quando não há desafio
  ativo, e valem todas as regras de "Criar": o término não pode ter passado e a jornada precisa da
  rota. *(1)*
- Um desafio deixa de estar ativo assim que termina (meta batida, fim do período ou cancelamento).
  As 24 horas de tolerância só recebem as atividades atrasadas e não impedem ativar outro. *(1)*
- O convite vai para todas as integrantes na hora em que eu ativo, e o período é calculado com os
  fusos de quem está no grupo nesse momento. *(1)*

## Responder ao convite

- Cada integrante aceita (vira Senhora) ou recusa (vira torcida). Não há prazo. *(1)*
- O desafio começa na hora marcada, mesmo que alguém ainda não tenha respondido. *(1)*
- Quem aceita depois do início entra no desafio, e as atividades dela desde o início do desafio
  contam. *(1)*
- Quem está na torcida pode virar Senhora enquanto o desafio não terminou, com a mesma regra. *(1)*
- Uma Senhora pode sair do desafio. As horas dela até ali continuam contando; as atividades
  seguintes não contam mais. *(1)*
- Se eu saio e depois volto, contam as minhas atividades de antes da saída e as de depois da volta;
  as do tempo em que fiquei fora, não. *(1)*
- Quem entra no grupo durante um desafio vê tudo como a torcida e pode aceitar, com a mesma regra. *(1)*
- Depois do término, ninguém muda mais a resposta. *(1)*

## Período e fusos

- O início vale no fuso mais adiantado entre as integrantes, e o término no fuso mais atrasado.
  Por exemplo, com GMT-3 e GMT-7, um desafio de segunda 0h a domingo 24h começa segunda 0h em
  GMT-3 e termina domingo 24h em GMT-7. *(1)*
  Por quê: assim o período cobre o dia inteiro de todas.
- Conta a atividade que começa dentro do período. *(1)*
- Enquanto nenhuma integrante tem fuso, o período vale em UTC. *(1)*

## Meta e término

- Todo minuto de atividade de cada Senhora soma no total do grupo. *(1)*
- Quando o total chega à meta, o desafio termina na hora, com sucesso. *(1)*
- Se o período acaba antes, o desafio termina sem sucesso e mostra o percentual atingido. *(1)*
- Depois do término, as Senhoras ainda têm 24 horas para atividades atrasadas ou editadas que
  começaram dentro do período (por exemplo, um Strava que sincronizou tarde). Ao fim dessas 24
  horas, o resultado fica fechado. *(1)*
- Nessas 24 horas, o resultado acompanha o total: se atividades atrasadas fizerem o total chegar à
  meta, o desafio passa a ter sucesso; se uma edição ou exclusão deixar o total abaixo da meta, ele
  volta a ficar sem sucesso. *(1)*
- Quando a meta é batida antes do fim do período, contam só as atividades que começaram antes desse
  momento. *(1)*
- Os marcos são 25%, 50% e 75% da meta. *(1)*

## Jornada

- Ao criar, eu escolho se o desafio tem jornada. *(1)*
- Com jornada, eu escolho o ponto de partida e o de chegada buscando lugares no mapa, e o app
  calcula a rota de carro entre eles. A meta é a distância da rota. *(1)*
- Eu busco cada lugar pelo nome e escolho entre até 5 resultados. *(1)*
- O app escolhe sozinho as paradas no caminho; eu não acrescento nem tiro paradas. Cada parada é um
  marco, além de 25%, 50% e 75%. *(1)*
- O número de paradas depende da distância: uma a cada 25 km de rota, no máximo 8. Uma rota com
  menos de 25 km não tem parada. *(1)*
- O app divide a rota em trechos iguais e, em cada um, escolhe a maior cidade a até 10 km da rota;
  onde não há cidade, um ponto turístico famoso (com página na Wikipédia); onde não há nenhum dos
  dois, o trecho fica sem parada. Um lugar não se repete. *(1)*
- A rota não muda por causa das paradas: cada parada fica no ponto da rota mais perto dela. *(1)*
- Se a busca ou o cálculo da rota não responder, eu tento de novo mais tarde; um desafio em
  andamento continua com a rota guardada. Se só a busca das paradas não responder, a rota fica sem
  paradas, e eu posso calcular de novo. *(1)*
- Cada hora de atividade vale 5 km na jornada, para todas as modalidades. O app mostra também a
  meta equivalente em horas. *(1)*
- O mapa mostra a rota e onde o grupo está nela. *(1)*

## Andamento

- Eu vejo o total do grupo e o percentual da meta, comparados com o programado: onde a gente
  estaria hoje dividindo a meta igualmente pelo período. *(1)*
- Eu escolho ver o andamento como barra, anel ou curva acumulada; o meu aparelho lembra a escolha. *(1)*
- Embaixo vem sempre uma frase que chama para a ação, nunca uma cobrança: à frente do ritmo, no
  ritmo, atrás do ritmo ou na reta final. *(1)*
- Sem jornada, eu vejo quanto o grupo precisa por dia para bater a meta, a média por dia até aqui e
  a diferença entre as duas. *(1)*
- Há um ranking das Senhoras, por horas, por número de atividades ou por dias ativos, com quem
  subiu ou desceu nas últimas 24 horas e quem está na torcida. *(1)*
- Sem jornada, há destaques: a maior atividade, o dia mais forte, a sequência de dias em que alguém
  se mexeu, os fusos em ação e a parte de cada modalidade. *(1)*
- Com jornada, eu vejo a linha do caminho com as paradas e os marcos, e o ranking
  mostra quem levou o grupo mais longe, em km. *(1)*

## Editar, cancelar e apagar

- O criador edita o nome, o início, o término, a meta e a jornada a qualquer momento antes do
  término. Depois do término, nada muda. *(1)*
- Marcos já atingidos continuam atingidos, mesmo que a meta ou a rota mude. *(1)*
  Por quê: uma meta ou rota nova não deve apagar um marco que o grupo já celebrou.
- O criador pode cancelar o desafio antes do término. Um desafio cancelado fica no histórico como
  cancelado. *(1)*
- Ao cancelar, o resultado fecha na hora, com os totais de cada Senhora até ali, sem as 24 horas de
  tolerância. *(1)*
- Só o admin apaga um desafio, depois de confirmar. O rascunho, quem criou apaga. *(1)*

## Log de atividades e reações

- O desafio mostra o log das atividades das Senhoras: quem, quando, quanto tempo e a modalidade. *(1)*
- Qualquer integrante, inclusive a torcida, pode reagir com um coração a uma atividade do log, e
  tirar o próprio coração. *(1)*

## Histórico

- Eu vejo a lista dos desafios passados, com o resultado, o total, o percentual e o total de cada
  Senhora. *(1)*
- Esses totais ficam guardados mesmo se alguém sair do grupo. *(1)*
