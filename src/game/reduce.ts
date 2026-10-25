import { haversine } from "./geo";
import {
  freshPlayer,
  type ChatLine,
  type PendingTag,
  type Phase,
  type Player,
  type Role,
  type Settings,
  type Snapshot,
} from "./types";

const TAG_WINDOW_MS = 12000;
const REVEAL_MS = 30000;
const TRAIL_MIN_M = 18;
const TRAIL_CAP = 50;
const CHAT_CAP = 40;

export interface HelloMsg {
  t: "hello";
  id: string;
  name: string;
}
export interface PosMsg {
  t: "pos";
  id: string;
  lat: number;
  lng: number;
  acc: number | null;
  ts: number;
}
export interface ChatMsg {
  t: "chat";
  id: string;
  from: string;
  name: string;
  role: Role;
  text: string;
  ts: number;
}
export interface TagMsg {
  t: "tag";
  id: string;
  from: string;
  target: string;
  dist: number | null;
  ts: number;
}
export interface TagResMsg {
  t: "tagres";
  id: string;
  tagId: string;
  accept: boolean;
}
export interface SetMsg {
  t: "set";
  from: string;
  settings?: Partial<Settings>;
  center?: { lat: number; lng: number } | null;
  title?: string;
  role?: { id: string; role: Role };
  bot?: boolean;
}
export interface StartMsg {
  t: "start";
  from: string;
}
export interface EndMsg {
  t: "end";
  from: string;
}
export interface ByeMsg {
  t: "bye";
  id: string;
}

export type ClientMsg =
  | HelloMsg
  | PosMsg
  | ChatMsg
  | TagMsg
  | TagResMsg
  | SetMsg
  | StartMsg
  | EndMsg
  | ByeMsg;

export function slim(snap: Snapshot): Snapshot {
  return {
    ...snap,
    players: snap.players.map((p) => ({
      ...p,
      trail: snap.phase === "end" ? p.trail.slice(-TRAIL_CAP) : [],
    })),
    chat: snap.chat.slice(-20),
  };
}

