# ADR-011: Journey stops chosen from Overpass

**Status:** Accepted
**Date:** 2026-10-26
**Decision:** The app chooses the journey's stops; the creator no longer picks them.
- **Finding places:** after OSRM returns the walking route, the Worker sends one query to the
  public Overpass API (`https://overpass-api.de`, listed in `SERVER_ORIGINS`) for the cities and
  towns, and the attractions and historic sites with a Wikidata entry, within 10 km of the route.
  The route goes as a line of at most 150 points; the request carries the same identifying
  `User-Agent` as Nominatim and OSRM (ADR-009). This is a second call per route, on top of OSRM.
- **Choosing:** the rule lives in `src/domain/challenge/journey-stops.ts` and the spec
  (`docs/spec/desafio-horas.md`, "Jornada"): equal stretches, the largest city in each, else the
  attraction closest to the stretch's middle. Population comes from the OpenStreetMap `population`
  tag; without it, a city counts as 100,000 and a town as 10,000.
- **Stored once:** the chosen stops go into the journey like before, so nothing changes in storage
  and running challenges never call Overpass.
- **Failure:** when Overpass is down or times out, the route is kept without stops, rather than
  failing the whole route.

**Why:** The owner wanted stops to come from big cities and tourist spots on the way. Overpass
answers "what is near this line" in one request, with no API key. Nominatim cannot search along a
line, and querying it per stretch would mean several calls per route.
**Alternatives:** Nominatim reverse geocoding at each stretch's middle (several calls, and it
returns the nearest locality, not the largest); Wikidata SPARQL (no road-level proximity, and the
query is heavier); the route's own OSRM step names (streets, not cities).
**Limits to watch:** The public Overpass servers are often busy; on long routes the query may hit
the 25-second timeout and the journey comes without stops. Places with no `name:pt` show their local
name.
