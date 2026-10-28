// A challenge that ended (docs/spec/desafio-horas.md, "Meta e término"; docs/spec/desafio-corrente.md,
// "Término"): the result in the top with three numbers, and on the sheet the tolerance notice and how
// each Senhora's share made the group total. No positions: the result is the group's.
import type { ChallengeView, LogEntryView } from '../../../application/api-contract';
import { daysEarly, formatDuration, formatGoal, secondsToKm, shares } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatDateTime, formatKm } from '../../format';
import { CheckIcon, ClockIcon, FlagIcon } from '../../icons';
import { TONES } from '../../palette';
import { senhorasOf } from './Ranking';

const DAY = 86_400_000;

interface HeroNumber {
  readonly value: string;
  readonly note: string;
}

function resultText(challenge: ChallengeView): { title: string; body: string } {
  const chain = challenge.chain;
  if (chain && challenge.state !== 'cancelled') {
    const r = strings.chain.result;
    return challenge.state === 'succeeded'
      ? { title: r.succeeded, body: r.succeededBody(chain.saved) }
      : { title: r.failed, body: r.failedBody(chain.lost, chain.allowedBreaks) };
  }
  const r = strings.challenge.result;
  const days = challenge.endedAt ? Math.max(1, Math.ceil((Date.parse(challenge.endedAt) - Date.parse(challenge.startsAt)) / DAY)) : 0;
  if (challenge.state === 'succeeded') return { title: r.succeeded, body: r.succeededBody(days) };
  if (challenge.state === 'failed') return { title: r.failed(challenge.percent), body: r.failedBody };
  return { title: r.cancelled, body: r.cancelledBody };
}

function heroNumbers(challenge: ChallengeView, activities: number): HeroNumber[] {
  const n = strings.challenge.result.numbers;
  const chain = challenge.chain;
  if (chain) {
    return [
      { value: strings.chain.streak(chain.streak), note: strings.chain.heroStreak },
      { value: String(chain.saved), note: strings.chain.savedNote(chain.saved) },
      { value: strings.chain.breaks(chain.lost, chain.allowedBreaks), note: strings.chain.result.lostNote },
    ];
  }
  const count = { value: String(activities), note: n.activities(activities) };
  const journey = challenge.journey;
  if (journey) {
    return [
      { value: formatKm(journey.progressMeters / 1000), note: n.of(formatKm(journey.distanceMeters / 1000)) },
      { value: formatDuration(challenge.totalSeconds), note: n.of(formatGoal(challenge.goalMinutes)) },
      count,
    ];
  }
  const early = challenge.state === 'succeeded' && challenge.endedAt ? daysEarly(challenge.endedAt, challenge.endsAt) : 0;
  return [
    { value: formatDuration(challenge.totalSeconds), note: n.of(formatGoal(challenge.goalMinutes)) },
    count,
    early > 0 ? { value: n.days(early), note: n.early } : { value: `${challenge.percent}%`, note: strings.challenge.ofTheGoal },
  ];
}

/** The top of an ended challenge: a round badge, the result and three numbers. */
export function ResultHero({ challenge, log }: { challenge: ChallengeView; log: readonly LogEntryView[] }) {
  const { title, body } = resultText(challenge);
  return (
    <div className="hero-c-figure" role="status">
      <div className="result-head">
        <div className="result-badge" aria-hidden="true">
          {challenge.state === 'succeeded' ? <CheckIcon /> : <FlagIcon />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="d result-title">{title}</div>
          <div className="hero-c-of">{body}</div>
        </div>
      </div>
      <div className="result-numbers">
        {heroNumbers(challenge, log.length).map((x) => (
          <div key={x.note}>
            <div className="d result-number">{x.value}</div>
            <div className="result-note">{x.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** While late activities still count, how long they have. */
export function ToleranceNote({ challenge }: { challenge: ChallengeView }) {
  if (!challenge.closesAt || challenge.closed || challenge.state === 'cancelled') return null;
  const until = formatDateTime(challenge.closesAt);
  return (
    <div className="sheet-section">
      <div className="sheet-note">
        <div className="sheet-note-icon">
          <ClockIcon />
        </div>
        <div>
          <span>{challenge.chain ? strings.chain.result.tolerance(until) : strings.challenge.result.tolerance(until)}</span>
        </div>
      </div>
    </div>
  );
}

/** One bar of the group total split into each Senhora's share, and the shares as a list without positions. */
export function HowWeGotThere({ challenge, log }: { challenge: ChallengeView; log: readonly LogEntryView[] }) {
  const h = strings.challenge.result.how;
  const rows = shares(senhorasOf(challenge.members), log);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.seconds, 0);
  const tone = (i: number) => TONES[i % TONES.length];

  return (
    <section className="sheet-section">
      <div>
        <h2 className="d">{h.title}</h2>
        <div className="sheet-foot">{h.body(formatDuration(total))}</div>
      </div>
      <div className="share-total" aria-hidden="true">
        {rows.map((r, i) => (
          <div key={r.memberId} style={{ width: `${(r.fraction * 100).toFixed(2)}%`, background: tone(i) }} />
        ))}
      </div>
      <ul className="share-list">
        {rows.map((r, i) => (
          <li key={r.memberId}>
            <span className="share-dot" style={{ background: tone(i) }} aria-hidden="true" />
            <span className="ellipsis">{r.name}</span>
            <span className="sheet-row-sub">{h.activities(r.activities)}</span>
            <span className="d share-value">
              {challenge.journey ? `${formatKm(secondsToKm(r.seconds))} · ` : ''}
              {formatDuration(r.seconds)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