export function hostApply(snap: Snapshot, msg: ClientMsg): Snapshot {
  const now = Date.now();
  let next = tick({ ...snap, now }, now);

  switch (msg.t) {
    case "hello": {
      if (next.players.some((p) => p.id === msg.id)) {
        next = {
          ...next,
          players: next.players.map((p) =>
            p.id === msg.id ? { ...p, name: msg.name.slice(0, 18), seen: now } : p,
          ),
        };
      } else if (next.phase !== "end" && next.players.length < 40) {
        const role: Role = next.phase === "lobby" ? "runner" : "runner";
        next = {
          ...next,
          players: [...next.players, freshPlayer(msg.id, msg.name, false, role)],
        };
      }
      break;
    }
    case "pos": {
      next = {
        ...next,
        players: next.players.map((p) => (p.id === msg.id ? applyPos(p, msg, next, now) : p)),
      };
      break;
    }
    case "chat": {
      const player = next.players.find((p) => p.id === msg.from);
      if (!player) break;
      const text = msg.text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (!text) break;
      const line: ChatLine = {
        id: msg.id,
        from: player.id,
        name: player.name,
        role: player.role,
        text,
        ts: now,
      };
      if (next.chat.some((c) => c.id === line.id)) break;
      next = { ...next, chat: [...next.chat, line].slice(-CHAT_CAP) };
      break;
    }
    case "tag": {
      if (next.phase !== "live" && next.phase !== "head") break;
      const from = next.players.find((p) => p.id === msg.from);
      const target = next.players.find((p) => p.id === msg.target);
      if (!from || !target || from.role !== "hunter" || target.role !== "runner") break;
      if (target.taggedAt) break;
      if (next.pending.some((t) => t.target === target.id)) break;
      const tag: PendingTag = {
        id: msg.id,
        from: from.id,
        target: target.id,
        ts: now,
        dist: msg.dist,
      };
      next = { ...next, pending: [...next.pending, tag] };
      break;
    }
    case "tagres": {
      next = resolveTag(next, msg.tagId, msg.accept, now);
      break;
    }
    case "set": {
      if (msg.from !== next.hostId || next.phase !== "lobby") break;
      const settings = { ...next.settings, ...sanitizeSettings(msg.settings) };
      let center = next.center;
      if (msg.center !== undefined) center = msg.center;
      let title = next.title;
      if (typeof msg.title === "string" && msg.title.trim()) title = msg.title.trim().slice(0, 28);
      let players = next.players;
      if (msg.role) {
        players = players.map((p) =>
          p.id === msg.role!.id ? { ...p, role: msg.role!.role } : p,
        );
      }
      if (msg.bot && players.length < 40) {
        const bot = freshPlayer(`bot${Math.random().toString(36).slice(2, 7)}`, "Practice runner", false, "runner");
        if (center) {
          bot.lat = center.lat;
          bot.lng = center.lng;
          bot.seen = Date.now();
        }
        players = [...players, bot];
      }
      next = { ...next, settings, center, title, players };
      break;
    }
    case "start": {
      if (msg.from !== next.hostId || next.phase !== "lobby") break;
      if (next.settings.radius > 0 && !next.center) break;
      const hunters = next.players.filter((p) => p.role === "hunter").length;
      const runners = next.players.filter((p) => p.role === "runner").length;
      if (hunters < 1 || runners < 1) break;
      const startedAt = now;
      const headMs = next.settings.headMin * 60000;
      next = {
        ...next,
        phase: next.settings.headMin > 0 ? "head" : "live",
        startedAt,
        nextShrink:
          next.settings.shrinkMin > 0 ? startedAt + headMs + next.settings.shrinkMin * 60000 : null,
        ping: [],
        pingAt: null,
        shrinkWarn: false,
      };
      break;
    }
    case "end": {
      if (msg.from !== next.hostId || next.phase === "lobby" || next.phase === "end") break;
      next = { ...next, phase: "end", endedReason: "Host ended the round" };
      break;
    }
    case "bye": {
      if (msg.id === next.hostId) break;
      if (next.phase === "lobby") {
        next = { ...next, players: next.players.filter((p) => p.id !== msg.id) };
      }
      break;
    }
    default:
      break;
  }

  next = tick(next, Date.now());
  next = maybeFinish(next);
  return { ...next, seq: snap.seq + 1, now: Date.now() };
}

export function tick(snap: Snapshot, now: number): Snapshot {
  if (!snap.startedAt || snap.phase === "lobby" || snap.phase === "end") return snap;
  const headMs = snap.settings.headMin * 60000;
  const roundMs = snap.settings.roundMin * 60000;
  const liveStart = snap.startedAt + headMs;
  let phase: Phase = snap.phase;
  let endedReason = snap.endedReason;
  if (phase === "head" && now >= liveStart) phase = "live";
  if ((phase === "live" || phase === "head") && now >= snap.startedAt + headMs + roundMs) {
    phase = "end";
    endedReason = "Time";
  }

  let { radius } = snap.settings;
  let nextShrink = snap.nextShrink;
  let shrinkWarn = false;
  const settings = snap.settings;
  if (phase === "live" && settings.shrinkMin > 0 && nextShrink) {
    shrinkWarn = now >= nextShrink - 60000 && now < nextShrink;
    if (now >= nextShrink) {
      radius = Math.max(80, Math.round(radius * 0.8));
      nextShrink += settings.shrinkMin * 60000;
      shrinkWarn = false;
    }
  }

  let ping = snap.ping;
  let pingAt = snap.pingAt;
  if (phase === "live" && settings.pingMin > 0) {
    const due = !pingAt || now - pingAt >= settings.pingMin * 60000;
    if (due) {
      ping = snap.players
        .filter((p) => p.role === "runner" && !p.taggedAt && p.lat != null && p.lng != null)
        .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng! }));
      pingAt = now;
    }
  }

  let working = snap;
  for (const tag of [...snap.pending]) {
    if (now - tag.ts >= TAG_WINDOW_MS) {
      const stands = tag.dist == null || tag.dist <= 45;
      working = resolveTag(working, tag.id, stands, now);
    }
  }
  snap = working;

  const players = snap.players.map((p) =>
    refreshZone(p, { ...snap, settings: { ...settings, radius } }, now, phase),
  );

  return maybeFinish({
    ...snap,
    phase,
    endedReason,
    settings: { ...settings, radius },
    nextShrink,
    shrinkWarn,
    ping,
    pingAt,
    players,
  });
}

