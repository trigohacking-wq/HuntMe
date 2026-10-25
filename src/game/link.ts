/**
 * Tiny room bus for static hosting (GitHub Pages).
 * 1. Same-browser: localStorage + BroadcastChannel (works offline).
 * 2. Cross-device: MQTT over a public WebSocket broker.
 * Payloads stay small. QoS 0. Reconnects with backoff. No server of our own.
 */

export type LinkStatus = "connecting" | "live" | "local" | "reconnecting";

type Listener = (data: unknown) => void;
type StatusListener = (s: LinkStatus) => void;

const BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
];

export interface RoomLink {
  publish: (data: unknown) => void;
  close: () => void;
  readonly status: LinkStatus;
}

export function openRoom(
  code: string,
  onMessage: Listener,
  onStatus: StatusListener,
): RoomLink {
  const topic = `hm/v1/${code}`;
  const storageKey = `hm-room:${code}`;
  let status: LinkStatus = "connecting";
  let closed = false;
  let ws: WebSocket | null = null;
  let brokerIndex = 0;
  let attempt = 0;
  let pingTimer = 0;
  let reconnectTimer = 0;
  const seen = new Set<string>();

  const setStatus = (s: LinkStatus) => {
    status = s;
    onStatus(s);
  };

  const remember = (mid: string) => {
    seen.add(mid);
    if (seen.size > 400) {
      const first = seen.values().next().value as string | undefined;
      if (first) seen.delete(first);
    }
  };

  const deliver = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const mid = (raw as { mid?: string }).mid;
    if (typeof mid === "string") {
      if (seen.has(mid)) return;
      remember(mid);
    }
    onMessage(raw);
  };

  const publishLocal = (json: string) => {
    try {
      localStorage.setItem(storageKey, json);
    } catch {
      /* quota — ignore, mqtt may still carry it */
    }
    try {
      channel?.postMessage(json);
    } catch {
      /* private mode */
    }
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(`hm-${code}`);
    channel.onmessage = (ev) => {
      try {
        deliver(JSON.parse(String(ev.data)));
      } catch {
        /* ignore */
      }
    };
  } catch {
    channel = null;
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== storageKey || !ev.newValue) return;
    try {
      deliver(JSON.parse(ev.newValue));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) deliver(JSON.parse(existing));
  } catch {
    /* ignore */
  }

  const connect = () => {
    if (closed) return;
    const url = BROKERS[brokerIndex % BROKERS.length]!;
    let socket: WebSocket;
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
      const packets = decodePackets(new Uint8Array(ev.data as ArrayBuffer));
      for (const pkt of packets) {
        if (pkt.kind === "connack") {
          if (pkt.ok) {
            socket.send(encodeSubscribe(topic, 1));
            attempt = 0;
            setStatus("live");
            window.clearInterval(pingTimer);
            pingTimer = window.setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) socket.send(encodePing());
            }, 20000);
          } else {
            socket.close();
          }
        } else if (pkt.kind === "publish" && pkt.payload) {
          try {
            deliver(JSON.parse(pkt.payload));
          } catch {
            /* ignore */
          }
        }
      }
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    brokerIndex++;
    attempt++;
    setStatus(attempt > 2 ? "local" : "reconnecting");
    const delay = Math.min(15000, 800 * 2 ** Math.min(attempt, 4));
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, delay);
  };

  connect();
  // If the broker is slow or blocked, the game still runs on this device.
  window.setTimeout(() => {
    if (!closed && status === "connecting") setStatus("local");
  }, 4500);

  return {
    get status() {
      return status;
    },
    publish(data: unknown) {
      const withMid =
        data && typeof data === "object"
          ? { mid: uidMid(), ...(data as object) }
          : { mid: uidMid(), data };
      const json = JSON.stringify(withMid);
      remember(withMid.mid);
      publishLocal(json);
      if (ws && ws.readyState === WebSocket.OPEN && status === "live") {
        try {
          ws.send(encodePublish(topic, json));
        } catch {
          /* next reconnect */
        }
      }
    },
    close() {
      closed = true;
      window.clearInterval(pingTimer);
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("storage", onStorage);
      try {
        channel?.close();
      } catch {
        /* ignore */
      }
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
  };
}

function uidMid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

function encodeRemaining(len: number): number[] {
  const out: number[] = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    out.push(digit);
  } while (len > 0);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytes(...parts: Array<number[] | Uint8Array>): Uint8Array {
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

function encodeConnect(): Uint8Array {
  const proto = utf8("MQTT");
  const client = utf8("hm" + Math.random().toString(36).slice(2, 10));
  const vh = bytes(
    [0, proto.length],
    proto,
    [4, 2, 0, 30], // level 4, clean session, keepalive 30s
  );
  const payload = bytes([client.length >> 8, client.length & 0xff], client);
  const body = bytes(vh, payload);
  return bytes([0x10], encodeRemaining(body.length), body);
}

function encodeSubscribe(topic: string, packetId: number): Uint8Array {
  const t = utf8(topic);
  const body = bytes(
    [packetId >> 8, packetId & 0xff],
    [t.length >> 8, t.length & 0xff],
    t,
    [0],
  );
  return bytes([0x82], encodeRemaining(body.length), body);
}

function encodePublish(topic: string, payload: string): Uint8Array {
  const t = utf8(topic);
  const p = utf8(payload);
  const body = bytes([t.length >> 8, t.length & 0xff], t, p);
  return bytes([0x30], encodeRemaining(body.length), body);
}

function encodePing(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

interface Decoded {
  kind: "connack" | "publish" | "other";
  ok?: boolean;
  payload?: string;
}

function decodePackets(buf: Uint8Array): Decoded[] {
  const out: Decoded[] = [];
  let i = 0;
  while (i < buf.length) {
    const type = buf[i]! >> 4;
    i++;
    let multiplier = 1;
    let remaining = 0;
    let digit: number;
    do {
      if (i >= buf.length) return out;
      digit = buf[i]!;
      i++;
      remaining += (digit & 127) * multiplier;
      multiplier *= 128;
    } while ((digit & 128) !== 0);
    const start = i;
    const end = Math.min(buf.length, start + remaining);
    const body = buf.slice(start, end);
    i = end;
    if (type === 2) {
      out.push({ kind: "connack", ok: body.length < 2 || body[1] === 0 });
    } else if (type === 3 && body.length >= 2) {
      const tlen = (body[0]! << 8) | body[1]!;
      const payload = body.slice(2 + tlen);
      out.push({ kind: "publish", payload: new TextDecoder().decode(payload) });
    } else {
      out.push({ kind: "other" });
    }
  }
  return out;
}
