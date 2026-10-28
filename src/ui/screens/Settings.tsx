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

export function Settings({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const strava = useQuery('strava', {}, ['strava']);
  const p = strings.profile;
  const s = strings.settings;
  return (
    <>
      <nav className="menu-list" aria-label={s.account}>
        <Link to="/configuracoes/nome">
          {p.nameRow}
          <span className="muted ellipsis">{me.name}</span>
        </Link>
        <Link to="/configuracoes/strava">
          {p.strava}
          {strava.data && <span className={`status-pill${strava.data.connected ? ' ok' : ''}`}>{strava.data.connected ? p.stravaConnected : p.stravaDisconnected}</span>}
        </Link>
      </nav>
      <ThemePicker />
      {canManageGroup(me) && (
        <nav className="menu-list" aria-label={s.group}>
          <Link to="/integrantes">
            {strings.nav.members}
            <ChevronIcon />
          </Link>
          <Link to="/convites">
            {strings.nav.invites}
            <ChevronIcon />
          </Link>
        </nav>
      )}
      <nav className="menu-list" aria-label={strings.nav.signOut}>
        <button type="button" className="danger-text" onClick={onSignOut}>
          {strings.nav.signOut}
        </button>
      </nav>
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
    <section className="panel">
      <h2 className="d text-md">{s.theme}</h2>
      <div role="radiogroup" aria-label={s.theme} className="segmented" style={{ alignSelf: 'stretch' }}>
        {THEME_CHOICES.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={theme === choice} onClick={() => pick(choice)} style={{ flex: 1, width: 'auto', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
            {s.themes[choice]}
          </button>
        ))}
      </div>
    </section>
  );
}
