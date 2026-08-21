import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

if (process.argv[2] !== '--version') {
  process.stderr.write('只允许 --version\n');
  process.exit(64);
}

switch (process.env.FAKE_DSH_SCENARIO) {
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
