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

  it('README 如实声明非官方身份、正式 bridge 与宿主 UI 边界', async () => {
    const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');

    expect(readme).toContain('Unofficial community integration for DeepSeek Harness.');
    expect(readme).toContain('| 新建任务 | Ardot `v2` 宿主 UI 与确定性状态骨架已实现并通过单元测试；真实发送、对话、上下文和任务执行尚未接通 |');
    expect(readme).toContain('| 中央 Workbench 与当前内部导航 | Ardot `v2` 导航已实现：新建任务首位、运行置底、五个中间入口真实禁用；Batch 5A 隔离 Vault 运行验收已通过 |');
    expect(readme).toContain('| 可选右侧快速助手容器 | Ardot `v2` 宿主 UI 已实现；显示健康、上下文空态和两个真实禁用的快捷提问，不承担主对话 |');
    expect(readme).toContain('| DSH 路径配置与健康检查 | 已实现；只读检查已通过本地测试和隔离 Vault 运行验收 |');
    expect(readme).toContain('只有用户手动点击“检查 DSH”时才启动外部子进程');
    expect(readme).toContain('当前健康检查精确支持 DSH `0.1.1-rc.1`');
    expect(readme).toContain('| DSH 会话、流式事件与取消 | bridge 内部路径已实现并通过本地真实运行验收；Obsidian 宿主入口已实现，但模型调用链、上下文与任务执行尚未接通 |');
    expect(readme).toContain('| Vault 读取与写入 | 未启用 |');
    expect(readme).toContain('| Obsidian 社区提交 | 尚未进行 |');
    expect(readme).toContain('宿主 UI 已同步，真实模型连接和最终用户 UI 验收尚未完成');
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
    expect(design).toContain('导航首位固定为“新建任务”');
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
    expect(design).toContain('当前实现已注册同一鲸鱼 path 几何');
    expect(readme).toContain('Obsidian ribbon、活动标签页、Workbench 左上角和快速助手已使用同一 DeepSeek 鲸鱼几何');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('当前批准基线为页面 `UI 真相 v2`（`12:1`）');
    expect(adr).toContain('同一 Ardot 项目持续演进');
    expect(releaseGateAdr).toContain('“新建任务”固定为 Workbench 内部导航第一个功能');
    expect(releaseGateAdr).toContain('原“概览”和“运行状态”合并为“运行”，固定在功能导航最后');
    expect(releaseGateAdr).toContain('发布门和实现差异只记录在治理文档、测试、CI 与验收证据中');
    expect(releaseGateAdr).toContain('当前源码与单元测试已同步新导航、新建任务宿主页面、确定性状态骨架和快速助手');
    expect(designQa).toContain('Ardot UI 真相 v2');
    expect(designQa).toContain('Ardot 组件为 `12:555`');
    expect(designQa).toContain('各产品画板均不显示“首发”“规划中”“尚未实现”等开发或发布文案');
    expect(designQa).toContain('Ardot v2 design-only final result: passed');
    expect(designQa.trimEnd()).toMatch(/Batch 5A host UI implementation result: passed; final Obsidian UI user acceptance: pending$/u);

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

  it('Batch 5A 固定新建任务宿主 UI、禁用边界与隔离 Vault 证据', async () => {
    const [main, workbench, quickAssistant, newTaskState, styles, designQa] = await Promise.all([
      readFile(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'workbench-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'quick-assistant-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-state.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'styles.css'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
    ]);

    expect(main).toContain('addIcon(');
    expect(main).toContain('transform="scale(2)"');
    expect(workbench.indexOf("id: 'new-task'"))
      .toBeLessThan(workbench.indexOf("id: 'projects'"));
    expect(workbench.indexOf("id: 'domain-workbenches'"))
      .toBeLessThan(workbench.indexOf("id: 'run'"));
    expect(workbench).toContain("private activeSection: WorkbenchSectionId = 'new-task'");
    expect(workbench).toContain("buttonEl.setAttr('aria-disabled', 'true')");
    expect(workbench).toContain('canSubmitNewTask(this.newTaskState)');
    expect(workbench).not.toMatch(/text:\s*['`](?:首发|规划中|尚未实现)/u);
    expect(quickAssistant).toContain("promptEl.disabled = true");
    expect(quickAssistant).toContain('新建任务是主对话入口');
    expect(newTaskState).toContain("mode: 'chat'");
    expect(newTaskState).toContain("runtimeStatus: 'disconnected'");
    expect(newTaskState).toContain("reviewStatus: 'pending'");
    expect(newTaskState).toContain("'awaiting_permission'");
    expect(styles).toContain('@container dsh-workbench-view (max-width: 760px)');
    expect(styles).toContain('.dsh-workbench-sidebar {');
    expect(designQa).toContain('clientWidth = 700`、`scrollWidth = 700');
    expect(designQa).toContain('受管 `obsidian-bridge.mjs` Node 进程均为 `0`');
    expect(designQa).toContain('c8f6922b1a44e5bc0fdb325fce183e95b85320d1');
    expect(designQa).toContain('CI run 32919119819');
    expect(designQa).toContain('Ubuntu check `98028935782`、Windows check `98028935888`');

    for (const asset of [
      'new-task-wide-light.png',
      'new-task-with-quick-assistant.png',
      'run-wide-light.png',
      'new-task-wide-dark.png',
      'new-task-narrow-700.png',
    ]) {
      const bytes = await readFile(
        path.join(repositoryRoot, 'docs', 'assets', 'design-qa', 'new-task-host-ui', asset),
      );
      expect(bytes.byteLength).toBeGreaterThan(100_000);
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
    expect(requirements).toContain('当前核验到的正式 bridge 目标是 `0.1.1-rc.2`');
    expect(requirements).toContain('当前产品 UI 尚未启动该路径');
    expect(requirements).toContain('插件自动安装或更新 DSH');
    expect(hostContract).toContain('状态：已接受');
    expect(hostContract).toContain('只读 `--version` 健康检查');
    expect(hostContract).toContain('当前正式 bridge 精确锁定 DSH `0.1.1-rc.2`');
    expect(assessment).toContain('正式 bridge 最新预发布策略');
    expect(assessment).toContain('待验证候选');
    expect(roadmap).toContain('监测 workflow 尚未实现');
    expect(releaseStatus).toContain('Release 成功不自动授权社区提交');
    expect(releaseStatus).toContain('只有社区目录接受并发布后');
  });

  it('Batch 2 固定 rc.2 官方能力证据、兼容矩阵与生产未通过边界', async () => {
    const [spike, matrix, assessment, roadmap] = await Promise.all([
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'batch-2-bridge-capability-spike.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'runtime-compatibility-matrix.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'p0-runtime-route-assessment.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
    ]);

    expect(spike).toContain('上游 tag：`dsh-v0.1.1-rc.2`');
    expect(spike).toContain('`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`');
    expect(spike).toContain('`ctx.agents.create`');
    expect(spike).toContain('`agent.cancel({ kind: \'user\' })`');
    expect(spike).toContain('`agent.whenIdle()`');
    expect(spike).toContain('`approval/request`');
    expect(spike).toContain('源码能力已验证');
    expect(spike).toContain('Windows 真实 rc.2 运行未验证');
    expect(spike).toContain('Batch 2 结论：协议可行，生产兼容未通过');
    expect(spike).toContain('`d456a807215775e16da97ad60e388be2925249c2`');
    expect(spike).toContain('CI run 32708553927');
    expect(spike).toContain('原始 annotations API 后数组长度也均为 `0`');
    expect(matrix).toContain('| `0.1.1-rc.1` | 健康检查 | 已实现并验证 |');
    expect(matrix).toContain('| `0.1.1-rc.2` | 正式 bridge | `windows_runtime_passed`；尚未 `supported` |');
    expect(matrix).toContain('新版本只产生“待验证候选”');
    expect(matrix).toContain('不得自动安装或更新用户 DSH');
    expect(matrix).toContain('不得自动合并、Release 或提交社区目录');
    expect(assessment).toContain('Batch 2 已把该 API 从 P0 推断推进为固定 tag 源码证据');
    expect(roadmap).toContain('Batch 2 已建立 rc.2 固定 tag 的源码能力证据与兼容矩阵');
    expect(roadmap).toContain('不证明 rc.2 Windows 真实运行、正式握手或进程清理通过');
    expect(roadmap).toContain('CI run 32708553927');
  });

  it('Batch 3 固定 bridge 协议 v1 与假 bridge 的能力边界', async () => {
    const [protocol, client, tests, roadmap, readme] = await Promise.all([
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'bridge-protocol-v1.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'src', 'bridge-protocol-client.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'tests', 'bridge-protocol.test.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
    ]);

    expect(protocol).toContain('协议版本：`1`');
    expect(protocol).toContain('`seq` 是 bridge 为每个 session 生成的连续协议序号');
    expect(protocol).toContain('只有显式 `ignorable: true` 的未知事件');
    expect(protocol).toContain('`turn/cancel` 的 `{ accepted: true }` 只表示 bridge 已接收请求');
    expect(protocol).toContain('随后 transport EOF 才进入 `closed`');
    expect(protocol).toContain('Batch 4 最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664`');
    expect(client).toContain("'handshake_mismatch'");
    expect(client).toContain("'event_sequence'");
    expect(tests).toContain('bridge 协议 v1 与假 bridge');
    expect(tests).toContain('未知 ignorable 事件只推进 seq');
    expect(tests).toContain('只有取消终态才建立 cancelled');
    expect(roadmap).toContain('Batch 3 已实现 bridge 协议 v1');
    expect(roadmap).toContain('39023169811fc591be5fe33fde05662fbbc9657e');
    expect(roadmap).toContain('CI run 32711052033');
    expect(readme).toContain('| 正式 bridge、协议 v1 与 NDJSON | 已实现；本地与 Windows CI 已由 DSH `0.1.1-rc.2` 真实加载');
  });

  it('Batch 4 固定正式 bridge artifact、rc.2 夹具与 Windows 运行边界', async () => {
    const [manifest, fixture, protocol, matrix, roadmap, runtimeTest] = await Promise.all([
      readJson<{
        artifactSha256: string;
        bridgeVersion: string;
        dshIntegrity: string;
        dshVersion: string;
        protocolVersion: string;
      }>('bridge-build-manifest.json'),
      readJson<{ dependencies: Record<string, string> }>('tests/runtime-fixture/package.json'),
      readFile(path.join(repositoryRoot, 'docs', 'architecture', 'bridge-protocol-v1.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'architecture', 'runtime-compatibility-matrix.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'tests', 'real-dsh-bridge.test.ts'), 'utf8'),
    ]);

    expect(manifest).toMatchObject({
      bridgeVersion: '0.1.0',
      protocolVersion: '1',
      dshVersion: '0.1.1-rc.2',
      artifactSha256: '1cf83b3e977ed5b5da6ca5c59a5d42ceb70d67e475ce3b8dec0279a5b27139d6',
    });
    expect(manifest.dshIntegrity).toMatch(/^sha512-/u);
    expect(fixture.dependencies['@deepseek-ai/dsh']).toBe('0.1.1-rc.2');
    expect(protocol).toContain('正式 bridge、NDJSON、受管进程');
    expect(protocol).toContain('CI run 32717711862');
    expect(protocol).toContain('Ubuntu check `97402381390`、Windows check `97402381253`');
    expect(protocol).toContain('两个原始 annotations 数组均为 `[]`');
    expect(matrix).toContain('`windows_runtime_passed`；尚未 `supported`');
    expect(roadmap).toContain('环回模型请求后的 mid-turn cancel');
    expect(roadmap).toContain('CI `32717476733` 在干净检出中揭示进程单测依赖未跟踪构建产物');
    expect(roadmap).toContain('最小修复 `a719b03c88807740581a2a0327a462fa5e5b7664`');
    expect(runtimeTest).toContain('真实加载 artifact');
    expect(runtimeTest).toContain('payload: { outcome: \'cancelled\' }');
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
