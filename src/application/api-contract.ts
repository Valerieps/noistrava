// The contract between the app and the server: query and command names, inputs and outputs.
// Types only. The server imports it with `import type`, so nothing here runs on either side.
import type { ActivitySource } from '../domain/activity';
import type { ChallengeResponse, ChallengeState, Journey, Place } from '../domain/challenge/challenge';
import type { Role } from '../domain/group/roles';

export interface MemberView {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly roles: readonly Role[];
  /** IANA, from the member's device; null until her app first sends it. */
  readonly timezone: string | null;
}

/** A row of the members screen: the e-mail only reaches admins. */
export interface MemberListItem extends MemberView {
  readonly email?: string;
}

export interface MeView extends MemberView {
  readonly email: string;
}

export type InviteState = 'pending' | 'accepted' | 'revoked';

export interface InviteView {
  readonly email: string;
  readonly state: InviteState;
  readonly invitedByName: string;
  readonly createdAt: string;
  readonly acceptedAt: string | null;
}

/** My own Strava connection; nobody else's is ever shown. */
export interface StravaConnectionView {
  readonly connected: boolean;
  readonly includePrivate: boolean;
}

/** One of my own activities, to edit or delete. */
export interface ActivityView {
  readonly id: string;
  readonly source: ActivitySource;
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
  readonly editedByMember: boolean;
}

export interface ChallengeMemberView {
  readonly memberId: string;
  readonly name: string;
  readonly photoUrl: string | null;
  /** Not answered yet counts as `pending`, and sees everything as the torcida. */
  readonly response: ChallengeResponse;
  readonly totalSeconds: number;
}

export interface ChallengeView {
  readonly id: string;
  readonly type: 'horas_colaborativas';
  readonly name: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly startDate: string;
  readonly endDate: string;
  /** The period in UTC, from the members' zones furthest ahead and furthest behind. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly state: ChallengeState;
  readonly endedAt: string | null;
  /** End of the 24 hours of tolerance; null while open. */
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly goalMinutes: number;
  readonly totalSeconds: number;
  readonly percent: number;
  readonly journey: (Journey & { readonly progressMeters: number }) | null;
  readonly members: readonly ChallengeMemberView[];
  readonly milestones: readonly { readonly milestone: string; readonly reachedAt: string }[];
  readonly myResponse: ChallengeResponse;
}

/** A row of the challenge's activity log. */
export interface LogEntryView {
  readonly activityId: string;
  readonly memberId: string;
  readonly memberName: string;
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
  readonly hearts: number;
  readonly heartedByMe: boolean;
}

export interface HistoryItemView {
  readonly id: string;
  readonly name: string;
  readonly state: ChallengeState;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly endedAt: string | null;
  readonly goalMinutes: number;
  readonly totalSeconds: number;
  readonly percent: number;
  readonly results: readonly { readonly memberId: string; readonly name: string; readonly totalSeconds: number }[];
}

/** Creating or editing: a goal in whole hours, or a journey whose distance is the goal. */
export interface ChallengeSetupInput {
  name: string;
  startDate: string;
  endDate: string;
  goalHours?: number;
  journey?: Journey | null;
}

/** A place found by the journey's search (ADR-009): a short name, and the full address to tell apart. */
export interface PlaceSuggestion {
  readonly name: string;
  readonly detail: string;
  readonly lat: number;
  readonly lng: number;
}

/** The driving route to compute: the start, the end, and the stops in the order they are walked. */
export interface RouteInput {
  start: Place;
  end: Place;
}

export interface ActivityInput {
  /** ISO 8601 with an offset or Z. */
  startedAt: string;
  timezone: string;
  durationSeconds: number;
  sport: string;
}

/** Reads: `POST /api/query/<name>`. They never change anything. */
export interface Queries {
  me: { input: Record<string, never>; output: MeView };
  members: { input: Record<string, never>; output: MemberListItem[] };
  /** Admins only. */
  invites: { input: Record<string, never>; output: InviteView[] };
  strava: { input: Record<string, never>; output: StravaConnectionView };
  /** With an id, that challenge; without, the open one, else the latest not yet closed, else null. */
  challenge: { input: { challengeId?: string }; output: { challenge: ChallengeView | null } };
  challengeLog: { input: { challengeId: string }; output: LogEntryView[] };
  /** Closed challenges, newest first, with each Senhora's total. */
  history: { input: Record<string, never>; output: HistoryItemView[] };
  /** My own activities, newest first. */
  activities: { input: Record<string, never>; output: ActivityView[] };
}

/** Writes: `POST /api/command/<name>`. Each runs alone, in one transaction. */
export interface Commands {
  'invite.create': { input: { email: string }; output: InviteView };
  'invite.revoke': { input: { email: string }; output: null };
  'member.setRoles': { input: { memberId: string; roles: Role[] }; output: MemberView };
  /** Admins; never oneself, so the last admin stays. */
  'member.remove': { input: { memberId: string }; output: null };
  'member.rename': { input: { name: string }; output: MeView };
  'member.setTimezone': { input: { timezone: string }; output: MeView };
  'activity.create': { input: ActivityInput; output: ActivityView };
  /** Only my own; on a Strava activity only the duration changes. */
  'activity.update': { input: { activityId: string } & Partial<ActivityInput>; output: ActivityView };
  'activity.delete': { input: { activityId: string }; output: null };
  /** Fails with `conflict` while another challenge is open. */
  'challenge.create': { input: ChallengeSetupInput & { creatorIsSenhora: boolean }; output: ChallengeView };
  /** The creator, before the end. */
  'challenge.edit': { input: ChallengeSetupInput & { challengeId: string }; output: ChallengeView };
  /** Accept to become a Senhora; decline to be torcida, or to leave after accepting. */
  'challenge.respond': { input: { challengeId: string; accept: boolean }; output: ChallengeView };
  /** The creator, before the end. */
  'challenge.cancel': { input: { challengeId: string }; output: null };
  /** Admins only. */
  'challenge.delete': { input: { challengeId: string }; output: null };
  'reaction.set': { input: { challengeId: string; activityId: string; heart: boolean }; output: null };
}

export type QueryName = keyof Queries;
export type CommandName = keyof Commands;

/** What a live message says changed; the screens that show it refetch. */
export type Topic = 'me' | 'members' | 'invites' | 'strava' | 'activities' | 'challenge' | 'history';

export interface LiveMessage {
  readonly type: 'changed';
  readonly topics: readonly Topic[];
}

export type ApiError = 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'last_admin' | 'unavailable';

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };
