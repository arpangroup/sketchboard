import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { InMemoryRoomBroker, type RoomBroker } from './broker.js';

/**
 * SketchBoard collaboration relay.
 * Zero-knowledge: payloads are AES-GCM encrypted in the browser and the key never leaves the
 * URL fragment, so this server can't read drawings. It only routes opaque blobs between peers.
 */

const PORT = Number(process.env.PORT ?? 3002);
const MAX_PAYLOAD = Number(process.env.MAX_PAYLOAD_BYTES ?? 5 * 1024 * 1024);
const MAX_ROOM_ID = 64;
const RATE_LIMIT_PER_SEC = Number(process.env.RATE_LIMIT_PER_SEC ?? 120);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

type ClientMessage =
  | { type: 'join'; roomId: string }
  | { type: 'broadcast'; payload: string; volatile?: boolean };

interface Client {
  id: string;
  ws: WebSocket;
  roomId: string | null;
  alive: boolean;
  tokens: number;
}

const broker: RoomBroker = new InMemoryRoomBroker();

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: broker.roomCount(), clients: broker.memberCount() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  maxPayload: MAX_PAYLOAD,
  verifyClient: ({ origin }: { origin: string }) => ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin),
});

const send = (ws: WebSocket, msg: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

wss.on('connection', (ws) => {
  const client: Client = { id: randomUUID(), ws, roomId: null, alive: true, tokens: RATE_LIMIT_PER_SEC };
  ws.on('pong', () => (client.alive = true));

  ws.on('message', (raw) => {
    // token-bucket rate limit protects the relay from a misbehaving client
    if (client.tokens-- <= 0) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Malformed message' });
    }

    if (msg.type === 'join') {
      if (typeof msg.roomId !== 'string' || !msg.roomId || msg.roomId.length > MAX_ROOM_ID) {
        return send(ws, { type: 'error', message: 'Invalid room id' });
      }
      if (client.roomId) leaveRoom(client);
      client.roomId = msg.roomId;
      const peers = broker.join(msg.roomId, { id: client.id, send: (d) => ws.readyState === WebSocket.OPEN && ws.send(d) });
      send(ws, { type: 'joined', clientId: client.id, peers });
      broker.publish(msg.roomId, JSON.stringify({ type: 'peer-joined', clientId: client.id }), client.id);
      return;
    }

    if (msg.type === 'broadcast' && client.roomId && typeof msg.payload === 'string') {
      // Volatile messages (cursor positions) are dropped under back-pressure.
      if (msg.volatile && ws.bufferedAmount > 1024 * 1024) return;
      broker.publish(client.roomId, JSON.stringify({ type: 'message', from: client.id, payload: msg.payload }), client.id);
    }
  });

  ws.on('close', () => leaveRoom(client));
  ws.on('error', () => leaveRoom(client));
  clients.add(client);
});

const clients = new Set<Client>();

function leaveRoom(client: Client): void {
  if (!client.roomId) return;
  broker.leave(client.roomId, client.id);
  broker.publish(client.roomId, JSON.stringify({ type: 'peer-left', clientId: client.id }));
  client.roomId = null;
}

// Heartbeat: terminate dead connections; refill rate-limit buckets.
setInterval(() => {
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.CLOSED) {
      clients.delete(c);
      continue;
    }
    if (!c.alive) {
      c.ws.terminate();
      clients.delete(c);
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);
setInterval(() => clients.forEach((c) => (c.tokens = RATE_LIMIT_PER_SEC)), 1000);

http.listen(PORT, () => {
  console.log(`SketchBoard collab relay listening on :${PORT}`);
});

const shutdown = () => {
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  http.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
