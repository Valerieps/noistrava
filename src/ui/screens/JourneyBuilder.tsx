// Choosing the journey (docs/spec/desafio-horas.md, "Jornada"): the start, the stops and the end,
// each found by searching places, then the walking route the server computes between them. Each
// search and each route is one call, only when the creator asks (ADR-009).
import { useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '../../application/api-contract';
import { MAX_STOPS, journeyGoalMinutes, type Journey, type Place } from '../../domain/challenge/challenge';
import { measureRoute, pointAt } from '../../domain/challenge/journey-map';
import { formatGoal } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatKm } from '../format';
import { RouteMap } from '../map/RouteMap';

const place = ({ name, lat, lng }: Place): Place => ({ name, lat, lng });

export function JourneyBuilder({ initial, onChange }: { initial: Journey | null; onChange: (journey: Journey | null) => void }) {
  const { backend } = useServices();
  const f = strings.challengeForm;
  const [start, setStart] = useState<Place | null>(initial ? place(initial.start) : null);
  const [end, setEnd] = useState<Place | null>(initial ? place(initial.end) : null);
  const [stops, setStops] = useState<Place[]>(initial ? initial.stops.map(place) : []);
  const [planned, setPlanned] = useState<Journey | null>(initial);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Any change of place drops the route computed for the old ones. */
  function changed(apply: () => void) {
    apply();
    setPlanned(null);
    setError(null);
    onChange(null);
  }

  async function plan() {
    if (!start || !end) return;
    setPlanning(true);
    setError(null);
    const result = await backend.planRoute({ start, end, stops });
    setPlanning(false);
    if (!result.ok) {
      setError(result.error === 'invalid' ? f.noRoute : f.routeFailed);
      return;
    }
    setPlanned(result.value);
    onChange(result.value);
  }

  const names = new Set([start?.name, end?.name, ...stops.map((s) => s.name)]);

  return (
    <div className="stack">
      <PlacePicker label={f.journeyStart} value={start} onPick={(p) => changed(() => setStart(p))} />

      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className="field-label">{f.journeyStops}</span>
        {stops.map((stop) => (
          <div key={stop.name} className="place-row">
            <span>{stop.name}</span>
            <button type="button" className="link-button" onClick={() => changed(() => setStops(stops.filter((s) => s !== stop)))}>
              {f.remove(stop.name)}
            </button>
          </div>
        ))}
        {stops.length < MAX_STOPS && (
          <PlacePicker label={f.addStop} value={null} onPick={(p) => p && !names.has(p.name) && changed(() => setStops([...stops, p]))} />
        )}
        <span className="tiny muted">{f.stopsHint}</span>
      </div>

      <PlacePicker label={f.journeyEnd} value={end} onPick={(p) => changed(() => setEnd(p))} />

      {!planned && (
        <button type="button" className="big-button" disabled={!start || !end || planning} onClick={plan}>
          {planning ? f.planning : f.planRoute}
        </button>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {planned && <PlannedRoute journey={planned} />}
    </div>
  );
}

function PlannedRoute({ journey }: { journey: Journey }) {
  const f = strings.challengeForm;
  const route = measureRoute(journey);
  const stops = [{ ...journey.start, distanceMeters: 0 }, ...journey.stops, { ...journey.end, distanceMeters: journey.distanceMeters }];
  return (
    <>
      <RouteMap
        route={journey.route}
        lines={[{ points: journey.route, tone: 'walked' }]}
        places={stops.map((s) => ({ name: s.name, point: pointAt(route, s.distanceMeters), reached: false }))}
        label={strings.journey.mapLabel(journey.start.name, journey.end.name)}
      />
      <p className="small" style={{ margin: 0 }}>
        {f.journeyRoute(journey.start.name, journey.end.name, formatKm(journey.distanceMeters / 1000))}
      </p>
      <div className="equivalent">
        <span>{f.equivalent}</span>
        <span className="d" style={{ fontSize: 22 }}>
          {formatGoal(journeyGoalMinutes(journey.distanceMeters))}
        </span>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {f.perHour} {f.routeCredit}
      </p>
    </>
  );
}

/** A place: the one chosen, with "Trocar", or a search box and its results to pick from. */
function PlacePicker({ label, value, onPick }: { label: string; value: Place | null; onPick: (place: Place | null) => void }) {
  const { backend } = useServices();
  const f = strings.challengeForm;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    setError(null);
    const result = await backend.searchPlaces(query);
    setSearching(false);
    if (!result.ok) {
      setResults(null);
      setError(f.searchFailed);
      return;
    }
    setResults(result.value);
    if (result.value.length === 0) setError(f.noPlaces);
  }

  function pick(suggestion: PlaceSuggestion) {
    setQuery('');
    setResults(null);
    onPick(place(suggestion));
  }

  // Enter searches instead of submitting the challenge form.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void search();
  }

  if (value) {
    return (
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <span className="field-label">{label}</span>
        <div className="place-row">
          <b>{value.name}</b>
          <button type="button" className="link-button" onClick={() => onPick(null)}>
            {f.change}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <label>
        <span className="field-label">{label}</span>
        <div className="place-search">
          <input type="search" enterKeyHint="search" value={query} placeholder={f.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <button type="button" className="secondary" disabled={query.trim().length < 2 || searching} onClick={search}>
            {searching ? f.searching : f.search}
          </button>
        </div>
      </label>
      {results && results.length > 0 && (
        <ul className="place-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" onClick={() => pick(r)}>
                <b>{r.name}</b>
                <span className="tiny muted">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="tiny muted" role="status">{error}</span>}
    </div>
  );
}
