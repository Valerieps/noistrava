// The badges (docs/spec/acompanhamento.md, "Selos"): the next one on the profile, and every one in a
// grid on its own screen, earned with the date, missing with what it takes.
import type { BadgeStatus } from '../../../domain/tracking/tracking';
import { strings } from '../../../domain/strings';
import { formatDate } from '../../format';
import { BadgeIcon } from '../../icons';
import { useQuery } from '../../use-query';

const TOPICS = ['activities', 'challenge', 'history'] as const;

function Progress({ done, goal }: { done: number; goal: number }) {
  return (
    <span className="badge-progress" role="presentation">
      <span style={{ width: `${Math.round((done / goal) * 100)}%` }} />
    </span>
  );
}

export function NextBadge({ badge }: { badge: BadgeStatus }) {
  const t = strings.tracking;
  const { done, goal } = badge.progress!;
  return (
    <section className="sheet-section next-badge">
      <span className="next-badge-icon">
        <BadgeIcon badge={badge.key} size={22} />
      </span>
      <div className="grow stack" style={{ gap: 6, minWidth: 0 }}>
        <div className="next-badge-top">
          <b>{t.badges[badge.key].name}</b>
          <span className="next-badge-tag">{t.nextBadge}</span>
        </div>
        <Progress done={done} goal={goal} />
        <span className="small muted">{t.missing[badge.key](goal - done)}</span>
      </div>
    </section>
  );
}

export function EarnedBadges({ badges }: { badges: readonly BadgeStatus[] }) {
  const t = strings.tracking;
  const earned = badges.filter((b) => b.earnedAt !== null);
  if (earned.length === 0)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        {t.badgesEmpty}
      </p>
    );
  return (
    <ul className="badge-grid">
      {earned.map((b) => (
        <li key={b.key} className="badge-card earned">
          <span className="badge-circle">
            <BadgeIcon badge={b.key} size={24} />
          </span>
          <b>{t.badges[b.key].name}</b>
          <span className="tiny muted">{t.earnedOn(formatDate(b.earnedAt!))}</span>
        </li>
      ))}
    </ul>
  );
}

export function BadgesScreen() {
  const tracking = useQuery('tracking', {}, TOPICS);
  const t = strings.tracking;
  if (!tracking.data) return null;
  return (
    <div className="sheet-section">
      <ul className="badge-grid">
        {tracking.data.badges.map((b) => {
          const earned = b.earnedAt !== null;
          return (
            <li key={b.key} className={`badge-card${earned ? ' earned' : ''}`}>
              <span className="badge-circle">
                <BadgeIcon badge={b.key} size={24} />
              </span>
              <b>{t.badges[b.key].name}</b>
              <span className="tiny muted">{earned ? t.earnedOn(formatDate(b.earnedAt!)) : t.badges[b.key].how}</span>
              {!earned && b.progress && (
                <>
                  <Progress done={b.progress.done} goal={b.progress.goal} />
                  <span className="tiny muted">{t.progress(b.progress.done, b.progress.goal)}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
