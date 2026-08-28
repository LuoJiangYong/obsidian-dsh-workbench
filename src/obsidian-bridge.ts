import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  BRIDGE_CAPABILITIES,
  BRIDGE_PROTOCOL_VERSION,
  TARGET_BRIDGE_DSH_VERSION,
  TARGET_BRIDGE_VERSION,
  type BridgeRemoteErrorCode,
  type BridgeRequest,
  type BridgeSessionMode,
  type BridgeTurnErrorCode,
} from './bridge-protocol';

export const name = 'obsidian-bridge';
export const inject = ['agents', 'agentDefaultModel', 'tools'] as const;
export const MAX_BRIDGE_FRAME_BYTES = 1024 * 1024;

const CHAT_BOUNDARY_SECTION = 'obsidian:chat-boundary';
const CHAT_BOUNDARY_TEXT = [
  '你正在 Obsidian 的只读对话模式中，此模式没有任何可用工具。',
  '不得调用或假装调用 DSH 工具；不得输出 DSML 或其他工具调用标记。',
  '用户消息是 version 1 JSON 信封：task 是问题，contexts[].content 已包含用户明确选择的只读资料。',
  '直接依据 contexts[].content 回答 task；资料不足时明确说明，不得尝试按 path 读取文件。',
].join('\n');
const TASK_BOUNDARY_SECTION = 'obsidian:task-boundary';
const TASK_ALLOWED_TOOLS = Object.freeze([
  'edit',
  'glob',
  'grep',
  'read',
  'read_image',
  'write',
] as const);
const TASK_BOUNDARY_TEXT = [
  '你正在 Obsidian 的任务执行模式中，只能使用 read、read_image、glob、grep、write、edit。',
  '所有文件路径必须位于当前会话工作区；不得调用 Shell、PowerShell、网络、Skill、子代理或其他工具。',
  '不得请求 danger-full-access 或任何工作区外权限升级；资料不足时明确说明。',
].join('\n');

type ApprovalOutcome = 'allowed-once' | 'cancelled' | 'rejected' | 'unavailable';

export interface DshMessage {
  readonly id: string;
  readonly role: 'user';
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }];
  readonly source: { readonly kind: 'user' };
}

export interface DshSession {
  readonly id: string;
}

export interface DshAgent {
  readonly session: DshSession;
  cancel(cause: { readonly kind: 'user' }): void;
  followup(message: DshMessage): void;
}

export interface DshAgentHandle {
  readonly agent: DshAgent;
  dispose(): Promise<void>;
}

export interface DshModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

