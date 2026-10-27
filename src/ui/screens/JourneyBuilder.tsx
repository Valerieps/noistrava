// Choosing the journey (docs/spec/desafio-horas.md, "Jornada"): the start, the stops and the end,
// each found by searching places, then the driving route the server computes through them. Each
// search and each route is one call, only when the creator asks (ADR-009).
// Laid out like a ride app: the start, the stops and the end on one rail, a button to add a stop
// and one to swap the trip around, and the search results under the rail.
import { useState, type KeyboardEvent } from 'react';
import type { PlaceSuggestion } from '../../application/api-contract';
import { MAX_STOPS, journeyGoalMinutes, type Journey, type Place } from '../../domain/challenge/challenge';
import { measureRoute, pointAt } from '../../domain/challenge/journey-map';
import { formatGoal } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatKm } from '../format';
import { CloseIcon, PinIcon, PlusIcon, SearchIcon, SwapIcon } from '../icons';
import { RouteMap } from '../map/RouteMap';

const place = ({ name, lat, lng }: Place): Place => ({ name, lat, lng });

/** The place being searched: the start, the end, a stop by its position, or a new stop. */
type Slot = 'start' | 'end' | 'new' | number;

export function JourneyBuilder({ initial, onChange }: { initial: Journey | null; onChange: (journey: Journey | null) => void }) {
  const { backend } = useServices();
  const f = strings.challengeForm;
  const [start, setStart] = useState<Place | null>(initial ? place(initial.start) : null);
  const [end, setEnd] = useState<Place | null>(initial ? place(initial.end) : null);
  const [stops, setStops] = useState<Place[]>(initial ? initial.stops.map(place) : []);
  const [planned, setPlanned] = useState<Journey | null>(initial);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The place being searched, if any; the search is focused only when the creator opened it.
  const [editing, setEditing] = useState<Slot | null>(initial ? null : 'start');
  const [focus, setFocus] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  function current(slot: Slot): Place | null {
    if (slot === 'start') return start;
    if (slot === 'end') return end;
    return slot === 'new' ? null : stops[slot];
  }

  /** Any change of place drops the route computed for the old ones. */
  function changed(apply: () => void) {
    apply();
    setPlanned(null);
    setError(null);
    onChange(null);
  }

  function edit(slot: Slot | null) {
    setEditing(slot);
    setFocus(slot !== null);
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
    if (editing === null) return;
    const chosen = place(suggestion);
    // Each place appears once on the journey, so each stop is a milestone of its own.
    const others = [start, end, ...stops].filter((p) => p && p !== current(editing));
    if (others.some((p) => p?.name === chosen.name)) {
      setSearchError(f.placeTaken);
      return;
    }
    if (editing === 'start') {
      changed(() => setStart(chosen));
      edit(end ? null : 'end');
    } else if (editing === 'end') {
      changed(() => setEnd(chosen));
      edit(start ? null : 'start');
    } else {
      const slot = editing;
      changed(() => setStops(slot === 'new' ? [...stops, chosen] : stops.map((s, i) => (i === slot ? chosen : s))));
      edit(null);
    }
  }

  function remove(index: number) {
    changed(() => setStops(stops.filter((_, i) => i !== index)));
  }

  /** Swapping turns the whole trip around: the stops come in the opposite order. */
  function swap() {
    changed(() => {
      setStart(end);
      setEnd(start);
      setStops([...stops].reverse());
    });
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

  /** A search can be left when it keeps a place already chosen, or when it was a new stop. */
  const canLeave = editing === 'new' || (editing !== null && current(editing) !== null);

  // Enter searches instead of submitting the challenge form; Escape gives up the search.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && canLeave) {
      event.preventDefault();
      edit(null);
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void search();
  }

  // Leaving an empty search keeps the place already chosen.
  function onBlur() {
    if (query.trim() === '' && !results && canLeave) edit(null);
  }

  function label(slot: Slot): string {
    if (slot === 'start') return f.journeyStart;
    if (slot === 'end') return f.journeyEnd;
    return slot === 'new' ? f.addStop : f.stopLabel(slot + 1);
  }

  function field(slot: Slot) {
    const value = current(slot);
    if (editing === slot) {
      return (
        <div className="route-search">
          <input
            type="search"
            enterKeyHint="search"
            aria-label={label(slot)}
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
      <button type="button" className={`route-field${value ? '' : ' empty'}`} aria-label={value ? f.placeField(label(slot), value.name) : label(slot)} onClick={() => edit(slot)}>
        {value ? value.name : slot === 'start' ? f.journeyStartPlaceholder : f.journeyEndPlaceholder}
      </button>
    );
  }

  /** Where the computed route passes the stop, once there is one. */
  function stopKm(stop: Place): string | null {
    const found = planned?.stops.find((s) => s.name === stop.name);
    return found ? strings.journey.atKm(Math.round(found.distanceMeters / 1000)) : null;
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
          {stops.map((s, i) => (
            <li key={s.name} className="route-row">
              <span className="route-marker stop">
                <i className="route-dot" />
              </span>
              {field(i)}
              {editing !== i && (
                <>
                  {stopKm(s) && <span className="route-km tiny muted">{stopKm(s)}</span>}
                  <button type="button" className="icon-button route-remove" aria-label={f.removeStop(s.name)} disabled={planning} onClick={() => remove(i)}>
                    <CloseIcon />
                  </button>
                </>
              )}
            </li>
          ))}
          {editing === 'new' && (
            <li className="route-row">
              <span className="route-marker stop">
                <i className="route-dot" />
              </span>
              {field('new')}
            </li>
          )}
          {editing === null && stops.length < MAX_STOPS && (
            <li className="route-row add">
              <span className="route-marker add">
                <PlusIcon />
              </span>
              <button type="button" className="link-button route-add" disabled={planning} onClick={() => edit('new')}>
                {f.addStop}
              </button>
            </li>
          )}
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
        <>
          <span className="tiny muted">{f.stopsHint}</span>
          <button type="button" className="big-button" disabled={!start || !end || planning} onClick={plan}>
            {planning ? f.planning : f.planRoute}
          </button>
        </>
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
