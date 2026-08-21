import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ignoredDirectories = new Set(['.git', 'coverage', 'node_modules']);
const forbiddenNames = new Set(['.env', '.dsh']);
const textExtensions = new Set(['.css', '.json', '.md', '.mjs', '.ts', '.yml', '.yaml']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bghp_[A-Za-z0-9]{20,}\b/u,
  /\bsk-[A-Za-z0-9]{20,}\b/u,
];
const machinePathPatterns = [
  /\b[A-Za-z]:\\Users\\[^\\\s]+/u,
  /\b[A-Za-z]:\\knowledge base\\/iu,
];

const files = await collectFiles('.');
const failures = [];

for (const file of files) {
  const relative = path.relative('.', file).replaceAll('\\', '/');
  const segments = relative.split('/');
  if (segments.some((segment) => forbiddenNames.has(segment))) {
    failures.push(`禁止文件或目录：${relative}`);
  }

  if (!textExtensions.has(path.extname(relative))) continue;
  if (relative === 'package-lock.json') continue;

  const content = await readFile(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) failures.push(`疑似凭据：${relative}`);
  }
  for (const pattern of machinePathPatterns) {
    if (pattern.test(content)) failures.push(`本机绝对路径：${relative}`);
  }
}

const gitignore = await readFile('.gitignore', 'utf8');
if (!gitignore.split(/\r?\n/u).includes('main.js')) {
  failures.push('.gitignore 必须忽略 main.js');
}

if (isGitRepository()) {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/u)
    .filter(Boolean);
  for (const forbiddenTrackedFile of ['main.js', '.env']) {
    if (tracked.includes(forbiddenTrackedFile)) {
      failures.push(`禁止跟踪构建或凭据文件：${forbiddenTrackedFile}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`仓库边界验证失败：\n- ${failures.join('\n- ')}`);
}

console.debug(`仓库边界验证通过：检查 ${files.length} 个文件，未发现凭据、机器路径或禁止文件。`);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const collected = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...await collectFiles(entryPath));
    else if (entry.isFile()) collected.push(entryPath);
  }
  return collected;
}

function isGitRepository() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
