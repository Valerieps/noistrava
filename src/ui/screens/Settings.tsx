// "Configurações", from the gear in the top bar: my name, the Strava connection and the theme for
// everyone; the members and the invites for the admin; and signing out.
import { useState } from 'react';
import type { MeView } from '../../application/api-contract';
import { canManageGroup } from '../../domain/group/roles';
import { strings } from '../../domain/strings';
import { ChevronIcon } from '../icons';
import { Link } from '../router';
import { saveTheme, savedTheme, THEME_CHOICES, type ThemeChoice } from '../theme/preference';
import { useQuery } from '../use-query';
import { Photo } from './Profile';

/** My photo and name, on the settings' hero. */
export function SettingsHero({ me }: { me: MeView }) {
  return (
    <div className="hero-who">
      <Photo me={me} size={52} />
      <span className="d hero-who-name compact ellipsis">{me.name}</span>
    </div>
  );
}

export function Settings({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const strava = useQuery('strava', {}, ['strava']);
  const p = strings.profile;
  const s = strings.settings;
  const band = <div className="sheet-band" />;
  return (
    <>
      <nav className="sheet-menu" aria-labelledby="settings-account">
        <h2 id="settings-account" className="sheet-menu-label">
          {s.account}
        </h2>
        <Link to="/configuracoes/nome" className="sheet-menu-row">
          <span>{p.nameRow}</span>
          <span className="sheet-menu-value ellipsis">{me.name}</span>
          <ChevronIcon />
        </Link>
        <Link to="/configuracoes/strava" className="sheet-menu-row">
          <span>{p.strava}</span>
          {strava.data && <span className={`status-pill${strava.data.connected ? ' ok' : ''}`}>{strava.data.connected ? p.stravaConnected : p.stravaDisconnected}</span>}
          <ChevronIcon />
        </Link>
      </nav>
      {band}
      <ThemePicker />
      {canManageGroup(me) && (
        <>
          {band}
          <nav className="sheet-menu" aria-labelledby="settings-group">
            <h2 id="settings-group" className="sheet-menu-label">
              {s.group}
            </h2>
            <Link to="/integrantes" className="sheet-menu-row">
              <span>{strings.nav.members}</span>
              <ChevronIcon />
            </Link>
            <Link to="/convites" className="sheet-menu-row">
              <span>{strings.nav.invites}</span>
              <ChevronIcon />
            </Link>
          </nav>
        </>
      )}
      {band}
      <div className="sheet-menu">
        <button type="button" className="sheet-menu-row danger" onClick={onSignOut}>
          {strings.nav.signOut}
        </button>
      </div>
    </>
  );
}

function ThemePicker() {
  const [theme, setTheme] = useState<ThemeChoice>(savedTheme);
  const s = strings.settings;

  function pick(next: ThemeChoice) {
    setTheme(next);
    saveTheme(next);
  }

  return (
    <section className="sheet-menu theme-picker">
      <h2 id="settings-theme" className="sheet-menu-label">
        {s.theme}
      </h2>
      <div role="radiogroup" aria-labelledby="settings-theme" className="sheet-segmented">
        {THEME_CHOICES.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={theme === choice} onClick={() => pick(choice)}>
            {s.themes[choice]}
          </button>
        ))}
      </div>
    </section>
  );
}
