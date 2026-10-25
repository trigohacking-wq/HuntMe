import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Crosshair,
  Map as MapIcon,
  MessageSquare,
  Radar,
  Radio,
  Users,
} from "lucide-react";
import { ageLabel, bearing, formatClock, formatDist, haversine } from "@/game/geo";
import type { PingPin, Player, Role, Snapshot } from "@/game/types";
import { patchSettings, setRole, useHunt, type HuntApi } from "@/game/use-hunt";
import { ZoneMap } from "./zone-map";

type Tab = "radar" | "map" | "radio" | "crew";

export function HuntApp() {
  const api = useHunt();
  if (!api.snap) return <Gate api={api} />;
  if (api.snap.phase === "lobby") return <Lobby api={api} />;
  if (api.snap.phase === "end") return <Finale api={api} />;
  return <Round api={api} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg text-fg">{children}</div>
  );
}

function Wordmark() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-lg border border-line bg-surface">
        <Crosshair className="size-8 text-accent" strokeWidth={1.75} />
      </div>
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Hunt Me</h1>
        <p className="mt-2 text-sm text-muted">Runners hide. Hunters get pings. The phone keeps score.</p>
      </div>
    </div>
  );
}

function Gate({ api }: { api: HuntApi }) {
  const [mode, setMode] = useState<"home" | "create" | "join">("home");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    setName(loadSafeName());
  }, []);

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
        <Wordmark />
        {mode === "home" && (
          <div className="flex flex-col gap-3">
            <button className="h-12 rounded-lg bg-accent font-semibold text-bg" onClick={() => setMode("create")}>
              Create a game
            </button>
            <button
              className="h-12 rounded-lg border border-line bg-surface font-semibold"
              onClick={() => setMode("join")}
            >
              Join with a code
            </button>
            <p className="text-center text-xs text-muted">
              Location is shared only during a round, and only with this game. Built for patchy 4G —
              pings, not a live stream.
            </p>
          </div>
        )}
        {mode === "create" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              api.create(name, title);
            }}
          >
            <Field label="Your name" value={name} onChange={setName} placeholder="Alex" />
            <Field label="Game name" value={title} onChange={setTitle} placeholder="Park after dark" />
            <button className="h-12 rounded-lg bg-accent font-semibold text-bg" type="submit">
              Open lobby
            </button>
            <TextBtn onClick={() => setMode("home")}>Back</TextBtn>
          </form>
        )}
        {mode === "join" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              api.join(code, name);
            }}
          >
            <Field label="Your name" value={name} onChange={setName} placeholder="Alex" />
            <label className="flex flex-col gap-1 text-sm text-muted">
              Code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="ABC123"
                className="h-12 rounded-lg border border-line bg-surface text-center text-2xl font-bold tracking-widest text-accent"
                autoCapitalize="characters"
              />
            </label>
            <button className="h-12 rounded-lg bg-accent font-semibold text-bg" type="submit">
              Join
            </button>
            {api.waiting && (
              <p className="text-center text-sm text-muted">Looking for that game… stay on this screen.</p>
            )}
            <TextBtn onClick={() => { api.setWaiting(false); setMode("home"); }}>Back</TextBtn>
          </form>
        )}
      </div>
    </Shell>
  );
}

