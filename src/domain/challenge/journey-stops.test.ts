import { describe, expect, it } from 'vitest';
import { autoStopCount, chooseStops, type StopCandidate } from './journey-stops';

// A straight 100 km route along the equator, from lng 0 to lng 0.9: stretches of 20 km.
const journey = {
  start: { name: 'Início', lat: 0, lng: 0 },
  end: { name: 'Fim', lat: 0, lng: 0.9 },
  distanceMeters: 100_000,
  route: [
    [0, 0],
    [0, 0.9],
  ] as [number, number][],
};
const at = (km: number) => (km / 100) * 0.9;
const candidate = (name: string, kind: StopCandidate['kind'], km: number, lat = 0, population: number | null = null): StopCandidate => ({
  name,
  kind,
  lat,
  lng: at(km),
  population,
});

describe('automatic stops', () => {
  it('gives one stop per 25 km, at most 8', () => {
    expect(autoStopCount(24_999)).toBe(0);
    expect(autoStopCount(25_000)).toBe(1);
    expect(autoStopCount(100_000)).toBe(4);
    expect(autoStopCount(2_000_000)).toBe(8);
  });

  it('picks the largest city of each stretch, an attraction where there is none, and skips empty stretches', () => {
    const stops = chooseStops(journey, [
      candidate('Vila', 'town', 18, 0.05, 5_000),
      candidate('Cidade', 'city', 22, -0.02),
      candidate('Museu', 'attraction', 41),
      candidate('Castelo', 'attraction', 46),
      candidate('Longe', 'city', 60, 0.2, 1_000_000),
      candidate('Fim', 'city', 79, 0, 2_000_000),
      candidate('Porto', 'town', 81, 0.01, 30_000),
    ]);
    expect(stops.map((s) => s.name)).toEqual(['Cidade', 'Museu', 'Porto']);
    expect(stops.map((s) => Math.round(s.distanceMeters / 1000))).toEqual([22, 41, 81]);
  });

  it('uses each place once and none on a short route', () => {
    const twice = chooseStops(journey, [candidate('Cidade', 'city', 29), candidate('Cidade', 'city', 31)]);
    expect(twice.map((s) => s.name)).toEqual(['Cidade']);
    expect(chooseStops({ ...journey, distanceMeters: 20_000 }, [candidate('Cidade', 'city', 50)])).toEqual([]);
  });
});
