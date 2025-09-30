import React, { useEffect, useState } from "react";
import type { Stop, Route, PathResult } from "./types";
import { findBestPath } from "./utils/findBestPath";
import MapView from "./components/MapView";
import { supabase } from "./lib/supabaseClient";
import { haversineDistance } from "./utils/calcDistance"; 

export default function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [priority, setPriority] = useState<"fare" | "distance" | "stops">("fare");
  const [result, setResult] = useState<PathResult | null>(null);
  const [coordsPath, setCoordsPath] = useState<[number, number][]>([]);
  const [useRoadRouting, setUseRoadRouting] = useState<boolean>(false);

  // ✅ NEW states for multiple routes
  const [matchingRoutes, setMatchingRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);

  // ✅ Fetch stops and routes from Supabase
  useEffect(() => {
    const fetchStopsAndRoutes = async () => {
      try {
        // fetch stops
        const { data: stopsData, error: stopsError } = await supabase
          .from("stops")
          .select("id, name, lat, lng")
          .order("name", { ascending: true });

        if (stopsError) throw stopsError;

        const stopsMapped: Stop[] =
          stopsData?.map((s: any) => ({
            id: s.id,
            name: s.name,
            coords: [s.lat, s.lng],
          })) ?? [];

        setStops(stopsMapped);
        setFrom(stopsMapped[0]?.name ?? "");
        setTo(stopsMapped[1]?.name ?? "");

        // fetch routes and join stop details
        const { data: routesRes, error: routesError } = await supabase
          .from("routes")
          .select(`
            id,
            fare,
            from_stop (id, name, lat, lng),
            to_stop (id, name, lat, lng),
            route_stops (
              stop_order,
              stops (id, name, lat, lng)
            )
          `);

        if (routesError) throw routesError;

        const routesMapped: Route[] =
          routesRes?.map((r: any) => {
            const fromCoords: [number, number] = [r.from_stop.lat, r.from_stop.lng];
            const toCoords: [number, number] = [r.to_stop.lat, r.to_stop.lng];

            const intermediates =
              r.route_stops
                ?.sort((a: any, b: any) => a.stop_order - b.stop_order)
                .map((rs: any) => ({
                  name: rs.stops.name,
                  coords: [rs.stops.lat, rs.stops.lng] as [number, number],
                })) ?? [];

            return {
              id: r.id,
              from: r.from_stop.name,
              to: r.to_stop.name,
              fare: r.fare,
              distance: haversineDistance(fromCoords, toCoords),
              fromCoords,
              toCoords,
              intermediates,
            };
          }) ?? [];

        setRoutes(routesMapped);
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchStopsAndRoutes();

    if ((import.meta.env.VITE_ORS_API_KEY as string)?.length) {
      setUseRoadRouting(true);
    }
  }, []);

 const fetchLegFare = async (from: string, to: string): Promise<number> => {
  const { data, error } = await supabase
    .from("routes")
    .select("fare, from_stop(name), to_stop(name)")
    .eq("from_stop.name", from)
    .eq("to_stop.name", to);

  if (error) {
    console.error("Error fetching leg fare:", error);
    return 0;
  }

  if (!data || data.length === 0) return 0;

  // pick cheapest fare among all matching routes
  return Math.min(...data.map((d) => d.fare ?? 0));
};


// ✅ New state to hold per-leg fares
const [legFares, setLegFares] = useState<
  { from: string; to: string; fare: number }[]
>([]);


// ✅ When a route is selected, compute its leg fares
useEffect(() => {
  const computeLegFares = async () => {
    if (!selectedRouteId) return;

    const route = matchingRoutes.find((r) => r.id === selectedRouteId);
    if (!route) return;

    const stopSeq = [route.from, ...(route.intermediates?.map((i) => i.name) ?? []), route.to];

    const legs: { from: string; to: string; fare: number }[] = [];
    for (let i = 0; i < stopSeq.length - 1; i++) {
      const fromStop = stopSeq[i];
      const toStop = stopSeq[i + 1];
      const fare = await fetchLegFare(fromStop, toStop);
      legs.push({ from: fromStop, to: toStop, fare });
    }
    setLegFares(legs);
  };

  computeLegFares();
}, [selectedRouteId, matchingRoutes]);


  // ✅ Updated find handler
const handleFind = () => {
  if (!from || !to) return;

  const matches = routes.filter((r) => {
    const stopSeq = [
      r.from,
      ...(r.intermediates?.map((i) => i.name) ?? []),
      r.to,
    ];

    // ✅ Only include routes where the first stop matches user's "from"
    // and the last stop matches user's "to"
    return stopSeq[0] === from && stopSeq[stopSeq.length - 1] === to;
  });

  setMatchingRoutes(matches);

  if (matches.length) {
    const firstRoute = matches[0];
    setSelectedRouteId(firstRoute.id);

    const coords: [number, number][] = [];
    coords.push(firstRoute.fromCoords);
    if (firstRoute.intermediates?.length) {
      coords.push(...firstRoute.intermediates.map((i) => i.coords));
    }
    coords.push(firstRoute.toCoords);

    setCoordsPath(coords);
  } else {
    setCoordsPath([]);
    setSelectedRouteId(null);
  }

  const res = findBestPath(stops, routes, from, to, priority);
  setResult(res);
};

  const stopNames = stops.map((s) => s.name);

  return (
    <div className="app">
      <header className="header">
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18 }}>Ghana Trotro Transit</h1>
          <div style={{ flex: 1 }} />

          {/* Controls (unchanged) */}
          <div className="controls" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* From Search */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="From..."
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", width: 160 }}
              />
              {from && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#68439bff",
                    borderRadius: 6,
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    maxHeight: 150,
                    overflowY: "auto",
                    zIndex: 1000,
                  }}
                >
                  {stopNames
                    .filter((n) => n.toLowerCase().includes(from.toLowerCase()) && n !== from)
                    .map((n) => (
                      <li
                        key={n}
                        onClick={() => setFrom(n)}
                        style={{ padding: "6px 10px", cursor: "pointer" }}
                      >
                        {n}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* To Search */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="To..."
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", width: 160 }}
              />
              {to && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#68439bff",
                    borderRadius: 6,
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    maxHeight: 150,
                    overflowY: "auto",
                    zIndex: 1000,
                  }}
                >
                  {stopNames
                    .filter((n) => n.toLowerCase().includes(to.toLowerCase()) && n !== to)
                    .map((n) => (
                      <li
                        key={n}
                        onClick={() => setTo(n)}
                        style={{ padding: "6px 10px", cursor: "pointer" }}
                      >
                        {n}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Priority */}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc" }}
            >
              <option value="fare">Cheapest-first</option>
              <option value="distance">Shortest-distance-first</option>
              <option value="stops">Fewest-stops-first</option>
            </select>

            {/* Road Routing */}
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={useRoadRouting}
                onChange={(e) => setUseRoadRouting(e.target.checked)}
              />
              Road routing
            </label>

            {/* Button */}
            <button
              onClick={handleFind}
              style={{
                background: "#fff",
                color: "#6b21a8ff",
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
              }}
            >
              Find Route
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div style={{ position: "absolute", inset: 0 }}>
          {/* ✅ Pass selectedRouteId */}
          <MapView
            stopsCoords={coordsPath}
            useRoadRouting={useRoadRouting}
            selectedRouteId={selectedRouteId}
          />
        </div>

                {/* ✅ Bottom card now shows multiple routes with stop details */}
        <div className="bottom-card">
          {matchingRoutes.length ? (
            <div
              style={{
                maxHeight: "40vh",
                overflowY: "auto",
                maxWidth: 1100,
                margin: "0 auto",
                background: "#fff",
                padding: 14,
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              <h3 style={{ marginBottom: 8 }}>Available Routes</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {matchingRoutes.map((route) => {
  // ✅ Build the full stop sequence
  const stopNames = [
    route.from,
    ...(route.intermediates?.map((i) => i.name) ?? []),
    route.to,
  ];

// ✅ Build stop sequence for this specific route
const routeStops = [
  route.from,
  ...(route.intermediates?.map((i) => i.name) ?? []),
  route.to,
];

// ✅ Build leg segments with fare lookup from local routes[]
const segments = routeStops.slice(0, -1).map((stop, idx) => {
  const nextStop = routeStops[idx + 1];

  // Find all matching routes between stop and nextStop
  const possibleLegs = routes.filter(
    (r) => r.from === stop && r.to === nextStop
  );

  // Pick the cheapest fare (or first one if same)
  const legFare =
    possibleLegs.length > 0
      ? Math.min(...possibleLegs.map((r) => r.fare || 0))
      : 0;

  return {
    from: stop,
    to: nextStop,
    fare: legFare,
  };
});

// ✅ Calculate total fare
const totalFare = segments.reduce((acc, s) => acc + s.fare, 0);


  return (
    <li
      key={route.id}
      onClick={() => {
        setSelectedRouteId(route.id);

        const coords: [number, number][] = [];
        coords.push(route.fromCoords);
        if (route.intermediates?.length) {
          coords.push(...route.intermediates.map((i) => i.coords));
        }
        coords.push(route.toCoords);

        setCoordsPath(coords);
      }}
      style={{
        padding: "10px",
        marginBottom: 6,
        borderRadius: 8,
        cursor: "pointer",
        background:
          route.id === selectedRouteId ? "#f3e8ff" : "#fafafa",
        border:
          route.id === selectedRouteId
            ? "2px solid #6b21a8"
            : "1px solid #ddd",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        {route.from} → {route.to}
      </div>

      {/* ✅ Stops with correct segment fares */}
      <ul
        style={{
          margin: "6px 0",
          paddingLeft: 16,
          fontSize: 13,
          color: "#444",
        }}
      >
        {segments.map((s, idx) => (
          <li key={idx}>
            {s.from} → {s.to} —{" "}
            <span style={{ color: "green" }}>₵{s.fare}</span>
          </li>
        ))}
      </ul>

      {/* ✅ Total fare */}
      <div style={{ marginTop: 6, fontWeight: 600 }}>
        Total: <span style={{ color: "blue" }}>₵{totalFare}</span>
      </div>

      {/* Distance + stops count */}
      <div style={{ fontSize: 12, color: "#555" }}>
        {route.distance.toFixed(2)} km •{" "}
        {route.intermediates?.length ?? 0} intermediate stops
      </div>
    </li>
  );
})}

              </ul>
            </div>
          ) : (
            <div
              style={{
                maxWidth: 1100,
                margin: "0 auto",
                background: "#fff",
                padding: 14,
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                textAlign: "center",
              }}
            >
              No routes found
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
