import { useCallback, useEffect, useRef, useState } from "react";
import { openRoom, type LinkStatus, type RoomLink } from "./link";
import { hostApply, slim, tick, type ClientMsg } from "./reduce";
import {
  initialSnap,
  partyCode,
  uid,
  type Role,
  type Settings,
  type Snapshot,
} from "./types";

const PID = "hm-pid";
const PNAME = "hm-name";

export function loadName(): string {
  try {
    return localStorage.getItem(PNAME) || "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(PNAME, name);
  } catch {
    /* ignore */
  }
}

function loadPid(): string {
  try {
    let id = localStorage.getItem(PID);
    if (!id) {
      id = uid("p");
      localStorage.setItem(PID, id);
    }
    return id;
  } catch {
    return uid("p");
  }
}

interface WireSnap {
  t: "snap";
  snap: Snapshot;
}

export function useHunt() {
  const [meId, setMeId] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("connecting");
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number | null } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [waiting, setWaiting] = useState(false);

  const snapRef = useRef<Snapshot | null>(null);
  const linkRef = useRef<RoomLink | null>(null);
  const meRef = useRef("");
  const gpsRef = useRef(gps);
  const skew = useRef(0);
  gpsRef.current = gps;

  const adopt = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnap(next);
    skew.current = next.now - Date.now();
  }, []);

  const publishSnap = useCallback((next: Snapshot) => {
    const stamped = { ...next, now: Date.now() };
    snapRef.current = stamped;
    setSnap(stamped);
    linkRef.current?.publish({ t: "snap", snap: slim(stamped) });
  }, []);

  const detach = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
  }, []);

  const attach = useCallback(
    (code: string) => {
      detach();
      linkRef.current = openRoom(
        code,
        (raw) => {
          const msg = raw as WireSnap | ClientMsg;
          if (!msg || typeof msg !== "object" || !("t" in msg)) return;
          if (msg.t === "snap") {
            const incoming = (msg as WireSnap).snap;
            if (!incoming?.code) return;
            const local = snapRef.current;
            if (incoming.hostId === meRef.current) {
              if (!local) adopt(incoming);
              return;
            }
            if (!local || incoming.seq >= local.seq) adopt(incoming);
            setWaiting(false);
            return;
          }
          const local = snapRef.current;
          if (!local || local.hostId !== meRef.current) return;
          const next = hostApply(local, msg as ClientMsg);
          publishSnap(next);
        },
        setLinkStatus,
      );
    },
    [adopt, detach, publishSnap],
  );

  useEffect(() => {
    const id = loadPid();
    meRef.current = id;
    setMeId(id);
    return () => detach();
  }, [detach]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Host heartbeat — keeps pings, shrink and tag timeouts moving on slow links.
  useEffect(() => {
    if (!snap || snap.hostId !== meId) return;
    if (snap.phase === "lobby") return;
    const id = window.setInterval(() => {
      const cur = snapRef.current;
      if (!cur || cur.hostId !== meRef.current || cur.phase === "lobby" || cur.phase === "end") return;
      const next = tick(cur, Date.now());
      publishSnap({ ...next, seq: cur.seq + 1 });
    }, 4000);
    return () => window.clearInterval(id);
  }, [snap?.code, snap?.phase, snap?.hostId, meId, publishSnap]);

  // GPS only once a round is on — SCRAM shares location only during play.
  // Lobby still exposes a one-shot fix via locate().
  useEffect(() => {
    if (!snap || snap.phase === "lobby" || snap.phase === "end") return;
    if (!navigator.geolocation) {
      setGpsError("This browser has no location.");
      return;
    }
    setGpsError(null);
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy ?? null,
        });
      },
      (err) => setGpsError(err.code === 1 ? "Location permission denied." : "Still searching for GPS…"),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [snap?.code, snap?.phase]);

  useEffect(() => {
    if (!snap || snap.phase === "lobby" || snap.phase === "end") return;
    const sendPos = () => {
      const g = gpsRef.current;
      if (!g) return;
      const msg: ClientMsg = {
        t: "pos",
        id: meRef.current,
        lat: Math.round(g.lat * 1e5) / 1e5,
        lng: Math.round(g.lng * 1e5) / 1e5,
        acc: g.acc == null ? null : Math.round(g.acc),
        ts: Date.now(),
      };
      const local = snapRef.current;
      if (local && local.hostId === meRef.current) publishSnap(hostApply(local, msg));
      else linkRef.current?.publish(msg);
    };
    sendPos();
    const id = window.setInterval(sendPos, 6000);
    return () => window.clearInterval(id);
  }, [snap?.code, snap?.phase, publishSnap]);

  useEffect(() => {
    if (!snap || (snap.phase !== "head" && snap.phase !== "live")) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      navigator.wakeLock?.request("screen").then((s) => {
        lock = s;
      }).catch(() => undefined);
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => undefined);
    };
  }, [snap?.code, snap?.phase]);

  const create = useCallback(
    (name: string, title: string) => {
      const clean = name.trim().slice(0, 18);
      if (clean.length < 1) return;
      if (!meRef.current) {
        const id = loadPid();
        meRef.current = id;
        setMeId(id);
      }
      saveName(clean);
      const code = partyCode();
      const created = initialSnap(code, meRef.current, clean, title);
      attach(code);
      publishSnap(created);
      setWaiting(false);
    },
    [attach, publishSnap],
  );

  const join = useCallback(
    (code: string, name: string) => {
      const clean = name.trim().slice(0, 18);
      const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (clean.length < 1 || c.length !== 6) return;
      if (!meRef.current) {
        const id = loadPid();
        meRef.current = id;
        setMeId(id);
      }
      saveName(clean);
      setWaiting(true);
      setSnap(null);
      snapRef.current = null;
      attach(c);
      window.setTimeout(() => {
        linkRef.current?.publish({ t: "hello", id: meRef.current, name: clean });
      }, 300);
    },
    [attach],
  );

  const send = useCallback(
    (msg: ClientMsg) => {
      const local = snapRef.current;
      if (local && local.hostId === meRef.current) publishSnap(hostApply(local, msg));
      else linkRef.current?.publish(msg);
    },
    [publishSnap],
  );

  const leave = useCallback(() => {
    const local = snapRef.current;
    if (local) {
      linkRef.current?.publish({ t: "bye", id: meRef.current });
    }
    detach();
    snapRef.current = null;
    setSnap(null);
    setWaiting(false);
    setGps(null);
  }, [detach]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("This browser has no location.");
      return;
    }
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy ?? null,
        };
        setGps(fix);
        const local = snapRef.current;
        if (local && local.hostId === meRef.current && local.phase === "lobby") {
          send({ t: "set", from: meRef.current, center: { lat: fix.lat, lng: fix.lng } });
        }
      },
      (err) => setGpsError(err.code === 1 ? "Location permission denied." : "Couldn't get a fix yet."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, [send]);

  const me = snap?.players.find((p) => p.id === meId) ?? null;
  const isHost = !!snap && snap.hostId === meId;

  return {
    snap,
    linkStatus,
    gps,
    gpsError,
    now,
    waiting,
    create,
    join,
    leave,
    send,
    locate,
    setWaiting,
  };
}

export type HuntApi = ReturnType<typeof useHunt>;

export function patchSettings(api: HuntApi, settings: Partial<Settings>) {
  if (!api.isHost || !api.snap) return;
  api.send({ t: "set", from: api.meId, settings });
}

export function setRole(api: HuntApi, id: string, role: Role) {
  api.send({ t: "set", from: api.meId, role: { id, role } });
}
