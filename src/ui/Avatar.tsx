// A member's round avatar: the Google photo when there is one, the initial otherwise.
import { initial } from './format';

export function Avatar({ name, photoUrl, lead = false, large = false }: { name: string; photoUrl: string | null; lead?: boolean; large?: boolean }) {
  return (
    <div className={`initial${lead ? ' lead' : ''}${large ? ' large' : ''}`} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" /> : initial(name)}
    </div>
  );
}
