export const BRIDGE_PROTOCOL_VERSION = '1';
export const TARGET_BRIDGE_VERSION = '0.1.0';
export const TARGET_BRIDGE_DSH_VERSION = '0.1.1-rc.2';

export const BRIDGE_CAPABILITIES = [
  'session',
  'events',
  'cancel',
  'permission',
  'shutdown',
] as const;

export type BridgeCapability = typeof BRIDGE_CAPABILITIES[number];
export type BridgeSessionMode = 'chat' | 'task';
export type BridgePermissionDecision = 'allow-once' | 'reject';
export type BridgeTurnOutcome = 'completed' | 'failed' | 'cancelled';
export type BridgeTurnErrorCode =
  | 'context_invalid'
  | 'network_error'
  | 'permission_rejected'
  | 'runtime_error'
  | 'runtime_terminated';

export type BridgeRemoteErrorCode =
  | 'capability_missing'
  | 'internal_error'
  | 'invalid_request'
  | 'invalid_state'
  | 'permission_expired'
  | 'permission_not_found'
  | 'protocol_mismatch'
  | 'session_busy'
  | 'session_not_found'
  | 'turn_not_found'
  | 'unsupported_dsh';

interface BridgeRequestBase {
  readonly type: 'request';
  readonly id: string;
}

export interface InitializeRequest extends BridgeRequestBase {
  readonly method: 'initialize';
  readonly params: {
    readonly protocolVersion: string;
    readonly client: {
      readonly name: 'deepseek-harness-workbench';
      readonly version: string;
    };
    readonly requiredCapabilities: readonly BridgeCapability[];
  };
}

export interface SessionCreateRequest extends BridgeRequestBase {
  readonly method: 'session/create';
  readonly params: {
    readonly sessionId: string;
    readonly mode: BridgeSessionMode;
  };
}

export interface TurnStartRequest extends BridgeRequestBase {
  readonly method: 'turn/start';
  readonly params: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
  };
}

export interface TurnCancelRequest extends BridgeRequestBase {
  readonly method: 'turn/cancel';
  readonly params: {
    readonly sessionId: string;
    readonly turnId: string;
  };
}

export interface PermissionResolveRequest extends BridgeRequestBase {
  readonly method: 'permission/resolve';
  readonly params: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly requestId: string;
    readonly decision: BridgePermissionDecision;
  };
}

export interface SessionCloseRequest extends BridgeRequestBase {
  readonly method: 'session/close';
  readonly params: {
    readonly sessionId: string;
  };
}

export interface ShutdownRequest extends BridgeRequestBase {
  readonly method: 'shutdown';
  readonly params: Record<string, never>;
}

export type BridgeRequest =
  | InitializeRequest
  | PermissionResolveRequest
  | SessionCloseRequest
  | SessionCreateRequest
  | ShutdownRequest
  | TurnCancelRequest
  | TurnStartRequest;

export interface BridgeSuccessResponse {
  readonly type: 'response';
  readonly id: string;
  readonly ok: true;
  readonly result: unknown;
}

export interface BridgeErrorResponse {
  readonly type: 'response';
  readonly id: string;
  readonly ok: false;
  readonly error: {
    readonly code: BridgeRemoteErrorCode;
    readonly message: string;
  };
}

export type BridgeResponse = BridgeErrorResponse | BridgeSuccessResponse;

interface BridgeEventBase {
  readonly type: 'event';
  readonly sessionId: string;
  readonly turnId: string;
  /** Contiguous project-protocol sequence for this session. */
  readonly seq: number;
  /** Original DSH session-event seq when this frame projects one upstream event. */
  readonly sourceSeq?: number;
}

export interface TurnStartedEvent extends BridgeEventBase {
  readonly event: 'turn.started';
  readonly payload: Record<string, never>;
}

export interface AssistantDeltaEvent extends BridgeEventBase {
  readonly event: 'assistant.delta';
  readonly payload: { readonly text: string };
}

export interface AssistantMessageEvent extends BridgeEventBase {
  readonly event: 'assistant.message';
  readonly payload: {
    readonly text: string;
    readonly interrupted?: true;
  };
}