export interface DshScopedContext {
  readonly tools: {
    guard(guard: (execution: DshToolExecution) => string | undefined): () => void;
    restrict(filter: { readonly allow?: readonly string[]; readonly deny?: readonly string[] }): () => void;
  };
  on(
    event: 'system-prompt/assemble',
    listener: (
      assembly: unknown,
      context: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>,
  ): () => void;
  on(
    event: 'agent/request',
    listener: (
      payload: unknown,
      next: () => Promise<Record<string, unknown>>,
    ) => Promise<Record<string, unknown>>,
  ): () => void;
}

export interface DshToolExecution {
  readonly arguments: unknown;
  readonly name: string;
}

export interface DshContext {
  readonly agents: {
    create(options: {
      readonly sessionId: string;
      readonly meta?: { readonly cwd?: string };
      readonly agentOptions: { readonly provider: string; readonly model: string };
      readonly setup: (agentContext: DshScopedContext) => void;
    }): Promise<DshAgentHandle>;
  };
  readonly agentDefaultModel: {
    currentSelection(): DshModelSelection;
  };
  effect(effect: () => () => void | Promise<void>, label?: string): unknown;
  get(service: 'appExit'): ((code: number) => void) | undefined;
  get(service: 'loader'): { await(): Promise<void> } | undefined;
  on(
    event: 'session/event',
    listener: (session: DshSession, event: unknown) => void,
  ): () => void;
  on(
    event: 'approval/request',
    listener: (
      request: DshApprovalRequest,
      next: () => Promise<ApprovalOutcome>,
    ) => Promise<ApprovalOutcome>,
  ): () => void;
}

export interface DshApprovalRequest {
  readonly agent: DshAgent;
  readonly toolName: string;
  readonly callId?: string;
  readonly reason?: string;
  readonly signal?: AbortSignal;
}

export interface BridgeWire {
  write(frame: unknown): Promise<void>;
  close(): void;
}

interface PendingApproval {
  readonly requestId: string;
  readonly turnId: string;
  readonly settle: (outcome: ApprovalOutcome) => void;
  readonly detachAbort: () => void;
}

interface ActiveTurn {
  readonly turnId: string;
  accepting: boolean;
  cancelRequested: boolean;
  upstreamTurn: number | undefined;
  readonly buffered: ProjectedEvent[];
  pendingApproval: PendingApproval | undefined;
}

interface SessionRecord {
  readonly sessionId: string;
  readonly mode: BridgeSessionMode;
  readonly handle: DshAgentHandle;
  nextSeq: number;
  activeTurn: ActiveTurn | undefined;
}

interface ProjectedEvent {
  readonly event:
    | 'assistant.delta'
    | 'assistant.message'
    | 'permission.requested'
    | 'tool.started'
    | 'turn.ended'
    | 'turn.started';
  readonly payload: unknown;
  readonly sourceSeq?: number;
}

class BridgeRequestError extends Error {
  constructor(
    readonly code: BridgeRemoteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class ObsidianBridgeServer {
  private initialized = false;
  private closed = false;
  private shuttingDown = false;
  private readonly sessions = new Map<string, SessionRecord>();
  private outputTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly context: DshContext,
    private readonly wire: BridgeWire,
  ) {
    context.on('session/event', (session, event) => {
      this.onSessionEvent(session, event);
    });
    context.on('approval/request', async (request, next) => {
      const record = this.findOwnedSession(request.agent);
      if (!record) return await next();
      return await this.onApprovalRequest(record, request);
    });
  }

  async receive(value: unknown): Promise<void> {
    if (this.closed) return;
    let request: BridgeRequest;
    try {
      request = parseBridgeRequest(value);
    } catch (error) {
      const id = readResponseId(value);
      if (!id) {
        await this.failClosed();
        return;
      }
      await this.writeError(
        id,
        'invalid_request',
        error instanceof Error ? error.message : 'bridge 请求无效',
      );
      return;
    }

    try {
      await this.dispatch(request);
    } catch (error) {
      const normalized = normalizeRequestError(error);
      await this.writeError(request.id, normalized.code, normalized.message);
    }
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const records = [...this.sessions.values()];
    this.sessions.clear();
    for (const record of records) {
      settlePendingApproval(record, 'cancelled');
      await record.handle.dispose();
    }
    await this.outputTail.catch(() => undefined);
    this.wire.close();
  }

  private async dispatch(request: BridgeRequest): Promise<void> {
    if (request.method !== 'initialize' && !this.initialized) {
      throw new BridgeRequestError('invalid_state', 'initialize 必须是连接的第一个请求');
    }
    if (this.shuttingDown) {
      throw new BridgeRequestError('invalid_state', 'bridge 正在关闭');
    }

    switch (request.method) {
      case 'initialize':
        await this.initialize(request);
        return;
      case 'session/create':
        await this.createSession(request);
        return;
      case 'turn/start':
        await this.startTurn(request);
        return;
      case 'turn/cancel':
        await this.cancelTurn(request);
        return;
      case 'permission/resolve':
        await this.resolvePermission(request);
        return;
      case 'session/close':
        await this.closeSession(request);
        return;
      case 'shutdown':
        await this.shutdown(request);
    }
  }

  private async initialize(request: Extract<BridgeRequest, { method: 'initialize' }>): Promise<void> {
    if (this.initialized) throw new BridgeRequestError('invalid_state', 'initialize 不能重复');
    if (request.params.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      throw new BridgeRequestError('protocol_mismatch', 'bridge protocol version 不匹配');
    }
    const missing = request.params.requiredCapabilities.filter(
      capability => !BRIDGE_CAPABILITIES.includes(capability),
    );
    if (missing.length > 0) {
      throw new BridgeRequestError('capability_missing', `缺少 required capability：${missing.join(', ')}`);
    }
    this.initialized = true;
    await this.writeSuccess(request.id, {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      bridgeVersion: TARGET_BRIDGE_VERSION,
      dshVersion: TARGET_BRIDGE_DSH_VERSION,
      capabilities: BRIDGE_CAPABILITIES,
    });
  }

  private async createSession(
    request: Extract<BridgeRequest, { method: 'session/create' }>,
  ): Promise<void> {
    const { sessionId, mode } = request.params;
    if (this.sessions.has(sessionId)) {
      throw new BridgeRequestError('session_busy', 'sessionId 已存在');
    }
    await this.context.get('loader')?.await();
    const selection = this.context.agentDefaultModel.currentSelection();
    const handle = await this.context.agents.create({
      sessionId,
      meta: { cwd: process.cwd() },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: (agentContext) => {
        installModelSelection(agentContext, selection);
        if (mode === 'chat') installChatToolBoundary(agentContext);
        else installTaskToolBoundary(agentContext, process.cwd());
      },
    });
    if (this.sessions.has(sessionId)) {
      await handle.dispose();
      throw new BridgeRequestError('session_busy', 'sessionId 在创建期间被占用');
    }
    this.sessions.set(sessionId, {
      sessionId,
      mode,
      handle,
      nextSeq: 0,
      activeTurn: undefined,
    });
    await this.writeSuccess(request.id, { sessionId });
  }

  private async startTurn(request: Extract<BridgeRequest, { method: 'turn/start' }>): Promise<void> {
    const record = this.requireSession(request.params.sessionId);
    if (record.activeTurn) throw new BridgeRequestError('session_busy', 'session 已有活动 turn');
    const active: ActiveTurn = {
      turnId: request.params.turnId,
      accepting: true,
      cancelRequested: false,
      upstreamTurn: undefined,
      buffered: [],
      pendingApproval: undefined,
    };
    record.activeTurn = active;
    try {
      record.handle.agent.followup(createUserMessage(request.params.text));
    } catch (error) {
      record.activeTurn = undefined;
      throw new BridgeRequestError(
        'internal_error',
        error instanceof Error ? error.message : 'DSH 拒绝 turn',
      );
    }
    await this.writeSuccess(request.id, { accepted: true });
    active.accepting = false;
    for (const event of active.buffered.splice(0)) this.emitProjected(record, active, event);
  }

  private async cancelTurn(request: Extract<BridgeRequest, { method: 'turn/cancel' }>): Promise<void> {
    const record = this.requireSession(request.params.sessionId);
    const active = requireActiveTurn(record, request.params.turnId);
    if (active.cancelRequested) throw new BridgeRequestError('invalid_state', 'turn 已请求取消');
    active.cancelRequested = true;
    await this.writeSuccess(request.id, { accepted: true });
    settlePendingApproval(record, 'cancelled');
    record.handle.agent.cancel({ kind: 'user' });
  }

  private async resolvePermission(
    request: Extract<BridgeRequest, { method: 'permission/resolve' }>,
  ): Promise<void> {
    const record = this.requireSession(request.params.sessionId);
    const active = requireActiveTurn(record, request.params.turnId);
    const pending = active.pendingApproval;
    if (!pending || pending.requestId !== request.params.requestId) {
      throw new BridgeRequestError('permission_not_found', 'permission request 不存在或已失效');
    }
    active.pendingApproval = undefined;
    pending.detachAbort();
    await this.writeSuccess(request.id, { accepted: true });
    pending.settle(request.params.decision === 'allow-once' ? 'allowed-once' : 'rejected');
  }

  private async closeSession(request: Extract<BridgeRequest, { method: 'session/close' }>): Promise<void> {
    const record = this.requireSession(request.params.sessionId);
    if (record.activeTurn) throw new BridgeRequestError('session_busy', '活动 turn 结束前不能关闭 session');
    this.sessions.delete(record.sessionId);
    await record.handle.dispose();
    await this.writeSuccess(request.id, { closed: true });
  }

  private async shutdown(request: Extract<BridgeRequest, { method: 'shutdown' }>): Promise<void> {
    if ([...this.sessions.values()].some(record => record.activeTurn)) {
      throw new BridgeRequestError('session_busy', '存在活动 turn 时不能正常 shutdown');
    }
    const exit = this.context.get('appExit');
    if (!exit) throw new BridgeRequestError('internal_error', 'DSH launcher 未提供 appExit');
    this.shuttingDown = true;
    const records = [...this.sessions.values()];
    this.sessions.clear();
    for (const record of records) await record.handle.dispose();
    await this.writeSuccess(request.id, { accepted: true });
    this.closed = true;
    this.wire.close();
    exit(0);
  }

  private onSessionEvent(session: DshSession, value: unknown): void {
    const record = this.sessions.get(session.id);
    const active = record?.activeTurn;
    if (!record || !active) return;
    const event = asRecord(value);
    if (!event) return;
    const type = event['type'];
    const seq = readSafeInteger(event['seq']);
    const data = asRecord(event['data']);
    if (typeof type !== 'string' || seq === undefined || !data) return;

    if (type === 'turn/start') {
      const upstreamTurn = readSafeInteger(data['turn']);
      if (upstreamTurn === undefined || active.upstreamTurn !== undefined) return;
      active.upstreamTurn = upstreamTurn;
      this.project(record, active, { event: 'turn.started', payload: {}, sourceSeq: seq });
      return;
    }
    if (active.upstreamTurn === undefined || data['turn'] !== active.upstreamTurn) return;

    if (type === 'assistant/chunk') {
      const chunk = asRecord(data['chunk']);
      if (chunk?.['type'] === 'text-delta' && typeof chunk['text'] === 'string' && chunk['text']) {
        this.project(record, active, {
          event: 'assistant.delta',
          payload: { text: chunk['text'] },
          sourceSeq: seq,
        });
      }
      return;
    }
    if (type === 'assistant/message') {
      const message = asRecord(data['message']);
      const content = message?.['content'];
      if (!Array.isArray(content)) return;
      const text = content.flatMap((block) => {
        const item = asRecord(block);
        return item?.['type'] === 'text' && typeof item['text'] === 'string' ? [item['text']] : [];
      }).join('');
      this.project(record, active, {
        event: 'assistant.message',
        payload: {
          text,
          ...(data['interrupted'] === true ? { interrupted: true as const } : {}),
        },
        sourceSeq: seq,
      });
      return;
    }
    if (type === 'tool/call') {
      if (typeof data['callId'] !== 'string' || typeof data['name'] !== 'string') return;
      this.project(record, active, {
        event: 'tool.started',
        payload: { callId: data['callId'], toolName: data['name'] },
        sourceSeq: seq,
      });
      return;
    }
    if (type === 'turn/end') {
      const reason = asRecord(data['reason']);
      if (!reason || typeof reason['kind'] !== 'string') return;
      const payload = mapTurnEnd(reason, active.cancelRequested);
      settlePendingApproval(record, 'cancelled');
      this.project(record, active, { event: 'turn.ended', payload, sourceSeq: seq });
      record.activeTurn = undefined;
    }
  }

  private async onApprovalRequest(
    record: SessionRecord,
    request: DshApprovalRequest,
  ): Promise<ApprovalOutcome> {
    const active = record.activeTurn;
    if (!active || active.pendingApproval) return 'rejected';
    const requestId = `permission-${randomUUID()}`;
    return await new Promise<ApprovalOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: ApprovalOutcome): void => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };
      const onAbort = (): void => {
        if (active.pendingApproval?.requestId === requestId) active.pendingApproval = undefined;
        settle('cancelled');
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });
      active.pendingApproval = {
        requestId,
        turnId: active.turnId,
        settle,
        detachAbort: () => request.signal?.removeEventListener('abort', onAbort),
      };
      this.project(record, active, {
        event: 'permission.requested',
        payload: {
          requestId,
          toolName: request.toolName,
          ...(request.callId === undefined ? {} : { callId: request.callId }),
          ...(request.reason === undefined ? {} : { reason: request.reason }),
        },
      });
    });
  }

  private project(record: SessionRecord, active: ActiveTurn, event: ProjectedEvent): void {
    if (active.accepting) {
      active.buffered.push(event);
      return;
    }
    this.emitProjected(record, active, event);
  }

  private emitProjected(record: SessionRecord, active: ActiveTurn, event: ProjectedEvent): void {
    const frame = {
      type: 'event',
      event: event.event,
      sessionId: record.sessionId,
      turnId: active.turnId,
      seq: record.nextSeq,
      ...(event.sourceSeq === undefined ? {} : { sourceSeq: event.sourceSeq }),
      payload: event.payload,
    };
    record.nextSeq += 1;
    void this.queueWrite(frame).catch(() => this.dispose());
  }

  private findOwnedSession(agent: DshAgent): SessionRecord | undefined {
    return [...this.sessions.values()].find(record => record.handle.agent === agent);
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) throw new BridgeRequestError('session_not_found', 'session 不存在');
    return record;
  }

  private async writeSuccess(id: string, result: unknown): Promise<void> {
    await this.queueWrite({ type: 'response', id, ok: true, result });
  }

  private async writeError(id: string, code: BridgeRemoteErrorCode, message: string): Promise<void> {
    await this.queueWrite({ type: 'response', id, ok: false, error: { code, message } });
  }

  private queueWrite(frame: unknown): Promise<void> {
    this.outputTail = this.outputTail.then(() => this.wire.write(frame));
    return this.outputTail;
  }

  private async failClosed(): Promise<void> {
    await this.dispose();
    this.context.get('appExit')?.(1);
  }
}

