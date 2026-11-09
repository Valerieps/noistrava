// The notices of the Corrida das Estações (docs/spec/notificacoes.md, "Os avisos da Corrida das
// Estações"): the podium is out, I took a title, the year is over. Each one on until I turn it off;
// they go with content, encrypted, to the devices that gave their keys (ADR-013), once each.
import type { SeasonNoticesView } from '../../src/application/api-contract';
import { RANKINGS, type RankingKey } from '../../src/domain/seasons/rankings';
import { FIRST_STAGE, isYearEnd, parseStageKey, type Stage } from '../../src/domain/seasons/stages';
import { ofStageName } from '../../src/domain/seasons/texts';
import { strings } from '../../src/domain/strings';
import { localTime } from '../../src/domain/tracking/tracking';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';
import type { PushMessage } from './reminders';

/** Stages that closed longer ago than this send no notices (someone who joins later). */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
/** Where tapping a notice takes: the Estações tab. */
export const SEASONS_PATH = '/estacoes';
/** The titles that name a person: "Você é a Maratonista do Inverno 2026!". */
const NAMES_A_PERSON: ReadonlySet<RankingKey> = new Set(['weekend', 'variety', 'marathon', 'steady']);

type NoticeKind = 'podium' | 'title' | 'year';

interface SettingsRow {
  podium: number;
  title: number;
  year: number;
}

function settingsOf(ctx: Context, memberId: string): Record<NoticeKind, boolean> {
  const [row] = ctx.sql.all<SettingsRow>('SELECT podium, title, year FROM season_notice_settings WHERE member_id = ?', memberId);
  return row ? { podium: row.podium === 1, title: row.title === 1, year: row.year === 1 } : { podium: true, title: true, year: true };
}

function view(ctx: Context, memberId: string): SeasonNoticesView {
  const [{ devices }] = ctx.sql.all<{ devices: number }>(
    'SELECT COUNT(*) AS devices FROM push_subscriptions WHERE member_id = ? AND p256dh IS NOT NULL',
    memberId,
  );
  return { ...settingsOf(ctx, memberId), devices };
}

export function seasonNotices(ctx: Context, actor: Member): SeasonNoticesView {
  return view(ctx, actor.id);
}

export function setSeasonNotices(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<SeasonNoticesView> {
  const { podium, title, year } = input;
  if (typeof podium !== 'boolean' || typeof title !== 'boolean' || typeof year !== 'boolean') return failure('invalid');
  ctx.sql.run(
    `INSERT INTO season_notice_settings (member_id, podium, title, year) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET podium = excluded.podium, title = excluded.title, year = excluded.year`,
    actor.id,
    podium ? 1 : 0,
    title ? 1 : 0,
    year ? 1 : 0,
  );
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}



function titleBody(stage: Stage, ranking: RankingKey): string {
  return strings.seasonNotices.titleBody(strings.seasons.rankings[ranking], ofStageName(stage), NAMES_A_PERSON.has(ranking));
}

/**
 * The notices due now, for every member, already marked as sent: the podium and the titles of a
 * stage that just closed, and the year's end on 18 December in her zone.
 */
export function seasonNoticesDue(ctx: Context): PushMessage[] {
  const now = ctx.clock.now();
  const s = strings.seasonNotices;
  const since = new Date(now.getTime() - RECENT_MS).toISOString();
  const closed = ctx.sql
    .all<{ stage: string }>('SELECT stage FROM season_stages WHERE closed_at >= ?', since)
    .map((r) => parseStageKey(r.stage))
    .filter((stage): stage is Stage => stage !== null);
  const members = ctx.sql.all<{ id: string; timezone: string | null }>('SELECT id, timezone FROM members WHERE active = 1');

  return ctx.sql.transaction(() =>
    members.flatMap((member) => {
      const on = settingsOf(ctx, member.id);
      const due: { notice: string; kind: NoticeKind; body: string }[] = [];
      for (const stage of closed) {
        const key = `${stage.year}-${stage.season}`;
        due.push({ notice: `podium:${key}`, kind: 'podium', body: s.podiumBody(ofStageName(stage)) });
        const titles = ctx.sql
          .all<{ ranking: string }>('SELECT ranking FROM season_results WHERE stage = ? AND member_id = ? AND title = 1', key, member.id)
          .map((r) => r.ranking)
          .filter((r): r is RankingKey => (RANKINGS as readonly string[]).includes(r))
          .sort((a, b) => RANKINGS.indexOf(a) - RANKINGS.indexOf(b));
        for (const ranking of titles) due.push({ notice: `title:${key}:${ranking}`, kind: 'title', body: titleBody(stage, ranking) });
      }
      const today = localTime(now, member.timezone ?? 'UTC').date;
      const year = Number(today.slice(0, 4));
      if (isYearEnd(today) && year >= FIRST_STAGE.year) due.push({ notice: `year:${year}`, kind: 'year', body: s.yearBody(year) });

      const fresh = due.filter(
        (d) => ctx.sql.all('SELECT 1 FROM season_notices_sent WHERE member_id = ? AND notice = ?', member.id, d.notice).length === 0,
      );
      // Marked even when turned off or without devices: turning it on later does not send an old one.
      for (const d of fresh) ctx.sql.run('INSERT INTO season_notices_sent (member_id, notice, sent_at) VALUES (?, ?, ?)', member.id, d.notice, nowIso(ctx));
      const devices = ctx.sql.all<{ endpoint: string; p256dh: string; auth: string }>(
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ? AND p256dh IS NOT NULL',
        member.id,
      );
      return fresh
        .filter((d) => on[d.kind])
        .flatMap((d) => {
          const payload = JSON.stringify({ title: s.notificationTitle, body: d.body, tag: d.notice, url: SEASONS_PATH });
          return devices.map((p) => ({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth }, payload }));
        });
    }),
  );
}
