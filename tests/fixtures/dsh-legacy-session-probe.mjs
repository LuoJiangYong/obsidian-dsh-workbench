import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export const name = 'dsh-legacy-session-producer';
export const inject = ['agents', 'agentDefaultModel', 'sessions', 'sessionTitle'];

export function apply(context) {
  queueMicrotask(() => { void execute(context); });
}

async function execute(context) {
  let handle;
  try {
    const selection = context.agentDefaultModel.currentSelection();
    handle = await context.agents.create({
      sessionId: 'obsidian-dsh-workbench-runtime-migration-alpha3',
      meta: { cwd: process.cwd() },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: agentContext => { agentContext.tools.restrict({ allow: [] }); },
    });
    context.sessionTitle.rename(handle.agent.session, 'Runtime migration alpha3 candidate');
    handle.agent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '只回复好' }] });
    await handle.agent.whenIdle();
    await context.sessions.flush(handle.agent.session);
    const messages = handle.agent.session.events.filter(event => event.type === 'assistant/message');
    if (!messages.some(event => event.data.message.content.some(part => part.type === 'text' && part.text === '好'))) {
      throw new Error('历史 Agent 没有提交真实回复');
    }
    await writeFile(process.env.DSH_R1_REPORT_PATH, JSON.stringify({ status: 'passed', sessionId: handle.agent.session.id }), { encoding: 'utf8', mode: 0o600 });
    await handle.dispose();
    context.get('appExit')(0);
  } catch (error) {
    await handle?.dispose();
    console.error(error instanceof Error ? error.message : '历史会话生成失败');
    context.get('appExit')(1);
  }
}
