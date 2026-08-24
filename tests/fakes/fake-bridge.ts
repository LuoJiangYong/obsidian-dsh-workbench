import type {
  BridgeRequest,
  BridgeTransport,
  BridgeTransportHandlers,
} from '../../src/bridge-protocol';

export class FakeBridgeTransport implements BridgeTransport {
  private handlers: BridgeTransportHandlers | undefined;
  private readonly requests: BridgeRequest[] = [];

  attach(handlers: BridgeTransportHandlers): () => void {
    if (this.handlers) throw new Error('假 bridge transport 只能绑定一个 client');
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) this.handlers = undefined;
    };
  }

  send(request: BridgeRequest): void {
    this.requests.push(structuredClone(request));
  }

  takeRequest(): BridgeRequest {
    const request = this.requests.shift();
    if (!request) throw new Error('没有待处理的 bridge 请求');
    return request;
  }

  deliver(frame: unknown): void {
    if (!this.handlers) throw new Error('假 bridge transport 尚未绑定 client');
    this.handlers.onFrame(structuredClone(frame));
  }

  close(): void {
    if (!this.handlers) throw new Error('假 bridge transport 尚未绑定 client');
    this.handlers.onClose();
  }
}
