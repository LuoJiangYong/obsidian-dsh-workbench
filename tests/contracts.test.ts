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
    expect(readme).toContain('| 新建任务 | `v2` 首发设计目标；运行代码尚未实现对话、任务执行或上下文 |');
    expect(readme).toContain('| 中央 Workbench 与当前内部导航 | 已实现；已通过既有隔离 Vault 运行与视觉验收，仍为分离的“概览”“运行状态” |');
    expect(readme).toContain('| 可选右侧快速助手容器 | 当前真实空状态已实现并通过既有验收；`v2` 定义为可选，产品标题不携带发布阶段 |');
    expect(readme).toContain('| DSH 路径配置与健康检查 | 已实现；只读检查已通过本地测试和隔离 Vault 运行验收 |');
    expect(readme).toContain('只有用户手动点击“检查 DSH”时才启动外部子进程');
    expect(readme).toContain('当前健康检查精确支持 DSH `0.1.1-rc.1`');
    expect(readme).toContain('| DSH 会话、流式事件与取消 | 尚未实现 |');
    expect(readme).toContain('| Vault 读取与写入 | 未启用 |');
    expect(readme).toContain('| Obsidian 社区提交 | 尚未进行 |');
    expect(readme).toContain('当前状态是`仅设计已更新，运行代码未同步`');
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
    expect(design).toContain('v2 目标导航首位固定为“新建任务”');
    expect(design).toContain('“概览”和“运行状态”合并为“运行”，固定在功能导航最后');
    expect(design).toContain('快速助手是独立、按需打开的 Obsidian 右侧视图');
    expect(design).toContain('当前不得显示可编辑对话框、发送、停止、模型选择');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain("调用 `workspace.getLeaf('tab')`");
    expect(adr).toContain('不建立公共模块注册器、动态加载器或数据协议');
  });

  it('Ardot v2 固定新建任务首位、运行置底、三行品牌、浅灰禁用态和社区首发门', async () => {
    const [agents, design, readme, designQa, adr, releaseGateAdr] = await Promise.all([
      readFile(path.join(repositoryRoot, 'AGENTS.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-003-ardot-ui-authority.md'),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-004-new-task-first-release-gate.md',
        ),
        'utf8',
      ),
    ]);
    const ardotUrl = 'https://ardot.tencent.com/file/718186366720195';

    expect(agents).toContain(ardotUrl);
    expect(agents).toContain('最新获用户批准版本，是用户审阅的产品 UI 界面真相');
    expect(agents).toContain('必须同步演进 Ardot');
    expect(agents).toContain('不显示“首发”“规划中”“尚未实现”等开发阶段、发布批次或治理审批文案');
    expect(agents).toContain('尚未开放但需要保留的导航项必须使用浅灰文字与图标');
    expect(agents).toContain('首个 Obsidian 社区插件发布功能固定为“新建任务”');
    expect(design).toContain(ardotUrl);
    expect(design).toContain('未批准草稿');
    expect(design).toContain('页面：`UI 真相 v2`（`12:1`）');
    expect(design).toContain('`00 v2 设计系统与交互状态`（`12:2`）');
    expect(design).toContain('`01 新建任务 宽屏浅色`（`12:41`）');
    expect(design).toContain('`02 运行 宽屏浅色`（`12:120`）');
    expect(design).toContain('`06 参考截图与 v2 对照 QA`（`12:530`）');
    expect(design).toContain('第一行 `DeepSeek`、第二行 `Harness`、第三行 `Workbench`');
    expect(design).toContain('产品界面不得展示开发阶段、发布门或治理审批');
    expect(design).toContain('文字与图标采用浅灰禁用态，不显示额外状态徽标');
    expect(design).toContain('首个 Obsidian 社区插件发布功能固定为“新建任务”');
    expect(design).toContain('当前运行代码仍使用 Lucide `bot`');
    expect(readme).toContain('当前运行代码尚未同步该图标和 v2 导航');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('当前批准基线为页面 `UI 真相 v2`（`12:1`）');
    expect(adr).toContain('同一 Ardot 项目持续演进');
    expect(releaseGateAdr).toContain('“新建任务”固定为 Workbench 内部导航第一个功能');
    expect(releaseGateAdr).toContain('原“概览”和“运行状态”合并为“运行”，固定在功能导航最后');
    expect(releaseGateAdr).toContain('发布门和实现差异只记录在治理文档、测试、CI 与验收证据中');
    expect(releaseGateAdr).toContain('当前状态必须标记为`仅设计已更新，运行代码未同步`');
    expect(designQa).toContain('Ardot UI 真相 v2');
    expect(designQa).toContain('Ardot 组件为 `12:555`');
    expect(designQa).toContain('各产品画板均不显示“首发”“规划中”“尚未实现”等开发或发布文案');
    expect(designQa.trimEnd()).toMatch(/Ardot v2 design-only final result: passed$/u);

    for (const asset of [
      'design-system.png',
      'new-task-wide-light.png',
      'run-wide-light.png',
      'new-task-with-quick-assistant.png',
      'new-task-wide-dark.png',
      'new-task-narrow-700.png',
      'comparison-reference-v2.png',
    ]) {
      const bytes = await readFile(
        path.join(repositoryRoot, 'docs', 'assets', 'design-qa', 'ardot-ui-truth-v2', asset),
      );
      expect(bytes.byteLength).toBeGreaterThan(1_000);
    }
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

  it('新建任务 v1 固定宿主边界、真实取消、最新预发布候选与只读自动演进', async () => {
    const [requirements, hostContract, assessment, roadmap, releaseStatus] = await Promise.all([
      readFile(path.join(repositoryRoot, 'docs', 'requirements', 'new-task-v1.md'), 'utf8'),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-005-new-task-v1-host-contract.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'p0-runtime-route-assessment.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'release', 'name-and-community-claim-status.md'),
        'utf8',
      ),
    ]);

    expect(requirements).toContain('v1 发布门必须真实实现“对话”和“任务执行”');
    expect(requirements).toContain('“代码协作”不属于当前社区首发门');
    expect(requirements).toContain('发送动作建立不可变上下文快照');
    expect(requirements).toContain('整个 Vault 不得成为 DSH 默认可写 `cwd`');
    expect(requirements).toContain('每个 turn 只能产生一个终态');
    expect(requirements).toContain('`failed(runtime_terminated)`');
    expect(requirements).toContain('当前核验到的正式 bridge 候选是 `0.1.1-rc.2`');
    expect(requirements).toContain('不表示 bridge 已实现或当前插件已支持');
    expect(requirements).toContain('插件自动安装或更新 DSH');
    expect(hostContract).toContain('状态：已接受');
    expect(hostContract).toContain('只读 `--version` 健康检查');
    expect(hostContract).toContain('当前代码仍只验证健康检查 `0.1.1-rc.1`');
    expect(assessment).toContain('正式 bridge 最新预发布策略');
    expect(assessment).toContain('待验证候选');
    expect(roadmap).toContain('监测 workflow 与正式 bridge 均未获实现批准');
    expect(releaseStatus).toContain('Release 成功不自动授权社区提交');
    expect(releaseStatus).toContain('只有社区目录接受并发布后');
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
