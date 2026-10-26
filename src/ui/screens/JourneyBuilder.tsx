// Choosing the journey (docs/spec/desafio-horas.md, "Jornada"): the start and the end, each found
// by searching places, then the driving route the server computes between them, with the stops it
// chooses. Each search and each route happens only when the creator asks (ADR-009, ADR-011).
// Laid out like a ride app: the start and the end on one rail, the stops between them once the
// route is computed, a button to swap the two and the search results under the rail.
import { useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '../../application/api-contract';
import { journeyGoalMinutes, type Journey, type Place } from '../../domain/challenge/challenge';
import { measureRoute, pointAt } from '../../domain/challenge/journey-map';
import { formatGoal } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatKm } from '../format';
import { PinIcon, SearchIcon, SwapIcon } from '../icons';
import { RouteMap } from '../map/RouteMap';

const place = ({ name, lat, lng }: Place): Place => ({ name, lat, lng });

type End = 'start' | 'end';

export function JourneyBuilder({ initial, onChange }: { initial: Journey | null; onChange: (journey: Journey | null) => void }) {
  const { backend } = useServices();
  const f = strings.challengeForm;
  const [start, setStart] = useState<Place | null>(initial ? place(initial.start) : null);
  const [end, setEnd] = useState<Place | null>(initial ? place(initial.end) : null);
  const [planned, setPlanned] = useState<Journey | null>(initial);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The end being searched, if any; the search is focused only when the creator opened it.
  const [editing, setEditing] = useState<End | null>(initial ? null : 'start');
  const [focus, setFocus] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  /** Any change of place drops the route computed for the old ones. */
  function changed(apply: () => void) {
    apply();
    setPlanned(null);
    setError(null);
    onChange(null);
  }

  function edit(which: End | null) {
    setEditing(which);
    setFocus(which !== null);
    setQuery('');
    setResults(null);
    setSearchError(null);
  }

  async function search() {
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    setSearchError(null);
    const result = await backend.searchPlaces(query);
    setSearching(false);
    if (!result.ok) {
      setResults(null);
      setSearchError(f.searchFailed);
      return;
    }
    setResults(result.value);
    if (result.value.length === 0) setSearchError(f.noPlaces);
  }

  /** Picking the start moves on to the end while it is still empty, as ride apps do. */
  function pick(suggestion: PlaceSuggestion) {
    const chosen = place(suggestion);
    if (editing === 'start') {
      changed(() => setStart(chosen));
      edit(end ? null : 'end');
    } else {
      changed(() => setEnd(chosen));
      edit(start ? null : 'start');
    }
  }

  function swap() {
    changed(() => {
      setStart(end);
      setEnd(start);
    });
  }

  async function plan() {
    if (!start || !end) return;
    setPlanning(true);
    setError(null);
    const result = await backend.planRoute({ start, end });
    setPlanning(false);
    if (!result.ok) {
      setError(result.error === 'invalid' ? f.noRoute : f.routeFailed);
      return;
    }
    setPlanned(result.value);
    onChange(result.value);
  }

  // Enter searches instead of submitting the challenge form; Escape gives up the search.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && (editing === 'start' ? start : end)) {
      event.preventDefault();
      edit(null);
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void search();
  }

  // Leaving an empty search keeps the place already chosen.
  function onBlur() {
    if (query.trim() === '' && !results && (editing === 'start' ? start : end)) edit(null);
  }

  function field(which: End) {
    const value = which === 'start' ? start : end;
    const label = which === 'start' ? f.journeyStart : f.journeyEnd;
    if (editing === which) {
      return (
        <div className="route-search">
          <input
            type="search"
            enterKeyHint="search"
            aria-label={label}
            autoFocus={focus}
            value={query}
            placeholder={f.searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          />
          <button type="button" className="icon-button" aria-label={searching ? f.searching : f.search} disabled={query.trim().length < 2 || searching} onClick={search}>
            <SearchIcon />
          </button>
        </div>
      );
    }
    return (
      <button type="button" className={`route-field${value ? '' : ' empty'}`} aria-label={value ? f.placeField(label, value.name) : label} onClick={() => edit(which)}>
        {value ? value.name : which === 'start' ? f.journeyStartPlaceholder : f.journeyEndPlaceholder}
      </button>
    );
  }

  return (
    <div className="stack">
      <div className="route-card">
        <ol className="route-rail" aria-label={f.journeyPlaces}>
          <li className="route-row">
            <span className="route-marker start">
              <i className="route-dot" />
            </span>
            {field('start')}
          </li>
          {planned?.stops.map((s) => (
            <li key={`${s.lat},${s.lng}`} className="route-row stop">
              <span className="route-marker stop">
                <i className="route-dot" />
              </span>
              <span className="route-stop">
                <span>{s.name}</span>
                <span className="tiny muted">{strings.journey.atKm(Math.round(s.distanceMeters / 1000))}</span>
              </span>
            </li>
          ))}
          <li className="route-row">
            <span className="route-marker end">
              <i className="route-dot" />
            </span>
            {field('end')}
          </li>
        </ol>
        {editing === null && (start || end) && (
          <button type="button" className="icon-button route-swap" aria-label={f.swap} disabled={planning} onClick={swap}>
            <SwapIcon />
          </button>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="place-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              {/* Picking on mouse down, before the search box loses focus. */}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                <PinIcon />
                <span className="place-result-text">
                  <b>{r.name}</b>
                  <span className="tiny muted">{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchError && (
        <span className="tiny muted" role="status">
          {searchError}
        </span>
      )}

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
      <p className="tiny muted" style={{ margin: 0 }}>
        {journey.stops.length > 0 ? f.autoStops : f.noStops}
      </p>
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
        <span className="d text-lg">
          {formatGoal(journeyGoalMinutes(journey.distanceMeters))}
        </span>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {f.perHour}
      </p>
    </>
  );
}