export interface ToolStartedEvent extends BridgeEventBase {
  readonly event: 'tool.started';
  readonly payload: {
    readonly callId: string;
    readonly toolName: string;
  };
}

export interface PermissionRequestedEvent extends BridgeEventBase {
  readonly event: 'permission.requested';
  readonly payload: {
    readonly requestId: string;
    readonly toolName: string;
    readonly callId?: string;
    readonly reason?: string;
  };
}

export interface TurnEndedEvent extends BridgeEventBase {
  readonly event: 'turn.ended';
  readonly payload:
    | { readonly outcome: 'cancelled' | 'completed' }
    | { readonly outcome: 'failed'; readonly errorCode: BridgeTurnErrorCode };
}

export interface IgnorableBridgeEvent extends BridgeEventBase {
  readonly event: string;
  readonly ignorable: true;
  readonly payload: unknown;
}

export type KnownBridgeEvent =
  | AssistantDeltaEvent
  | AssistantMessageEvent
  | PermissionRequestedEvent
  | ToolStartedEvent
  | TurnEndedEvent
  | TurnStartedEvent;

export type BridgeEvent = IgnorableBridgeEvent | KnownBridgeEvent;
export type BridgeInboundFrame = BridgeEvent | BridgeResponse;

export interface BridgeInitializeResult {
  readonly protocolVersion: string;
  readonly bridgeVersion: string;
  readonly dshVersion: string;
  readonly capabilities: readonly BridgeCapability[];
}

export interface BridgeAcceptedResult {
  readonly accepted: true;
}

export interface BridgeSessionCreatedResult {
  readonly sessionId: string;
}

export interface BridgeSessionClosedResult {
  readonly closed: true;
}

export interface BridgeTransportHandlers {
  readonly onFrame: (frame: unknown) => void;
  readonly onClose: () => void;
}

export interface BridgeTransport {
  attach(handlers: BridgeTransportHandlers): () => void;
  send(request: BridgeRequest): void;
}

export function parseBridgeInboundFrame(value: unknown): BridgeInboundFrame {
  const record = expectRecord(value, 'bridge frame');
  const type = expectString(record, 'type', 'bridge frame');
  if (type === 'response') return parseResponse(record);
  if (type === 'event') return parseEvent(record);
  throw new Error(`未知 bridge frame type：${type}`);
}

export function parseInitializeResult(value: unknown): BridgeInitializeResult {
  const record = expectRecord(value, 'initialize result');
  assertExactKeys(
    record,
    ['protocolVersion', 'bridgeVersion', 'dshVersion', 'capabilities'],
    [],
    'initialize result',
  );
  const rawCapabilities = record['capabilities'];
  if (!Array.isArray(rawCapabilities)) throw new Error('initialize capabilities 必须是数组');
  const capabilities: BridgeCapability[] = [];
  for (const rawCapability of rawCapabilities) {
    if (typeof rawCapability !== 'string' || !isBridgeCapability(rawCapability)) {
      throw new Error('initialize 返回未知 capability');
    }
    if (capabilities.includes(rawCapability)) throw new Error('initialize capability 重复');
    capabilities.push(rawCapability);
  }
  return {
    protocolVersion: expectString(record, 'protocolVersion', 'initialize result'),
    bridgeVersion: expectString(record, 'bridgeVersion', 'initialize result'),
    dshVersion: expectString(record, 'dshVersion', 'initialize result'),
    capabilities,
  };
}

export function parseAcceptedResult(value: unknown): BridgeAcceptedResult {
  const record = expectRecord(value, 'accepted result');
  assertExactKeys(record, ['accepted'], [], 'accepted result');
  if (record['accepted'] !== true) throw new Error('accepted result 必须为 true');
  return { accepted: true };
}

export function parseSessionCreatedResult(value: unknown): BridgeSessionCreatedResult {
  const record = expectRecord(value, 'session create result');
  assertExactKeys(record, ['sessionId'], [], 'session create result');
  return { sessionId: expectIdentifier(record, 'sessionId', 'session create result') };
}

