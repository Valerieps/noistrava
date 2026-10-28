// "Configurações": the group's admin pages. For now only the admin reaches it.
import { strings } from '../../domain/strings';
import { ChevronIcon } from '../icons';
import { Link } from '../router';

export function Settings() {
  return (
    <nav className="menu-list" aria-label={strings.nav.settings}>
      <Link to="/integrantes">
        {strings.nav.members}
        <ChevronIcon />
      </Link>
      <Link to="/convites">
        {strings.nav.invites}
        <ChevronIcon />
      </Link>
    </nav>
  );
}
