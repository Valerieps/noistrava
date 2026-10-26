// What the UI needs from the outside world. src/infrastructure/ implements it; the UI receives it
// through ServicesProvider and never makes network calls itself.
import type { Journey } from '../domain/challenge/challenge';
import type { ApiResult, CommandName, Commands, PlaceSuggestion, QueryName, Queries, RouteInput, Topic } from './api-contract';

export interface Backend {
  query<N extends QueryName>(name: N, input: Queries[N]['input']): Promise<ApiResult<Queries[N]['output']>>;
  command<N extends CommandName>(name: N, input: Commands[N]['input']): Promise<ApiResult<Commands[N]['output']>>;
  signOut(): Promise<void>;
  /** The test sign-in without Google; the server accepts it only on localhost (ADR-007). */
  devSignIn(email: string, name: string): Promise<ApiResult<null>>;
  /**
   * "Conectar com Strava", after the member accepted sharing: Strava's address, where the browser
   * navigates next. The server answers `unavailable` where Strava is not set up.
   */
  stravaConnect(includePrivate: boolean): Promise<ApiResult<string>>;
  /** The journey's place search, through the server (ADR-009); `unavailable` when it is down. */
  searchPlaces(query: string): Promise<ApiResult<PlaceSuggestion[]>>;
  /**
   * The driving route through the places, ready to send as the challenge's journey; `invalid` when
   * there is no driving route between them, `unavailable` when the routing server is down.
   */
  planRoute(input: RouteInput): Promise<ApiResult<Journey>>;
  /** The address the browser navigates to for "Entrar com Google". */
  readonly signInUrl: string;
}

export type LiveStatus = 'connecting' | 'online' | 'offline';

export interface LiveUpdates {
  /** Calls `onChange` with the topics that changed; also with every topic after a reconnect. */
  subscribe(onChange: (topics: readonly Topic[]) => void): () => void;
  onStatus(listener: (status: LiveStatus) => void): () => void;
  start(): void;
  stop(): void;
}