export function parseSessionClosedResult(value: unknown): BridgeSessionClosedResult {
  const record = expectRecord(value, 'session close result');
  assertExactKeys(record, ['closed'], [], 'session close result');
  if (record['closed'] !== true) throw new Error('session close result 必须为 true');
  return { closed: true };
}

function parseResponse(record: Record<string, unknown>): BridgeResponse {
  const ok = record['ok'];
  if (ok === true) {
    assertExactKeys(record, ['type', 'id', 'ok', 'result'], [], 'bridge success response');
    return {
      type: 'response',
      id: expectIdentifier(record, 'id', 'bridge success response'),
      ok: true,
      result: record['result'],
    };
  }
  if (ok === false) {
    assertExactKeys(record, ['type', 'id', 'ok', 'error'], [], 'bridge error response');
    const error = expectRecord(record['error'], 'bridge response error');
    assertExactKeys(error, ['code', 'message'], [], 'bridge response error');
    const code = expectString(error, 'code', 'bridge response error');
    if (!isBridgeRemoteErrorCode(code)) throw new Error(`未知 bridge error code：${code}`);
    return {
      type: 'response',
      id: expectIdentifier(record, 'id', 'bridge error response'),
      ok: false,
      error: {
        code,
        message: expectNonEmptyString(error, 'message', 'bridge response error'),
      },
    };
  }
  throw new Error('bridge response ok 必须是 boolean');
}

function parseEvent(record: Record<string, unknown>): BridgeEvent {
  const event = expectNonEmptyString(record, 'event', 'bridge event');
  const common = parseEventCommon(record);
  switch (event) {
    case 'turn.started': {
      assertKnownEventKeys(record, 'turn.started');
      const payload = expectRecord(record['payload'], 'turn.started payload');
      assertExactKeys(payload, [], [], 'turn.started payload');
      return { ...common, event, payload: {} };
    }
    case 'assistant.delta': {
      assertKnownEventKeys(record, 'assistant.delta');
      const payload = expectRecord(record['payload'], 'assistant.delta payload');
      assertExactKeys(payload, ['text'], [], 'assistant.delta payload');
      return {
        ...common,
        event,
        payload: { text: expectNonEmptyString(payload, 'text', 'assistant.delta payload') },
      };
    }
    case 'assistant.message': {
      assertKnownEventKeys(record, 'assistant.message');
      const payload = expectRecord(record['payload'], 'assistant.message payload');
      assertExactKeys(payload, ['text'], ['interrupted'], 'assistant.message payload');
      const interrupted = payload['interrupted'];
      if (interrupted !== undefined && interrupted !== true) {
        throw new Error('assistant.message interrupted 只能为 true');
      }
      return {
        ...common,
        event,
        payload: {
          text: expectString(payload, 'text', 'assistant.message payload'),
          ...(interrupted === true ? { interrupted: true as const } : {}),
        },
      };
    }
    case 'tool.started': {
      assertKnownEventKeys(record, 'tool.started');
      const payload = expectRecord(record['payload'], 'tool.started payload');
      assertExactKeys(payload, ['callId', 'toolName'], [], 'tool.started payload');
      return {
        ...common,
        event,
        payload: {
          callId: expectIdentifier(payload, 'callId', 'tool.started payload'),
          toolName: expectNonEmptyString(payload, 'toolName', 'tool.started payload'),
        },
      };
    }
    case 'permission.requested': {
      assertKnownEventKeys(record, 'permission.requested');
      const payload = expectRecord(record['payload'], 'permission.requested payload');
      assertExactKeys(
        payload,
        ['requestId', 'toolName'],
        ['callId', 'reason'],
        'permission.requested payload',
      );
      return {
        ...common,
        event,
        payload: {
          requestId: expectIdentifier(payload, 'requestId', 'permission.requested payload'),
          toolName: expectNonEmptyString(payload, 'toolName', 'permission.requested payload'),
          ...readOptionalIdentifier(payload, 'callId', 'permission.requested payload'),
          ...readOptionalNonEmptyString(payload, 'reason', 'permission.requested payload'),
        },
      };
    }
    case 'turn.ended': {
      assertKnownEventKeys(record, 'turn.ended');
      const payload = expectRecord(record['payload'], 'turn.ended payload');
      const outcome = expectString(payload, 'outcome', 'turn.ended payload');
      if (outcome === 'completed' || outcome === 'cancelled') {
        assertExactKeys(payload, ['outcome'], [], 'turn.ended payload');
        return { ...common, event, payload: { outcome } };
      }
      if (outcome === 'failed') {
        assertExactKeys(payload, ['outcome', 'errorCode'], [], 'turn.ended payload');
        const errorCode = expectString(payload, 'errorCode', 'turn.ended payload');
        if (!isBridgeTurnErrorCode(errorCode)) {
          throw new Error(`未知 turn error code：${errorCode}`);
        }
        return { ...common, event, payload: { outcome, errorCode } };
      }
      throw new Error(`未知 turn outcome：${outcome}`);
    }
    default: {
      assertExactKeys(
        record,
        ['type', 'event', 'sessionId', 'turnId', 'seq', 'payload', 'ignorable'],
        ['sourceSeq'],
        'ignorable bridge event',
      );
      if (record['ignorable'] !== true) throw new Error(`未知 required bridge event：${event}`);
      return { ...common, event, ignorable: true, payload: record['payload'] };
    }
  }
}

