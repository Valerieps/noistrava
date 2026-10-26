# ADR-009: Journey map on OpenStreetMap, routes computed once by the Worker

**Status:** Accepted
**Date:** 2026-10-26
**Decision:** The journey uses OpenStreetMap services, no API keys.
- **Choosing the route:** when the creator creates or edits a journey, the Worker searches places
  with Nominatim (`https://nominatim.openstreetmap.org`) and computes a walking route between the
  start and the end with the FOSSGIS OSRM server (`https://routing.openstreetmap.de`, foot
  profile). Both go in `SERVER_ORIGINS`; the Worker sends an identifying `User-Agent` and makes
  at most one call per creator action, as their usage policies require. ADR-011 adds one Overpass
  call per route, for the stops.
- **Stored once:** the challenge keeps the route's geometry (simplified), its total distance and the
  named stops, so showing progress never calls these services again.
- **Showing the map:** Leaflet, bundled (exact version), draws OpenStreetMap tiles from
  `https://tile.openstreetmap.org`, listed in `IMAGE_ORIGINS`, with the required attribution. The
  app's `Referrer-Policy` is `no-referrer`, but the tile servers refuse requests without a Referer,
  so the tile layer alone uses `strict-origin-when-cross-origin`: only the app's origin is sent.
- **Identifying the app:** the User-Agent names the app and its origin, plus `OSM_CONTACT` (an
  e-mail or page, optional) so the operators can reach the group.
- **Conversion:** fixed at 5 km per hour of activity.

**Why:** The owner chose OpenStreetMap over Google Maps. Google Maps needs a billing account, an API
key, and its script loaded from Google's servers, against the rule of bundling every dependency.
Computing the route only at creation keeps the group's use of the free public servers tiny.
**Alternatives:** Google Maps (above); openrouteservice (needs an API key and a sign-up);
self-hosted routing (far too heavy for one route a month).
**Limits to watch:** The public servers have no SLA; if one is down, creating a journey fails and the
creator tries later, while running challenges keep working from the stored route.
