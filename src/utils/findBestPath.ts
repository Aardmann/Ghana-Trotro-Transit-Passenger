import type { Stop, Route, RouteLeg, PathResult } from "../types";

/** Haversine distance between two [lat,lng] in km */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lat1, lon1] = [toRad(a[0]), toRad(a[1])];
  const [lat2, lon2] = [toRad(b[0]), toRad(b[1])];
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const A = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * C;
}

/**
 * Find best path using lexicographic priority:
 * - priority = "fare" : compare by fare, then stops, then distance
 * - priority = "distance" : compare by distance, then fare, then stops
 * - priority = "stops" : compare by number of stops, then fare, then distance
 *
 * Returns PathResult or null if unreachable.
 */
export function findBestPath(
  stopsArr: Stop[],
  routesArr: Route[],
  start: string,
  end: string,
  priority: "fare" | "distance" | "stops" = "fare"
): PathResult | null {
  // Quick check
  if (start === end) {
    return { path: [start], legs: [], totalFare: 0, totalDistance: 0, totalStops: 0 };
  }

  const coordsByName = new Map<string, [number, number]>();
  stopsArr.forEach((s) => coordsByName.set(s.name, s.coords));

  // adjacency: keep original routes but algorithm will treat edges as bidirectional
  const adj = new Map<string, { to: string; fare: number; distance: number }[]>();
  for (const r of routesArr) {
    const fromCoords = coordsByName.get(r.from);
    const toCoords = coordsByName.get(r.to);
    if (!fromCoords || !toCoords) continue;
    const dist = r.distance ?? haversine(fromCoords, toCoords);

    if (!adj.has(r.from)) adj.set(r.from, []);
    adj.get(r.from)!.push({ to: r.to, fare: r.fare, distance: dist });

    // add reverse edge (same fare/distance)
    if (!adj.has(r.to)) adj.set(r.to, []);
    adj.get(r.to)!.push({ to: r.from, fare: r.fare, distance: dist });
  }

  type Cost = { fare: number; stops: number; distance: number };

  function cmpCost(a: Cost, b: Cost): number {
    if (priority === "fare") {
      if (a.fare !== b.fare) return a.fare - b.fare;
      if (a.stops !== b.stops) return a.stops - b.stops;
      return a.distance - b.distance;
    } else if (priority === "distance") {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.fare !== b.fare) return a.fare - b.fare;
      return a.stops - b.stops;
    } else {
      // stops
      if (a.stops !== b.stops) return a.stops - b.stops;
      if (a.fare !== b.fare) return a.fare - b.fare;
      return a.distance - b.distance;
    }
  }

  // Best known cost per node
  const best = new Map<string, Cost>();
  for (const s of stopsArr) best.set(s.name, { fare: Infinity, stops: Infinity, distance: Infinity });
  best.set(start, { fare: 0, stops: 0, distance: 0 });

  // Priority queue - simple array sorted each pop (fine for small graphs)
  type Node = { node: string; path: string[]; legs: RouteLeg[]; cost: Cost };
  const pq: Node[] = [{ node: start, path: [start], legs: [], cost: { fare: 0, stops: 0, distance: 0 } }];

  while (pq.length > 0) {
    // pop best by cmpCost
    pq.sort((A, B) => cmpCost(A.cost, B.cost));
    const current = pq.shift()!;
    const currentBest = best.get(current.node)!;
    // If current is worse than best known, skip (duplicate)
    if (cmpCost(current.cost, currentBest) > 0) continue;

    if (current.node === end) {
      // Build PathResult
      const totalFare = current.cost.fare;
      const totalDistance = current.cost.distance;
      const totalStops = current.cost.stops;
      return {
        path: current.path,
        legs: current.legs,
        totalFare,
        totalDistance,
        totalStops,
      };
    }

    const neighbors = adj.get(current.node) ?? [];
    for (const edge of neighbors) {
      const nextName = edge.to;
      const newCost: Cost = {
        fare: current.cost.fare + edge.fare,
        stops: current.cost.stops + 1,
        distance: current.cost.distance + edge.distance,
      };
      const bestForNext = best.get(nextName) ?? { fare: Infinity, stops: Infinity, distance: Infinity };
      if (cmpCost(newCost, bestForNext) < 0) {
        best.set(nextName, newCost);
        const newLeg: RouteLeg = { from: current.node, to: nextName, fare: edge.fare, distance: edge.distance };
        pq.push({
          node: nextName,
          path: [...current.path, nextName],
          legs: [...current.legs, newLeg],
          cost: newCost,
        });
      }
    }
  }

  return null; // unreachable
}
