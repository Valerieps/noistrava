import { useEffect } from 'react';
import type { MeView } from '../application/api-contract';
import { canManageGroup } from '../domain/group/roles';
import { strings } from '../domain/strings';
import { useLiveStatus, useServices } from './backend-context';
import { Link, navigate, usePath } from './router';
import { Home } from './screens/Home';
import { Invites } from './screens/Invites';
import { Members } from './screens/Members';
import { SignIn } from './screens/SignIn';
import { useQuery } from './use-query';

/** The app's screens. Replace Home with the app's first real screen (BOOTSTRAP.md). */
export function App() {
  const { backend, live } = useServices();
  const me = useQuery('me', {}, ['me']);
  const signedIn = me.data !== undefined && me.error !== 'unauthenticated';

  useEffect(() => {
    if (!signedIn) return;
    live.start();
    return () => live.stop();
  }, [live, signedIn]);

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
    <div className="app">
      <Navigation me={me.data} onSignOut={() => void signOut()} />
      <OfflineNotice />
      <Screen me={me.data} />
    </div>
  );
}

function Navigation({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const path = usePath();
  const tabs = [
    { path: '/', label: strings.nav.home },
    { path: '/membros', label: strings.nav.members },
    ...(canManageGroup(me) ? [{ path: '/convites', label: strings.nav.invites }] : []),
  ];
  return (
    <nav className="row tabs" aria-label={strings.nav.main}>
      {tabs.map((tab) => (
        <Link key={tab.path} to={tab.path} aria-current={path === tab.path ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
      <span className="grow" />
      <button type="button" className="secondary" onClick={onSignOut}>
        {strings.nav.signOut}
      </button>
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

function Screen({ me }: { me: MeView }) {
  const path = usePath();
  if (path === '/membros') return <Members me={me} />;
  if (path === '/convites' && canManageGroup(me)) return <Invites />;
  return <Home me={me} />;
}
