import { access, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
const readme = await readFile('README.md', 'utf8');

const expected = {
  id: 'deepseek-harness-workbench',
  name: 'DeepSeek Harness Workbench',
  unofficialStatement: 'Unofficial community integration for DeepSeek Harness.',
};

assert(manifest.id === expected.id, `manifest id 必须是 ${expected.id}`);
assert(manifest.name === expected.name, `manifest name 必须是 ${expected.name}`);
assert(manifest.isDesktopOnly === true, 'manifest isDesktopOnly 必须为 true');
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'manifest version 必须是 x.y.z');
assert(packageJson.version === manifest.version, 'package 与 manifest 版本不一致');
assert(versions[manifest.version] === manifest.minAppVersion, 'versions 映射与 manifest 不一致');
assert(typeof manifest.description === 'string', 'manifest description 缺失');
assert(manifest.description.length <= 250, 'manifest description 超过 250 字符');
assert(manifest.description.endsWith('.'), 'manifest description 必须以句点结尾');
assert(readme.includes(expected.unofficialStatement), 'README 缺少非官方声明');
assert(
  readme.includes('DSH 路径配置与健康检查 | 命令校验和进程边界已实现；目标统一为 `0.1.1-rc.2`，本地、双平台 CI 与专用隔离 Vault 读回均通过'),
  'README 误报健康检查状态',
);
assert(
  readme.includes('DSH 会话、流式事件与取消 | 对话与任务链均已接入 Obsidian 宿主；专用 Vault 已验证成功、明确失败与恢复、真实文件变更/审核/撤销，以及禁用后受管进程从 `2` 归零'),
  'README 会话能力边界漂移',
);
assert(
  readme.includes('当前健康检查与正式 bridge 统一精确支持 DSH `0.1.1-rc.2`'),
  'README 缺少目标 DSH 版本',
);
assert(
  readme.includes('在当前实现远端 CI 与用户最终验收完成前仍不得进入 `supported`'),
  'README 提前把 rc.2 标为 supported',
);
assert(readme.includes('Obsidian 社区提交 | 尚未进行'), 'README 误报社区提交状态');

await access('main.js');

console.debug('发布状态验证通过：身份、版本、能力真相和构建产物一致。');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
