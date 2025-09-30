export interface Stop {
  id: string;
  name: string;
  coords: [number, number];
}

export interface Route {
  id: string;
  from: string;
  to: string;
  fare: number;
  distance: number;
  fromCoords: [number, number];
  toCoords: [number, number];
  intermediates?: { name: string; coords: [number, number] }[];
}


export interface Stop {
  name: string;
  coords: [number, number]; // [lat, lng]
}


export interface RouteLeg {
  from: string;
  to: string;
  fare: number;
  distance: number;
}

export interface PathResult {
  path: string[];        // stop names in order
  legs: RouteLeg[];      // legs in order
  totalFare: number;
  totalDistance: number; // km
  totalStops: number;    // number of legs
}
