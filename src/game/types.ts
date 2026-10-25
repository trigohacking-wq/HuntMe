export type Role = "hunter" | "runner";
export type Phase = "lobby" | "head" | "live" | "end";
export type Spectate = "delay" | "live" | "off";

export interface Settings {
  roundMin: number;
  headMin: number;
  /** 0 = no pings */
  pingMin: number;
  /** 0 = zone off */
  radius: number;
  /** 0 = no shrink */
  shrinkMin: number;
  spectate: Spectate;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  host: boolean;
  lat: number | null;
  lng: number | null;
  acc: number | null;
  seen: number;
  outSince: number | null;
  revealed: boolean;
  taggedAt: number | null;
  tags: number;
  trail: TrailPt[];
}

export interface TrailPt {
  lat: number;
  lng: number;
  ts: number;
}

export interface PingPin {
  id: string;
  lat: number;
  lng: number;
}

export interface PendingTag {
  id: string;
  from: string;
  target: string;
  ts: number;
  dist: number | null;
}

export interface ChatLine {
  id: string;
  from: string;
  name: string;
  role: Role;
  text: string;
  ts: number;
}

export interface Snapshot {
  seq: number;
  code: string;
  title: string;
  hostId: string;
  settings: Settings;
  center: { lat: number; lng: number } | null;
  phase: Phase;
  startedAt: number | null;
  /** Host clock when this snapshot was sent. */
  now: number;
  pingAt: number | null;
  ping: PingPin[];
  nextShrink: number | null;
  shrinkWarn: boolean;
  players: Player[];
  pending: PendingTag[];
  chat: ChatLine[];
  endedReason: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  roundMin: 30,
  headMin: 3,
  pingMin: 2,
  radius: 400,
  shrinkMin: 0,
  spectate: "delay",
};

export function uid(prefix = ""): string {
  const a = Math.random().toString(36).slice(2, 8);
  const b = Date.now().toString(36).slice(-4);
  return prefix + a + b;
}

export function partyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function freshPlayer(id: string, name: string, host: boolean, role: Role): Player {
  return {
    id,
    name: name.slice(0, 18),
    role,
    host,
    lat: null,
    lng: null,
    acc: null,
    seen: Date.now(),
    outSince: null,
    revealed: false,
    taggedAt: null,
    tags: 0,
    trail: [],
  };
}

export function initialSnap(code: string, hostId: string, hostName: string, title: string): Snapshot {
  return {
    seq: 1,
    code,
    title: title.slice(0, 28) || "Night hunt",
    hostId,
    settings: { ...DEFAULT_SETTINGS },
    center: null,
    phase: "lobby",
    startedAt: null,
    now: Date.now(),
    pingAt: null,
    ping: [],
    nextShrink: null,
    shrinkWarn: false,
    players: [freshPlayer(hostId, hostName, true, "hunter")],
    pending: [],
    chat: [],
    endedReason: null,
  };
}