function parseEventCommon(record: Record<string, unknown>): BridgeEventBase {
  const sourceSeq = record['sourceSeq'];
  if (sourceSeq !== undefined && !isSequence(sourceSeq)) {
    throw new Error('bridge event sourceSeq 必须是非负安全整数');
  }
  return {
    type: 'event',
    sessionId: expectIdentifier(record, 'sessionId', 'bridge event'),
    turnId: expectIdentifier(record, 'turnId', 'bridge event'),
    seq: expectSequence(record, 'seq', 'bridge event'),
    ...(sourceSeq === undefined ? {} : { sourceSeq }),
  };
}

function assertKnownEventKeys(record: Record<string, unknown>, label: string): void {
  assertExactKeys(
    record,
    ['type', 'event', 'sessionId', 'turnId', 'seq', 'payload'],
    ['sourceSeq'],
    `${label} event`,
  );
}

function assertExactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`${label} 缺少字段：${key}`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} 包含未知字段：${key}`);
  }
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    throw new Error(`${label} 必须是普通对象`);
  }
  return value;
}

function expectString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`${label}.${key} 必须是字符串`);
  return value;
}

function expectNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = expectString(record, key, label);
  if (value.length === 0) throw new Error(`${label}.${key} 不能为空`);
  return value;
}

function expectIdentifier(record: Record<string, unknown>, key: string, label: string): string {
  const value = expectNonEmptyString(record, key, label);
  if (value.trim() !== value) throw new Error(`${label}.${key} 不能包含首尾空白`);
  return value;
}

function expectSequence(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (!isSequence(value)) throw new Error(`${label}.${key} 必须是非负安全整数`);
  return value;
}

function readOptionalIdentifier(
  record: Record<string, unknown>,
  key: string,
  label: string,
): { readonly callId?: string } {
  if (record[key] === undefined) return {};
  return { callId: expectIdentifier(record, key, label) };
}

function readOptionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): { readonly reason?: string } {
  if (record[key] === undefined) return {};
  return { reason: expectNonEmptyString(record, key, label) };
}

function isSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBridgeCapability(value: string): value is BridgeCapability {
  return BRIDGE_CAPABILITIES.some((capability) => capability === value);
}

function isBridgeRemoteErrorCode(value: string): value is BridgeRemoteErrorCode {
  return [
    'capability_missing',
    'internal_error',
    'invalid_request',
    'invalid_state',
    'permission_expired',
    'permission_not_found',
    'protocol_mismatch',
    'session_busy',
    'session_not_found',
    'turn_not_found',
    'unsupported_dsh',
  ].includes(value);
}

function isBridgeTurnErrorCode(value: string): value is BridgeTurnErrorCode {
  return [
    'context_invalid',
    'network_error',
    'permission_rejected',
    'runtime_error',
    'runtime_terminated',
  ].includes(value);
}