function Lobby({ api }: { api: HuntApi }) {
  const snap = api.snap!;
  const s = snap.settings;
  const hunters = snap.players.filter((p) => p.role === "hunter").length;
  const runners = snap.players.filter((p) => p.role === "runner").length;
  const canStart = hunters >= 1 && runners >= 1 && (s.radius === 0 || !!snap.center);

  return (
    <Shell>
      <header className="flex items-center justify-between px-5 pt-5">
        <button className="text-sm text-muted" onClick={api.leave}>
          Leave
        </button>
        <LinkPill status={api.linkStatus} />
      </header>
      <div className="px-5 pt-4">
        <p className="text-xs uppercase tracking-widest text-muted">{snap.title}</p>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
          <span className="text-sm text-muted">Code</span>
          <span className="text-2xl font-bold tracking-widest text-accent">{snap.code}</span>
        </div>
        <button
          className="mt-2 h-10 w-full rounded-lg border border-line text-sm"
          onClick={() => navigator.clipboard?.writeText(snap.code).catch(() => undefined)}
        >
          Copy code
        </button>
      </div>
      <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-5">
        <h2 className="text-sm text-muted">Crew · {snap.players.length}</h2>
        {snap.players.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-accent">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.name}
                {p.id === api.meId ? <span className="text-accent"> · you</span> : null}
              </p>
              <p className="text-xs text-muted">{p.host ? "Host" : "Player"}</p>
            </div>
            {api.isHost ? (
              <select
                className="h-10 rounded-lg border border-line bg-bg px-2 text-sm"
                value={p.role}
                onChange={(e) => setRole(api, p.id, e.target.value as Role)}
              >
                <option value="hunter">Hunter</option>
                <option value="runner">Runner</option>
              </select>
            ) : (
              <RoleBadge role={p.role} />
            )}
          </div>
        ))}
      </div>
      {api.isHost ? (
        <div className="space-y-3 border-t border-line px-5 py-4">
          <Slider
            label="Round"
            value={s.roundMin}
            min={10}
            max={180}
            step={5}
            suffix=" min"
            onChange={(roundMin) => patchSettings(api, { roundMin })}
          />
          <Slider
            label="Head start"
            value={s.headMin}
            min={0}
            max={15}
            step={1}
            suffix=" min"
            onChange={(headMin) => patchSettings(api, { headMin })}
          />
          <Slider
            label="Ping every"
            value={s.pingMin}
            min={0}
            max={15}
            step={1}
            suffix={s.pingMin === 0 ? " · off" : " min"}
            onChange={(pingMin) => patchSettings(api, { pingMin })}
          />
          <Slider
            label="Zone"
            value={s.radius}
            min={0}
            max={2000}
            step={50}
            suffix={s.radius === 0 ? " · anywhere" : " m"}
            onChange={(radius) => patchSettings(api, { radius })}
          />
          <Slider
            label="Shrink every"
            value={s.shrinkMin}
            min={0}
            max={20}
            step={1}
            suffix={s.shrinkMin === 0 ? " · off" : " min"}
            onChange={(shrinkMin) => patchSettings(api, { shrinkMin })}
          />
          <label className="flex items-center justify-between text-sm text-muted">
            After a tag
            <select
              className="h-10 rounded-lg border border-line bg-bg px-2 text-fg"
              value={s.spectate}
              onChange={(e) =>
                patchSettings(api, { spectate: e.target.value as Snapshot["settings"]["spectate"] })
              }
            >
              <option value="delay">Watch, 1 min behind</option>
              <option value="live">Watch live</option>
              <option value="off">Sit out</option>
            </select>
          </label>
          <button
            className="h-11 w-full rounded-lg border border-line text-sm"
            onClick={() => api.send({ t: "set", from: api.meId, bot: true })}
          >
            Add a practice runner
          </button>
          <button className="h-12 w-full rounded-lg border border-line" onClick={api.locate}>
            {snap.center ? "Zone center set · tap to update" : "Set zone center from my location"}
          </button>
          {api.gpsError && <p className="text-xs text-danger">{api.gpsError}</p>}
          {!canStart && (
            <p className="text-center text-xs text-muted">
              Need one hunter, one runner{s.radius > 0 ? ", and a zone center" : ""}.
            </p>
          )}
          <button
            className="h-12 w-full rounded-lg bg-accent font-semibold text-bg disabled:opacity-40"
            disabled={!canStart}
            onClick={() => api.send({ t: "start", from: api.meId })}
          >
            Start hunt
          </button>
        </div>
      ) : (
        <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">
          Waiting for the host to start. You'll get a head start to hide.
        </p>
      )}
    </Shell>
  );
}

