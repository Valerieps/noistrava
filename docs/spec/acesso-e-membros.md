# Acesso e membros

Quem entra no app, como entra e o que cada papel pode fazer. Já vem construído no template; o
`BOOTSTRAP.md` ajusta as regras às respostas da dona.

- **Entra aqui:** login, convites, papéis, a lista de membros, remover membro e o nome no perfil.
- **Não entra aqui:** as features do app em si (cada uma no seu arquivo de `spec/`).

## Em aberto

- [ ] Que papéis o app tem além de admin e membro, e o que cada um pode?

## Entrar

- Eu entro só com minha conta Google. Não há login com senha. *(1)*
- Só entra quem tem convite para o e-mail da conta Google. Com outro e-mail, o app avisa que não há
  convite e não cria a conta. *(1)*
- Os primeiros admins entram sem convite, pelos e-mails configurados no servidor, só enquanto o
  grupo não tem nenhum admin. *(1)*
- Eu continuo conectada por 180 dias, até sair. *(1)*

## Papéis

| Papel | O que pode |
| --- | --- |
| Membro | Usar o app e ver a lista de membros |
| Admin | Tudo do membro; convidar e remover membros; dar e tirar o papel de admin |

- Pode haver mais de um admin. O app não deixa tirar o papel do último. *(1)*

## Membros

- Todos os membros veem a lista do grupo, com nome, foto e papéis. O e-mail de cada um só o admin
  vê. *(1)*
- O admin remove um membro depois de confirmar. Ele não remove a si mesmo: outro admin faz isso.
  Assim sempre sobra um admin. *(1)*
- Quem é removido perde o acesso na hora, inclusive no app aberto. Um convite novo traz a pessoa de
  volta, com o mesmo histórico. *(1)*

## Perfil

- Meu nome começa como o da conta Google, e eu posso mudar. Ele tem de 1 a 40 caracteres. *(1)*
- A foto é a da conta Google e se atualiza a cada login. *(1)*

## Convites

- O admin convida uma pessoa pelo e-mail dela. O convite fica ligado a esse e-mail e só vale para
  quem entra com a conta Google dele. *(1)*
- O convite não expira. Ele deixa de valer só quando o admin o revoga. *(1)*
- O admin vê a lista de convites pendentes e aceitos e pode revogar um pendente. *(1)*
