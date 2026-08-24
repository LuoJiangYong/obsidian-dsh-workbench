import type {
  BridgeRequest,
  BridgeTransport,
  BridgeTransportHandlers,
} from './bridge-protocol';

export const MAX_NDJSON_FRAME_BYTES = 1024 * 1024;

export interface BridgeReadable {
  setEncoding(encoding: NodeJS.BufferEncoding): void;
  on(event: 'data', listener: (chunk: string) => void): void;
  on(event: 'end' | 'error', listener: () => void): void;
  removeListener(event: 'data', listener: (chunk: string) => void): void;
  removeListener(event: 'end' | 'error', listener: () => void): void;
}

export interface BridgeWritable {
  write(chunk: string): boolean;
}

export class NdjsonBridgeTransport implements BridgeTransport {
  private buffer = '';
  private closed = false;
  private handlers: BridgeTransportHandlers | undefined;

  constructor(
    private readonly input: BridgeReadable,
    private readonly output: BridgeWritable,
  ) {}

  attach(handlers: BridgeTransportHandlers): () => void {
    if (this.handlers) throw new Error('NDJSON transport 只能绑定一个 client');
    if (this.closed) throw new Error('NDJSON transport 已关闭');
    this.handlers = handlers;
    this.input.setEncoding('utf8');
    this.input.on('data', this.onData);
    this.input.on('end', this.onClose);
    this.input.on('error', this.onClose);
    return () => {
      if (this.handlers !== handlers) return;
      this.detachListeners();
      this.handlers = undefined;
    };
  }

  send(request: BridgeRequest): void {
    if (this.closed) throw new Error('NDJSON transport 已关闭');
    const line = `${JSON.stringify(request)}\n`;
    if (Buffer.byteLength(line, 'utf8') > MAX_NDJSON_FRAME_BYTES) {
      throw new Error('bridge 请求 frame 超过 1 MiB');
    }
    this.output.write(line);
  }

  private readonly onData = (chunk: string): void => {
    if (this.closed) return;
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const wireLine = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(`${wireLine}\n`, 'utf8') > MAX_NDJSON_FRAME_BYTES) {
        this.deliverInvalidFrame();
        return;
      }
      const line = wireLine.replace(/\r$/u, '');
      if (!line) {
        this.deliverInvalidFrame();
        return;
      }
      let frame: unknown;
      try {
        frame = JSON.parse(line) as unknown;
      } catch {
        this.deliverInvalidFrame();
        return;
      }
      this.handlers?.onFrame(frame);
      if (this.closed) return;
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_NDJSON_FRAME_BYTES) {
      this.deliverInvalidFrame();
    }
  };

  private readonly onClose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.detachListeners();
    const handlers = this.handlers;
    this.handlers = undefined;
    handlers?.onClose();
  };

  private deliverInvalidFrame(): void {
    this.handlers?.onFrame({ type: 'invalid-ndjson-frame' });
    this.closed = true;
    this.detachListeners();
  }

  private detachListeners(): void {
    this.input.removeListener('data', this.onData);
    this.input.removeListener('end', this.onClose);
    this.input.removeListener('error', this.onClose);
  }
}
