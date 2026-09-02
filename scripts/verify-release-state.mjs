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
  readme.includes('DSH 路径配置与健康检查 | 命令校验和进程边界已实现；生产目标统一为 `0.1.2-alpha.3`，本地与专用隔离 Vault 读回通过，并由双平台 CI 执行精确夹具'),
  'README 误报健康检查状态',
);
assert(
  readme.includes('DSH 会话、流式事件与取消 | 对话与任务链均已接入 Obsidian 宿主；专用 Vault 已验证成功、明确失败与恢复、真实文件变更/审核/撤销，以及禁用后受管进程从 `2` 归零'),
  'README 会话能力边界漂移',
);
assert(
  readme.includes('当前健康检查与正式 bridge 统一精确支持 DSH `0.1.2-alpha.3`'),
  'README 缺少目标 DSH 版本',
);
assert(
  readme.includes('用户于 `2026-08-31` 明确确认第一批开发目标完成'),
  'README 缺少第一批开发目标完成状态',
);
assert(
  readme.includes('正式 bridge + 产品对话/任务组合推进到 `supported`'),
  'README 缺少当前 v1 的产品支持状态',
);
assert(
  readme.includes('R2 已实现公开 session 精确读取/恢复和 Vault 外最小任务索引'),
  'README 缺少 R2 最小恢复事实',
);
assert(
  readme.includes('项目/最近 UI、Vault 写入和删除工具不属于当前范围'),
  'README 误报 R2 后续范围',
);
assert(readme.includes('GitHub Release | 未创建'), 'README 误报 GitHub Release 状态');
assert(readme.includes('Obsidian 社区提交 | 尚未进行'), 'README 误报社区提交状态');

await access('main.js');

console.debug('发布状态验证通过：身份、版本、能力真相和构建产物一致。');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
