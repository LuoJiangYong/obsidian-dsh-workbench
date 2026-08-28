import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const pluginBaseline = await readFile('tests/plugin-baseline.test.ts', 'utf8');
const newTaskContextTests = await readFile('tests/new-task-context.test.ts', 'utf8');
const obsidianContextHostTests = await readFile('tests/obsidian-context-host.test.ts', 'utf8');
const governanceContracts = await readFile('tests/contracts.test.ts', 'utf8');
const bridgeProtocolTests = await readFile('tests/bridge-protocol.test.ts', 'utf8');
const formalBridgeTests = await readFile('tests/obsidian-bridge.test.ts', 'utf8');
const ndjsonTests = await readFile('tests/bridge-ndjson-transport.test.ts', 'utf8');
const managedBridgeTests = await readFile('tests/managed-bridge-process.test.ts', 'utf8');
const realDshBridgeTests = await readFile('tests/real-dsh-bridge.test.ts', 'utf8');
const runtimeStorageTests = await readFile('tests/runtime-storage.test.ts', 'utf8');
const taskWorkspaceTests = await readFile('tests/task-workspace.test.ts', 'utf8');
const newTaskConversationTests = await readFile('tests/new-task-conversation.test.ts', 'utf8');
const conversationUiTests = await readFile('tests/workbench-conversation-ui.test.ts', 'utf8');
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
  packageJson.scripts['test:runtime'].includes('tests/runtime-storage.test.ts'),
  'test:runtime 必须覆盖 Vault 外运行数据边界',
);
assert(
  packageJson.scripts['test:runtime'].includes('tests/task-workspace.test.ts'),
  'test:runtime 必须覆盖任务工作区变更账本',
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
  '只在显式请求时打开并复用右侧快速助手真实上下文摘要',
  '插件卸载时关闭仍打开的上下文选择器',
]) {
  assert(pluginBaseline.includes(uiContract), `插件基线缺少 UI 契约：${uiContract}`);
}
for (const contextContract of [
  '新建任务只读上下文',
  '把文件夹展开结果作为一个原子批次加入，重复或超量时不部分修改',
  '发送前从宿主重新读取文件并建立不随后续编辑变化的不可变快照',
  '以最坏转义内容实测上下文上限仍低于 1 MiB bridge frame',
]) {
  assert(newTaskContextTests.includes(contextContract), `只读上下文测试缺少契约：${contextContract}`);
}
for (const hostContextContract of [
  'Obsidian 只读上下文宿主',
  '从活动 Markdown 视图捕获当前笔记和当前选区，并由用户显式加入',
  '文件选择器只列出尚未加入的 Markdown 文件',
  '选择文件夹时递归展开未选择的 Markdown，并作为一个受限批次加入',
  '文件夹展开超过剩余项数时整体失败且不提交部分笔记',
  '文件夹展开使合计字节超限时在读取前整体失败',
  '重复打开或宿主释放时关闭已有选择器',
  '快照读取只接受仍存在且未超限的 Markdown 文件',
]) {
  assert(
    obsidianContextHostTests.includes(hostContextContract),
    `Obsidian 上下文宿主测试缺少契约：${hostContextContract}`,
  );
}
for (const ardotContract of [
  'Ardot v2 固定用户审阅真相、AI 只读边界、插件反馈差异和社区首发门',
  'Codex 参考路线固定正式会话、原生右侧栏与 DSH 能力投影边界',
  'https://ardot.tencent.com/file/718186366720195',
  'Ardot 是用户审阅和完善 UI 的专属界面，AI 默认只读',
  '除非用户对当前批次明确要求修改 Ardot',
  'UI 真相 v2',
  '首个 Obsidian 社区插件发布功能固定为“新建任务”',
  '不显示“首发”“规划中”“尚未实现”等开发阶段、发布批次或治理审批文案',
  '未实现模块不在插件导航中渲染',
  '模式分段控件在插件中使用左右半圆胶囊边界',
  'Batch 5A UI 基线与 Batch 7 插件级对话状态各自保持单一职责',
  '同一个 Workbench leaf 内切换为正式会话页',
  '右侧信息应使用 Obsidian 原生右侧 leaf，默认关闭且可选打开',
  '不提供完全权限、跨会话永久授权或任意 Shell',
]) {
  assert(governanceContracts.includes(ardotContract), `治理契约缺少 Ardot 规则：${ardotContract}`);
}
for (const newTaskContract of [
  '新建任务 v1 固定宿主边界、真实取消、运行数据与只读自动演进',
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
  '禁止对话模式全部 DSH 工具',
  '依赖、缓存、构建产物与版本控制目录不属于可编辑工作区',
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
  '把 overlay 与 DSH 原生会话根分离',
  'shutdown 超时后终止整个子进程树',
  'Windows .cmd shim',
  '运行目录落入 Vault 时在执行任何 DSH 检查前 fail closed',
]) {
  assert(managedBridgeTests.includes(processContract), `受管进程测试缺少契约：${processContract}`);
}
for (const storageContract of [
  'Workbench 运行数据存储边界',
  '按 Vault 哈希解析系统应用数据目录，并继承 DSH 原生会话根',
  '拒绝 Vault 内的状态目录或 DSH_HOME',
]) {
  assert(runtimeStorageTests.includes(storageContract), `运行数据测试缺少契约：${storageContract}`);
}
for (const taskWorkspaceContract of [
  '任务工作区变更账本',
  '只接受与 Vault、Vault 外状态目录完全分离的普通目录',
  '只报告真实文件变化并排除依赖与构建目录',
  '确认撤销后恢复修改和删除的文件，并移除本 turn 新建文件',
  '检测后续编辑时不改写任何文件',
  '账本被篡改时 fail closed',
  '账本目录哈希必须继续绑定原工作区',
  '按有效期和每工作区账本上限清理',
]) {
  assert(
    taskWorkspaceTests.includes(taskWorkspaceContract),
    `任务工作区测试缺少契约：${taskWorkspaceContract}`,
  );
}
for (const conversationContract of [
  '新建任务真实对话控制器',
  '发送前重读上下文，复用同一 session，并投影流式回复、工具、权限和完成终态',
  '只有 bridge 的 cancelled 终态才显示已取消',
  '取消已接受但终态超时后强制清理',
  '意外 EOF 立即成为可见失败',
]) {
  assert(
    newTaskConversationTests.includes(conversationContract),
    `对话控制器测试缺少契约：${conversationContract}`,
  );
}
for (const conversationUiContract of [
  'Workbench 真实对话界面',
  '发送前展示只读审阅，取消保留草稿，确认后清空草稿并显示流式结果',
  '只提供本次权限决定并把错误作为可访问终态呈现',
]) {
  assert(
    conversationUiTests.includes(conversationUiContract),
    `对话 UI 测试缺少契约：${conversationUiContract}`,
  );
}
for (const runtimeContract of [
  'DSH 0.1.1-rc.2 正式 bridge 运行验收',
  '真实加载 artifact',
  '原生 DSH 会话落盘',
  'mid-turn cancel',
  '零残留',
]) {
  assert(realDshBridgeTests.includes(runtimeContract), `真实 DSH 测试缺少契约：${runtimeContract}`);
}

console.debug(
  'CI 覆盖验证通过：双平台 Phase A、Workbench UI、只读知识库、Vault 外运行数据与任务变更账本、真实对话、Ardot v2、bridge 协议/正式实现/NDJSON 与 Windows rc.2 运行门已接入。',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