export interface BridgeStdioInput {
  destroy(): void;
  setEncoding(encoding: NodeJS.BufferEncoding): void;
  on(event: 'data', listener: (chunk: string) => void): void;
  on(event: 'end' | 'error', listener: () => void): void;
  removeAllListeners(): void;
}

export interface BridgeStdioOutput {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
}

export class BridgeStdioHost implements BridgeWire {
  private buffer = '';
  private closed = false;
  private inputTail: Promise<void> = Promise.resolve();
  private server: ObsidianBridgeServer | undefined;

  constructor(
    private readonly input: BridgeStdioInput,
    private readonly output: BridgeStdioOutput,
  ) {}

  bind(server: ObsidianBridgeServer): void {
    if (this.server) throw new Error('stdio bridge 已绑定');
    this.server = server;
    this.input.setEncoding('utf8');
    this.input.on('data', chunk => this.acceptChunk(chunk));
    this.input.on('end', () => { void server.dispose(); });
    this.input.on('error', () => { void server.dispose(); });
  }

  write(frame: unknown): Promise<void> {
    const line = `${JSON.stringify(frame)}\n`;
    if (Buffer.byteLength(line, 'utf8') > MAX_BRIDGE_FRAME_BYTES) {
      return Promise.reject(new Error('bridge 输出 frame 超过 1 MiB'));
    }
    return new Promise<void>((resolve, reject) => {
      this.output.write(line, error => error ? reject(error) : resolve());
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.input.removeAllListeners();
    this.input.destroy();
  }

  private acceptChunk(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const wireLine = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(`${wireLine}\n`, 'utf8') > MAX_BRIDGE_FRAME_BYTES) {
        void this.server?.dispose();
        return;
      }
      const rawLine = wireLine.replace(/\r$/u, '');
      this.inputTail = this.inputTail.then(async () => {
        if (!rawLine) {
          await this.server?.dispose();
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(rawLine) as unknown;
        } catch {
          await this.server?.dispose();
          return;
        }
        await this.server?.receive(value);
      });
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_BRIDGE_FRAME_BYTES) {
      void this.server?.dispose();
    }
  }
}

