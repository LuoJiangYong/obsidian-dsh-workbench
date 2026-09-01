import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const name = 'obsidian-dsh-workbench-r1-control-probe';
export const inject = [
  'agents',
  'approval',
  'attachments',
  'sessionController',
  'sessions',
];

const EXPECTED_SESSION_ID = 'obsidian-dsh-workbench-r1-alpha2';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export function apply(context) {
  queueMicrotask(() => {
    void execute(context);
  });
}

async function execute(context) {
  const reportPath = process.env.DSH_R1_REPORT_PATH;
  const phase = process.env.DSH_R1_PHASE;
  try {
    if (!reportPath || !path.isAbsolute(reportPath)) {
      throw new Error('DSH_R1_REPORT_PATH must be absolute');
    }
    if (phase !== 'seed' && phase !== 'restore') {
      throw new Error('DSH_R1_PHASE must be seed or restore');
    }
    const report = phase === 'seed'
      ? await seed(context)
      : await restore(context);
    await writeFile(reportPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 });
    exit(context, 0);
  } catch (error) {
    if (reportPath && path.isAbsolute(reportPath)) {
      await writeFile(reportPath, `${JSON.stringify({
        phase,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })}\n`, { encoding: 'utf8', mode: 0o600 }).catch(() => undefined);
    }
    exit(context, 1);
  }
}

async function seed(context) {
  const signal = new AbortController().signal;
  let approvalRequest;
  const detachApproval = context.on('approval/request', (request, next) => {
    if (request.agent.id !== EXPECTED_SESSION_ID) return next();
    approvalRequest = {
      callId: request.callId,
      reason: request.reason,
      toolName: request.toolName,
    };
    return Promise.resolve('allowed-once');
  });
  try {
    const created = await context.sessionController.create({
      cwd: process.cwd(),
      sessionId: EXPECTED_SESSION_ID,
    });
    const agent = requireAgent(context);
    const renamed = await context.sessionController.rename({
      sessionId: EXPECTED_SESSION_ID,
      title: 'R1 alpha2 candidate',
    });
    const attachment = await context.attachments.saveImage({
      data: PNG_1X1,
      mediaType: 'image/png',
      name: 'r1-alpha2.png',
    });
    agent.session.append('turn/start', { turn: 1 });
    agent.session.append('user/message', {
      id: randomUUID(),
      role: 'user',
      content: [
        { type: 'text', text: 'R1 alpha2 public control probe' },
        { type: 'image', attachment },
      ],
      source: { kind: 'user' },
    }, { surfaceOp: 'append' });
    const approvalOutcome = await context.approval.request({
      agent,
      callId: 'r1-alpha2-call',
      reason: 'R1 candidate one-shot permission probe',
      toolName: 'read',
    });
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    await context.sessions.flush(agent.session);

    const roundTrip = await context.sessionController.attachment({
      attachmentId: attachment.attachmentId,
      sessionId: EXPECTED_SESSION_ID,
    });
    const stored = await context.attachments.readImage(attachment);
    const listed = await context.sessionController.list({}, signal);
    const inspected = await context.sessionController.inspect(EXPECTED_SESSION_ID, signal);
    const followed = await firstFrame(
      context.sessionController.follow({
        address: { kind: 'session', sessionId: EXPECTED_SESSION_ID },
        maxMessages: 20,
      }, signal),
    );
    const control = await firstFrame(context.sessionController.control(signal));
    const row = listed.items.find(item => item.sessionId === EXPECTED_SESSION_ID);
    return {
      phase: 'seed',
      status: 'passed',
      sessionId: created.sessionId,
      listed: summarizeRow(row),
      title: renamed,
      attachment: {
        bytesMatched: Buffer.from(roundTrip.data, 'base64').equals(Buffer.from(stored.data)),
        mediaType: roundTrip.attachment.mediaType,
        sourceMediaType: 'image/png',
      },
      approval: {
        outcome: approvalOutcome,
        request: approvalRequest,
      },
      history: summarizeHistory(inspected.events),
      follow: summarizeFollow(followed),
      control: summarizeControl(control),
    };
  } finally {
    detachApproval();
  }
}

