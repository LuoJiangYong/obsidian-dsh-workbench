import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const pluginBaseline = await readFile('tests/plugin-baseline.test.ts', 'utf8');

const requiredCommands = [
  'npm ci',
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run test:runtime',
  'npm run build',
  'npm run verify',
];

for (const command of requiredCommands) {
  assert(workflow.includes(command), `CI 未执行：${command}`);
}

assert(workflow.includes('ubuntu-latest'), 'CI 缺少 Ubuntu job');
assert(workflow.includes('windows-latest'), 'CI 缺少 Windows job');
assert(
  /name: Windows DSH 进程与 shim 专项测试\s+if: runner\.os == 'Windows'\s+run: npm run test:runtime/u.test(workflow),
  'CI 必须在 Windows runner 显式执行 DSH 进程与 shim 专项测试',
);
assert(workflow.includes("node-version: '24'"), 'CI 必须固定 Node 24');
assert(
  /uses: actions\/checkout@[0-9a-f]{40} # v7\.0\.1/.test(workflow),
  'CI 必须固定已核验的 actions/checkout v7.0.1 提交',
);
assert(
  /uses: actions\/setup-node@[0-9a-f]{40} # v7\.0\.0/.test(workflow),
  'CI 必须固定已核验的 actions/setup-node v7.0.0 提交',
);
assert(!workflow.includes('actions/checkout@v4'), 'CI 禁止退回 Node 20 runtime 的 checkout v4');
assert(!workflow.includes('actions/setup-node@v4'), 'CI 禁止退回 Node 20 runtime 的 setup-node v4');

for (const script of ['typecheck', 'lint', 'test', 'test:runtime', 'build', 'verify']) {
  assert(typeof packageJson.scripts?.[script] === 'string', `package scripts 缺少 ${script}`);
}

assert(
  packageJson.scripts['test:runtime'].includes('tests/dsh-settings.test.ts')
    && packageJson.scripts['test:runtime'].includes('tests/dsh-health.test.ts'),
  'test:runtime 必须覆盖设置契约和受管健康检查',
);
assert(
  packageJson.scripts.test === 'vitest run',
  'test 必须执行完整 Vitest 集，不能把 UI 契约排除在双平台 CI 外',
);
for (const uiContract of [
  '在中央标签页打开并复用 Workbench 视图',
  '渲染内部导航、概览真值，并切换到运行状态',
  '只在显式请求时打开并复用右侧快速助手真实空状态',
]) {
  assert(pluginBaseline.includes(uiContract), `插件基线缺少 UI 契约：${uiContract}`);
}

console.debug('CI 覆盖验证通过：双平台 Phase A、Workbench UI 契约与 Windows DSH 专项门已接入。');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
