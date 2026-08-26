import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const pluginBaseline = await readFile('tests/plugin-baseline.test.ts', 'utf8');
const governanceContracts = await readFile('tests/contracts.test.ts', 'utf8');
const bridgeProtocolTests = await readFile('tests/bridge-protocol.test.ts', 'utf8');
const formalBridgeTests = await readFile('tests/obsidian-bridge.test.ts', 'utf8');
const ndjsonTests = await readFile('tests/bridge-ndjson-transport.test.ts', 'utf8');
const managedBridgeTests = await readFile('tests/managed-bridge-process.test.ts', 'utf8');
const realDshBridgeTests = await readFile('tests/real-dsh-bridge.test.ts', 'utf8');
const runtimeFixture = JSON.parse(await readFile('tests/runtime-fixture/package.json', 'utf8'));

const requiredCommands = [
  'npm ci',
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run test:runtime',
  'npm run prepare:runtime-fixture',
  'npm run test:bridge:runtime',
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
assert(
  /name: Windows DSH rc\.2 正式 bridge 运行验收\s+if: runner\.os == 'Windows'\s+run: npm run test:bridge:runtime/u.test(workflow),
  'CI 必须在 Windows runner 显式执行 DSH rc.2 正式 bridge 运行验收',
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

for (const script of [
  'typecheck',
  'lint',
  'test',
  'test:runtime',
  'test:bridge:runtime',
  'prepare:runtime-fixture',
  'build',
  'verify:bridge-artifact',
  'verify',
]) {
  assert(typeof packageJson.scripts?.[script] === 'string', `package scripts 缺少 ${script}`);
}

assert(
  packageJson.scripts['test:runtime'].includes('tests/dsh-settings.test.ts')
    && packageJson.scripts['test:runtime'].includes('tests/dsh-health.test.ts'),
  'test:runtime 必须覆盖设置契约和受管健康检查',
);
assert(
  packageJson.scripts['test:runtime'].includes('tests/managed-bridge-process.test.ts'),
  'test:runtime 必须覆盖正式 bridge 受管进程生命周期',
);
assert(
  runtimeFixture.dependencies?.['@deepseek-ai/dsh'] === '0.1.1-rc.2',
  '运行夹具必须精确锁定 @deepseek-ai/dsh 0.1.1-rc.2',
);
assert(
  packageJson.scripts.test === 'vitest run',
  'test 必须执行完整 Vitest 集，不能把 UI 契约排除在双平台 CI 外',
);
for (const uiContract of [
  '在中央标签页打开并复用 Workbench 视图',
  '按用户反馈渲染精简导航和胶囊模式，并把不可用动作保持为真实禁用态',
  '只在显式请求时打开并复用右侧快速助手真实空状态',
]) {
  assert(pluginBaseline.includes(uiContract), `插件基线缺少 UI 契约：${uiContract}`);
}
for (const ardotContract of [
  'Ardot v2 固定用户审阅真相、AI 只读边界、插件反馈差异和社区首发门',
  'https://ardot.tencent.com/file/718186366720195',
  'Ardot 是用户审阅和完善 UI 的专属界面，AI 默认只读',
  '除非用户对当前批次明确要求修改 Ardot',
  'UI 真相 v2',
  '首个 Obsidian 社区插件发布功能固定为“新建任务”',
  '不显示“首发”“规划中”“尚未实现”等开发阶段、发布批次或治理审批文案',
  '未实现模块不在插件导航中渲染',
  '模式分段控件在插件中使用左右半圆胶囊边界',
  'Batch 5A 固定插件反馈 UI、禁用边界与专用 Vault 证据',
]) {
  assert(governanceContracts.includes(ardotContract), `治理契约缺少 Ardot 规则：${ardotContract}`);
}
for (const newTaskContract of [
  '新建任务 v1 固定宿主边界、真实取消、最新预发布候选与只读自动演进',
  'Batch 2 固定 rc.2 官方能力证据、兼容矩阵与生产未通过边界',
  '发送动作建立不可变上下文快照',
  '整个 Vault 不得成为 DSH 默认可写 `cwd`',
  '每个 turn 只能产生一个终态',
  '当前核验到的正式 bridge 目标是 `0.1.1-rc.2`',
  '插件自动安装或更新 DSH',
  'Release 成功不自动授权社区提交',
]) {
  assert(governanceContracts.includes(newTaskContract), `治理契约缺少新建任务 v1 规则：${newTaskContract}`);
}
for (const bridgeProtocolContract of [
  'bridge 协议 v1 与假 bridge',
  '完成精确握手并固定 initialize 请求',
  '拒绝事件 seq 缺口、重复和未知 required 事件',
  '未知 ignorable 事件只推进 seq',
  '权限请求只允许当前 session/turn/request 的一次性决定',
  '只有取消终态才建立 cancelled',
  '正常 shutdown 必须先收到响应再由 EOF 建立 closed',
  '意外 EOF 与请求超时都使连接失败且拒绝后续请求',
]) {
  assert(
    bridgeProtocolTests.includes(bridgeProtocolContract),
    `bridge 协议测试缺少契约：${bridgeProtocolContract}`,
  );
}

for (const formalBridgeContract of [
  '正式 obsidian-bridge',
  '窄投影 DSH session 事件',
  '只接管自有 Agent 的一次性权限请求',
  '正常 shutdown 前释放所有空闲 Agent',
]) {
  assert(formalBridgeTests.includes(formalBridgeContract), `正式 bridge 测试缺少契约：${formalBridgeContract}`);
}
for (const transportContract of [
  '插件侧 NDJSON transport',
  '空行、非法 JSON 与超限 frame 都交给协议层 fail closed',
]) {
  assert(ndjsonTests.includes(transportContract), `NDJSON 测试缺少契约：${transportContract}`);
}
for (const processContract of [
  '正式 bridge 受管进程',
  '隔离 DSH_HOME',
  'shutdown 超时后终止整个子进程树',
  'Windows .cmd shim',
]) {
  assert(managedBridgeTests.includes(processContract), `受管进程测试缺少契约：${processContract}`);
}
for (const runtimeContract of [
  'DSH 0.1.1-rc.2 正式 bridge 运行验收',
  '真实加载 artifact',
  'mid-turn cancel',
  '零残留',
]) {
  assert(realDshBridgeTests.includes(runtimeContract), `真实 DSH 测试缺少契约：${runtimeContract}`);
}

console.debug(
  'CI 覆盖验证通过：双平台 Phase A、Workbench UI、Ardot v2、新建任务 v1、bridge 协议/正式实现/NDJSON 与 Windows rc.2 运行门已接入。',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
