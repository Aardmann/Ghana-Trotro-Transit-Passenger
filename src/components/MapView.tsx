import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";

type LatLng = [number, number];

interface MapViewProps {
  stopsCoords: LatLng[];         // [lat,lng] in order
  useRoadRouting?: boolean;      // if true, attempt ORS routing
}

function FitBounds({ coords }: { coords: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length === 0) return;
    // convert to LatLng tuples
    // @ts-ignore
    map.fitBounds(coords, { padding: [50, 50] });
  }, [map, coords]);
  return null;
}

export default function MapView({ stopsCoords, useRoadRouting = false }: MapViewProps) {
  const [roadLine, setRoadLine] = useState<LatLng[] | null>(null);
  const center: LatLng = stopsCoords[0] ?? [5.65, -0.16];

  useEffect(() => {
    setRoadLine(null);
    if (!useRoadRouting) return;

    const key = (import.meta.env.VITE_ORS_API_KEY as string) || "";
    if (!key) {
      console.warn("VITE_ORS_API_KEY not set — falling back to straight lines");
      return;
    }

    if (!stopsCoords || stopsCoords.length < 2) return;

    // Build ORS coordinates: [[lng,lat], ...]
    const coordList = stopsCoords.map((c) => [c[1], c[0]]); // [lng, lat]

    const fetchRoute = async () => {
      try {
        const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
        const body = { coordinates: coordList };
        const resp = await axios.post(url, body, {
          headers: { Authorization: key, "Content-Type": "application/json" },
        });
        // geometry is a LineString coordinates array of [lng, lat] pairs
        const geom = resp.data?.features?.[0]?.geometry?.coordinates;
        if (Array.isArray(geom)) {
          const line: LatLng[] = geom.map((pt: [number, number]) => [pt[1], pt[0]]);
          setRoadLine(line);
        } else {
          console.warn("ORS returned unexpected geometry, falling back to straight polyline");
        }
      } catch (err) {
        console.error("ORS routing error:", err);
      }
    };

    fetchRoute();
  }, [stopsCoords, useRoadRouting]);

  return (
    <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

      {/* markers for each stop */}
      {stopsCoords.map((pos, i) => (
        <Marker key={i} position={pos}>
          <Popup>
            {i === 0 ? "Start" : i === stopsCoords.length - 1 ? "Destination" : `Stop ${i}`}
          </Popup>
        </Marker>
      ))}

      {/* road line if available, otherwise straight connections */}
      {roadLine && roadLine.length > 1 ? (
        <Polyline positions={roadLine} color="purple" weight={5} opacity={0.9} />
      ) : (
        stopsCoords.length > 1 && <Polyline positions={stopsCoords} color="purple" weight={4} />
      )}

      <FitBounds coords={roadLine ?? stopsCoords} />
    </MapContainer>
  );
}
