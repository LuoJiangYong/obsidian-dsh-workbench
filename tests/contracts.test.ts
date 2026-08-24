import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();

async function readJson<T>(relativePath: string): Promise<T> {
  const content = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
  return JSON.parse(content) as T;
}

describe('发布与治理契约', () => {
  it('固定插件身份、版本与桌面端边界', async () => {
    const manifest = await readJson<{
      id: string;
      isDesktopOnly: boolean;
      minAppVersion: string;
      name: string;
      version: string;
    }>('manifest.json');
    const packageJson = await readJson<{ version: string }>('package.json');
    const versions = await readJson<Record<string, string>>('versions.json');

    expect(manifest).toMatchObject({
      id: 'deepseek-harness-workbench',
      isDesktopOnly: true,
      minAppVersion: '1.13.0',
      name: 'DeepSeek Harness Workbench',
      version: '0.1.0',
    });
    expect(packageJson.version).toBe(manifest.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it('README 如实声明非官方身份、只读健康检查与未实现能力', async () => {
    const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');

    expect(readme).toContain('Unofficial community integration for DeepSeek Harness.');
    expect(readme).toContain('| 中央 Workbench 与内部导航 | 已实现；已通过本批隔离 Vault 运行与视觉验收 |');
    expect(readme).toContain('| 可选右侧快速助手容器 | 已实现真实空状态；已通过本批隔离 Vault 运行与视觉验收 |');
    expect(readme).toContain('| DSH 路径配置与健康检查 | 已实现；只读检查已通过本地测试和隔离 Vault 运行验收 |');
    expect(readme).toContain('只有用户手动点击“检查 DSH”时才启动外部子进程');
    expect(readme).toContain('当前健康检查精确支持 DSH `0.1.1-rc.1`');
    expect(readme).toContain('| DSH 会话、流式事件与取消 | 尚未实现 |');
    expect(readme).toContain('| Vault 读取与写入 | 未启用 |');
    expect(readme).toContain('| Obsidian 社区提交 | 尚未进行 |');
    expect(readme).toContain('- 不采集客户端遥测。');
  });

  it('DESIGN 与 ADR 固定中央工作台、内部导航和可选快速助手边界', async () => {
    const design = await readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8');
    const adr = await readFile(
      path.join(repositoryRoot, 'docs', 'architecture', 'ADR-002-workbench-shell.md'),
      'utf8',
    );

    expect(design).toContain('用户审阅的产品 UI 界面真相');
    expect(design).toContain('中央 Workbench 标签页');
    expect(design).toContain('桌面宽屏导航宽度固定为 `194px`');
    expect(design).toContain('快速助手是独立、按需打开的 Obsidian 右侧视图');
    expect(design).toContain('当前不得显示可编辑对话框、发送、停止、模型选择');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain("调用 `workspace.getLeaf('tab')`");
    expect(adr).toContain('不建立公共模块注册器、动态加载器或数据协议');
  });

  it('Ardot 固定用户审阅 UI 真相、鲸鱼基线和同步演进门', async () => {
    const [agents, design, readme, designQa, adr] = await Promise.all([
      readFile(path.join(repositoryRoot, 'AGENTS.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-003-ardot-ui-authority.md'),
        'utf8',
      ),
    ]);
    const ardotUrl = 'https://ardot.tencent.com/file/718186366720195';

    expect(agents).toContain(ardotUrl);
    expect(agents).toContain('最新获用户批准版本，是用户审阅的产品 UI 界面真相');
    expect(agents).toContain('必须同步演进 Ardot');
    expect(design).toContain(ardotUrl);
    expect(design).toContain('未批准草稿');
    expect(design).toContain('`05 运行状态 700px 容器`（`2:36`）');
    expect(design).toContain('当前运行代码仍使用 Lucide `bot`');
    expect(readme).toContain('当前运行代码尚未同步该图标');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('同一 Ardot 项目持续演进');
    expect(designQa).toContain('Ardot UI 真相 v1');
    expect(designQa.trimEnd()).toMatch(/final result: passed$/u);
  });

  it('P0 评估只接受一个生产运行时 ADR', async () => {
    const adr = await readFile(
      path.join(repositoryRoot, 'docs', 'architecture', 'ADR-001-runtime-integration.md'),
      'utf8',
    );
    const assessment = await readFile(
      path.join(repositoryRoot, 'docs', 'architecture', 'p0-runtime-route-assessment.md'),
      'utf8',
    );

    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('未来生产集成只采用一条薄 `obsidian-bridge` 路线');
    expect(adr).toContain('不把官方 SDK 或 ACP 作为第二条生产 fallback');
    expect(assessment).toContain('| 薄 bridge |');
    expect(assessment).toContain('健康检查成功只表示目标命令可执行');
  });

  it('CI 路线图保持 Release 自动化未获批准', async () => {
    const roadmap = await readFile(
      path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'),
      'utf8',
    );

    expect(roadmap).toContain('状态：未批准，禁止实施。');
    expect(roadmap).toContain('不得自动提交 Obsidian 社区目录');
  });
});