export function apply(context: DshContext): void {
  const host = new BridgeStdioHost(process.stdin, process.stdout);
  const server = new ObsidianBridgeServer(context, host);
  host.bind(server);
  context.effect(() => () => server.dispose(), 'obsidian-bridge.stdio');
}

function installModelSelection(
  context: DshScopedContext,
  selection: DshModelSelection,
): void {
  let assembled: DshModelSelection | undefined;
  context.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const result = await next();
    assembled = selection;
    const record = asRecord(result);
    if (!record) return result;
    const variables = asRecord(record['variables']) ?? {};
    return {
      ...record,
      variables: { ...variables, provider: selection.provider, model: selection.model },
    };
  });
  context.on('agent/request', async (_payload, next) => {
    const resolved = await next();
    if (!assembled) return resolved;
    const { reasoningEffort: _inherited, ...withoutInherited } = resolved;
    return {
      ...withoutInherited,
      provider: assembled.provider,
      model: assembled.model,
      ...(assembled.reasoningEffort === undefined ? {} : { reasoningEffort: assembled.reasoningEffort }),
    };
  });
}

function installChatToolBoundary(context: DshScopedContext): void {
  context.tools.restrict({ allow: [] });
  context.tools.guard(() => 'Obsidian 对话模式不允许调用 DSH 工具。');
  context.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const resolved = await next();
    const record = asRecord(resolved);
    if (!record) return resolved;
    const sectionsSource = record['sections'];
    const sections: unknown[] = Array.isArray(sectionsSource)
      ? (sectionsSource as unknown[]).filter(
          (section) => asRecord(section)?.['name'] !== CHAT_BOUNDARY_SECTION,
        )
      : [];
    return {
      ...record,
      sections: [...sections, { name: CHAT_BOUNDARY_SECTION, text: CHAT_BOUNDARY_TEXT }],
      tools: [],
    };
  });
}

