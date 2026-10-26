// Every user-facing text, in Brazilian Portuguese, in the app's voice (docs/GLOSSARIO.md has the
// terms). The UI imports from here; it never writes its own text.
export const strings = {
  appName: 'Senhoras',
  genericError: 'Algo deu errado. Tenta de novo?',
  retry: 'Tentar de novo',
  forbidden: 'Você não tem permissão para isso.',
  offline: 'Sem conexão. Mostrando o último estado carregado.',

  signIn: {
    tagline: 'Desafios coletivos de horas de exercício. Cada minuto de cada Senhora soma.',
    button: 'Entrar com Google',
    noInvite: 'Não há convite para esse e-mail. Peça a um admin para te convidar.',
    failed: 'O login não deu certo. Tenta de novo?',
    devTitle: 'Entrar sem Google (só para testes neste computador)',
    devEmail: 'E-mail',
    devName: 'Nome',
    devButton: 'Entrar para testar',
    devHint: 'Precisa de DEV_SIGN_IN=1 no .dev.vars. As mesmas regras de convite valem.',
    devOff: 'O login de teste está desligado. Ponha DEV_SIGN_IN=1 no .dev.vars e reinicie o servidor.',
  },

  nav: {
    main: 'Navegação principal',
    home: 'Início',
    members: 'Integrantes',
    invites: 'Convites',
    signOut: 'Sair',
  },

  home: {
    greeting: (greeting: string, name: string) => `${greeting}, ${name}!`,
    nameLabel: 'Meu nome',
    save: 'Salvar',
  },

  invites: {
    title: 'Convites',
    emailLabel: 'E-mail da conta Google',
    send: 'Convidar',
    revoke: 'Revogar',
    pending: 'Pendente',
    accepted: 'Aceito',
    revoked: 'Revogado',
    invalidEmail: 'Esse e-mail não parece certo.',
    alreadyMember: 'Essa pessoa já é integrante do grupo.',
    empty: 'Nenhum convite ainda.',
  },

  members: {
    title: 'Integrantes',
    you: '(você)',
    admin: 'Admin',
    member: 'Integrante',
    makeAdmin: 'Admin',
    rolesOf: (name: string) => `Papéis de ${name}`,
    lastAdmin: 'O grupo precisa de pelo menos um admin. Dê o papel a outra pessoa antes.',
    remove: 'Remover',
    removeOf: (name: string) => `Remover ${name} do grupo`,
    removeConfirm: (name: string) => `Remover ${name} do grupo? O acesso acaba na hora. Para voltar, é só convidar de novo.`,
    empty: 'Só você por aqui. Convide alguém!',
  },
} as const;
