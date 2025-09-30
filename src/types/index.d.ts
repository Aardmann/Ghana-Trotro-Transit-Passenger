export interface Route {
  from: string;
  to: string;
  fare: number;
  coords: [number, number][]; // lat/lng pair
}


export interface StopOption {
  value: string;
  label: string;
}
