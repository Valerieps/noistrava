// "Ranking das Senhoras" (by hours, activities or active days) and, on a journey, "Quem levou o
// grupo mais longe". Both read the challenge's log; the footer says who passed whom and who is in
// the torcida.
import { useState } from 'react';
import type { ChallengeMemberView, LogEntryView } from '../../../application/api-contract';
import { daysElapsed, formatDuration, latestOvertake, ranking, secondsToKm, type Period, type RankingKind } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatKm, initial } from '../../format';

const KINDS: RankingKind[] = ['hours', 'activities', 'constancy'];

/** Who shows in the ranking: Senhoras now, and those who left with hours that still count. */
export function senhorasOf(members: readonly ChallengeMemberView[]): ChallengeMemberView[] {
  return members.filter((m) => m.response === 'accepted' || m.totalSeconds > 0);
}

function Footer({ members, rows }: { members: readonly ChallengeMemberView[]; rows: ReturnType<typeof ranking> }) {
  const parts: string[] = [];
  const overtake = latestOvertake(rows);
  if (overtake) parts.push(strings.challenge.ranking.overtake(overtake.passer, overtake.passed));
  else if (rows.length >= 2 && rows[0].value > rows[1].value)
    parts.push(strings.challenge.ranking.gap(rows[1].name, formatDuration(rows[0].value - rows[1].value), rows[0].name));
  const torcida = members.filter((m) => m.response === 'declined' && m.totalSeconds === 0).map((m) => m.name);
  const pending = members.filter((m) => m.response === 'pending').map((m) => m.name);
  if (torcida.length) parts.push(strings.challenge.ranking.torcida(torcida.join(', ')));
  if (pending.length) parts.push(strings.challenge.ranking.pending(pending.join(', ')));
  if (parts.length === 0) return null;
  return <div className="panel-foot">{parts.join(' ')}</div>;
}

function Avatar({ name, photoUrl, lead }: { name: string; photoUrl: string | null; lead: boolean }) {
  return (
    <div className={`initial${lead ? ' lead' : ''}`} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" /> : initial(name)}
    </div>
  );
}

function Move({ move }: { move: number }) {
  if (move === 0) return null;
  return <span className={`move${move > 0 ? ' up' : ''}`}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>;
}

export function Ranking({ members, log, period, now }: { members: readonly ChallengeMemberView[]; log: readonly LogEntryView[]; period: Period; now: Date }) {
  const [kind, setKind] = useState<RankingKind>('hours');
  const senhoras = senhorasOf(members);
  const rows = ranking(senhoras, log, kind, now);
  const hoursRows = kind === 'hours' ? rows : ranking(senhoras, log, 'hours', now);
  const total = log.reduce((sum, a) => sum + a.durationSeconds, 0);
  const max = rows[0]?.value || 1;
  const days = Math.max(1, daysElapsed(period, now));
  const photo = new Map(members.map((m) => [m.memberId, m.photoUrl]));

  const value = (v: number) => (kind === 'hours' ? formatDuration(v) : kind === 'activities' ? String(v) : `${v}/${days}`);
  const sub = (v: number) =>
    kind === 'hours' ? strings.challenge.ranking.shareOfTotal(total ? Math.round((v / total) * 100) : 0) : kind === 'activities' ? strings.challenge.ranking.activities : strings.challenge.ranking.activeDays;

  return (
    <section className="panel">
      <h2 className="d">{strings.challenge.ranking.title}</h2>
      <div role="tablist" className="pills">
        {KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {strings.challenge.ranking.tabs[k]}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="muted small">{strings.challenge.ranking.empty}</p>}
      <div className="stack" role="tabpanel">
        {rows.map((r, i) => (
          <div key={r.memberId} className="rank-row">
            <div className="d muted text-md">
              {i + 1}
            </div>
            <Avatar name={r.name} photoUrl={photo.get(r.memberId) ?? null} lead={i === 0 && r.value > 0} />
            <div className="stack" style={{ gap: 5, minWidth: 0 }}>
              <div className="rank-name ellipsis">
                {r.name} {kind === 'hours' && <Move move={r.move} />}
              </div>
              <div className="meter">
                <div className={i === 0 ? 'lead' : ''} style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
              </div>
            </div>
            <div className="right">
              <div className="d text-md">
                {value(r.value)}
              </div>
              <div className="tiny muted">{sub(r.value)}</div>
            </div>
          </div>
        ))}
      </div>
      <Footer members={members} rows={hoursRows} />
    </section>
  );
}

export function JourneyRanking({ members, log, now }: { members: readonly ChallengeMemberView[]; log: readonly LogEntryView[]; now: Date }) {
  const rows = ranking(senhorasOf(members), log, 'hours', now);
  const total = log.reduce((sum, a) => sum + a.durationSeconds, 0);
  const photo = new Map(members.map((m) => [m.memberId, m.photoUrl]));
  return (
    <section className="panel" style={{ gap: 12 }}>
      <h2 className="d">{strings.journey.rankingTitle}</h2>
      {rows.length === 0 && <p className="muted small">{strings.challenge.ranking.empty}</p>}
      {rows.map((r, i) => (
        <div key={r.memberId} className="rank-row">
          <div className="d muted text-md">
            {i + 1}
          </div>
          <Avatar name={r.name} photoUrl={photo.get(r.memberId) ?? null} lead={i === 0 && r.value > 0} />
          <div style={{ minWidth: 0 }}>
            <div className="rank-name ellipsis">
              {r.name} <Move move={r.move} />
            </div>
            <div className="tiny muted">{strings.challenge.ranking.shareOfTotal(total ? Math.round((r.value / total) * 100) : 0)}</div>
          </div>
          <div className="right">
            <div className="d text-md">
              {formatKm(secondsToKm(r.value))}
            </div>
            <div className="tiny muted">{formatDuration(r.value)}</div>
          </div>
        </div>
      ))}
      <Footer members={members} rows={rows} />
    </section>
  );
}
