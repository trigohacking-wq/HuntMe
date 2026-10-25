import { useEffect, useRef } from "react";
import type { PingPin, Player, Snapshot } from "@/game/types";
import "leaflet/dist/leaflet.css";

interface Props {
  snap: Snapshot;
  pins: Array<Player | PingPin>;
  showCenter?: boolean;
  onPick?: (lat: number, lng: number) => void;
  trails?: boolean;
}

export function ZoneMap({ snap, pins, showCenter = true, onPick, trails }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      const start = snap.center ?? { lat: 51.5, lng: -0.12 };
      map = L.map(el.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([start.lat, start.lng], snap.center ? 15 : 3);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "&copy; OSM &copy; CARTO",
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("click", (ev) => {
        onPickRef.current?.(ev.latlng.lat, ev.latlng.lng);
      });
      window.setTimeout(() => map?.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Create once per game code — camera stays put while pins move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.code]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    void import("leaflet").then((L) => {
      layer.clearLayers();
      if (showCenter && snap.center && snap.settings.radius > 0) {
        L.circle([snap.center.lat, snap.center.lng], {
          radius: snap.settings.radius,
          color: "#22c55e",
          weight: 2,
          fillColor: "#22c55e",
          fillOpacity: 0.06,
        }).addTo(layer);
      }
      if (trails) {
        for (const p of snap.players) {
          if (p.trail.length < 2) continue;
          L.polyline(
            p.trail.map((pt) => [pt.lat, pt.lng] as [number, number]),
            { color: p.role === "hunter" ? "#22c55e" : "#e7f2ea", weight: 3, opacity: 0.8 },
          ).addTo(layer);
        }
      }
      for (const pin of pins) {
        if (pin.lat == null || pin.lng == null) continue;
        const player = "role" in pin ? pin : snap.players.find((p) => p.id === pin.id);
        const revealed = player && "revealed" in player && player.revealed;
        const hunter = player?.role === "hunter";
        L.circleMarker([pin.lat, pin.lng], {
          radius: revealed ? 9 : 7,
          color: revealed ? "#f07167" : hunter ? "#22c55e" : "#e7f2ea",
          fillColor: hunter ? "#22c55e" : "#121714",
          fillOpacity: 0.95,
          weight: 2,
        })
          .bindTooltip(player?.name ?? "Ping", { permanent: false, direction: "top" })
          .addTo(layer);
      }
    });
  }, [pins, showCenter, snap, trails]);

  return <div ref={el} className="h-full w-full bg-surface" />;
}