function installTaskToolBoundary(context: DshScopedContext, workspaceRoot: string): void {
  context.tools.restrict({ allow: TASK_ALLOWED_TOOLS });
  context.tools.guard((execution) => taskToolGuardReason(execution, workspaceRoot));
  context.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const resolved = await next();
    const record = asRecord(resolved);
    if (!record) return resolved;
    const sectionsSource = record['sections'];
    const sections: unknown[] = Array.isArray(sectionsSource)
      ? (sectionsSource as unknown[]).filter(
          (section) => asRecord(section)?.['name'] !== TASK_BOUNDARY_SECTION,
        )
      : [];
    return {
      ...record,
      sections: [...sections, { name: TASK_BOUNDARY_SECTION, text: TASK_BOUNDARY_TEXT }],
    };
  });
}

function taskToolGuardReason(
  execution: DshToolExecution,
  workspaceRoot: string,
): string | undefined {
  if (!TASK_ALLOWED_TOOLS.includes(execution.name as typeof TASK_ALLOWED_TOOLS[number])) {
    return 'Obsidian 任务执行模式只允许工作区文件工具。';
  }
  const args = asRecord(execution.arguments);
  if (!args) return '工具参数必须是对象。';
  if ('sandbox_permissions' in args || 'justification' in args) {
    return 'Obsidian 任务执行模式不允许权限升级。';
  }

  const pathValue = execution.name === 'glob' || execution.name === 'grep'
    ? args['path'] ?? '.'
    : args['file_path'];
  if (typeof pathValue !== 'string' || pathValue.trim().length === 0) {
    return '工具必须提供有效的工作区路径。';
  }
  if (execution.name === 'glob') {
    const pattern = args['pattern'];
    if (typeof pattern !== 'string' || hasParentTraversal(pattern) || path.isAbsolute(pattern)) {
      return 'glob pattern 不得越过工作区。';
    }
  }
  return isPathInsideWorkspace(pathValue, workspaceRoot)
    ? undefined
    : '工具路径不得越过当前工作区。';
}

function isPathInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
  if (candidate.includes('\0')) return false;
  const canonicalRoot = realpathSync(workspaceRoot);
  const resolved = path.resolve(workspaceRoot, candidate);
  if (!isContainedPath(canonicalRoot, resolved)) return false;

  let existing = resolved;
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return false;
    existing = parent;
  }
  return isContainedPath(canonicalRoot, realpathSync(existing));
}

function isContainedPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function hasParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/u).includes('..');
}

function createUserMessage(text: string): DshMessage {
  return deepFreeze({
    id: randomUUID(),
    role: 'user' as const,
    content: [{ type: 'text' as const, text }] as const,
    source: { kind: 'user' as const },
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function settlePendingApproval(record: SessionRecord, outcome: ApprovalOutcome): void {
  const pending = record.activeTurn?.pendingApproval;
  if (!pending) return;
  record.activeTurn!.pendingApproval = undefined;
  pending.detachAbort();
  pending.settle(outcome);
}

function requireActiveTurn(record: SessionRecord, turnId: string): ActiveTurn {
  const active = record.activeTurn;
  if (!active || active.turnId !== turnId) {
    throw new BridgeRequestError('turn_not_found', 'turn 不是当前活动 turn');
  }
  return active;
}

function mapTurnEnd(
  reason: Record<string, unknown>,
  cancelRequested: boolean,
): { readonly outcome: 'cancelled' | 'completed' }
  | { readonly outcome: 'failed'; readonly errorCode: BridgeTurnErrorCode } {
  if (reason['kind'] === 'completed') return { outcome: 'completed' };
  const abortReason = asRecord(reason['reason']);
  if (cancelRequested && reason['kind'] === 'aborted' && abortReason?.['kind'] === 'user') {
    return { outcome: 'cancelled' };
  }
  return { outcome: 'failed', errorCode: 'runtime_error' };
}

function normalizeRequestError(error: unknown): BridgeRequestError {
  if (error instanceof BridgeRequestError) return error;
  return new BridgeRequestError(
    'internal_error',
    error instanceof Error ? error.message : 'bridge 内部错误',
  );
}

function parseBridgeRequest(value: unknown): BridgeRequest {
  const record = requireRecord(value, 'bridge request');
  requireExactKeys(record, ['type', 'id', 'method', 'params'], 'bridge request');
  if (record['type'] !== 'request') throw new Error('bridge request type 必须是 request');
  const id = requireIdentifier(record['id'], 'request id');
  const method = requireString(record['method'], 'request method');
  const params = requireRecord(record['params'], 'request params');

  switch (method) {
    case 'initialize': {
      requireExactKeys(params, ['protocolVersion', 'client', 'requiredCapabilities'], 'initialize params');
      const client = requireRecord(params['client'], 'initialize client');
      requireExactKeys(client, ['name', 'version'], 'initialize client');
      if (client['name'] !== 'deepseek-harness-workbench') throw new Error('initialize client name 无效');
      const capabilities = params['requiredCapabilities'];
      if (!Array.isArray(capabilities)
        || capabilities.some(capability => typeof capability !== 'string'
          || !BRIDGE_CAPABILITIES.includes(capability as typeof BRIDGE_CAPABILITIES[number]))) {
        throw new Error('requiredCapabilities 包含未知值');
      }
      return {
        type: 'request',
        id,
        method,
        params: {
          protocolVersion: requireString(params['protocolVersion'], 'protocolVersion'),
          client: {
            name: 'deepseek-harness-workbench',
            version: requireString(client['version'], 'client version'),
          },
          requiredCapabilities: capabilities as typeof BRIDGE_CAPABILITIES[number][],
        },
      };
    }
    case 'session/create': {
      requireExactKeys(params, ['sessionId', 'mode'], 'session/create params');
      const mode = params['mode'];
      if (mode !== 'chat' && mode !== 'task') throw new Error('session mode 无效');
      return { type: 'request', id, method, params: { sessionId: requireIdentifier(params['sessionId'], 'sessionId'), mode } };
    }
    case 'turn/start':
      requireExactKeys(params, ['sessionId', 'turnId', 'text'], 'turn/start params');
      return {
        type: 'request', id, method,
        params: {
          sessionId: requireIdentifier(params['sessionId'], 'sessionId'),
          turnId: requireIdentifier(params['turnId'], 'turnId'),
          text: requireNonEmptyString(params['text'], 'turn text'),
        },
      };
    case 'turn/cancel':
      requireExactKeys(params, ['sessionId', 'turnId'], 'turn/cancel params');
      return {
        type: 'request', id, method,
        params: {
          sessionId: requireIdentifier(params['sessionId'], 'sessionId'),
          turnId: requireIdentifier(params['turnId'], 'turnId'),
        },
      };
    case 'permission/resolve': {
      requireExactKeys(params, ['sessionId', 'turnId', 'requestId', 'decision'], 'permission/resolve params');
      const decision = params['decision'];
      if (decision !== 'allow-once' && decision !== 'reject') throw new Error('permission decision 无效');
      return {
        type: 'request', id, method,
        params: {
          sessionId: requireIdentifier(params['sessionId'], 'sessionId'),
          turnId: requireIdentifier(params['turnId'], 'turnId'),
          requestId: requireIdentifier(params['requestId'], 'requestId'),
          decision,
        },
      };
    }
    case 'session/close':
      requireExactKeys(params, ['sessionId'], 'session/close params');
      return { type: 'request', id, method, params: { sessionId: requireIdentifier(params['sessionId'], 'sessionId') } };
    case 'shutdown':
      requireExactKeys(params, [], 'shutdown params');
      return { type: 'request', id, method, params: {} };
    default:
      throw new Error(`未知 bridge method：${method}`);
  }
}

function readResponseId(value: unknown): string | undefined {
  const record = asRecord(value);
  const id = record?.['id'];
  return typeof id === 'string' && id.length > 0 && id.trim() === id ? id : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw new Error(`${label} 必须是对象`);
  return record;
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} 字段集合无效`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`);
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!text) throw new Error(`${label} 不能为空`);
  return text;
}

function requireIdentifier(value: unknown, label: string): string {
  const identifier = requireNonEmptyString(value, label);
  if (identifier.trim() !== identifier) throw new Error(`${label} 不能包含首尾空白`);
  return identifier;
}

function readSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
