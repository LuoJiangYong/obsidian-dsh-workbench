import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('bridge-build-manifest.json', 'utf8'));
const runtimePackage = JSON.parse(await readFile('tests/runtime-fixture/package.json', 'utf8'));
const runtimeLock = JSON.parse(await readFile('tests/runtime-fixture/package-lock.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const artifact = await readFile(manifest.artifact);
const dshLock = runtimeLock.packages?.['node_modules/@deepseek-ai/dsh'];

assert(manifest.bridgeVersion === '0.2.0', 'bridge manifest 版本必须为 0.2.0');
assert(manifest.protocolVersion === '1', 'bridge manifest 协议必须为 1');
assert(manifest.dshVersion === '0.1.2-alpha.3', 'bridge manifest DSH 必须为 0.1.2-alpha.3');
assert(runtimePackage.dependencies?.['@deepseek-ai/dsh'] === manifest.dshVersion, '运行夹具未精确锁定目标 DSH');
assert(runtimeLock.packages?.['']?.dependencies?.['@deepseek-ai/dsh'] === manifest.dshVersion, '运行夹具 lock 根规格漂移');
assert(dshLock?.version === manifest.dshVersion, '运行夹具 lock DSH 解析版本漂移');
assert(dshLock?.integrity === manifest.dshIntegrity, '运行夹具 lock DSH integrity 漂移');
assert(artifact.byteLength === manifest.artifactBytes, 'bridge artifact 字节数漂移');
assert(
  createHash('sha256').update(artifact).digest('hex') === manifest.artifactSha256,
  'bridge artifact SHA-256 漂移',
);
assert(rootPackage.dependencies?.['@deepseek-ai/dsh'] === undefined, '插件运行依赖不得安装 DSH');
assert(rootPackage.devDependencies?.['@deepseek-ai/dsh'] === undefined, '根开发依赖不得混入 DSH 运行夹具');

console.debug(
  `正式 bridge artifact 验证通过：${manifest.bridgeVersion} / protocol ${manifest.protocolVersion} / DSH ${manifest.dshVersion} / ${manifest.artifactSha256}。`,
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
