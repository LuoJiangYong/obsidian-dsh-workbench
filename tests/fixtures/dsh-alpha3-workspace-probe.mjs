import { writeFile } from 'node:fs/promises';

export const name = 'obsidian-dsh-workbench-d1-workspace-probe';
export const inject = ['workspaceRegistry'];

export function apply(context) {
  queueMicrotask(() => {
    void execute(context);
  });
}

async function execute(context) {
  const reportPath = process.env.DSH_D1_REPORT_PATH;
  const phase = process.env.DSH_D1_PHASE;
  try {
    if (!reportPath || !pathIsAbsolute(reportPath)) throw new Error('DSH_D1_REPORT_PATH must be absolute');
    if (phase !== 'seed' && phase !== 'restore') throw new Error('DSH_D1_PHASE must be seed or restore');
    const report = phase === 'seed' ? await seed(context) : await restore(context);
    await writeFile(reportPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 });
    exit(context, 0);
  } catch (error) {
    if (reportPath && pathIsAbsolute(reportPath)) {
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
  const firstPath = requiredPath('DSH_D1_FIRST_PATH');
  const secondPath = requiredPath('DSH_D1_SECOND_PATH');
  const first = await context.workspaceRegistry.create(firstPath, 'D1 Alpha3 First');
  const repeated = await context.workspaceRegistry.create(firstPath, 'ignored duplicate title');
  const second = await context.workspaceRegistry.create(secondPath, 'D1 Alpha3 Second');
  const listed = context.workspaceRegistry.list();
  return {
    phase: 'seed',
    status: 'passed',
    repeatedId: repeated.id,
    workspaces: await summarize(listed),
    firstId: first.id,
    secondId: second.id,
  };
}

async function restore(context) {
  const listed = context.workspaceRegistry.list();
  return {
    phase: 'restore',
    status: 'passed',
    workspaces: await summarize(listed),
  };
}

async function summarize(workspaces) {
  return await Promise.all(workspaces.map(async (workspace) => ({
    id: workspace.id,
    path: workspace.path,
    title: workspace.title,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    sessionIds: [...workspace.sessionIds],
    status: await workspace.status(),
  })));
}

function requiredPath(name) {
  const value = process.env[name];
  if (!value || !pathIsAbsolute(value)) throw new Error(`${name} must be absolute`);
  return value;
}

function pathIsAbsolute(value) {
  return typeof value === 'string' && (
    value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)
  );
}

function exit(context, code) {
  const requestExit = context.get('appExit');
  if (!requestExit) throw new Error('DSH appExit service is unavailable');
  requestExit(code);
}
