import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { ManagedBridgeProcess } from '../src/managed-bridge-process';

const legacyBin = path.join(process.cwd(), 'tests/runtime-legacy-fixture/node_modules/@deepseek-ai/dsh/lib/bin.js');
const currentCommand = path.join(process.cwd(), 'tests/runtime-candidate-fixture/node_modules/.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
const sessionId = 'obsidian-dsh-workbench-runtime-migration-alpha3';

describe.runIf(existsSync(legacyBin) && existsSync(currentCommand))('DSH 原生历史 session 迁移', () => {
  it('alpha.3 公开 API 生成历史会话，rc.2 冷读取并恢复原 ID，旧字节不变且不创建凭据', async () => {
    vi.stubGlobal('window', globalThis);
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dsh-native-migration-')));
    const dshHome = path.join(root, 'dsh-home');
    const cwd = path.join(root, 'workspace');
    await mkdir(cwd);
    await mkdir(path.join(root, 'vault'));
    let modelRequests = 0;
    const model = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        modelRequests += 1;
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: {"choices":[{"delta":{"role":"assistant","content":"好"}}]}\n\ndata: [DONE]\n\n');
      });
    });
    await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
    const address = model.address();
    if (!address || typeof address === 'string') throw new Error('本地模型端口缺失');
    const environment = { ...process.env, DEEPSEEK_API_KEY: 'fixture-key-never-logged', DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}` };
    const manager = new ManagedBridgeProcess({
      bridgePath: path.join(process.cwd(), 'obsidian-bridge.mjs'), command: currentCommand,
      dshHome, stateDirectory: path.join(root, 'state'), vaultPath: path.join(root, 'vault'), workingDirectory: cwd,
      environment,
      startTimeoutMs: 15_000, requestTimeoutMs: 10_000, shutdownTimeoutMs: 5_000,
    });
    try {
      const reportPath = path.join(root, 'seed-report.json');
      const overlayPath = path.join(root, 'legacy-seed.cordis.patch.yml');
      const probeUrl = pathToFileURL(path.join(process.cwd(), 'tests/fixtures/dsh-legacy-session-probe.mjs')).href;
      await writeFile(overlayPath, [
        '- id: code-runtime', '  disabled: true', '- id: headless-startup', '  disabled: true',
        '- id: headless-runner', '  disabled: true', '- id: session-title-llm', '  disabled: true',
        '- insert:', '    - id: legacy-producer', `      name: ${JSON.stringify(probeUrl)}`,
        '      inject: [agents, agentDefaultModel, sessions, sessionTitle]', '',
      ].join('\n'), { encoding: 'utf8', mode: 0o600 });
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [legacyBin, '--profile', 'headless', '--patch', overlayPath], {
          cwd, env: { ...environment, DSH_HOME: dshHome, DSH_R1_REPORT_PATH: reportPath,
            DSH_PERMISSION_MODE: 'workspace-write', DSH_TELEMETRY_DISABLED: '1' },
          stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
        });
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2048); });
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('历史 producer 超时')); }, 30_000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`历史 producer 失败 ${String(code)}: ${stderr}`)); });
      });
      expect(JSON.parse(await readFile(reportPath, 'utf8')) as unknown).toMatchObject({ status: 'passed', sessionId });
      expect(modelRequests).toBe(1);
      const sessionsRoot = path.join(dshHome, 'sessions');
      const oldArtifacts = (await readdir(sessionsRoot, { recursive: true })).filter(entry => /session\.jsonl(?:\.zstd)?$/u.test(entry));
      expect(oldArtifacts.length).toBeGreaterThan(0);
      // Only byte preservation is checked. No private log format is parsed by the plugin or test.
      const oldHashes = await Promise.all(oldArtifacts.map(async entry => createHash('sha256').update(await readFile(path.join(sessionsRoot, entry))).digest('hex')));
      expect(existsSync(path.join(dshHome, '.credentials.yaml'))).toBe(false);
      const client = await manager.start();
      await expect(client.readSessions([sessionId])).resolves.toMatchObject({ items: [
        { sessionId, status: 'available', blank: false, running: false, title: 'Runtime migration alpha3 candidate' },
      ] });
      await client.restoreSession({ sessionId, mode: 'chat' });
      await client.closeSession(sessionId);
      await expect(manager.shutdown()).resolves.toEqual({ outcome: 'graceful' });
      expect(client.failure).toBeUndefined();
      expect(modelRequests).toBe(1);
      expect(await Promise.all(oldArtifacts.map(async entry => createHash('sha256').update(await readFile(path.join(sessionsRoot, entry))).digest('hex')))).toEqual(oldHashes);
      expect((await readdir(sessionsRoot, { recursive: true })).some(entry => /session\.v4\.jsonl(?:\.zstd)?$/u.test(entry))).toBe(true);
      expect(existsSync(path.join(dshHome, '.credentials.yaml'))).toBe(false);
      expect(await readdir(path.join(root, 'vault'))).toEqual([]);
    } finally {
      await manager.dispose();
      await new Promise<void>(resolve => model.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
      vi.unstubAllGlobals();
    }
  }, 60_000);
});
