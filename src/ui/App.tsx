import { useEffect, type ReactNode } from 'react';
import type { MeView } from '../application/api-contract';
import { canManageGroup } from '../domain/group/roles';
import { strings } from '../domain/strings';
import { useLiveStatus, useServices } from './backend-context';
import { quarterStage } from '../domain/seasons/stages';
import { deviceTimezone, todayDate } from './format';
import { BackIcon, BellIcon, ClockIcon, FlagIcon, GearIcon, PersonIcon, SeasonIcon } from './icons';
import { Link, navigate, usePath } from './router';
import { ActivityForm } from './screens/ActivityForm';
import { ActivityTemplateForm, ActivityTemplates } from './screens/ActivityTemplates';
import { ChallengeForm } from './screens/ChallengeForm';
import { ChallengeScreen } from './screens/ChallengeScreen';
import { Drafts } from './screens/Drafts';
import { History } from './screens/History';
import { Invites } from './screens/Invites';
import { Members } from './screens/Members';
import { Notifications } from './screens/Notifications';
import { MyActivities, NameForm, Profile } from './screens/Profile';
import { BadgesScreen } from './screens/profile/Badges';
import { CircuitScreen, SeasonStage, SeasonsTab, YearScreen } from './screens/Seasons';
import { Settings, SettingsHero } from './screens/Settings';
import { SignIn } from './screens/SignIn';
import { StravaConnect } from './screens/StravaConnect';
import { useQuery } from './use-query';

/** The app's screens: the challenge, the Estações, the history and the profile, with a top bar and a bottom navigation. */
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
      <TopBar />
      <Screen me={me.data} onSignOut={() => void signOut()} />
      <Navigation />
    </div>
  );
}

function Navigation() {
  const path = usePath();
  const section = path.startsWith('/historico')
    ? '/historico'
    : path.startsWith('/perfil')
      ? '/perfil'
      : path.startsWith('/estacoes')
        ? '/estacoes'
        : SETTINGS_PATHS.includes(path)
          ? null
          : '/';
  // The tab's icon is the season of the stage in progress, colored while the tab is open.
  const season = quarterStage(todayDate()).season;
  const tabs = [
    { path: '/', label: strings.nav.challenge, icon: <FlagIcon /> },
    { path: '/estacoes', label: strings.seasons.tab, icon: <SeasonIcon season={season} plain={section !== '/estacoes'} /> },
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

const TAB_PATHS = ['/', '/estacoes', '/historico', '/perfil'];
const SETTINGS_PATHS = ['/notificacoes', '/configuracoes', '/configuracoes/nome', '/configuracoes/strava', '/integrantes', '/convites'];

/** The app's name and the ways to the notifications and the settings. Only on the tab screens. */
function TopBar() {
  const path = usePath();
  if (!TAB_PATHS.includes(path)) return null;
  return (
    <header className="top-bar">
      <span className="d top-bar-name">{strings.appName}</span>
      <div className="top-bar-actions">
        <Link to="/notificacoes" className="icon-button" aria-label={strings.nav.notifications}>
          <BellIcon />
        </Link>
        <Link to="/configuracoes" className="icon-button" aria-label={strings.nav.settings}>
          <GearIcon />
        </Link>
      </div>
    </header>
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
export function BackHeader({ title, to, back = false }: { title: string; to: string; back?: boolean }) {
  return (
    <header className="back-header">
      <Link to={to} back={back} className="icon-button" aria-label={strings.nav.back}>
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

/** A screen reached from the profile or the settings: a short hero with the way back, then the sheet. */
function SheetSub({
  title,
  back,
  backInHistory = false,
  hero,
  children,
}: {
  title: string;
  back: string;
  /** Return to the previous screen instead, with `back` as the fallback. */
  backInHistory?: boolean;
  hero?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="hero-c hero-c-dots hero-c-short">
        <div className="hero-c-head">
          <div className="hero-c-back">
            <Link to={back} back={backInHistory} className="icon-button" aria-label={strings.nav.back}>
              <BackIcon />
            </Link>
            <h1 className="d">{title}</h1>
          </div>
          {hero}
        </div>
      </header>
      <div className="sheet">{children}</div>
    </>
  );
}

function Screen({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const path = usePath();
  if (path === '/historico') return <History />;
  if (path === '/perfil') return <Profile me={me} />;
  if (path === '/estacoes') return <SeasonsTab />;
  const seasonStage = /^\/estacoes\/etapa\/([^/]+)$/.exec(path);
  if (seasonStage) return <SeasonStage key={seasonStage[1]} stageKey={decodeURIComponent(seasonStage[1])} />;
  const seasonYear = /^\/estacoes\/ano\/(\d{4})$/.exec(path);
  if (seasonYear) return <YearScreen key={seasonYear[1]} year={Number(seasonYear[1])} />;
  const myCircuit = /^\/perfil\/circuito(?:\/(\d{4}))?$/.exec(path);
  if (myCircuit) return <CircuitScreen key={path} year={myCircuit[1] ? Number(myCircuit[1]) : undefined} back="/perfil" />;
  const circuit = /^\/estacoes\/circuito\/([^/]+)(?:\/(\d{4}))?$/.exec(path);
  if (circuit)
    return <CircuitScreen key={path} memberId={decodeURIComponent(circuit[1])} year={circuit[2] ? Number(circuit[2]) : undefined} back="/estacoes" />;
  if (path === '/perfil/selos')
    return (
      <SheetSub title={strings.tracking.badgesTitle} back="/perfil">
        <BadgesScreen />
      </SheetSub>
    );
  if (path === '/perfil/atividades')
    return (
      <SheetSub title={strings.profile.activities} back="/perfil">
        <MyActivities />
      </SheetSub>
    );
  if (path === '/perfil/modelos')
    return (
      <SheetSub title={strings.templates.title} back="/perfil" backInHistory={new URLSearchParams(window.location.search).get('de') === 'registro'}>
        <ActivityTemplates />
      </SheetSub>
    );
  if (path === '/configuracoes/nome')
    return (
      <SheetSub title={strings.profile.nameRow} back="/configuracoes">
        <NameForm me={me} />
      </SheetSub>
    );
  if (path === '/configuracoes/strava')
    return (
      <SheetSub title={strings.profile.strava} back="/configuracoes">
        <div className="sheet-section">
          <StravaConnect />
        </div>
      </SheetSub>
    );
  if (path === '/notificacoes')
    return (
      <SheetSub title={strings.nav.notifications} back="/">
        <Notifications />
      </SheetSub>
    );
  if (path === '/configuracoes')
    return (
      <SheetSub title={strings.nav.settings} back="/" hero={<SettingsHero me={me} />}>
        <Settings me={me} onSignOut={onSignOut} />
      </SheetSub>
    );
  if (path === '/integrantes' && canManageGroup(me))
    return (
      <Sub title={strings.nav.members} back="/configuracoes">
        <Members me={me} />
      </Sub>
    );
  if (path === '/convites' && canManageGroup(me))
    return (
      <Sub title={strings.nav.invites} back="/configuracoes">
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
  if (path === '/modelo/novo') return <ActivityTemplateForm templateId={null} />;
  const template = /^\/modelo\/([^/]+)$/.exec(path);
  if (template) return <ActivityTemplateForm templateId={decodeURIComponent(template[1])} />;
  if (path === '/atividade/nova') return <ActivityForm activityId={null} />;
  const activity = /^\/atividade\/([^/]+)$/.exec(path);
  if (activity) return <ActivityForm activityId={decodeURIComponent(activity[1])} />;
  return <ChallengeScreen me={me} />;
}
