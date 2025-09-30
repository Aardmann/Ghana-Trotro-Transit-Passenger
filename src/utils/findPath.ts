import type { Route, Stop, PathResult, RouteLeg } from "../types";

/** Haversine distance (km) */
function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lon1] = [toRad(a[0]), toRad(a[1])];
  const [lat2, lon2] = [toRad(b[0]), toRad(b[1])];
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

/** Compare two cost tuples lexicographically:
 * primary: fare, secondary: stopsCount, tertiary: distance
 * return true if a is strictly better (smaller) than b
 */
function isBetter(a: { fare: number; stops: number; distance: number }, b: { fare: number; stops: number; distance: number }) {
  if (a.fare !== b.fare) return a.fare < b.fare;
  if (a.stops !== b.stops) return a.stops < b.stops;
  return a.distance < b.distance;
}

/**
 * Find best path given stops & routes using lexicographic cost.
 * returns PathResult or null if unreachable.
 */
export function findBestPath(
  stopsArr: Stop[],
  routesArr: Route[],
  start: string,
  end: string
): PathResult | null {
  const coordsByName = new Map<string, [number, number]>();
  for (const s of stopsArr) coordsByName.set(s.name, s.coords);

  if (!coordsByName.has(start) || !coordsByName.has(end)) return null;

  // Best known cost per node
  const bestCost = new Map<string, { fare: number; stops: number; distance: number }>();
  // Initialize all stops to +inf
  for (const s of stopsArr) bestCost.set(s.name, { fare: Infinity, stops: Infinity, distance: Infinity });
  bestCost.set(start, { fare: 0, stops: 0, distance: 0 });

  // Priority queue: a simple array sorted by cost each pop (fine for small graphs)
  type Node = { stop: string; path: string[]; legs: RouteLeg[]; fare: number; stopsCount: number; distance: number };
  const pq: Node[] = [{ stop: start, path: [start], legs: [], fare: 0, stopsCount: 0, distance: 0 }];

  while (pq.length > 0) {
    // pop best node
    pq.sort((A, B) => {
      if (A.fare !== B.fare) return A.fare - B.fare;
      if (A.stopsCount !== B.stopsCount) return A.stopsCount - B.stopsCount;
      return A.distance - B.distance;
    });
    const current = pq.shift()!;
    const currentBest = bestCost.get(current.stop)!;
    // If current node is worse than bestCost (possible due to duplicates), skip
    if (!isBetter({ fare: current.fare, stops: current.stopsCount, distance: current.distance }, currentBest) && !(current.fare === currentBest.fare && current.stopsCount === currentBest.stops && current.distance === currentBest.distance)) {
      // If current is not equal to best known, skip
      if (!(current.fare === currentBest.fare && current.stopsCount === currentBest.stops && current.distance === currentBest.distance)) {
        continue;
      }
    }

    // Found destination
    if (current.stop === end) {
      return {
        path: current.path,
        legs: current.legs,
        totalFare: current.fare,
        totalDistance: current.distance
      };
    }

    // Expand neighbors across all routes (consider both directions)
    for (const r of routesArr) {
      // forward: r.from -> r.to if current.stop === r.from
      if (r.from === current.stop) {
        const neighbor = r.to;
        const fromCoords = coordsByName.get(r.from)!;
        const toCoords = coordsByName.get(r.to)!;
        if (!fromCoords || !toCoords) continue;
        const dist = haversineDistance(fromCoords, toCoords);
        const newFare = current.fare + r.fare;
        const newStops = current.stopsCount + 1;
        const newDist = current.distance + dist;
        const candidate = { fare: newFare, stops: newStops, distance: newDist };
        const bestForNeighbor = bestCost.get(neighbor)!;
        if (isBetter(candidate, bestForNeighbor)) {
          bestCost.set(neighbor, candidate);
          pq.push({
            stop: neighbor,
            path: [...current.path, neighbor],
            legs: [...current.legs, { from: r.from, to: r.to, fare: r.fare, distance: dist }],
            fare: newFare,
            stopsCount: newStops,
            distance: newDist
          });
        }
      }

      // reverse: r.to -> r.from if current.stop === r.to
      if (r.to === current.stop) {
        const neighbor = r.from;
        const fromCoords = coordsByName.get(r.to)!; // current
        const toCoords = coordsByName.get(r.from)!;
        if (!fromCoords || !toCoords) continue;
        const dist = haversineDistance(fromCoords, toCoords);
        const newFare = current.fare + r.fare;
        const newStops = current.stopsCount + 1;
        const newDist = current.distance + dist;
        const candidate = { fare: newFare, stops: newStops, distance: newDist };
        const bestForNeighbor = bestCost.get(neighbor)!;
        if (isBetter(candidate, bestForNeighbor)) {
          bestCost.set(neighbor, candidate);
          pq.push({
            stop: neighbor,
            path: [...current.path, neighbor],
            legs: [...current.legs, { from: r.to, to: r.from, fare: r.fare, distance: dist }],
            fare: newFare,
            stopsCount: newStops,
            distance: newDist
          });
        }
      }
    }
  }

  return null;
}