function maybeFinish(snap: Snapshot): Snapshot {
  if (snap.phase !== "live" && snap.phase !== "head") return snap;
  const runners = snap.players.filter((p) => p.role === "runner");
  if (runners.length > 0 && runners.every((p) => p.taggedAt)) {
    return { ...snap, phase: "end", endedReason: "Every runner was tagged" };
  }
  return snap;
}

function refreshZone(p: Player, snap: Snapshot, now: number, phase: Snapshot["phase"]): Player {
  if (p.taggedAt || p.role !== "runner") return { ...p, revealed: false, outSince: null };
  if (phase !== "live" || !snap.center || snap.settings.radius <= 0 || p.lat == null || p.lng == null) {
    return { ...p, revealed: false, outSince: null };
  }
  const dist = haversine(p.lat, p.lng, snap.center.lat, snap.center.lng);
  if (dist > snap.settings.radius) {
    const outSince = p.outSince ?? now;
    const revealed = now - outSince >= REVEAL_MS;
    return { ...p, outSince, revealed };
  }
  return { ...p, outSince: null, revealed: false };
}

function applyPos(p: Player, msg: PosMsg, snap: Snapshot, now: number): Player {
  if (!Number.isFinite(msg.lat) || !Number.isFinite(msg.lng)) return p;
  const trail = [...p.trail];
  const last = trail[trail.length - 1];
  if (!last || haversine(last.lat, last.lng, msg.lat, msg.lng) >= TRAIL_MIN_M) {
    trail.push({ lat: msg.lat, lng: msg.lng, ts: msg.ts || now });
    if (trail.length > TRAIL_CAP) trail.shift();
  }
  const moved = refreshZone(
    { ...p, lat: msg.lat, lng: msg.lng, acc: msg.acc, seen: now, trail },
    snap,
    now,
    snap.phase,
  );
  return moved;
}

function resolveTag(snap: Snapshot, tagId: string, accept: boolean, now: number): Snapshot {
  const tag = snap.pending.find((t) => t.id === tagId);
  if (!tag) return snap;
  let players = snap.players;
  if (accept || (tag.dist != null && tag.dist <= 45) || tag.dist == null) {
    // Dispute wins only when phones were clearly far apart.
    const stands = accept || tag.dist == null || tag.dist <= 45;
    if (stands) {
      players = players.map((p) => {
        if (p.id === tag.target && !p.taggedAt) return { ...p, taggedAt: now, revealed: false };
        if (p.id === tag.from) return { ...p, tags: p.tags + 1 };
        return p;
      });
    }
  }
  return { ...snap, pending: snap.pending.filter((t) => t.id !== tagId), players };
}

function sanitizeSettings(partial: Partial<Settings> | undefined): Partial<Settings> {
  if (!partial) return {};
  const out: Partial<Settings> = {};
  if (partial.roundMin != null) out.roundMin = clamp(partial.roundMin, 10, 180);
  if (partial.headMin != null) out.headMin = clamp(partial.headMin, 0, 15);
  if (partial.pingMin != null) out.pingMin = clamp(partial.pingMin, 0, 30);
  if (partial.radius != null) out.radius = clamp(partial.radius, 0, 3000);
  if (partial.shrinkMin != null) out.shrinkMin = clamp(partial.shrinkMin, 0, 30);
  if (partial.spectate === "delay" || partial.spectate === "live" || partial.spectate === "off") {
    out.spectate = partial.spectate;
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
