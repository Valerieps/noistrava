import { useEffect, type ReactNode } from 'react';
import type { MeView } from '../application/api-contract';
import { canManageGroup } from '../domain/group/roles';
import { strings } from '../domain/strings';
import { useLiveStatus, useServices } from './backend-context';
import { deviceTimezone } from './format';
import { BackIcon, ClockIcon, FlagIcon, PersonIcon } from './icons';
import { Link, navigate, usePath } from './router';
import { ActivityForm } from './screens/ActivityForm';
import { ChallengeForm } from './screens/ChallengeForm';
import { ChallengeScreen } from './screens/ChallengeScreen';
import { Drafts } from './screens/Drafts';
import { History } from './screens/History';
import { Invites } from './screens/Invites';
import { Members } from './screens/Members';
import { Profile } from './screens/Profile';
import { SignIn } from './screens/SignIn';
import { useQuery } from './use-query';

/** The app's screens: the challenge, the history and the profile, with a bottom navigation. */
export function App() {
  const { backend, live } = useServices();
  const me = useQuery('me', {}, ['me']);
  const signedIn = me.data !== undefined && me.error !== 'unauthenticated';

  useEffect(() => {
    if (!signedIn) return;
    live.start();
    return () => live.stop();
  }, [live, signedIn]);

  // The device's zone reaches the server on every open, so the period covers everyone's day.
  const savedZone = me.data?.timezone;
  useEffect(() => {
    if (!signedIn) return;
    const zone = deviceTimezone();
    if (zone && zone !== savedZone) void backend.command('member.setTimezone', { timezone: zone });
  }, [backend, signedIn, savedZone]);

  if (me.loading && !me.data) return null;
  if (!me.data && me.error && me.error !== 'unauthenticated') {
    return (
      <main className="app">
        <p className="notice" role="alert">
          {strings.genericError}
        </p>
        <button type="button" onClick={me.reload}>
          {strings.retry}
        </button>
      </main>
    );
  }
  if (!signedIn) return <SignIn />;

  async function signOut() {
    await backend.signOut();
    navigate('/', { replace: true });
    me.reload();
  }

  return (
    <div className="shell">
      <OfflineNotice />
      <Screen me={me.data} onSignOut={() => void signOut()} />
      <Navigation />
    </div>
  );
}

function Navigation() {
  const path = usePath();
  const section = path.startsWith('/historico') ? '/historico' : ['/perfil', '/integrantes', '/convites'].includes(path) ? '/perfil' : '/';
  const tabs = [
    { path: '/', label: strings.nav.challenge, icon: <FlagIcon /> },
    { path: '/historico', label: strings.nav.history, icon: <ClockIcon /> },
    { path: '/perfil', label: strings.nav.profile, icon: <PersonIcon /> },
  ];
  return (
    <nav className="bottom-nav" aria-label={strings.nav.main}>
      {tabs.map((tab) => (
        <Link key={tab.path} to={tab.path} aria-current={section === tab.path ? 'page' : undefined}>
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function OfflineNotice() {
  const status = useLiveStatus();
  if (status !== 'offline') return null;
  return (
    <p className="notice" role="status">
      {strings.offline}
    </p>
  );
}

/** A screen reached from another one, with a way back. */
export function BackHeader({ title, to }: { title: string; to: string }) {
  return (
    <header className="back-header">
      <Link to={to} className="icon-button" aria-label={strings.nav.back}>
        <BackIcon />
      </Link>
      <h1 className="d">{title}</h1>
    </header>
  );
}

function Sub({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <>
      <BackHeader title={title} to={back} />
      <div className="screen">{children}</div>
    </>
  );
}

function Screen({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const path = usePath();
  if (path === '/historico') return <History />;
  if (path === '/perfil') return <Profile me={me} onSignOut={onSignOut} />;
  if (path === '/integrantes')
    return (
      <Sub title={strings.nav.members} back="/perfil">
        <Members me={me} />
      </Sub>
    );
  if (path === '/convites' && canManageGroup(me))
    return (
      <Sub title={strings.nav.invites} back="/perfil">
        <Invites />
      </Sub>
    );
  if (path === '/rascunhos')
    return (
      <Sub title={strings.drafts.title} back="/">
        <Drafts />
      </Sub>
    );
  if (path === '/desafio/novo') return <ChallengeForm challengeId={null} />;
  const edit = /^\/desafio\/([^/]+)\/editar$/.exec(path);
  if (edit) return <ChallengeForm challengeId={decodeURIComponent(edit[1])} />;
  if (path === '/atividade/nova') return <ActivityForm activityId={null} />;
  const activity = /^\/atividade\/([^/]+)$/.exec(path);
  if (activity) return <ActivityForm activityId={decodeURIComponent(activity[1])} />;
  return <ChallengeScreen me={me} />;
}
