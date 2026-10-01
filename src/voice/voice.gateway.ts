import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { RawData, WebSocket } from 'ws';
import { ChatTurn } from '../providers/types.js';
import { PipelineEvent, VoicePipeline } from './voice-pipeline.js';

/** Max audio per utterance: ~1 minute of Opus speech. */
const MAX_UTTERANCE_BYTES = 2 * 1024 * 1024;
/** Turns kept in context, so long conversations stay cheap and fast. */
const MAX_HISTORY_TURNS = 20;

interface Session {
  history: ChatTurn[];
  chunks: Buffer[];
  size: number;
  mimeType: string;
  abort?: AbortController;
}

/**
 * Protocol (one WebSocket per conversation):
 *   client → server: {"type":"start","mimeType":"audio/webm"} · binary audio frames · {"type":"stop"}
 *                    {"type":"interrupt"} cancels the reply that is playing (barge-in)
 *   server → client: JSON PipelineEvent messages, plus {"type":"error","message":...}
 */
@WebSocketGateway({ path: '/voice' })
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(VoiceGateway.name);
  private readonly sessions = new Map<WebSocket, Session>();

  constructor(@Inject(VoicePipeline) private readonly pipeline: VoicePipeline) {}

  handleConnection(socket: WebSocket): void {
    this.sessions.set(socket, { history: [], chunks: [], size: 0, mimeType: 'audio/webm' });
    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) this.onAudio(socket, data as Buffer);
      else this.onControl(socket, data.toString());
    });
  }

  handleDisconnect(socket: WebSocket): void {
    this.sessions.get(socket)?.abort?.abort();
    this.sessions.delete(socket);
  }

  private onAudio(socket: WebSocket, data: Buffer): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    session.size += data.length;
    if (session.size > MAX_UTTERANCE_BYTES) {
      this.send(socket, { type: 'error', message: 'Utterance is too long.' });
      session.chunks = [];
      session.size = 0;
      return;
    }
    session.chunks.push(data);
  }

  private onControl(socket: WebSocket, raw: string): void {
    const session = this.sessions.get(socket);
    if (!session) return;

    let message: { type?: string; mimeType?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      this.send(socket, { type: 'error', message: 'Invalid JSON message.' });
      return;
    }

    switch (message.type) {
      case 'start':
        session.abort?.abort(); // a new utterance interrupts the previous reply
        session.chunks = [];
        session.size = 0;
        session.mimeType = message.mimeType ?? 'audio/webm';
        break;
      case 'stop':
        void this.runTurn(socket, session);
        break;
      case 'interrupt':
        session.abort?.abort();
        break;
      default:
        this.send(socket, { type: 'error', message: `Unknown message type: ${message.type}` });
    }
  }

  private async runTurn(socket: WebSocket, session: Session): Promise<void> {
    const audio = { data: Buffer.concat(session.chunks), mimeType: session.mimeType };
    session.chunks = [];
    session.size = 0;
    if (audio.data.length === 0) return;

    const abort = new AbortController();
    session.abort = abort;
    try {
      await this.pipeline.runTurn(
        audio,
        session.history,
        (event) => this.send(socket, event),
        abort.signal,
      );
      session.history.splice(0, Math.max(0, session.history.length - MAX_HISTORY_TURNS * 2));
    } catch (error) {
      if (abort.signal.aborted) return;
      this.logger.error(error);
      this.send(socket, { type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      if (session.abort === abort) session.abort = undefined;
    }
  }

  private send(socket: WebSocket, event: PipelineEvent | { type: 'error'; message: string }): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  }
}