function Round({ api }: { api: HuntApi }) {
  const snap = api.snap!;
  const me = api.me;
  const [tab, setTab] = useState<Tab>("radar");
  const [chat, setChat] = useState("");
  const seenPing = useRef<number | null>(null);
  const view = useSpectate(snap, me, api.now);

  useEffect(() => {
    if (snap.phase !== "live" || !snap.pingAt || me?.role !== "hunter") return;
    if (seenPing.current === snap.pingAt) return;
    seenPing.current = snap.pingAt;
    buzz([30, 40, 30]);
  }, [snap.pingAt, snap.phase, me?.role]);

  useEffect(() => {
    if (me?.revealed) buzz([80, 40, 80]);
  }, [me?.revealed]);

  const pending = snap.pending.find((t) => t.target === api.meId);
  const headLeft = snap.startedAt ? snap.startedAt + snap.settings.headMin * 60000 - api.now : 0;
  const roundEnd = snap.startedAt
    ? snap.startedAt + (snap.settings.headMin + snap.settings.roundMin) * 60000
    : api.now;
  const roundLeft = roundEnd - api.now;
  const shrinkLeft = snap.nextShrink ? snap.nextShrink - api.now : null;

  const oobLeft =
    me?.outSince && !me.revealed ? Math.max(0, 30000 - (api.now - me.outSince)) : null;

  return (
    <Shell>
      <header className="flex items-center justify-between px-4 pt-4">
        <button className="text-sm text-muted" onClick={api.leave}>
          Leave
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">
            {snap.phase === "head" ? "Head start" : "Live"}
          </p>
          <p className="font-semibold tabular-nums text-accent">
            {formatClock(snap.phase === "head" ? headLeft : roundLeft)}
          </p>
        </div>
        <LinkPill status={api.linkStatus} />
      </header>

      {snap.shrinkWarn && shrinkLeft != null && shrinkLeft < 60000 && (
        <Banner>Zone shrinks in {formatClock(shrinkLeft)}</Banner>
      )}
      {oobLeft != null && (
        <Banner danger>Outside the zone. Hunters see you live in {Math.ceil(oobLeft / 1000)}s.</Banner>
      )}
      {me?.revealed && <Banner danger>You're revealed until you step back inside.</Banner>}
      {pending && me?.role === "runner" && (
        <div className="mx-4 mt-2 rounded-lg border border-danger bg-surface p-3">
          <p className="text-sm font-semibold text-danger">A hunter tagged you</p>
          <div className="mt-2 flex gap-2">
            <button
              className="h-11 flex-1 rounded-lg bg-accent font-semibold text-bg"
              onClick={() => api.send({ t: "tagres", id: uidLocal(), tagId: pending.id, accept: true })}
            >
              I got tagged
            </button>
            <button
              className="h-11 flex-1 rounded-lg border border-line"
              onClick={() => api.send({ t: "tagres", id: uidLocal(), tagId: pending.id, accept: false })}
            >
              Dispute
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {tab === "radar" && <RadarPane api={api} view={view} />}
        {tab === "map" && <MapPane api={api} view={view} />}
        {tab === "radio" && (
          <div className="flex h-full flex-col px-4 pt-3">
            <p className="mb-2 flex items-center gap-2 text-xs text-muted">
              <Radio className="size-3.5" /> {me?.role === "hunter" ? "Hunter" : "Runner"} radio · the other team can't hear this
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {snap.chat.filter((c) => c.role === me?.role).length === 0 && (
                <p className="py-8 text-center text-sm text-muted">No messages yet.</p>
              )}
              {snap.chat
                .filter((c) => c.role === me?.role)
                .map((c) => (
                  <div key={c.id} className="rounded-lg bg-surface px-3 py-2">
                    <p className="text-xs text-accent">{c.name}</p>
                    <p className="text-sm">{c.text}</p>
                  </div>
                ))}
            </div>
            <form
              className="flex gap-2 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                const text = chat.trim();
                if (!text || !me) return;
                api.send({
                  t: "chat",
                  id: uidLocal(),
                  from: api.meId,
                  name: me.name,
                  role: me.role,
                  text,
                  ts: Date.now(),
                });
                setChat("");
              }}
            >
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="Quiet message"
                className="h-12 flex-1 rounded-lg border border-line bg-surface px-3"
              />
              <button className="h-12 rounded-lg bg-accent px-4 font-semibold text-bg" type="submit">
                Send
              </button>
            </form>
          </div>
        )}
        {tab === "crew" && <Crew api={api} />}
      </div>

      {me?.role === "hunter" && !me.taggedAt && snap.phase === "live" && <TagBar api={api} />}
      {me?.taggedAt && snap.settings.spectate === "off" && (
        <p className="px-4 py-3 text-center text-sm text-muted">You're out. Sit this one out.</p>
      )}

      <nav className="grid grid-cols-4 border-t border-line">
        <TabBtn active={tab === "radar"} onClick={() => setTab("radar")} icon={<Radar className="size-5" />} label="Radar" />
        <TabBtn active={tab === "map"} onClick={() => setTab("map")} icon={<MapIcon className="size-5" />} label="Map" />
        <TabBtn active={tab === "radio"} onClick={() => setTab("radio")} icon={<MessageSquare className="size-5" />} label="Radio" />
        <TabBtn active={tab === "crew"} onClick={() => setTab("crew")} icon={<Users className="size-5" />} label="Crew" />
      </nav>
      {api.isHost && (
        <button
          className="h-10 text-xs text-muted"
          onClick={() => api.send({ t: "end", from: api.meId })}
        >
          End round
        </button>
      )}
    </Shell>
  );
}

function RadarPane({ api, view }: { api: HuntApi; view: Snapshot | "wait" | "sit" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const snap = api.snap!;
  const me = api.me;
  const g = api.gps;

  const blips = useMemo(() => {
    if (!g || view === "wait" || view === "sit" || !me) return [];
    const source = view;
    return source.players
      .filter((p) => p.id !== me.id && p.lat != null && p.lng != null && !p.taggedAt)
      .map((p) => {
        const dist = haversine(g.lat, g.lng, p.lat!, p.lng!);
        const ally = p.role === me.role;
        return { p, dist, ally, brg: bearing(g.lat, g.lng, p.lat!, p.lng!) };
      })
      .filter((b) => b.dist <= 30);
  }, [g, me, view]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = node.clientWidth;
    node.width = size * dpr;
    node.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2;
    const maxR = size / 2 - 10;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(34,197,94,0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cx, (maxR * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cx, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
    for (const b of blips) {
      const rad = ((b.brg - 90) * Math.PI) / 180;
      const r = (b.dist / 30) * maxR;
      const x = cx + Math.cos(rad) * r;
      const y = cx + Math.sin(rad) * r;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = b.ally ? "#22c55e" : "#f07167";
      ctx.fill();
      ctx.fillStyle = "#e7f2ea";
      ctx.font = "11px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.ally ? b.p.name.slice(0, 10) : b.p.role, x, y - 10);
    }
  }, [blips]);

  return (
    <div className="flex h-full flex-col items-center px-4 pt-4">
      <div className="aspect-square w-full max-w-sm">
        <canvas ref={canvas} className="h-full w-full rounded-full border border-line bg-surface" />
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        30 m heartbeat. Green is your team. Red is the other side — direction only, no names.
      </p>
      {view === "wait" && <p className="mt-2 text-sm text-muted">Spectator view catches up in a minute.</p>}
      {snap.phase === "head" && me?.role === "hunter" && (
        <p className="mt-2 text-sm text-muted">Runners are hiding. You get nothing until the head start ends.</p>
      )}
      {snap.phase === "live" && me?.role === "hunter" && snap.pingAt && (
        <p className="mt-2 text-sm text-accent">
          Last ping {ageLabel(api.now - snap.pingAt)} · {snap.ping.length} runner{snap.ping.length === 1 ? "" : "s"}
        </p>
      )}
      {api.gpsError && <p className="mt-2 text-xs text-danger">{api.gpsError}</p>}
      {!api.gps && !api.gpsError && <p className="mt-2 text-xs text-muted">Getting a GPS fix… radar fills in when it lands.</p>}
    </div>
  );
}

function MapPane({ api, view }: { api: HuntApi; view: Snapshot | "wait" | "sit" }) {
  const snap = api.snap!;
  const me = api.me;
  if (view === "sit") {
    return <p className="px-6 py-16 text-center text-sm text-muted">The host turned spectating off.</p>;
  }
  if (view === "wait") {
    return <p className="px-6 py-16 text-center text-sm text-muted">You'll see the map one minute behind, so you can't tip anyone off.</p>;
  }
  const pins = pinsFor(view, me, api.gps);
  return (
    <div className="h-full min-h-72">
      <ZoneMap snap={view} pins={pins} />
    </div>
  );
}

function pinsFor(
  snap: Snapshot,
  me: Player | null,
  gps: { lat: number; lng: number } | null,
): Array<Player | PingPin> {
  if (!me) return [];
  const allies = snap.players.filter((p) => p.role === me.role && p.id !== me.id && p.lat != null);
  if (me.role === "runner") {
    const self = gps ? [{ ...me, lat: gps.lat, lng: gps.lng }] : [];
    return [...self, ...allies];
  }
  const self = gps ? [{ ...me, lat: gps.lat, lng: gps.lng }] : [];
  const revealed = snap.players.filter((p) => p.role === "runner" && p.revealed && !p.taggedAt && p.lat != null);
  const pingIds = new Set(revealed.map((p) => p.id));
  const pings = snap.ping.filter((p) => !pingIds.has(p.id));
  return [...self, ...allies, ...revealed, ...pings];
}

function TagBar({ api }: { api: HuntApi }) {
  const snap = api.snap!;
  const g = api.gps;
  const runners = snap.players.filter((p) => p.role === "runner" && !p.taggedAt);
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2">
      {runners.map((r) => {
        const dist =
          g && r.lat != null && r.lng != null ? haversine(g.lat, g.lng, r.lat, r.lng) : null;
        const close = dist == null || dist <= 35;
        return (
          <button
            key={r.id}
            disabled={!close || snap.pending.some((t) => t.target === r.id)}
            className="h-11 shrink-0 rounded-lg border border-line px-3 text-sm disabled:opacity-40"
            onClick={() =>
              api.send({
                t: "tag",
                id: uidLocal(),
                from: api.meId,
                target: r.id,
                dist: dist == null ? null : Math.round(dist),
                ts: Date.now(),
              })
            }
          >
            Tag {r.name}
            {dist != null ? ` · ${formatDist(dist)}` : ""}
          </button>
        );
      })}
    </div>
  );
}

function Crew({ api }: { api: HuntApi }) {
  const snap = api.snap!;
  return (
    <div className="space-y-2 overflow-y-auto px-4 py-3">
      {snap.players.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-3">
          <div>
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted">
              {p.taggedAt ? "Tagged" : p.revealed ? "Revealed" : p.role}
              {p.tags > 0 ? ` · ${p.tags} tag${p.tags === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <RoleBadge role={p.role} />
        </div>
      ))}
    </div>
  );
}

function Finale({ api }: { api: HuntApi }) {
  const snap = api.snap!;
  const runners = snap.players.filter((p) => p.role === "runner");
  const standing = runners.filter((p) => !p.taggedAt);
  const apex = [...snap.players].sort((a, b) => b.tags - a.tags)[0];
  return (
    <Shell>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-accent">Round over</p>
        <h2 className="text-3xl font-bold">{snap.endedReason ?? "That's the hunt"}</h2>
        <p className="text-sm text-muted">
          {standing.length === 0
            ? "Hunters cleared the board."
            : `${standing.map((p) => p.name).join(", ")} still standing.`}
        </p>
        {apex && apex.tags > 0 && (
          <p className="rounded-lg border border-line bg-surface px-3 py-3 text-sm">
            Apex · {apex.name} · {apex.tags} tag{apex.tags === 1 ? "" : "s"}
          </p>
        )}
        <div className="h-64 overflow-hidden rounded-lg border border-line">
          <ZoneMap snap={snap} pins={snap.players.filter((p) => p.lat != null)} trails />
        </div>
        <div className="space-y-2">
          {snap.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span>{p.name}</span>
              <span className="text-muted">
                {p.role}
                {p.taggedAt ? " · tagged" : p.role === "runner" ? " · escaped" : ""}
                {p.tags ? ` · ${p.tags}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-6">
        <button className="h-12 w-full rounded-lg bg-accent font-semibold text-bg" onClick={api.leave}>
          Back home
        </button>
      </div>
    </Shell>
  );
}

function useSpectate(snap: Snapshot, me: Player | null, now: number): Snapshot | "wait" | "sit" {
  const hist = useRef<Array<{ at: number; snap: Snapshot }>>([]);
  useEffect(() => {
    hist.current.push({ at: Date.now(), snap });
    const cutoff = Date.now() - 120000;
    hist.current = hist.current.filter((h) => h.at >= cutoff);
  }, [snap]);

  if (!me?.taggedAt) return snap;
  if (snap.settings.spectate === "off") return "sit";
  if (snap.settings.spectate === "live") return snap;
  const target = now - 60000;
  const old = [...hist.current].reverse().find((h) => h.at <= target);
  return old ? old.snap : "wait";
}

function Banner({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <p
      className={
        danger
          ? "mx-4 mt-2 rounded-lg border border-danger bg-surface px-3 py-2 text-center text-sm text-danger"
          : "mx-4 mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-center text-sm text-accent"
      }
    >
      {children}
    </p>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={role === "hunter" ? "text-xs font-semibold text-accent" : "text-xs font-semibold text-fg"}>
      {role}
    </span>
  );
}

function LinkPill({ status }: { status: HuntApi["linkStatus"] }) {
  const label =
    status === "live" ? "Linked" : status === "local" ? "This phone" : status === "reconnecting" ? "Reconnecting" : "Linking";
  return <span className="text-xs text-muted">{label}</span>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-lg border border-line bg-surface px-3 text-fg"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm text-muted">
      <span className="flex justify-between">
        {label}
        <span className="text-fg">
          {value}
          {suffix}
        </span>
      </span>
      <input
        className="mt-1 w-full accent-accent"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function TextBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="h-10 text-sm text-muted" onClick={onClick}>
      {children}
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      className={active ? "flex h-14 flex-col items-center justify-center gap-0.5 text-accent" : "flex h-14 flex-col items-center justify-center gap-0.5 text-muted"}
      onClick={onClick}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}

function uidLocal(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadSafeName(): string {
  try {
    return localStorage.getItem("hm-name") || "";
  } catch {
    return "";
  }
}

function buzz(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
