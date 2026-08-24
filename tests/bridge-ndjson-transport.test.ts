import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  MAX_NDJSON_FRAME_BYTES,
  NdjsonBridgeTransport,
  type BridgeReadable,
  type BridgeWritable,
} from '../src/bridge-ndjson-transport';
import type { BridgeRequest } from '../src/bridge-protocol';

describe('插件侧 NDJSON transport', () => {
  it('按换行解帧分片/连续 JSON，并按原请求写出单行', () => {
    const input = new FakeReadable();
    const output = new FakeWritable();
    const frames: unknown[] = [];
    const transport = new NdjsonBridgeTransport(input, output);
    transport.attach({ onFrame: frame => frames.push(frame), onClose: () => undefined });

    input.emitData('{"type":"response","id":"request-1",');
    input.emitData('"ok":true,"result":{}}\n{"type":"event","event":"x"}\r\n');
    expect(frames).toEqual([
      { type: 'response', id: 'request-1', ok: true, result: {} },
      { type: 'event', event: 'x' },
    ]);

    transport.send(initializeRequest());
    expect(output.chunks).toHaveLength(1);
    expect(output.chunks[0]).toBe(`${JSON.stringify(initializeRequest())}\n`);
  });

  it('空行、非法 JSON 与超限 frame 都交给协议层 fail closed', () => {
    for (const chunk of ['\n', '{bad}\n', 'x'.repeat(MAX_NDJSON_FRAME_BYTES + 1)]) {
      const input = new FakeReadable();
      const frames: unknown[] = [];
      const transport = new NdjsonBridgeTransport(input, new FakeWritable());
      transport.attach({ onFrame: frame => frames.push(frame), onClose: () => undefined });
      input.emitData(chunk);
      expect(frames).toEqual([{ type: 'invalid-ndjson-frame' }]);
      expect(() => transport.send(initializeRequest())).toThrow('已关闭');
    }
  });

  it('按单帧限制大小，不把同一数据块内多个合规 frame 误判为超限', () => {
    const input = new FakeReadable();
    const line = `${JSON.stringify({ type: 'event', event: 'x' })}\n`;
    const count = Math.ceil((MAX_NDJSON_FRAME_BYTES + 1) / Buffer.byteLength(line, 'utf8'));
    let frames = 0;
    const transport = new NdjsonBridgeTransport(input, new FakeWritable());
    transport.attach({ onFrame: () => { frames += 1; }, onClose: () => undefined });

    input.emitData(line.repeat(count));

    expect(frames).toBe(count);
    expect(() => transport.send(initializeRequest())).not.toThrow();
  });

  it('EOF 只通知一次并移除监听器', () => {
    const input = new FakeReadable();
    let closes = 0;
    const transport = new NdjsonBridgeTransport(input, new FakeWritable());
    transport.attach({ onFrame: () => undefined, onClose: () => { closes += 1; } });
    input.emit('end');
    input.emit('end');
    expect(closes).toBe(1);
    expect(input.listenerCount('data')).toBe(0);
  });
});

class FakeReadable extends EventEmitter implements BridgeReadable {
  setEncoding(_encoding: NodeJS.BufferEncoding): void {}

  emitData(chunk: string): void {
    this.emit('data', chunk);
  }
}

class FakeWritable implements BridgeWritable {
  readonly chunks: string[] = [];

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

function initializeRequest(): BridgeRequest {
  return {
    type: 'request', id: 'request-1', method: 'initialize',
    params: {
      protocolVersion: '1',
      client: { name: 'deepseek-harness-workbench', version: '0.1.0' },
      requiredCapabilities: ['session', 'events', 'cancel', 'permission', 'shutdown'],
    },
  };
}
