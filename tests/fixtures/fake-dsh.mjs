import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const managedScenario = process.env.FAKE_DSH_SCENARIO?.startsWith('managed-') === true;

if (managedScenario && process.argv[2] === '--version') {
  process.stdout.write('0.1.1-rc.2\n');
  process.exit(0);
}

if (managedScenario) {
  runManagedBridge(process.env.FAKE_DSH_SCENARIO);
} else if (process.argv[2] !== '--version') {
  process.stderr.write('只允许 --version\n');
  process.exit(64);
} else switch (process.env.FAKE_DSH_SCENARIO) {
  case 'success':
    process.stdout.write('0.1.1-rc.1\n');
    break;
  case 'unsupported':
    process.stdout.write('0.1.0-rc.6\n');
    break;
  case 'invalid-output':
    process.stdout.write('DeepSeek Harness development build\n');
    break;
  case 'secret-error':
    process.stderr.write('DEEPSEEK_API_KEY=super-secret-value\n');
    process.exitCode = 2;
    break;
  case 'hang-with-child': {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
      stdio: 'ignore',
    });
    const pidFile = process.env.FAKE_DSH_PID_FILE;
    if (!pidFile || child.pid === undefined) {
      process.stderr.write('无法记录假运行时子进程\n');
      process.exit(65);
    }
    writeFileSync(pidFile, String(child.pid), 'utf8');
    setInterval(() => {}, 1_000);
    break;
  }
  default:
    process.stderr.write('未指定假运行时场景\n');
    process.exitCode = 64;
}

function runManagedBridge(scenario) {
  if (scenario === 'managed-hang-with-child') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
      stdio: 'ignore',
    });
    const pidFile = process.env.FAKE_DSH_PID_FILE;
    if (!pidFile || child.pid === undefined) process.exit(65);
    writeFileSync(pidFile, String(child.pid), 'utf8');
    process.stderr.write(`DEEPSEEK_API_KEY=super-secret-value cwd=${process.cwd()}\n`);
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const request = JSON.parse(line);
      if (request.method === 'initialize') {
        respond(request.id, {
          protocolVersion: '1',
          bridgeVersion: '0.1.0',
          dshVersion: '0.1.1-rc.2',
          capabilities: ['session', 'events', 'cancel', 'permission', 'shutdown'],
        });
      } else if (request.method === 'shutdown') {
        if (scenario === 'managed-graceful') {
          respond(request.id, { accepted: true });
          process.stdout.write('', () => process.exit(0));
        }
      } else {
        respond(request.id, { accepted: true });
      }
    }
  });
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ type: 'response', id, ok: true, result })}\n`);
}
