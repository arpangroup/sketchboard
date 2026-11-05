import type { ClientMessage, ServerMessage } from './protocol';

/**
 * Transport abstraction (Dependency Inversion): CollabSession doesn't care whether messages
 * travel over WebSocket, WebRTC data channels or a test double.
 */
export interface CollabTransport {
  connect(): void;
  send(msg: ClientMessage): void;
  onMessage(handler: (msg: ServerMessage) => void): void;
  onStatus(handler: (status: 'connecting' | 'open' | 'closed') => void): void;
  close(): void;
}

/** WebSocket transport with exponential-backoff reconnection. */
export class WebSocketTransport implements CollabTransport {
  private ws: WebSocket | null = null;
  private messageHandler: (msg: ServerMessage) => void = () => {};
  private statusHandler: (s: 'connecting' | 'open' | 'closed') => void = () => {};
  private retries = 0;
  private closedByUser = false;
  private queue: ClientMessage[] = [];

  constructor(private url: string) {}

  connect(): void {
    this.closedByUser = false;
    this.statusHandler('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.statusHandler('open');
      this.queue.splice(0).forEach((m) => this.send(m));
    };
    ws.onmessage = (ev) => {
      try {
        this.messageHandler(JSON.parse(ev.data as string) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.statusHandler('closed');
      if (this.closedByUser) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retries++);
      setTimeout(() => !this.closedByUser && this.connect(), delay);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    // 'join' is re-sent by the session on every (re)connect, so it's never queued.
    else if (msg.type === 'broadcast' && !msg.volatile) this.queue.push(msg);
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  onStatus(handler: (s: 'connecting' | 'open' | 'closed') => void): void {
    this.statusHandler = handler;
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}
