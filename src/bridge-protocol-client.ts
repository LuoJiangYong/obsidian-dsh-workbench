import {
  BRIDGE_CAPABILITIES,
  BRIDGE_PROTOCOL_VERSION,
  TARGET_BRIDGE_DSH_VERSION,
  TARGET_BRIDGE_VERSION,
  parseAcceptedResult,
  parseBridgeInboundFrame,
  parseInitializeResult,
  parseSessionClosedResult,
  parseSessionCreatedResult,
  type BridgeAcceptedResult,
  type BridgeEvent,
  type BridgeInitializeResult,
  type BridgePermissionDecision,
  type BridgeRemoteErrorCode,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSessionClosedResult,
  type BridgeSessionCreatedResult,
  type BridgeSessionMode,
  type BridgeTransport,
  type BridgeTurnOutcome,
  type KnownBridgeEvent,
} from './bridge-protocol';

export type BridgeConnectionState =
  | 'closed'
  | 'closing'
  | 'failed'
  | 'initializing'
  | 'new'
  | 'ready'
  | 'shutting_down';

export type BridgeProtocolErrorCode =
  | 'connection_unavailable'
  | 'event_listener_failed'
  | 'event_sequence'
  | 'handshake_mismatch'
  | 'invalid_frame'
  | 'invalid_result'
  | 'invalid_state'
  | 'request_timeout'
  | 'transport_send_failed'
  | 'unexpected_eof'
  | 'unknown_response';

export type BridgeActiveTurnState =
  | 'awaiting_permission'
  | 'cancelling'
  | 'running'
  | 'starting';

export interface BridgeActiveTurnSnapshot {
  readonly turnId: string;
  readonly state: BridgeActiveTurnState;
  readonly permissionRequestId?: string;
}

export interface BridgeTerminalSnapshot {
  readonly turnId: string;
  readonly outcome: BridgeTurnOutcome;
}

export interface BridgeSessionSnapshot {
  readonly sessionId: string;
  readonly mode: BridgeSessionMode;
  readonly state: 'closed' | 'closing' | 'creating' | 'idle';
  readonly lastEventSeq: number;
  readonly lastSourceSeq?: number;
  readonly activeTurn?: BridgeActiveTurnSnapshot;
  readonly lastTerminal?: BridgeTerminalSnapshot;
}

interface BridgeProtocolClientOptions {
  readonly requestTimeoutMs: number;
}

interface ActiveTurnRecord {
  readonly turnId: string;
  state: BridgeActiveTurnState;
  permissionRequestId?: string;
  permissionResolving: boolean;
}

interface SessionRecord {
  readonly sessionId: string;
  readonly mode: BridgeSessionMode;
  state: BridgeSessionSnapshot['state'];
  lastEventSeq: number;
  lastSourceSeq?: number;
  readonly permissionRequestIds: Set<string>;
  activeTurn?: ActiveTurnRecord;
  lastTerminal?: BridgeTerminalSnapshot;
}

interface PendingRequest {
  readonly timer: number;
  readonly accept: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly onRemoteError?: () => void;
}

interface RequestHooks<TResult> {
  readonly parse: (value: unknown) => TResult;
  readonly onSuccess?: (result: TResult) => void;
  readonly onRemoteError?: () => void;
}

export class BridgeProtocolError extends Error {
  readonly code: BridgeProtocolErrorCode;

  constructor(code: BridgeProtocolErrorCode, message: string) {
    super(message);
    this.name = 'BridgeProtocolError';
    this.code = code;
  }
}

export class BridgeRemoteError extends Error {
  readonly code: BridgeRemoteErrorCode;

  constructor(code: BridgeRemoteErrorCode, message: string) {
    super(message);
    this.name = 'BridgeRemoteError';
    this.code = code;
  }
}

export class BridgeProtocolClient {
  connectionState: BridgeConnectionState = 'new';
  failure: BridgeProtocolError | undefined;

