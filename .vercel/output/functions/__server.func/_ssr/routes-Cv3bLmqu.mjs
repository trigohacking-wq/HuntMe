import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as MessageSquare, i as Radar, o as Map, r as Radio, s as Crosshair, t as Users } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Cv3bLmqu.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function haversine(lat1, lon1, lat2, lon2) {
	const R = 6371e3;
	const toRad = (d) => d * Math.PI / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearing(lat1, lon1, lat2, lon2) {
	const toRad = (d) => d * Math.PI / 180;
	const toDeg = (r) => r * 180 / Math.PI;
	const dLon = toRad(lon2 - lon1);
	const y = Math.sin(dLon) * Math.cos(toRad(lat2));
	const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function formatDist(m) {
	if (m < 1e3) return `${Math.round(m)} m`;
	return `${(m / 1e3).toFixed(m < 1e4 ? 1 : 0)} km`;
}
function formatClock(ms) {
	const s = Math.max(0, Math.floor(ms / 1e3));
	const h = Math.floor(s / 3600);
	const m = Math.floor(s % 3600 / 60);
	const sec = s % 60;
	const mm = String(m).padStart(2, "0");
	const ss = String(sec).padStart(2, "0");
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function ageLabel(ms) {
	const s = Math.max(0, Math.round(ms / 1e3));
	if (s < 60) return `${s}s ago`;
	return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
var BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt"];
function openRoom(code, onMessage, onStatus) {
	const topic = `hm/v1/${code}`;
	const storageKey = `hm-room:${code}`;
	let status = "connecting";
	let closed = false;
	let ws = null;
	let brokerIndex = 0;
	let attempt = 0;
	let pingTimer = 0;
	let reconnectTimer = 0;
	const seen = /* @__PURE__ */ new Set();
	const setStatus = (s) => {
		status = s;
		onStatus(s);
	};
	const remember = (mid) => {
		seen.add(mid);
		if (seen.size > 400) {
			const first = seen.values().next().value;
			if (first) seen.delete(first);
		}
	};
	const deliver = (raw) => {
		if (!raw || typeof raw !== "object") return;
		const mid = raw.mid;
		if (typeof mid === "string") {
			if (seen.has(mid)) return;
			remember(mid);
		}
		onMessage(raw);
	};
	const publishLocal = (json) => {
		try {
			localStorage.setItem(storageKey, json);
		} catch {}
		try {
			channel?.postMessage(json);
		} catch {}
	};
	let channel = null;
	try {
		channel = new BroadcastChannel(`hm-${code}`);
		channel.onmessage = (ev) => {
			try {
				deliver(JSON.parse(String(ev.data)));
			} catch {}
		};
	} catch {
		channel = null;
	}
	const onStorage = (ev) => {
		if (ev.key !== storageKey || !ev.newValue) return;
		try {
			deliver(JSON.parse(ev.newValue));
		} catch {}
	};
	window.addEventListener("storage", onStorage);
	try {
		const existing = localStorage.getItem(storageKey);
		if (existing) deliver(JSON.parse(existing));
	} catch {}
	const connect = () => {
		if (closed) return;
		const url = BROKERS[brokerIndex % BROKERS.length];
		let socket;
		try {
			socket = new WebSocket(url, ["mqtt"]);
		} catch {
			scheduleReconnect();
			return;
		}
		ws = socket;
		socket.binaryType = "arraybuffer";
		const fail = () => {
			if (ws !== socket) return;
			ws = null;
			scheduleReconnect();
		};
		socket.onerror = fail;
		socket.onclose = fail;
		socket.onopen = () => {
			if (closed || ws !== socket) return;
			socket.send(encodeConnect());
		};
		socket.onmessage = (ev) => {
			if (ws !== socket) return;
			const packets = decodePackets(new Uint8Array(ev.data));
			for (const pkt of packets) if (pkt.kind === "connack") {
				if (pkt.ok) {
					socket.send(encodeSubscribe(topic, 1));
					attempt = 0;
					setStatus("live");
					window.clearInterval(pingTimer);
					pingTimer = window.setInterval(() => {
						if (socket.readyState === WebSocket.OPEN) socket.send(encodePing());
					}, 2e4);
				} else socket.close();
			} else if (pkt.kind === "publish" && pkt.payload) try {
				deliver(JSON.parse(pkt.payload));
			} catch {}
		};
	};
	const scheduleReconnect = () => {
		if (closed) return;
		brokerIndex++;
		attempt++;
		setStatus(attempt > 2 ? "local" : "reconnecting");
		const delay = Math.min(15e3, 800 * 2 ** Math.min(attempt, 4));
		window.clearTimeout(reconnectTimer);
		reconnectTimer = window.setTimeout(connect, delay);
	};
	connect();
	window.setTimeout(() => {
		if (!closed && status === "connecting") setStatus("local");
	}, 4500);
	return {
		get status() {
			return status;
		},
		publish(data) {
			const withMid = data && typeof data === "object" ? {
				mid: uidMid(),
				...data
			} : {
				mid: uidMid(),
				data
			};
			const json = JSON.stringify(withMid);
			remember(withMid.mid);
			publishLocal(json);
			if (ws && ws.readyState === WebSocket.OPEN && status === "live") try {
				ws.send(encodePublish(topic, json));
			} catch {}
		},
		close() {
			closed = true;
			window.clearInterval(pingTimer);
			window.clearTimeout(reconnectTimer);
			window.removeEventListener("storage", onStorage);
			try {
				channel?.close();
			} catch {}
			try {
				ws?.close();
			} catch {}
			ws = null;
		}
	};
}
function uidMid() {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}
function encodeRemaining(len) {
	const out = [];
	do {
		let digit = len % 128;
		len = Math.floor(len / 128);
		if (len > 0) digit |= 128;
		out.push(digit);
	} while (len > 0);
	return out;
}
function utf8(s) {
	return new TextEncoder().encode(s);
}
function bytes(...parts) {
	let n = 0;
	for (const p of parts) n += p.length;
	const out = new Uint8Array(n);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
function encodeConnect() {
	const proto = utf8("MQTT");
	const client = utf8("hm" + Math.random().toString(36).slice(2, 10));
	const body = bytes(bytes([0, proto.length], proto, [
		4,
		2,
		0,
		30
	]), bytes([client.length >> 8, client.length & 255], client));
	return bytes([16], encodeRemaining(body.length), body);
}
function encodeSubscribe(topic, packetId) {
	const t = utf8(topic);
	const body = bytes([packetId >> 8, packetId & 255], [t.length >> 8, t.length & 255], t, [0]);
	return bytes([130], encodeRemaining(body.length), body);
}
function encodePublish(topic, payload) {
	const t = utf8(topic);
	const p = utf8(payload);
	const body = bytes([t.length >> 8, t.length & 255], t, p);
	return bytes([48], encodeRemaining(body.length), body);
}
function encodePing() {
	return new Uint8Array([192, 0]);
}
function decodePackets(buf) {
	const out = [];
	let i = 0;
	while (i < buf.length) {
		const type = buf[i] >> 4;
		i++;
		let multiplier = 1;
		let remaining = 0;
		let digit;
		do {
			if (i >= buf.length) return out;
			digit = buf[i];
			i++;
			remaining += (digit & 127) * multiplier;
			multiplier *= 128;
		} while ((digit & 128) !== 0);
		const start = i;
		const end = Math.min(buf.length, start + remaining);
		const body = buf.slice(start, end);
		i = end;
		if (type === 2) out.push({
			kind: "connack",
			ok: body.length < 2 || body[1] === 0
		});
		else if (type === 3 && body.length >= 2) {
			const tlen = body[0] << 8 | body[1];
			const payload = body.slice(2 + tlen);
			out.push({
				kind: "publish",
				payload: new TextDecoder().decode(payload)
			});
		} else out.push({ kind: "other" });
	}
	return out;
}
var DEFAULT_SETTINGS = {
	roundMin: 30,
	headMin: 3,
	pingMin: 2,
	radius: 400,
	shrinkMin: 0,
	spectate: "delay"
};
function uid(prefix = "") {
	const a = Math.random().toString(36).slice(2, 8);
	const b = Date.now().toString(36).slice(-4);
	return prefix + a + b;
}
function partyCode() {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * 32)];
	return code;
}
function freshPlayer(id, name, host, role) {
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
		trail: []
	};
}
function initialSnap(code, hostId, hostName, title) {
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
		endedReason: null
	};
}
var TAG_WINDOW_MS = 12e3;
var REVEAL_MS = 3e4;
var TRAIL_MIN_M = 18;
var TRAIL_CAP = 50;
function slim(snap) {
	return {
		...snap,
		players: snap.players.map((p) => ({
			...p,
			trail: snap.phase === "end" ? p.trail.slice(-50) : []
		})),
		chat: snap.chat.slice(-20)
	};
}
function hostApply(snap, msg) {
	const now = Date.now();
	let next = tick({
		...snap,
		now
	}, now);
	switch (msg.t) {
		case "hello":
			if (next.players.some((p) => p.id === msg.id)) next = {
				...next,
				players: next.players.map((p) => p.id === msg.id ? {
					...p,
					name: msg.name.slice(0, 18),
					seen: now
				} : p)
			};
			else if (next.phase !== "end" && next.players.length < 40) {
				const role = next.phase === "lobby" ? "runner" : "runner";
				next = {
					...next,
					players: [...next.players, freshPlayer(msg.id, msg.name, false, role)]
				};
			}
			break;
		case "pos":
			next = {
				...next,
				players: next.players.map((p) => p.id === msg.id ? applyPos(p, msg, next, now) : p)
			};
			break;
		case "chat": {
			const player = next.players.find((p) => p.id === msg.from);
			if (!player) break;
			const text = msg.text.replace(/\s+/g, " ").trim().slice(0, 160);
			if (!text) break;
			const line = {
				id: msg.id,
				from: player.id,
				name: player.name,
				role: player.role,
				text,
				ts: now
			};
			if (next.chat.some((c) => c.id === line.id)) break;
			next = {
				...next,
				chat: [...next.chat, line].slice(-40)
			};
			break;
		}
		case "tag": {
			if (next.phase !== "live" && next.phase !== "head") break;
			const from = next.players.find((p) => p.id === msg.from);
			const target = next.players.find((p) => p.id === msg.target);
			if (!from || !target || from.role !== "hunter" || target.role !== "runner") break;
			if (target.taggedAt) break;
			if (next.pending.some((t) => t.target === target.id)) break;
			const tag = {
				id: msg.id,
				from: from.id,
				target: target.id,
				ts: now,
				dist: msg.dist
			};
			next = {
				...next,
				pending: [...next.pending, tag]
			};
			break;
		}
		case "tagres":
			next = resolveTag(next, msg.tagId, msg.accept, now);
			break;
		case "set": {
			if (msg.from !== next.hostId || next.phase !== "lobby") break;
			const settings = {
				...next.settings,
				...sanitizeSettings(msg.settings)
			};
			let center = next.center;
			if (msg.center !== void 0) center = msg.center;
			let title = next.title;
			if (typeof msg.title === "string" && msg.title.trim()) title = msg.title.trim().slice(0, 28);
			let players = next.players;
			if (msg.role) players = players.map((p) => p.id === msg.role.id && p.id !== next.hostId ? {
				...p,
				role: msg.role.role
			} : p);
			if (msg.bot && players.length < 40) {
				const bot = freshPlayer(`bot${Math.random().toString(36).slice(2, 7)}`, "Practice runner", false, "runner");
				if (center) {
					bot.lat = center.lat;
					bot.lng = center.lng;
					bot.seen = Date.now();
				}
				players = [...players, bot];
			}
			next = {
				...next,
				settings,
				center,
				title,
				players
			};
			break;
		}
		case "start": {
			if (msg.from !== next.hostId || next.phase !== "lobby") break;
			if (next.settings.radius > 0 && !next.center) break;
			const hunters = next.players.filter((p) => p.role === "hunter").length;
			const runners = next.players.filter((p) => p.role === "runner").length;
			if (hunters < 1 || runners < 1) break;
			const startedAt = now;
			const headMs = next.settings.headMin * 6e4;
			next = {
				...next,
				phase: next.settings.headMin > 0 ? "head" : "live",
				startedAt,
				nextShrink: next.settings.shrinkMin > 0 ? startedAt + headMs + next.settings.shrinkMin * 6e4 : null,
				ping: [],
				pingAt: null,
				shrinkWarn: false
			};
			break;
		}
		case "end":
			if (msg.from !== next.hostId || next.phase === "lobby" || next.phase === "end") break;
			next = {
				...next,
				phase: "end",
				endedReason: "Host ended the round"
			};
			break;
		case "bye":
			if (msg.id === next.hostId) break;
			if (next.phase === "lobby") next = {
				...next,
				players: next.players.filter((p) => p.id !== msg.id)
			};
	}
	next = tick(next, Date.now());
	next = maybeFinish(next);
	return {
		...next,
		seq: snap.seq + 1,
		now: Date.now()
	};
}
function tick(snap, now) {
	if (!snap.startedAt || snap.phase === "lobby" || snap.phase === "end") return snap;
	const headMs = snap.settings.headMin * 6e4;
	const roundMs = snap.settings.roundMin * 6e4;
	const liveStart = snap.startedAt + headMs;
	let phase = snap.phase;
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
		shrinkWarn = now >= nextShrink - 6e4 && now < nextShrink;
		if (now >= nextShrink) {
			radius = Math.max(80, Math.round(radius * .8));
			nextShrink += settings.shrinkMin * 6e4;
			shrinkWarn = false;
		}
	}
	let ping = snap.ping;
	let pingAt = snap.pingAt;
	if (phase === "live" && settings.pingMin > 0) {
		if (!pingAt || now - pingAt >= settings.pingMin * 6e4) {
			ping = snap.players.filter((p) => p.role === "runner" && !p.taggedAt && p.lat != null && p.lng != null).map((p) => ({
				id: p.id,
				lat: p.lat,
				lng: p.lng
			}));
			pingAt = now;
		}
	}
	let working = snap;
	for (const tag of [...snap.pending]) if (now - tag.ts >= TAG_WINDOW_MS) {
		const stands = tag.dist == null || tag.dist <= 45;
		working = resolveTag(working, tag.id, stands, now);
	}
	snap = working;
	const players = snap.players.map((p) => refreshZone(p, {
		...snap,
		settings: {
			...settings,
			radius
		}
	}, now, phase));
	return maybeFinish({
		...snap,
		phase,
		endedReason,
		settings: {
			...settings,
			radius
		},
		nextShrink,
		shrinkWarn,
		ping,
		pingAt,
		players
	});
}
function maybeFinish(snap) {
	if (snap.phase !== "live" && snap.phase !== "head") return snap;
	const runners = snap.players.filter((p) => p.role === "runner");
	if (runners.length > 0 && runners.every((p) => p.taggedAt)) return {
		...snap,
		phase: "end",
		endedReason: "Every runner was tagged"
	};
	return snap;
}
function refreshZone(p, snap, now, phase) {
	if (p.taggedAt || p.role !== "runner") return {
		...p,
		revealed: false,
		outSince: null
	};
	if (phase !== "live" || !snap.center || snap.settings.radius <= 0 || p.lat == null || p.lng == null) return {
		...p,
		revealed: false,
		outSince: null
	};
	if (haversine(p.lat, p.lng, snap.center.lat, snap.center.lng) > snap.settings.radius) {
		const outSince = p.outSince ?? now;
		const revealed = now - outSince >= REVEAL_MS;
		return {
			...p,
			outSince,
			revealed
		};
	}
	return {
		...p,
		outSince: null,
		revealed: false
	};
}
function applyPos(p, msg, snap, now) {
	if (!Number.isFinite(msg.lat) || !Number.isFinite(msg.lng)) return p;
	const trail = [...p.trail];
	const last = trail[trail.length - 1];
	if (!last || haversine(last.lat, last.lng, msg.lat, msg.lng) >= TRAIL_MIN_M) {
		trail.push({
			lat: msg.lat,
			lng: msg.lng,
			ts: msg.ts || now
		});
		if (trail.length > TRAIL_CAP) trail.shift();
	}
	return refreshZone({
		...p,
		lat: msg.lat,
		lng: msg.lng,
		acc: msg.acc,
		seen: now,
		trail
	}, snap, now, snap.phase);
}
function resolveTag(snap, tagId, accept, now) {
	const tag = snap.pending.find((t) => t.id === tagId);
	if (!tag) return snap;
	let players = snap.players;
	if (accept || tag.dist != null && tag.dist <= 45 || tag.dist == null) {
		if (accept || tag.dist == null || tag.dist <= 45) players = players.map((p) => {
			if (p.id === tag.target && !p.taggedAt) return {
				...p,
				taggedAt: now,
				revealed: false
			};
			if (p.id === tag.from) return {
				...p,
				tags: p.tags + 1
			};
			return p;
		});
	}
	return {
		...snap,
		pending: snap.pending.filter((t) => t.id !== tagId),
		players
	};
}
function sanitizeSettings(partial) {
	if (!partial) return {};
	const out = {};
	if (partial.roundMin != null) out.roundMin = clamp(partial.roundMin, 10, 180);
	if (partial.headMin != null) out.headMin = clamp(partial.headMin, 0, 15);
	if (partial.pingMin != null) out.pingMin = clamp(partial.pingMin, 0, 30);
	if (partial.radius != null) out.radius = clamp(partial.radius, 0, 3e3);
	if (partial.shrinkMin != null) out.shrinkMin = clamp(partial.shrinkMin, 0, 30);
	if (partial.spectate === "delay" || partial.spectate === "live" || partial.spectate === "off") out.spectate = partial.spectate;
	return out;
}
function clamp(n, min, max) {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) return min;
	return Math.min(max, Math.max(min, v));
}
var PID = "hm-pid";
var PNAME = "hm-name";
function saveName(name) {
	try {
		localStorage.setItem(PNAME, name);
	} catch {}
}
function loadPid() {
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
function useHunt() {
	const [ready, setReady] = (0, import_react.useState)(false);
	const [meId, setMeId] = (0, import_react.useState)("");
	const [snap, setSnap] = (0, import_react.useState)(null);
	const [linkStatus, setLinkStatus] = (0, import_react.useState)("connecting");
	const [gps, setGps] = (0, import_react.useState)(null);
	const [gpsError, setGpsError] = (0, import_react.useState)(null);
	const [now, setNow] = (0, import_react.useState)(() => Date.now());
	const [waiting, setWaiting] = (0, import_react.useState)(false);
	const snapRef = (0, import_react.useRef)(null);
	const linkRef = (0, import_react.useRef)(null);
	const meRef = (0, import_react.useRef)("");
	const gpsRef = (0, import_react.useRef)(gps);
	const skew = (0, import_react.useRef)(0);
	gpsRef.current = gps;
	const adopt = (0, import_react.useCallback)((next) => {
		snapRef.current = next;
		setSnap(next);
		skew.current = next.now - Date.now();
	}, []);
	const publishSnap = (0, import_react.useCallback)((next) => {
		const stamped = {
			...next,
			now: Date.now()
		};
		snapRef.current = stamped;
		setSnap(stamped);
		linkRef.current?.publish({
			t: "snap",
			snap: slim(stamped)
		});
	}, []);
	const detach = (0, import_react.useCallback)(() => {
		linkRef.current?.close();
		linkRef.current = null;
	}, []);
	const attach = (0, import_react.useCallback)((code) => {
		detach();
		linkRef.current = openRoom(code, (raw) => {
			const msg = raw;
			if (!msg || typeof msg !== "object" || !("t" in msg)) return;
			if (msg.t === "snap") {
				const incoming = msg.snap;
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
			const next = hostApply(local, msg);
			publishSnap(next);
		}, setLinkStatus);
	}, [
		adopt,
		detach,
		publishSnap
	]);
	(0, import_react.useEffect)(() => {
		const id = loadPid();
		meRef.current = id;
		setMeId(id);
		setReady(true);
		return () => detach();
	}, [detach]);
	(0, import_react.useEffect)(() => {
		const id = window.setInterval(() => setNow(Date.now() + skew.current), 1e3);
		return () => window.clearInterval(id);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!snap || snap.hostId !== meId) return;
		if (snap.phase === "lobby") return;
		const id = window.setInterval(() => {
			const cur = snapRef.current;
			if (!cur || cur.hostId !== meRef.current || cur.phase === "lobby" || cur.phase === "end") return;
			const next = tick(cur, Date.now());
			publishSnap({
				...next,
				seq: cur.seq + 1
			});
		}, 4e3);
		return () => window.clearInterval(id);
	}, [
		snap?.code,
		snap?.phase,
		snap?.hostId,
		meId,
		publishSnap
	]);
	(0, import_react.useEffect)(() => {
		if (!snap || snap.phase === "lobby" || snap.phase === "end") return;
		if (!navigator.geolocation) {
			setGpsError("This browser has no location.");
			return;
		}
		setGpsError(null);
		const watch = navigator.geolocation.watchPosition((pos) => {
			setGps({
				lat: pos.coords.latitude,
				lng: pos.coords.longitude,
				acc: pos.coords.accuracy ?? null
			});
		}, (err) => setGpsError(err.code === 1 ? "Location permission denied." : "Still searching for GPS…"), {
			enableHighAccuracy: true,
			maximumAge: 8e3,
			timeout: 2e4
		});
		return () => navigator.geolocation.clearWatch(watch);
	}, [snap?.code, snap?.phase]);
	(0, import_react.useEffect)(() => {
		if (!snap || snap.phase === "lobby" || snap.phase === "end") return;
		const sendPos = () => {
			const g = gpsRef.current;
			if (!g) return;
			const msg = {
				t: "pos",
				id: meRef.current,
				lat: Math.round(g.lat * 1e5) / 1e5,
				lng: Math.round(g.lng * 1e5) / 1e5,
				acc: g.acc == null ? null : Math.round(g.acc),
				ts: Date.now()
			};
			const local = snapRef.current;
			if (local && local.hostId === meRef.current) publishSnap(hostApply(local, msg));
			else linkRef.current?.publish(msg);
		};
		sendPos();
		const id = window.setInterval(sendPos, 6e3);
		return () => window.clearInterval(id);
	}, [
		snap?.code,
		snap?.phase,
		publishSnap
	]);
	(0, import_react.useEffect)(() => {
		if (!snap || snap.phase !== "head" && snap.phase !== "live") return;
		let lock = null;
		const request = () => {
			navigator.wakeLock?.request("screen").then((s) => {
				lock = s;
			}).catch(() => void 0);
		};
		request();
		const onVis = () => {
			if (document.visibilityState === "visible") request();
		};
		document.addEventListener("visibilitychange", onVis);
		return () => {
			document.removeEventListener("visibilitychange", onVis);
			lock?.release().catch(() => void 0);
		};
	}, [snap?.code, snap?.phase]);
	const create = (0, import_react.useCallback)((name, title) => {
		const clean = name.trim().slice(0, 18);
		if (clean.length < 1) return;
		saveName(clean);
		const code = partyCode();
		const created = initialSnap(code, meRef.current, clean, title);
		attach(code);
		publishSnap(created);
		setWaiting(false);
	}, [attach, publishSnap]);
	const join = (0, import_react.useCallback)((code, name) => {
		const clean = name.trim().slice(0, 18);
		const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
		if (clean.length < 1 || c.length !== 6) return;
		saveName(clean);
		setWaiting(true);
		setSnap(null);
		snapRef.current = null;
		attach(c);
		window.setTimeout(() => {
			linkRef.current?.publish({
				t: "hello",
				id: meRef.current,
				name: clean
			});
		}, 300);
	}, [attach]);
	const send = (0, import_react.useCallback)((msg) => {
		const local = snapRef.current;
		if (local && local.hostId === meRef.current) publishSnap(hostApply(local, msg));
		else linkRef.current?.publish(msg);
	}, [publishSnap]);
	const leave = (0, import_react.useCallback)(() => {
		if (snapRef.current) linkRef.current?.publish({
			t: "bye",
			id: meRef.current
		});
		detach();
		snapRef.current = null;
		setSnap(null);
		setWaiting(false);
		setGps(null);
	}, [detach]);
	const locate = (0, import_react.useCallback)(() => {
		if (!navigator.geolocation) {
			setGpsError("This browser has no location.");
			return;
		}
		setGpsError(null);
		navigator.geolocation.getCurrentPosition((pos) => {
			const fix = {
				lat: pos.coords.latitude,
				lng: pos.coords.longitude,
				acc: pos.coords.accuracy ?? null
			};
			setGps(fix);
			const local = snapRef.current;
			if (local && local.hostId === meRef.current && local.phase === "lobby") send({
				t: "set",
				from: meRef.current,
				center: {
					lat: fix.lat,
					lng: fix.lng
				}
			});
		}, (err) => setGpsError(err.code === 1 ? "Location permission denied." : "Couldn't get a fix yet."), {
			enableHighAccuracy: true,
			timeout: 2e4,
			maximumAge: 1e4
		});
	}, [send]);
	return {
		ready,
		meId,
		me: snap?.players.find((p) => p.id === meId) ?? null,
		isHost: !!snap && snap.hostId === meId,
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
		setWaiting
	};
}
function patchSettings(api, settings) {
	if (!api.isHost || !api.snap) return;
	api.send({
		t: "set",
		from: api.meId,
		settings
	});
}
function setRole(api, id, role) {
	api.send({
		t: "set",
		from: api.meId,
		role: {
			id,
			role
		}
	});
}
function ZoneMap({ snap, pins, showCenter = true, onPick, trails }) {
	const el = (0, import_react.useRef)(null);
	const mapRef = (0, import_react.useRef)(null);
	const layerRef = (0, import_react.useRef)(null);
	const onPickRef = (0, import_react.useRef)(onPick);
	onPickRef.current = onPick;
	(0, import_react.useEffect)(() => {
		if (!el.current) return;
		let cancelled = false;
		let map = null;
		(async () => {
			const L = await import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t()));
			if (cancelled || !el.current) return;
			const start = snap.center ?? {
				lat: 51.5,
				lng: -.12
			};
			map = L.map(el.current, {
				zoomControl: false,
				attributionControl: true
			}).setView([start.lat, start.lng], snap.center ? 15 : 3);
			L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
				subdomains: "abcd",
				maxZoom: 19,
				attribution: "&copy; OSM &copy; CARTO"
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
	}, [snap.code]);
	(0, import_react.useEffect)(() => {
		const map = mapRef.current;
		const layer = layerRef.current;
		if (!map || !layer) return;
		import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t())).then((L) => {
			layer.clearLayers();
			if (showCenter && snap.center && snap.settings.radius > 0) L.circle([snap.center.lat, snap.center.lng], {
				radius: snap.settings.radius,
				color: "#22c55e",
				weight: 2,
				fillColor: "#22c55e",
				fillOpacity: .06
			}).addTo(layer);
			if (trails) for (const p of snap.players) {
				if (p.trail.length < 2) continue;
				L.polyline(p.trail.map((pt) => [pt.lat, pt.lng]), {
					color: p.role === "hunter" ? "#22c55e" : "#e7f2ea",
					weight: 3,
					opacity: .8
				}).addTo(layer);
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
					fillOpacity: .95,
					weight: 2
				}).bindTooltip(player?.name ?? "Ping", {
					permanent: false,
					direction: "top"
				}).addTo(layer);
			}
		});
	}, [
		pins,
		showCenter,
		snap,
		trails
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: el,
		className: "h-full w-full bg-surface"
	});
}
function HuntApp() {
	const api = useHunt();
	if (!api.ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {}) });
	if (!api.snap) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Gate, { api });
	if (api.snap.phase === "lobby") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lobby, { api });
	if (api.snap.phase === "end") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Finale, { api });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Round, { api });
}
function Shell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg text-fg",
		children
	});
}
function Wordmark() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center gap-4 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex size-16 items-center justify-center rounded-lg border border-line bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crosshair, {
				className: "size-8 text-accent",
				strokeWidth: 1.75
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "text-4xl font-bold tracking-tight",
			children: "Hunt Me"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-sm text-muted",
			children: "Runners hide. Hunters get pings. The phone keeps score."
		})] })]
	});
}
function Gate({ api }) {
	const [mode, setMode] = (0, import_react.useState)("home");
	const [name, setName] = (0, import_react.useState)("");
	const [title, setTitle] = (0, import_react.useState)("");
	const [code, setCode] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		setName(loadSafeName());
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col justify-center gap-8 px-6 py-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {}),
			mode === "home" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "h-12 rounded-lg bg-accent font-semibold text-bg",
						onClick: () => setMode("create"),
						children: "Create a game"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "h-12 rounded-lg border border-line bg-surface font-semibold",
						onClick: () => setMode("join"),
						children: "Join with a code"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-center text-xs text-muted",
						children: "Location is shared only during a round, and only with this game. Built for patchy 4G — pings, not a live stream."
					})
				]
			}),
			mode === "create" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-3",
				onSubmit: (e) => {
					e.preventDefault();
					api.create(name, title);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Your name",
						value: name,
						onChange: setName,
						placeholder: "Alex"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Game name",
						value: title,
						onChange: setTitle,
						placeholder: "Park after dark"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "h-12 rounded-lg bg-accent font-semibold text-bg",
						type: "submit",
						children: "Open lobby"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextBtn, {
						onClick: () => setMode("home"),
						children: "Back"
					})
				]
			}),
			mode === "join" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-3",
				onSubmit: (e) => {
					e.preventDefault();
					api.join(code, name);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Your name",
						value: name,
						onChange: setName,
						placeholder: "Alex"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex flex-col gap-1 text-sm text-muted",
						children: ["Code", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: code,
							onChange: (e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)),
							placeholder: "ABC123",
							className: "h-12 rounded-lg border border-line bg-surface text-center text-2xl font-bold tracking-widest text-accent",
							autoCapitalize: "characters"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "h-12 rounded-lg bg-accent font-semibold text-bg",
						type: "submit",
						children: "Join"
					}),
					api.waiting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-center text-sm text-muted",
						children: "Looking for that game… stay on this screen."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextBtn, {
						onClick: () => {
							api.setWaiting(false);
							setMode("home");
						},
						children: "Back"
					})
				]
			})
		]
	}) });
}
function Lobby({ api }) {
	const snap = api.snap;
	const s = snap.settings;
	const hunters = snap.players.filter((p) => p.role === "hunter").length;
	const runners = snap.players.filter((p) => p.role === "runner").length;
	const canStart = hunters >= 1 && runners >= 1 && (s.radius === 0 || !!snap.center);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between px-5 pt-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "text-sm text-muted",
				onClick: api.leave,
				children: "Leave"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkPill, { status: api.linkStatus })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "px-5 pt-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs uppercase tracking-widest text-muted",
					children: snap.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm text-muted",
						children: "Code"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-2xl font-bold tracking-widest text-accent",
						children: snap.code
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "mt-2 h-10 w-full rounded-lg border border-line text-sm",
					onClick: () => navigator.clipboard?.writeText(snap.code).catch(() => void 0),
					children: "Copy code"
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 flex-1 space-y-2 overflow-y-auto px-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
				className: "text-sm text-muted",
				children: ["Crew · ", snap.players.length]
			}), snap.players.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex size-10 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-accent",
						children: p.name.slice(0, 1).toUpperCase()
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "truncate font-medium",
							children: [p.name, p.id === api.meId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-accent",
								children: " · you"
							}) : null]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted",
							children: p.host ? "Host" : "Player"
						})]
					}),
					api.isHost ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "h-10 rounded-lg border border-line bg-bg px-2 text-sm",
						value: p.role,
						onChange: (e) => setRole(api, p.id, e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "hunter",
							children: "Hunter"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "runner",
							children: "Runner"
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleBadge, { role: p.role })
				]
			}, p.id))]
		}),
		api.isHost ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-3 border-t border-line px-5 py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					label: "Round",
					value: s.roundMin,
					min: 10,
					max: 180,
					step: 5,
					suffix: " min",
					onChange: (roundMin) => patchSettings(api, { roundMin })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					label: "Head start",
					value: s.headMin,
					min: 0,
					max: 15,
					step: 1,
					suffix: " min",
					onChange: (headMin) => patchSettings(api, { headMin })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					label: "Ping every",
					value: s.pingMin,
					min: 0,
					max: 15,
					step: 1,
					suffix: s.pingMin === 0 ? " · off" : " min",
					onChange: (pingMin) => patchSettings(api, { pingMin })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					label: "Zone",
					value: s.radius,
					min: 0,
					max: 2e3,
					step: 50,
					suffix: s.radius === 0 ? " · anywhere" : " m",
					onChange: (radius) => patchSettings(api, { radius })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					label: "Shrink every",
					value: s.shrinkMin,
					min: 0,
					max: 20,
					step: 1,
					suffix: s.shrinkMin === 0 ? " · off" : " min",
					onChange: (shrinkMin) => patchSettings(api, { shrinkMin })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex items-center justify-between text-sm text-muted",
					children: ["After a tag", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "h-10 rounded-lg border border-line bg-bg px-2 text-fg",
						value: s.spectate,
						onChange: (e) => patchSettings(api, { spectate: e.target.value }),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "delay",
								children: "Watch, 1 min behind"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "live",
								children: "Watch live"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "off",
								children: "Sit out"
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "h-11 w-full rounded-lg border border-line text-sm",
					onClick: () => api.send({
						t: "set",
						from: api.meId,
						bot: true
					}),
					children: "Add a practice runner"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "h-12 w-full rounded-lg border border-line",
					onClick: api.locate,
					children: snap.center ? "Zone center set · tap to update" : "Set zone center from my location"
				}),
				api.gpsError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-danger",
					children: api.gpsError
				}),
				!canStart && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-center text-xs text-muted",
					children: [
						"Need one hunter, one runner",
						s.radius > 0 ? ", and a zone center" : "",
						"."
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "h-12 w-full rounded-lg bg-accent font-semibold text-bg disabled:opacity-40",
					disabled: !canStart,
					onClick: () => api.send({
						t: "start",
						from: api.meId
					}),
					children: "Start hunt"
				})
			]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "border-t border-line px-5 py-6 text-center text-sm text-muted",
			children: "Waiting for the host to start. You'll get a head start to hide."
		})
	] });
}
function Round({ api }) {
	const snap = api.snap;
	const me = api.me;
	const [tab, setTab] = (0, import_react.useState)("radar");
	const [chat, setChat] = (0, import_react.useState)("");
	const seenPing = (0, import_react.useRef)(null);
	const view = useSpectate(snap, me, api.now);
	(0, import_react.useEffect)(() => {
		if (snap.phase !== "live" || !snap.pingAt || me?.role !== "hunter") return;
		if (seenPing.current === snap.pingAt) return;
		seenPing.current = snap.pingAt;
		buzz([
			30,
			40,
			30
		]);
	}, [
		snap.pingAt,
		snap.phase,
		me?.role
	]);
	(0, import_react.useEffect)(() => {
		if (me?.revealed) buzz([
			80,
			40,
			80
		]);
	}, [me?.revealed]);
	const pending = snap.pending.find((t) => t.target === api.meId);
	const headLeft = snap.startedAt ? snap.startedAt + snap.settings.headMin * 6e4 - api.now : 0;
	const roundLeft = (snap.startedAt ? snap.startedAt + (snap.settings.headMin + snap.settings.roundMin) * 6e4 : api.now) - api.now;
	const shrinkLeft = snap.nextShrink ? snap.nextShrink - api.now : null;
	const oobLeft = me?.outSince && !me.revealed ? Math.max(0, 3e4 - (api.now - me.outSince)) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between px-4 pt-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-sm text-muted",
					onClick: api.leave,
					children: "Leave"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs uppercase tracking-widest text-muted",
						children: snap.phase === "head" ? "Head start" : "Live"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-semibold tabular-nums text-accent",
						children: formatClock(snap.phase === "head" ? headLeft : roundLeft)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkPill, { status: api.linkStatus })
			]
		}),
		snap.shrinkWarn && shrinkLeft != null && shrinkLeft < 6e4 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Banner, { children: ["Zone shrinks in ", formatClock(shrinkLeft)] }),
		oobLeft != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Banner, {
			danger: true,
			children: [
				"Outside the zone. Hunters see you live in ",
				Math.ceil(oobLeft / 1e3),
				"s."
			]
		}),
		me?.revealed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Banner, {
			danger: true,
			children: "You're revealed until you step back inside."
		}),
		pending && me?.role === "runner" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-4 mt-2 rounded-lg border border-danger bg-surface p-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm font-semibold text-danger",
				children: "A hunter tagged you"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "h-11 flex-1 rounded-lg bg-accent font-semibold text-bg",
					onClick: () => api.send({
						t: "tagres",
						id: uidLocal(),
						tagId: pending.id,
						accept: true
					}),
					children: "I got tagged"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "h-11 flex-1 rounded-lg border border-line",
					onClick: () => api.send({
						t: "tagres",
						id: uidLocal(),
						tagId: pending.id,
						accept: false
					}),
					children: "Dispute"
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-h-0 flex-1",
			children: [
				tab === "radar" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarPane, {
					api,
					view
				}),
				tab === "map" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPane, {
					api,
					view
				}),
				tab === "radio" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex h-full flex-col px-4 pt-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mb-2 flex items-center gap-2 text-xs text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, { className: "size-3.5" }),
								" ",
								me?.role === "hunter" ? "Hunter" : "Runner",
								" radio · the other team can't hear this"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex-1 space-y-2 overflow-y-auto",
							children: [snap.chat.filter((c) => c.role === me?.role).length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "py-8 text-center text-sm text-muted",
								children: "No messages yet."
							}), snap.chat.filter((c) => c.role === me?.role).map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg bg-surface px-3 py-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-accent",
									children: c.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm",
									children: c.text
								})]
							}, c.id))]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							className: "flex gap-2 py-3",
							onSubmit: (e) => {
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
									ts: Date.now()
								});
								setChat("");
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: chat,
								onChange: (e) => setChat(e.target.value),
								placeholder: "Quiet message",
								className: "h-12 flex-1 rounded-lg border border-line bg-surface px-3"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "h-12 rounded-lg bg-accent px-4 font-semibold text-bg",
								type: "submit",
								children: "Send"
							})]
						})
					]
				}),
				tab === "crew" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Crew, { api })
			]
		}),
		me?.role === "hunter" && !me.taggedAt && snap.phase === "live" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagBar, { api }),
		me?.taggedAt && snap.settings.spectate === "off" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "px-4 py-3 text-center text-sm text-muted",
			children: "You're out. Sit this one out."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
			className: "grid grid-cols-4 border-t border-line",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "radar",
					onClick: () => setTab("radar"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: "size-5" }),
					label: "Radar"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "map",
					onClick: () => setTab("map"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Map, { className: "size-5" }),
					label: "Map"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "radio",
					onClick: () => setTab("radio"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "size-5" }),
					label: "Radio"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBtn, {
					active: tab === "crew",
					onClick: () => setTab("crew"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "size-5" }),
					label: "Crew"
				})
			]
		}),
		api.isHost && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: "h-10 text-xs text-muted",
			onClick: () => api.send({
				t: "end",
				from: api.meId
			}),
			children: "End round"
		})
	] });
}
function RadarPane({ api, view }) {
	const canvas = (0, import_react.useRef)(null);
	const snap = api.snap;
	const me = api.me;
	const g = api.gps;
	const blips = (0, import_react.useMemo)(() => {
		if (!g || view === "wait" || view === "sit" || !me) return [];
		return view.players.filter((p) => p.id !== me.id && p.lat != null && p.lng != null && !p.taggedAt).map((p) => {
			return {
				p,
				dist: haversine(g.lat, g.lng, p.lat, p.lng),
				ally: p.role === me.role,
				brg: bearing(g.lat, g.lng, p.lat, p.lng)
			};
		}).filter((b) => b.dist <= 30);
	}, [
		g,
		me,
		view
	]);
	(0, import_react.useEffect)(() => {
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
			ctx.arc(cx, cx, maxR * i / 3, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.arc(cx, cx, 6, 0, Math.PI * 2);
		ctx.fillStyle = "#22c55e";
		ctx.fill();
		for (const b of blips) {
			const rad = (b.brg - 90) * Math.PI / 180;
			const r = b.dist / 30 * maxR;
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col items-center px-4 pt-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "aspect-square w-full max-w-sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
					ref: canvas,
					className: "h-full w-full rounded-full border border-line bg-surface"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-center text-xs text-muted",
				children: "30 m heartbeat. Green is your team. Red is the other side — direction only, no names."
			}),
			view === "wait" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Spectator view catches up in a minute."
			}),
			snap.phase === "head" && me?.role === "hunter" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Runners are hiding. You get nothing until the head start ends."
			}),
			snap.phase === "live" && me?.role === "hunter" && snap.pingAt && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-sm text-accent",
				children: [
					"Last ping ",
					ageLabel(api.now - snap.pingAt),
					" · ",
					snap.ping.length,
					" runner",
					snap.ping.length === 1 ? "" : "s"
				]
			}),
			api.gpsError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-danger",
				children: api.gpsError
			}),
			!api.gps && !api.gpsError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-muted",
				children: "Getting a GPS fix… radar fills in when it lands."
			})
		]
	});
}
function MapPane({ api, view }) {
	api.snap;
	const me = api.me;
	if (view === "sit") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-6 py-16 text-center text-sm text-muted",
		children: "The host turned spectating off."
	});
	if (view === "wait") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-6 py-16 text-center text-sm text-muted",
		children: "You'll see the map one minute behind, so you can't tip anyone off."
	});
	const pins = pinsFor(view, me, api.gps);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "h-full min-h-72",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZoneMap, {
			snap: view,
			pins
		})
	});
}
function pinsFor(snap, me, gps) {
	if (!me) return [];
	const allies = snap.players.filter((p) => p.role === me.role && p.id !== me.id && p.lat != null);
	if (me.role === "runner") return [...gps ? [{
		...me,
		lat: gps.lat,
		lng: gps.lng
	}] : [], ...allies];
	const self = gps ? [{
		...me,
		lat: gps.lat,
		lng: gps.lng
	}] : [];
	const revealed = snap.players.filter((p) => p.role === "runner" && p.revealed && !p.taggedAt && p.lat != null);
	const pingIds = new Set(revealed.map((p) => p.id));
	const pings = snap.ping.filter((p) => !pingIds.has(p.id));
	return [
		...self,
		...allies,
		...revealed,
		...pings
	];
}
function TagBar({ api }) {
	const snap = api.snap;
	const g = api.gps;
	const runners = snap.players.filter((p) => p.role === "runner" && !p.taggedAt);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex gap-2 overflow-x-auto px-4 py-2",
		children: runners.map((r) => {
			const dist = g && r.lat != null && r.lng != null ? haversine(g.lat, g.lng, r.lat, r.lng) : null;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				disabled: !(dist == null || dist <= 35) || snap.pending.some((t) => t.target === r.id),
				className: "h-11 shrink-0 rounded-lg border border-line px-3 text-sm disabled:opacity-40",
				onClick: () => api.send({
					t: "tag",
					id: uidLocal(),
					from: api.meId,
					target: r.id,
					dist: dist == null ? null : Math.round(dist),
					ts: Date.now()
				}),
				children: [
					"Tag ",
					r.name,
					dist != null ? ` · ${formatDist(dist)}` : ""
				]
			}, r.id);
		})
	});
}
function Crew({ api }) {
	const snap = api.snap;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-2 overflow-y-auto px-4 py-3",
		children: snap.players.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-medium",
				children: p.name
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-xs text-muted",
				children: [p.taggedAt ? "Tagged" : p.revealed ? "Revealed" : p.role, p.tags > 0 ? ` · ${p.tags} tag${p.tags === 1 ? "" : "s"}` : ""]
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleBadge, { role: p.role })]
		}, p.id))
	});
}
function Finale({ api }) {
	const snap = api.snap;
	const standing = snap.players.filter((p) => p.role === "runner").filter((p) => !p.taggedAt);
	const apex = [...snap.players].sort((a, b) => b.tags - a.tags)[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex-1 space-y-4 overflow-y-auto px-5 py-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs uppercase tracking-widest text-accent",
				children: "Round over"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-3xl font-bold",
				children: snap.endedReason ?? "That's the hunt"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: standing.length === 0 ? "Hunters cleared the board." : `${standing.map((p) => p.name).join(", ")} still standing.`
			}),
			apex && apex.tags > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "rounded-lg border border-line bg-surface px-3 py-3 text-sm",
				children: [
					"Apex · ",
					apex.name,
					" · ",
					apex.tags,
					" tag",
					apex.tags === 1 ? "" : "s"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "h-64 overflow-hidden rounded-lg border border-line",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZoneMap, {
					snap,
					pins: snap.players.filter((p) => p.lat != null),
					trails: true
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-2",
				children: snap.players.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: p.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-muted",
						children: [
							p.role,
							p.taggedAt ? " · tagged" : p.role === "runner" ? " · escaped" : "",
							p.tags ? ` · ${p.tags}` : ""
						]
					})]
				}, p.id))
			})
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "px-5 pb-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: "h-12 w-full rounded-lg bg-accent font-semibold text-bg",
			onClick: api.leave,
			children: "Back home"
		})
	})] });
}
function useSpectate(snap, me, now) {
	const hist = (0, import_react.useRef)([]);
	(0, import_react.useEffect)(() => {
		hist.current.push({
			at: Date.now(),
			snap
		});
		const cutoff = Date.now() - 12e4;
		hist.current = hist.current.filter((h) => h.at >= cutoff);
	}, [snap]);
	if (!me?.taggedAt) return snap;
	if (snap.settings.spectate === "off") return "sit";
	if (snap.settings.spectate === "live") return snap;
	const target = now - 6e4;
	const old = [...hist.current].reverse().find((h) => h.at <= target);
	return old ? old.snap : "wait";
}
function Banner({ children, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: danger ? "mx-4 mt-2 rounded-lg border border-danger bg-surface px-3 py-2 text-center text-sm text-danger" : "mx-4 mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-center text-sm text-accent",
		children
	});
}
function RoleBadge({ role }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: role === "hunter" ? "text-xs font-semibold text-accent" : "text-xs font-semibold text-fg",
		children: role
	});
}
function LinkPill({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "text-xs text-muted",
		children: status === "live" ? "Linked" : status === "local" ? "This phone" : status === "reconnecting" ? "Reconnecting" : "Linking"
	});
}
function Field({ label, value, onChange, placeholder }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex flex-col gap-1 text-sm text-muted",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			value,
			onChange: (e) => onChange(e.target.value),
			placeholder,
			className: "h-12 rounded-lg border border-line bg-surface px-3 text-fg"
		})]
	});
}
function Slider({ label, value, min, max, step, suffix, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block text-sm text-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex justify-between",
			children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "text-fg",
				children: [value, suffix]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			className: "mt-1 w-full accent-accent",
			type: "range",
			min,
			max,
			step,
			value,
			onChange: (e) => onChange(Number(e.target.value))
		})]
	});
}
function TextBtn({ children, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: "h-10 text-sm text-muted",
		onClick,
		children
	});
}
function TabBtn({ active, onClick, icon, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		className: active ? "flex h-14 flex-col items-center justify-center gap-0.5 text-accent" : "flex h-14 flex-col items-center justify-center gap-0.5 text-muted",
		onClick,
		children: [icon, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs",
			children: label
		})]
	});
}
function uidLocal() {
	return Math.random().toString(36).slice(2, 10);
}
function loadSafeName() {
	try {
		return localStorage.getItem("hm-name") || "";
	} catch {
		return "";
	}
}
function buzz(pattern) {
	try {
		navigator.vibrate?.(pattern);
	} catch {}
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HuntApp, {});
}
//#endregion
export { Home as component };
