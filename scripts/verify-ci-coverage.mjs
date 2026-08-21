import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const requiredCommands = [
  'npm ci',
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run build',
  'npm run verify',
];

for (const command of requiredCommands) {
  assert(workflow.includes(command), `CI 未执行：${command}`);
}

assert(workflow.includes('ubuntu-latest'), 'CI 缺少 Ubuntu job');
assert(workflow.includes('windows-latest'), 'CI 缺少 Windows job');
assert(workflow.includes("node-version: '24'"), 'CI 必须固定 Node 24');

for (const script of ['typecheck', 'lint', 'test', 'build', 'verify']) {
  assert(typeof packageJson.scripts?.[script] === 'string', `package scripts 缺少 ${script}`);
}

console.debug('CI 覆盖验证通过：Windows 与 Ubuntu 均执行完整 Phase A 命令。');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