  private readonly connectionStateListeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: KnownBridgeEvent) => void>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly transport: BridgeTransport;
  private detachTransport: (() => void) | undefined;
  private nextRequestNumber = 1;

  constructor(transport: BridgeTransport, options: BridgeProtocolClientOptions) {
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new Error('bridge requestTimeoutMs 必须是正安全整数');
    }
    this.transport = transport;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.detachTransport = transport.attach({
      onFrame: (frame) => this.handleFrame(frame),
      onClose: () => this.handleClose(),
    });
  }

  async initialize(): Promise<BridgeInitializeResult> {
    if (this.connectionState !== 'new') {
      throw this.invalidState('initialize 只能在新连接上调用');
    }
    this.setConnectionState('initializing');
    return await this.sendRequest(
      (id) => ({
        type: 'request',
        id,
        method: 'initialize',
        params: {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          client: { name: 'deepseek-harness-workbench', version: '0.1.0' },
          requiredCapabilities: BRIDGE_CAPABILITIES,
        },
      }),
      {
        parse: parseInitializeResult,
        onSuccess: (result) => {
          if (!isExpectedInitializeResult(result)) {
            throw new BridgeProtocolError(
              'handshake_mismatch',
              'bridge、DSH、协议版本或 capability 不匹配',
            );
          }
          this.setConnectionState('ready');
        },
        onRemoteError: () => {
          throw new BridgeProtocolError('handshake_mismatch', 'bridge 拒绝 initialize');
        },
      },
    );
  }

  async createSession(input: {
    readonly sessionId: string;
    readonly mode: BridgeSessionMode;
  }): Promise<BridgeSessionCreatedResult> {
    this.requireReady();
    requireIdentifier(input.sessionId, 'sessionId');
    if (this.sessions.has(input.sessionId)) throw this.invalidState('sessionId 已存在');
    const session: SessionRecord = {
      sessionId: input.sessionId,
      mode: input.mode,
      state: 'creating',
      lastEventSeq: -1,
      permissionRequestIds: new Set(),
    };
    this.sessions.set(input.sessionId, session);

    return await this.sendRequest(
      (id) => ({
        type: 'request',
        id,
        method: 'session/create',
        params: { sessionId: input.sessionId, mode: input.mode },
      }),
      {
        parse: parseSessionCreatedResult,
        onSuccess: (result) => {
          if (result.sessionId !== input.sessionId) {
            throw new BridgeProtocolError('invalid_result', 'session/create 返回错误 sessionId');
          }
          session.state = 'idle';
        },
        onRemoteError: () => this.sessions.delete(input.sessionId),
      },
    );
  }

  async startTurn(input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
  }): Promise<BridgeAcceptedResult> {
    this.requireReady();
    requireIdentifier(input.turnId, 'turnId');
    if (input.text.trim().length === 0) throw this.invalidState('turn 文本不能为空');
    const session = this.requireIdleSession(input.sessionId);
    const activeTurn: ActiveTurnRecord = {
      turnId: input.turnId,
      state: 'starting',
      permissionResolving: false,
    };
    session.activeTurn = activeTurn;
    session.lastTerminal = undefined;

    return await this.sendRequest(
      (id) => ({
        type: 'request',
        id,
        method: 'turn/start',
        params: input,
      }),
      {
        parse: parseAcceptedResult,
        onRemoteError: () => {
          if (session.activeTurn === activeTurn) session.activeTurn = undefined;
        },
      },
    );
  }

  async cancelTurn(input: {
    readonly sessionId: string;
    readonly turnId: string;
  }): Promise<BridgeAcceptedResult> {
    this.requireReady();
    const session = this.requireSession(input.sessionId);
    const activeTurn = this.requireActiveTurn(session, input.turnId);
    if (activeTurn.state === 'cancelling') throw this.invalidState('turn 已在取消中');
    const priorState = activeTurn.state;
    activeTurn.state = 'cancelling';

    return await this.sendRequest(
      (id) => ({ type: 'request', id, method: 'turn/cancel', params: input }),
      {
        parse: parseAcceptedResult,
        onRemoteError: () => {
          const current = session.activeTurn;
          if (!current || current !== activeTurn) {
            throw new BridgeProtocolError('invalid_state', 'cancel 错误响应晚于 turn 终态');
          }
          current.state = priorState;
        },
      },
    );
  }

  async resolvePermission(input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly requestId: string;
    readonly decision: BridgePermissionDecision;
  }): Promise<BridgeAcceptedResult> {
    this.requireReady();
    const session = this.requireSession(input.sessionId);
    const activeTurn = this.requireActiveTurn(session, input.turnId);
    if (activeTurn.state !== 'awaiting_permission'
      || activeTurn.permissionRequestId !== input.requestId
      || activeTurn.permissionResolving) {
      throw this.invalidState('permission 请求不是当前待决请求');
    }
    activeTurn.permissionResolving = true;

    return await this.sendRequest(
      (id) => ({ type: 'request', id, method: 'permission/resolve', params: input }),
      {
        parse: parseAcceptedResult,
        onSuccess: () => {
          const current = session.activeTurn;
          if (!current || current !== activeTurn) {
            throw new BridgeProtocolError('invalid_state', 'permission 响应晚于 turn 终态');
          }
          current.state = 'running';
          current.permissionRequestId = undefined;
          current.permissionResolving = false;
        },
        onRemoteError: () => {
          if (session.activeTurn === activeTurn) activeTurn.permissionResolving = false;
        },
      },
    );
  }

  async closeSession(sessionId: string): Promise<BridgeSessionClosedResult> {
    this.requireReady();
    const session = this.requireIdleSession(sessionId);
    session.state = 'closing';
    return await this.sendRequest(
      (id) => ({ type: 'request', id, method: 'session/close', params: { sessionId } }),
      {
        parse: parseSessionClosedResult,
        onSuccess: () => { session.state = 'closed'; },
        onRemoteError: () => { session.state = 'idle'; },
      },
    );
  }

  async shutdown(): Promise<BridgeAcceptedResult> {
    this.requireReady();
    if ([...this.sessions.values()].some((session) => session.activeTurn !== undefined)) {
      throw this.invalidState('存在活动 turn 时不能正常 shutdown');
    }
    this.setConnectionState('shutting_down');
    return await this.sendRequest(
      (id) => ({ type: 'request', id, method: 'shutdown', params: {} }),
      {
        parse: parseAcceptedResult,
        onSuccess: () => { this.setConnectionState('closing'); },
        onRemoteError: () => { this.setConnectionState('ready'); },
      },
    );
  }

  getSession(sessionId: string): BridgeSessionSnapshot | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return {
      sessionId: session.sessionId,
      mode: session.mode,
      state: session.state,
      lastEventSeq: session.lastEventSeq,
      ...(session.lastSourceSeq === undefined ? {} : { lastSourceSeq: session.lastSourceSeq }),
      ...(session.activeTurn === undefined ? {} : {
        activeTurn: {
          turnId: session.activeTurn.turnId,
          state: session.activeTurn.state,
          ...(session.activeTurn.permissionRequestId === undefined
            ? {}
            : { permissionRequestId: session.activeTurn.permissionRequestId }),
        },
      }),
      ...(session.lastTerminal === undefined ? {} : {
        lastTerminal: { ...session.lastTerminal },
      }),
    };
  }

  onEvent(listener: (event: KnownBridgeEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnectionStateChange(listener: () => void): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  private sendRequest<TResult>(
    buildRequest: (id: string) => BridgeRequest,
    hooks: RequestHooks<TResult>,
  ): Promise<TResult> {
    const id = `request-${String(this.nextRequestNumber++)}`;
    const request = buildRequest(id);
    return new Promise<TResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.fail(new BridgeProtocolError(
          'request_timeout',
          `bridge 请求超时：${request.method}`,
        ));
      }, this.requestTimeoutMs);
      const pending: PendingRequest = {
        timer,
        accept: (value) => {
          let result: TResult;
          try {
            result = hooks.parse(value);
          } catch (error) {
            throw new BridgeProtocolError(
              'invalid_result',
              error instanceof Error ? error.message : 'bridge result 无效',
            );
          }
          hooks.onSuccess?.(result);
          resolve(result);
        },
        reject,
        ...(hooks.onRemoteError === undefined ? {} : { onRemoteError: hooks.onRemoteError }),
      };
      this.pendingRequests.set(id, pending);
      try {
        this.transport.send(request);
      } catch {
        this.fail(new BridgeProtocolError('transport_send_failed', 'bridge transport 发送失败'));
      }
    });
  }

  private handleFrame(rawFrame: unknown): void {
    if (this.connectionState === 'closed' || this.connectionState === 'failed') return;
    try {
      const frame = parseBridgeInboundFrame(rawFrame);
      if (frame.type === 'response') {
        this.handleResponse(frame);
      } else {
        this.handleEvent(frame);
      }
    } catch (error) {
      this.fail(normalizeProtocolError(error, 'invalid_frame'));
    }
  }

  private handleResponse(frame: BridgeResponse): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      throw new BridgeProtocolError('unknown_response', `未知或重复 response id：${frame.id}`);
    }
    window.clearTimeout(pending.timer);
    if (!frame.ok) {
      pending.onRemoteError?.();
      this.pendingRequests.delete(frame.id);
      pending.reject(new BridgeRemoteError(frame.error.code, frame.error.message));
      return;
    }
    pending.accept(frame.result);
    this.pendingRequests.delete(frame.id);
  }

  private handleEvent(event: BridgeEvent): void {
    if (this.connectionState !== 'ready' && this.connectionState !== 'shutting_down') {
      throw this.invalidState('未完成握手时收到 bridge event');
    }
    const session = this.requireSession(event.sessionId);
    if (session.state !== 'idle') throw this.invalidState('非活动 session 收到 turn event');
    const expectedSeq = session.lastEventSeq + 1;
    if (event.seq !== expectedSeq) {
      throw new BridgeProtocolError(
        'event_sequence',
        `session ${event.sessionId} 期望 seq ${String(expectedSeq)}，收到 ${String(event.seq)}`,
      );
    }
    if (event.sourceSeq !== undefined
      && session.lastSourceSeq !== undefined
      && event.sourceSeq <= session.lastSourceSeq) {
      throw new BridgeProtocolError('event_sequence', 'sourceSeq 必须严格递增');
    }
    const activeTurn = this.requireActiveTurn(session, event.turnId);

    if ('ignorable' in event) {
      this.commitEventSequence(session, event);
      return;
    }

    switch (event.event) {
      case 'turn.started':
        if (activeTurn.state !== 'starting') throw this.invalidState('重复或过期 turn.started');
        activeTurn.state = 'running';
        break;
      case 'assistant.delta':
      case 'assistant.message':
        if (activeTurn.state !== 'running' && activeTurn.state !== 'cancelling') {
          throw this.invalidState(`${event.event} 不属于当前 turn 状态`);
        }
        break;
      case 'tool.started':
        if (activeTurn.state !== 'running') {
          throw this.invalidState('tool.started 不属于当前 turn 状态');
        }
        break;
      case 'permission.requested':
        if (activeTurn.state !== 'running'
          || activeTurn.permissionRequestId !== undefined
          || session.permissionRequestIds.has(event.payload.requestId)) {
          throw this.invalidState('permission.requested 不属于当前 turn 状态');
        }
        session.permissionRequestIds.add(event.payload.requestId);
        activeTurn.state = 'awaiting_permission';
        activeTurn.permissionRequestId = event.payload.requestId;
        activeTurn.permissionResolving = false;
        break;
      case 'turn.ended':
        if (activeTurn.state === 'starting') throw this.invalidState('turn.started 前收到终态');
        if (event.payload.outcome === 'cancelled' && activeTurn.state !== 'cancelling') {
          throw this.invalidState('没有 cancel 请求却收到 cancelled 终态');
        }
        session.lastTerminal = { turnId: event.turnId, outcome: event.payload.outcome };
        session.activeTurn = undefined;
        break;
    }

    this.commitEventSequence(session, event);
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        throw new BridgeProtocolError('event_listener_failed', 'bridge event listener 执行失败');
      }
    }
  }

  private commitEventSequence(session: SessionRecord, event: BridgeEvent): void {
    session.lastEventSeq = event.seq;
    if (event.sourceSeq !== undefined) session.lastSourceSeq = event.sourceSeq;
  }

  private handleClose(): void {
    if (this.connectionState === 'closed' || this.connectionState === 'failed') return;
    if (this.connectionState === 'closing') {
      this.setConnectionState('closed');
      this.detach();
      return;
    }
    this.fail(new BridgeProtocolError('unexpected_eof', 'bridge 在正常 shutdown 前关闭'));
  }

  private fail(error: BridgeProtocolError): void {
    if (this.connectionState === 'failed' || this.connectionState === 'closed') return;
    this.failure = error;
    this.setConnectionState('failed');
    this.detach();
    for (const pending of this.pendingRequests.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private detach(): void {
    this.detachTransport?.();
    this.detachTransport = undefined;
  }

  private setConnectionState(state: BridgeConnectionState): void {
    this.connectionState = state;
    for (const listener of this.connectionStateListeners) {
      try {
        listener();
      } catch {
        // Connection observers cannot change protocol validity or lifecycle ownership.
      }
    }
  }

  private requireReady(): void {
    if (this.connectionState !== 'ready') {
      throw new BridgeProtocolError('connection_unavailable', 'bridge 连接不可用');
    }
  }

  private requireSession(sessionId: string): SessionRecord {
    requireIdentifier(sessionId, 'sessionId');
    const session = this.sessions.get(sessionId);
    if (!session) throw this.invalidState('session 不存在');
    return session;
  }

  private requireIdleSession(sessionId: string): SessionRecord {
    const session = this.requireSession(sessionId);
    if (session.state !== 'idle' || session.activeTurn) {
      throw this.invalidState('session 当前不可接受该操作');
    }
    return session;
  }

  private requireActiveTurn(session: SessionRecord, turnId: string): ActiveTurnRecord {
    requireIdentifier(turnId, 'turnId');
    const activeTurn = session.activeTurn;
    if (!activeTurn || activeTurn.turnId !== turnId) throw this.invalidState('turn 不是当前活动 turn');
    return activeTurn;
  }

  private invalidState(message: string): BridgeProtocolError {
    return new BridgeProtocolError('invalid_state', message);
  }
}

function isExpectedInitializeResult(result: BridgeInitializeResult): boolean {
  return result.protocolVersion === BRIDGE_PROTOCOL_VERSION
    && result.bridgeVersion === TARGET_BRIDGE_VERSION
    && result.dshVersion === TARGET_BRIDGE_DSH_VERSION
    && result.capabilities.length === BRIDGE_CAPABILITIES.length
    && BRIDGE_CAPABILITIES.every((capability) => result.capabilities.includes(capability));
}

function requireIdentifier(value: string, label: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new BridgeProtocolError('invalid_state', `${label} 不能为空或包含首尾空白`);
  }
}

function normalizeProtocolError(
  error: unknown,
  fallbackCode: BridgeProtocolErrorCode,
): BridgeProtocolError {
  if (error instanceof BridgeProtocolError) return error;
  return new BridgeProtocolError(
    fallbackCode,
    error instanceof Error ? error.message : 'bridge 协议错误',
  );
}