async function restore(context) {
  const signal = new AbortController().signal;
  const before = await context.sessionController.list({}, signal);
  const beforeRow = before.items.find(item => item.sessionId === EXPECTED_SESSION_ID);
  const cold = await context.sessionController.inspect(EXPECTED_SESSION_ID, signal);
  const adopted = await context.sessionController.create({
    cwd: process.cwd(),
    sessionId: EXPECTED_SESSION_ID,
  });
  const agent = requireAgent(context);
  const renamed = await context.sessionController.rename({
    sessionId: EXPECTED_SESSION_ID,
    title: 'R1 alpha2 restored',
  });
  await context.sessions.flush(agent.session);

  const attachment = findAttachment(cold.events);
  const roundTrip = await context.sessionController.attachment({
    attachmentId: attachment.attachmentId,
    sessionId: EXPECTED_SESSION_ID,
  });
  const stored = await context.attachments.readImage(attachment);
  const after = await context.sessionController.list({}, signal);
  const followed = await firstFrame(
    context.sessionController.follow({
      address: { kind: 'session', sessionId: EXPECTED_SESSION_ID },
      maxMessages: 20,
    }, signal),
  );
  const control = await firstFrame(context.sessionController.control(signal));
  return {
    phase: 'restore',
    status: 'passed',
    sessionId: adopted.sessionId,
    coldListed: summarizeRow(beforeRow),
    liveAgentRestored: context.agents.get(EXPECTED_SESSION_ID) === agent,
    title: renamed,
    attachment: {
      bytesMatched: Buffer.from(roundTrip.data, 'base64').equals(Buffer.from(stored.data)),
      mediaType: roundTrip.attachment.mediaType,
      sourceMediaType: 'image/png',
    },
    history: summarizeHistory(agent.session.events),
    listed: summarizeRow(after.items.find(item => item.sessionId === EXPECTED_SESSION_ID)),
    follow: summarizeFollow(followed),
    control: summarizeControl(control),
  };
}

function requireAgent(context) {
  const agent = context.agents.get(EXPECTED_SESSION_ID);
  if (!agent) throw new Error('session-controller did not publish the requested Agent');
  return agent;
}

function findAttachment(events) {
  for (const event of events) {
    if (event.type !== 'user/message') continue;
    for (const part of event.data.content ?? []) {
      if (part?.type === 'image' && part.attachment) return part.attachment;
    }
  }
  throw new Error('persisted image attachment was not found');
}

async function firstFrame(stream) {
  const iterator = stream[Symbol.asyncIterator]();
  try {
    const result = await iterator.next();
    if (result.done) throw new Error('public control stream ended before its baseline');
    return result.value;
  } finally {
    await iterator.return?.();
  }
}

function summarizeRow(row) {
  if (!row) return null;
  return {
    blank: row.blank,
    projectionKeys: Object.keys(row.projections?.values ?? {}).sort(),
    running: row.running,
    sessionId: row.sessionId,
  };
}

function summarizeHistory(events) {
  return {
    count: events.length,
    eventTypes: [...new Set(events.map(event => event.type))].sort(),
    titleEvents: events
      .filter(event => event.type === 'session/title')
      .map(event => event.data.title),
  };
}

function summarizeFollow(frame) {
  if (frame.type !== 'snapshot') return { type: frame.type };
  return {
    cursor: frame.cursor,
    projectionKeys: Object.keys(frame.projections?.values ?? {}).sort(),
    recordTypes: [...new Set(frame.records.map(record => record.event.type))].sort(),
    type: frame.type,
  };
}

function summarizeControl(frame) {
  if (frame.type !== 'baseline') return { type: frame.type };
  return {
    projectionKeys: Object.keys(frame.value.projections?.[EXPECTED_SESSION_ID]?.values ?? {}).sort(),
    sessionPresent: EXPECTED_SESSION_ID in frame.value.projections,
    type: frame.type,
  };
}

function exit(context, code) {
  const requestExit = context.get('appExit');
  if (!requestExit) throw new Error('DSH appExit service is unavailable');
  requestExit(code);
}
