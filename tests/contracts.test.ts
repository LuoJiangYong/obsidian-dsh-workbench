import { createHash } from 'node:crypto';
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
    expect(readme).toContain('| 新建任务 | 宿主 UI、只读知识库、真实对话与 Vault 外任务链均已实现；Batch 10 专用 Vault 技术运行门与双平台 CI 已通过；用户已明确确认第一批开发目标完成，当前 v1 与 DSH `0.1.1-rc.2` 组合已获得产品支持 |');
    expect(readme).toContain('| 中央 Workbench 与当前内部导航 | 按 `2026-08-26` 用户直接反馈仅渲染“新建任务”和“运行”，未开放模块不进入插件导航；专用隔离 Vault 验收已通过 |');
    expect(readme).toContain('| 可选右侧任务环境 | 原“快速助手”已原位演进为默认关闭的原生 `ItemView`；专用 Vault 已验证打开/复用、公开事实投影、完整路径排除和关闭不影响中央会话 |');
    expect(readme).toContain('| ribbon 与中央标签页命令入口 | 已实现并通过本地测试、双平台 CI 与专用隔离 Vault 的加载、复用和禁用验收 |');
    expect(readme).toContain('| DSH 路径配置与健康检查 | 命令校验和进程边界已实现；目标统一为 `0.1.1-rc.2`，本地、双平台 CI 与专用隔离 Vault 读回均通过 |');
    expect(readme).toContain('用户在发送前确认后，插件才启动正式 bridge');
    expect(readme).toContain('当前健康检查与正式 bridge 统一精确支持 DSH `0.1.1-rc.2`');
    expect(readme).toContain('| DSH 会话、流式事件与取消 | 对话与任务链均已接入 Obsidian 宿主；专用 Vault 已验证成功、明确失败与恢复、真实文件变更/审核/撤销，以及禁用后受管进程从 `2` 归零 |');
    expect(readme).toContain('| Vault 读取与写入 | 仅用户显式选择的 Markdown 文件、文件夹当下展开的确定笔记集合或当前选区可进入只读上下文；该只读子集已通过专用 Vault 运行验收，写入、删除、移动、整库索引和隐式整库读取仍禁用 |');
    expect(readme).toContain('| Obsidian 社区提交 | 尚未进行 |');
    expect(readme).toContain('凡使用 `obsidian-trend-radar-evidence` 的 Obsidian 运行读回与截图均已撤回');
    expect(readme).toContain('用户于 `2026-08-31` 明确确认第一批开发目标完成');
    expect(readme).toContain('正式 bridge + 产品对话/任务组合推进到 `supported`');
    expect(readme).toContain('跨重启恢复仍属于下一批');
    expect(readme).toContain('- 不采集客户端遥测。');
  });

  it('G0-1、G0-2、R1 与 R1-M 候选状态一致且不越过生产迁移边界', async () => {
    const [
      design,
      designQa,
      requirements,
      runtimeAdr,
      ardotAdr,
      hostAdr,
      sessionAdr,
      protocol,
      matrix,
      r1Evidence,
      alpha3MigrationEvidence,
      ciRoadmap,
      codexAssessment,
      releaseStatus,
      implementationRoadmap,
    ] = await Promise.all([
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'requirements', 'new-task-v1.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-001-runtime-integration.md'),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-003-ardot-ui-authority.md'),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-005-new-task-v1-host-contract.md'),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-010-formal-conversation-and-task-environment.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'bridge-protocol-v1.md'),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'runtime-compatibility-matrix.md'),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'r1-dsh-alpha2-control-capability.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'dsh-alpha3-production-migration.md',
        ),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'design', 'codex-reference-ui-assessment.md'),
        'utf8',
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'release', 'name-and-community-claim-status.md'),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'implementation',
          'unified-workbench-roadmap.md',
        ),
        'utf8',
      ),
    ]);

    expect(design).toContain('用户已于 `2026-08-31` 明确确认第一批开发目标完成');
    expect(design).toContain('跨重启恢复和统一工作台后续能力尚未实现');
    expect(designQa).toContain('final Obsidian UI user acceptance: passed');
    expect(requirements).toContain('状态：已实现并验证');
    expect(requirements).toContain('当前 v1 与 DSH `0.1.1-rc.2` 组合进入产品支持');
    expect(runtimeAdr).toContain('当前 v1 与 rc.2 组合获得产品支持');
    expect(ardotAdr).toContain('第一批用户验收闭环；Ardot 仍只读');
    expect(hostAdr).toContain('当前 v1 组合推进到 `supported`');
    expect(sessionAdr).toContain('用户已于 `2026-08-31` 明确确认第一批开发目标完成');
    expect(protocol).toContain('明确延期或未授权：跨重启恢复属于下一批');
    expect(matrix).toContain('| `0.1.1-rc.2` | 正式 bridge + 产品对话/任务 | `supported`（当前 v1） |');
    expect(matrix).toContain('| `0.1.2-alpha.2` | 独立候选夹具 + 公开 session controller | `candidate_verified`（R1 证据完成，不晋级生产） |');
    expect(matrix).toContain('| `0.1.2-alpha.3` | 独立候选夹具 + 公开 session controller | `candidate_verified`（R1-M 第一步；尚未晋级生产） |');
    expect(r1Evidence).toContain('所有 215 个顶层 `@deepseek-ai/dsh*` 包都精确为 `0.1.2-alpha.2`');
    expect(r1Evidence).toContain('建议继续保留生产 `0.1.1-rc.2`');
    expect(r1Evidence).toContain('R2 也仍需新的明确批准');
    expect(alpha3MigrationEvidence).toContain('当前状态：`candidate_verified`；生产仍为 `0.1.1-rc.2`');
    expect(alpha3MigrationEvidence).toContain('alpha.3 删除的是可选 SQLite session persistence 后端');
    expect(ciRoadmap).toContain('状态：当前 v1 + rc.2 范围已通过');
    expect(ciRoadmap).toContain('发布资产验收、Release 与社区提交仍未完成或未授权');
    expect(ciRoadmap).toContain('npm run verify:isolated-vault');
    expect(ciRoadmap).toContain('入口默认且仅执行 dry-run');
    expect(ciRoadmap).toContain('npm run test:runtime:candidate');
    expect(codexAssessment).toContain('用户已于 `2026-08-31` 明确确认第一批开发目标完成');
    expect(releaseStatus).toContain('GitHub Release、发布资产验收和 Obsidian 社区提交仍未批准或执行');
    expect(implementationRoadmap).toContain('状态：G0-1、G0-2、R1 已完成；R1-M 已获批准并完成候选分步，生产仍为 rc.2；R2 及后续批次尚未获授权');
    expect(implementationRoadmap).toContain('权威配置来源固定为 Obsidian 桌面 Vault 注册表');
    expect(designQa).toContain('G0-2 dedicated Vault reproducible read-only preflight: passed');
    expect(designQa).toContain('R1 alpha.2 candidate evidence: passed without production switch');
    expect(designQa).toContain('Ardot 未修改、只读核对');
  });

  it('DESIGN 与 ADR 固定中央工作台、内部导航和可选任务环境边界', async () => {
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
    expect(design).toContain('### 3.3 可选右侧任务环境');
    expect(design).toContain('不随 Workbench 自动打开，重复开启复用同一右侧 leaf');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain("调用 `workspace.getLeaf('tab')`");
    expect(adr).toContain('不建立公共模块注册器、动态加载器或数据协议');
  });

  it('开发宪法固定原生能力优先、Claudian 对照与最小运行时接缝', async () => {
    const [agents, assessment, design] = await Promise.all([
      readFile(path.join(repositoryRoot, 'AGENTS.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'governance', 'development-constitution-assessment.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
    ]);

    expect(agents).toContain('先只读检查 Claudian 当时的公开源码和文档');
    expect(agents).toContain('DSH 已经可靠提供的能力，插件优先调用、编排或投影');
    expect(agents).toContain('为后续切换 PI、Codex 等同类运行时保留演进路径');
    expect(agents).toContain('不授权现在建立多运行时框架');
    expect(agents).toContain('不得把每个细分场景写成彼此独立的插件执行系统');
    expect(assessment).toContain('原生能力优先与供应商可替换边界');
    expect(assessment).toContain('DSH 仍是唯一生产路线');
    expect(design).toContain('只删除这一处文字');
    expect(design).toContain('保留标签页名称、鲸鱼图标、标签栏、返回/前进、更多菜单');
  });

  it('下一批契约固定统一运行、项目与最近、手动排序和运行规划', async () => {
    const [requirements, implementationRoadmap, design, readme, permissionAdr] = await Promise.all([
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'requirements',
          'unified-workbench-next-batch.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'implementation',
          'unified-workbench-roadmap.md',
        ),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-011-context-environment-and-permission-levels.md',
        ),
        'utf8',
      ),
    ]);

    expect(requirements).toContain('状态：已确认的未来实施输入，尚未批准开始代码实施');
    expect(requirements).toContain('上方产品功能导航');
    expect(requirements).toContain('下方项目与任务导航');
    expect(requirements).toContain('项目任务与“最近”互斥，不重复展示');
    expect(requirements).toContain('搜索已有项目、选择已有项目、新建项目');
    expect(requirements).toContain('项目不按活动时间自动排序');
    expect(requirements).toContain('用户可以手动排序项目，并可以置顶或取消置顶');
    expect(requirements).toContain('默认按最后活动时间倒序，最新活动任务在最前');
    expect(requirements).toContain('用户首次执行手动排序后');
    expect(requirements).toContain('`运行` 保留在上方产品功能导航');
    expect(requirements).toContain('项目归档、移除与任务归档、删除的准确语义');
    expect(requirements).toContain('统一工作台分批实施路线');
    expect(requirements).toContain('不自动批准任何产品代码批次');
    expect(implementationRoadmap).toContain('G0-1：第一批状态真相闭环');
    expect(implementationRoadmap).toContain('G0-2：隔离 Vault 可复现验收入口');
    expect(implementationRoadmap).toContain('R1：DSH 正式控制面兼容候选');
    expect(implementationRoadmap).toContain('R1-M：DSH alpha.3 生产运行时迁移门');
    expect(implementationRoadmap).toContain('任务归档、删除和恢复语义');
    expect(implementationRoadmap).toContain('R2 及后续产品批次仍需新的明确批准');
    expect(implementationRoadmap).toContain('Ardot 未修改、只读核对');
    expect(design).toContain('统一工作台下一批未来实施契约');
    expect(readme).toContain('统一工作台下一批未来实施契约');
    expect(readme).toContain('统一工作台分批实施路线');
    expect(permissionAdr).toContain('后续综合实施契约');
  });

  it('Codex 参考路线固定正式会话、原生右侧栏与 DSH 能力投影边界', async () => {
    const [assessment, design, roadmap, readme, adr] = await Promise.all([
      readFile(
        path.join(repositoryRoot, 'docs', 'design', 'codex-reference-ui-assessment.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-010-formal-conversation-and-task-environment.md',
        ),
        'utf8',
      ),
    ]);

    expect(assessment).toContain('Ardot 文件 `718186366720195`');
    expect(assessment).toContain('保持 AI 只读且未修改');
    expect(assessment).toContain('同一个 Workbench leaf 内切换为正式会话页');
    expect(assessment).toContain('右侧信息应使用 Obsidian 原生右侧 leaf，默认关闭且可选打开');
    expect(assessment).toContain('不显示私有推理');
    expect(assessment).toContain('不提供完全权限、跨会话永久授权或任意 Shell');
    expect(assessment).toContain('DSH 原生 session 保存；插件只在官方契约支持后建立最小 Vault 外索引');
    expect(assessment).toContain('Batch 8C');
    expect(assessment).toContain('Batch 8D');
    expect(assessment).toContain('Batch 9');
    expect(assessment).toContain('Batch 10');
    expect(assessment).toContain('精确 `700px` 容器无水平滚动');
    expect(design).toContain('### 4.2 正式会话页（已实现并通过 Batch 10 专用 Vault 技术运行门）');
    expect(design).toContain('开启页主标题与正式页会话标题互斥');
    expect(design).toContain('## 6.1 DSH 原生能力投影');
    expect(design).toContain('不提供完全权限、跨会话永久授权、任意 Shell');
    expect(roadmap).toContain('Batch 9 已接通同 leaf 正式会话');
    expect(roadmap).toContain('按需右侧任务环境由插件基线测试覆盖');
    expect(readme).toContain('Ardot 未修改');
    expect(readme).toContain('Codex 参考界面评估与正式会话路线');
    expect(readme).toContain('正式会话与任务环境 ADR');
    expect(adr).toContain('状态：已接受并完成实现、Batch 9–10 远端 CI 与 Batch 10 专用 Vault 技术运行门');
    expect(adr).toContain('插件重载后投影清空，不显示“最近任务”');
    expect(adr).toContain('当前协议未公开具体标识');
  });

  it('Ardot v2 固定用户审阅真相、AI 只读边界、插件反馈差异和社区首发门', async () => {
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
    expect(agents).toContain('Ardot 是用户审阅和完善 UI 的专属界面，AI 默认只读');
    expect(agents).toContain('除非用户对当前批次明确要求修改 Ardot');
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
    expect(design).toContain('未实现模块不在插件导航中渲染');
    expect(design).toContain('模式分段控件在插件中使用左右半圆胶囊边界');
    expect(design).toContain('首个 Obsidian 社区插件发布功能固定为“新建任务”');
    expect(design).toContain('当前实现已注册同一鲸鱼 path 几何');
    expect(readme).toContain('Obsidian ribbon、活动标签页、Workbench 左上角和任务环境继续使用同一 DeepSeek 鲸鱼几何');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('当前批准基线为页面 `UI 真相 v2`（`12:1`）');
    expect(adr).toContain('同一 Ardot 项目持续演进');
    expect(releaseGateAdr).toContain('“新建任务”固定为 Workbench 内部导航第一个功能');
    expect(releaseGateAdr).toContain('原“概览”和“运行状态”合并为“运行”，固定在功能导航最后');
    expect(releaseGateAdr).toContain('发布门和实现差异只记录在治理文档、测试、CI 与验收证据中');
    expect(releaseGateAdr).toContain('当前源码与测试已同步“新建任务 / 运行”导航');
    expect(designQa).toContain('Ardot UI 真相 v2');
    expect(designQa).toContain('Ardot 组件为 `12:555`');
    expect(designQa).toContain('各产品画板均不显示“首发”“规划中”“尚未实现”等开发或发布文案');
    expect(designQa).toContain('Ardot v2 design-only final result: passed');
    expect(designQa).toContain('Batch 5A dedicated Vault remediation result: passed; final Obsidian UI user acceptance: pending');

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

  it('Batch 5A UI 基线、Batch 7 对话与 Batch 9 正式会话各自保持单一职责', async () => {
    const [main, workbench, quickAssistant, newTaskState, conversation, styles, designQa]
      = await Promise.all([
      readFile(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'workbench-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'quick-assistant-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-state.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-conversation.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'styles.css'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
    ]);

    expect(main).toContain('addIcon(');
    expect(main).toContain('transform="scale(2)"');
    expect(workbench.indexOf("id: 'new-task'"))
      .toBeLessThan(workbench.indexOf("id: 'run'"));
    expect(workbench).not.toMatch(/id: '(?:projects|integrations|automation|library|domain-workbenches)'/u);
    expect(workbench).toContain("private activeSection: WorkbenchSectionId = 'new-task'");
    expect(workbench).toContain("attr: { type: 'button', 'aria-disabled': 'true' }");
    expect(workbench).toContain('disabledModeEl.disabled = true');
    expect(workbench).toContain('canSubmitNewTask(this.newTaskState, phase)');
    expect(workbench).not.toMatch(/text:\s*['`](?:首发|规划中|尚未实现)/u);
    expect(main).toContain("name: '打开任务环境'");
    expect(quickAssistant).toContain("return '任务环境'");
    expect(quickAssistant).toContain('conversationHost.subscribe');
    expect(quickAssistant).toContain('当前协议未公开具体标识');
    expect(quickAssistant).not.toContain('快捷提问');
    expect(newTaskState).toContain("mode: 'chat'");
    expect(newTaskState).toContain("'awaiting_permission'");
    expect(newTaskState).not.toContain('reviewStatus');
    expect(conversation).toContain("runtimeStatus: 'disconnected'");
    expect(conversation).toContain('readonly session: NewTaskConversationSession | null');
    expect(conversation).toContain('async startNewTask(): Promise<boolean>');
    expect(conversation).toContain('session_workspace_locked');
    expect(conversation).toContain('NewTaskConversationController');
    expect(workbench).toContain('NewTaskReviewModal');
    expect(workbench).toContain('renderFormalConversation');
    expect(workbench).toContain("text: '任务环境'");
    expect(workbench).toContain('NewTaskResetModal');
    expect(workbench).toContain("'aria-busy': isConversationBusy(snapshot.phase) ? 'true' : 'false'");
    expect(styles).toContain('@container dsh-workbench-view (max-width: 760px)');
    expect(styles).toContain('.dsh-workbench-sidebar {');
    expect(styles).toContain('border-radius: 999px;');
    expect(styles).toContain('.dsh-workbench-view button.dsh-new-task-mode__button:first-child');
    expect(styles).toContain('.dsh-workbench-view button.dsh-new-task-mode__button:last-child');
    expect(styles).toContain('var(--background-secondary) 58%');
    expect(styles).toContain('.dsh-new-task-composer.is-compact');
    expect(styles).toContain('.dsh-task-environment__section');
    expect(styles).not.toContain('min-height: 258px');
    expect(styles).not.toContain('min-height: 175px');
    expect(designQa).toContain('D:\\codex workspace\\_test-vaults\\obsidian-dsh-workbench-evidence');
    expect(designQa).toContain('原 Batch 5A 运行截图和 DOM 读回使用了');
    expect(designQa).toContain('已撤回');
    expect(designQa).toContain('c8f6922b1a44e5bc0fdb325fce183e95b85320d1');
    expect(designQa).toContain('CI run 32919119819');
    expect(designQa).toContain('Ubuntu check `98028935782`、Windows check `98028935888`');
    expect(designQa).toContain('a41c93b43245c9b1cfb84c4adb243ef4217c8253');
    expect(designQa).toContain('CI run 32963736114');
    expect(designQa).toContain('Ubuntu check `98161570546` 与 Windows check `98161570396`');
    expect(designQa).toContain('`clientWidth = 700`、`scrollWidth = 700`');
    expect(designQa).toContain('Workbench、快速助手及对应 leaf 均为 `0`');

    for (const asset of [
      {
        bytes: 165_779,
        name: 'new-task-wide-light.png',
        sha256: '6F79863879C0AB0E7A34B46CA54916802BDE9D3B5039EAF488AC5A413F2AD231',
      },
      {
        bytes: 243_563,
        name: 'new-task-with-quick-assistant.png',
        sha256: '6575F08DFC2EE4E162CDCCB9A6A5FA08B56620C85CAEE88967B1EF3F46071F15',
      },
      {
        bytes: 206_174,
        name: 'run-wide-light.png',
        sha256: 'E85BB8DC0EBB197E5F5E8B6C5B647BFC7A667CB7E45B6D1D7B30AFCC39278242',
      },
      {
        bytes: 166_010,
        name: 'new-task-wide-dark.png',
        sha256: 'A86C987D3E58CC6A392BFBB8E7A089735F8140550C44C74C713754543533A336',
      },
      {
        bytes: 145_406,
        name: 'new-task-narrow-700.png',
        sha256: '80014D474DFD159FE6D814D9DB76C4EF486782646AF31976F96372A1F25646B2',
      },
    ]) {
      const bytes = await readFile(
        path.join(repositoryRoot, 'docs', 'assets', 'design-qa', 'new-task-host-ui', asset.name),
      );
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(asset.sha256);
    }
  });

  it('Batch 6 固定显式只读上下文、不可变快照与宿主边界', async () => {
    const [
      context,
      host,
      workbench,
      state,
      styles,
      readme,
      design,
      designQa,
      hostContract,
      roadmap,
    ] = await Promise.all([
      readFile(path.join(repositoryRoot, 'src', 'new-task-context.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'obsidian-context-host.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'workbench-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-state.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'styles.css'), 'utf8'),
      readFile(path.join(repositoryRoot, 'README.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'docs', 'architecture', 'ADR-005-new-task-v1-host-contract.md'),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
    ]);

    expect(context).toContain('MAX_NEW_TASK_CONTEXT_ITEMS = 10');
    expect(context).toContain('MAX_NEW_TASK_CONTEXT_ITEM_BYTES = 96 * 1024');
    expect(context).toContain('MAX_NEW_TASK_CONTEXT_TOTAL_BYTES = 192 * 1024');
    expect(context).toContain('createNewTaskContextSnapshot');
    expect(context).toContain('addNewTaskContextSelections');
    expect(context).toContain("'context_missing'");
    expect(context).toContain("'context_binary'");
    expect(context).toContain("'context_total_too_large'");
    expect(host).toContain('getActiveFile()');
    expect(host).toContain("getLeavesOfType('markdown')");
    expect(host).toContain('getMarkdownFiles()');
    expect(host).toContain('getAllLoadedFiles()');
    expect(host).toContain('VaultFolderSuggestModal');
    expect(host).toContain("this.setPlaceholder('选择一个 Vault 文件夹')");
    expect(host).toContain('vault.cachedRead(file)');
    expect(host).not.toMatch(/vault\.(?:create|delete|modify|rename)/u);
    expect(workbench).toContain("text: '已选笔记'");
    expect(workbench).toContain("text: '选择知识库'");
    expect(workbench).toContain("return '发送时读取最新内容'");
    expect(workbench).toContain("type: 'context-removed'");
    expect(state).toContain("type: 'contexts-added'");
    expect(styles).toContain('.dsh-new-task-context__item');
    expect(styles).toMatch(/\.dsh-context-picker button\.dsh-context-picker__choice \{[\s\S]*?box-shadow: none;/u);
    expect(readme).toContain('## Batch 6：只读知识库（实现与运行门已通过）');
    expect(design).toContain('宿主 UI、只读知识库、真实对话、Vault 外任务、文件审核/撤销、同 leaf 正式会话与原生任务环境均已实现');
    expect(hostContract).toContain('最多 `10` 项、单项 `96 KiB`、合计 `192 KiB`');
    expect(roadmap).toContain('Batch 6 已实现只读知识库纯契约');
    expect(designQa).toContain('CI run 33031107880');
    expect(designQa).toContain('Ubuntu check `98383584575`、Windows check `98383584694`');
    expect(designQa).toContain('已选列表仍保持 `4` 项');
    expect(designQa).toContain('SHA-256 在运行前后均为 `97ADAA09E558EF57745C4304E12D67DD0B2789F31AAA56D16E10943FAE67C319`');
    expect(designQa).toContain('Batch 6 implementation and dedicated Vault result: passed; final Obsidian UI user acceptance: pending');

    for (const asset of [
      {
        bytes: 286_505,
        name: 'context-picker-wide-light.png',
        sha256: '86E19C947D11F84193707915AF94C5B4ACBFB0E2CE01C72DF0A1A3772BDD3C62',
      },
      {
        bytes: 248_542,
        name: 'context-selected-wide-light.png',
        sha256: '411E8E3FFF133DDA8F2C41D98D0977667BB1C9F3C25199F1A6A13FEFA747B156',
      },
      {
        bytes: 272_846,
        name: 'folder-picker-open-wide-light.png',
        sha256: 'CF6A3345AB0FEC511AFA283546BCF4447C546A978B23F1E08DAE9D328F0D4873',
      },
      {
        bytes: 257_122,
        name: 'folder-selected-final-wide-light.png',
        sha256: '19C5D6E4A41FDD9F28C73DE54935D7B51756FEA2FDA4AB4FB998B26EAA74C6BB',
      },
      {
        bytes: 262_014,
        name: 'context-with-quick-assistant-visible.png',
        sha256: '1622CEED41093903C31E045705579253AEA868B7C3713DD9A9FAAA203CCC2F13',
      },
      {
        bytes: 410_474,
        name: 'context-selected-wide-dark-visible.png',
        sha256: '0DCA39B12CBED741D5F441DDE0EB3A1B51E7279EB8EB53EACFEC76B380B54115',
      },
      {
        bytes: 250_733,
        name: 'context-selected-narrow-700-final.png',
        sha256: '4E4A78E3E414A4F1CFDE65364CE5E74E61207E565735BB2317807C83E35F86AA',
      },
      {
        bytes: 246_886,
        name: 'run-readonly-context-wide-light-final.png',
        sha256: 'AC0F4BD0B9B6585685FF016FBC716A2FD2E8FE03DE04E5AC1556DFBDAE3FD924',
      },
    ]) {
      const bytes = await readFile(
        path.join(repositoryRoot, 'docs', 'assets', 'design-qa', 'new-task-context', asset.name),
      );
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(asset.sha256);
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

  it('新建任务 v1 固定宿主边界、真实取消、运行数据与只读自动演进', async () => {
    const [requirements, hostContract, storageContract, taskLedgerContract, assessment, roadmap, releaseStatus, designQa]
      = await Promise.all([
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
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-006-conversation-runtime-storage.md',
        ),
        'utf8',
      ),
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-007-task-workspace-ledger.md',
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
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
    ]);

    expect(requirements).toContain('v1 发布门必须真实实现“对话”和“任务执行”');
    expect(requirements).toContain('“代码协作”不属于当前社区首发门');
    expect(requirements).toContain('发送动作建立不可变上下文快照');
    expect(requirements).toContain('整个 Vault 不得成为 DSH 默认可写 `cwd`');
    expect(requirements).toContain('每个 turn 只能产生一个终态');
    expect(requirements).toContain('`failed(runtime_terminated)`');
    expect(requirements).toContain('当前核验到的正式 bridge 目标是 `0.1.1-rc.2`');
    expect(requirements).toContain('Batch 6/7 已把只读知识库与不可变快照接入产品发送链');
    expect(requirements).toContain('`obsidian:chat-boundary` 系统提示三层拒绝全部工具');
    expect(requirements).toContain('任务结束后的已编辑文件');
    expect(requirements).toContain('插件自动安装或更新 DSH');
    expect(hostContract).toContain('状态：已接受');
    expect(hostContract).toContain('只读 `--version` 健康检查');
    expect(hostContract).toContain('当前正式 bridge 与健康检查统一精确锁定 DSH `0.1.1-rc.2`');
    expect(storageContract).toContain('Claudian `15b78af785cda04fccc96f4effcfae6367f9be65`');
    expect(storageContract).toContain('不复制 `.claudian/sessions`');
    expect(storageContract).toContain('操作系统应用数据目录下按 Vault 绝对路径 SHA-256');
    expect(storageContract).toContain('不得把 DSML/工具调用标记当作回答输出');
    expect(taskLedgerContract).toContain('状态：已接受');
    expect(taskLedgerContract).toContain('每个工作区最多 `20` 个账本');
    expect(taskLedgerContract).toContain('账本有效期 `7` 天');
    expect(taskLedgerContract).toContain('当前文件任一 SHA-256 与 turn 结束快照不一致时，整个撤销不写任何文件');
    expect(taskLedgerContract).toContain('Ardot 文件 `718186366720195`');
    expect(assessment).toContain('正式 bridge 最新预发布策略');
    expect(assessment).toContain('待验证候选');
    expect(roadmap).toContain('监测 workflow 尚未实现');
    expect(roadmap).toContain('CI run 33132970545');
    expect(designQa).toContain('Batch 7 implementation and technical runtime: passed');
    expect(designQa).toContain('Windows check `98726441325` 与 Ubuntu check `98726441475`');
    expect(releaseStatus).toContain('Release 成功不自动授权社区提交');
    expect(releaseStatus).toContain('只有社区目录接受并发布后');

    for (const asset of [
      {
        bytes: 136_584,
        name: '01b-light-idle-compact.png',
        sha256: 'EEF9C9A6A52223771D4FFCC1C89979D97247C35EEFFDA9734BDAE360D537C575',
      },
      {
        bytes: 182_814,
        name: '03-light-completed-compact.png',
        sha256: '5A5D2CBFB82AE9ADCBF2A61F574B37566DA3E16DEA211B79862707B70BC47BC6',
      },
      {
        bytes: 214_009,
        name: '05-light-cancelled.png',
        sha256: 'BF4CEA9C21A9BDF0268EF3ACB8933B9B7AE527CAC4023DAFA7CB6A6EE9DAFB65',
      },
      {
        bytes: 136_357,
        name: '06c-dark-700px-compact.png',
        sha256: '56027D0E0FB0089F89D03CA6D95513579348CB0BA99B69625698982ED619DF5A',
      },
    ]) {
      const bytes = await readFile(
        path.join(
          repositoryRoot,
          'docs',
          'assets',
          'design-qa',
          'new-task-conversation',
          asset.name,
        ),
      );
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(asset.sha256);
    }
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
    expect(matrix).toContain('| `0.1.1-rc.2` | 健康检查 | 已实现并通过本地、双平台 CI 与专用 Vault 读回 |');
    expect(matrix).toContain('| `0.1.1-rc.2` | 正式 bridge + 产品对话/任务 | `supported`（当前 v1） |');
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
    expect(readme).toContain('| 正式 bridge、协议 v1 与 NDJSON | 已实现；DSH `0.1.1-rc.2` 已真实加载并完成握手、Agent session、mid-turn cancel 与正常关闭；Batch 7 已由对话发送链启动，Batch 8 已验证文件工具限定的任务 session |');
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
      artifactSha256: '3342ef13d3f68b65f3336e97257f63fc585ca2a8708bd85759100d28ac9c945c',
    });
    expect(manifest.dshIntegrity).toMatch(/^sha512-/u);
    expect(fixture.dependencies['@deepseek-ai/dsh']).toBe('0.1.1-rc.2');
    expect(protocol).toContain('正式 bridge、NDJSON、受管进程');
    expect(protocol).toContain('CI run 32717711862');
    expect(protocol).toContain('Ubuntu check `97402381390`、Windows check `97402381253`');
    expect(protocol).toContain('两个原始 annotations 数组均为 `[]`');
    expect(matrix).toContain('`supported`（当前 v1）');
    expect(roadmap).toContain('环回模型请求后的 mid-turn cancel');
    expect(roadmap).toContain('CI `32717476733` 在干净检出中揭示进程单测依赖未跟踪构建产物');
    expect(roadmap).toContain('最小修复 `a719b03c88807740581a2a0327a462fa5e5b7664`');
    expect(runtimeTest).toContain('真实加载 artifact');
    expect(runtimeTest).toContain('payload: { outcome: \'cancelled\' }');
  });

  it('Batch 8C 固定 Vault 外工作区选择、任务控制器与真实变更摘要边界', async () => {
    const [adr, host, controller, main, view, design, roadmap] = await Promise.all([
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-008-task-execution-controller.md',
        ),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'src', 'task-workspace-host.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-conversation.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'main.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'workbench-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'ci-cd-roadmap.md'), 'utf8'),
    ]);

    expect(adr).toContain('状态：已接受，Batch 8C 已实现');
    expect(adr).toContain('普通界面与审阅界面只显示目录名称');
    expect(adr).toContain('workspace-write + ask');
    expect(adr).toContain('无法核对变更时不得显示“任务完成”');
    expect(adr).toContain('Ardot 未修改、只读核对');
    expect(adr).toContain('91b21345a52657520633475dfc9e86db7b720e65');
    expect(adr).toContain('CI run 33188573187');
    expect(adr).toContain('Ubuntu check `98907874384` 与 Windows check `98907874519`');
    expect(adr).toContain('两个原始 annotations 数组均为 `[]`');
    expect(host).toContain("properties: ['openDirectory']");
    expect(host).toContain('validateWorkspace(selectedPath)');
    expect(controller).toContain('taskLedger.beginTurn');
    expect(controller).toContain('finishTaskAfterConnectionFailure');
    expect(main).toContain("permissionMode: input.mode === 'task' ? 'workspace-write' : 'read-only'");
    expect(main).toContain('workingDirectory');
    expect(view).toContain('选择工作区');
    expect(view).toContain('文件工具逐次确认');
    expect(view).toContain("${result.undone ? '已撤销' : '已编辑'} ${String(result.changes.length)} 个文件");
    expect(design).toContain('任务执行已接通单一 Vault 外工作区');
    expect(roadmap).toContain('Batch 8C 已接通');
    expect(roadmap).toContain('CI run 33188573187');
  });

  it('Batch 8D 固定真实文件卡、原生菜单、审核与全量安全撤销边界', async () => {
    const [adr, fileActions, controller, view, styles, requirements, design, designQa] = await Promise.all([
      readFile(
        path.join(
          repositoryRoot,
          'docs',
          'architecture',
          'ADR-009-task-change-review-and-undo-ui.md',
        ),
        'utf8',
      ),
      readFile(path.join(repositoryRoot, 'src', 'task-workspace-file-actions.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'new-task-conversation.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'src', 'workbench-view.ts'), 'utf8'),
      readFile(path.join(repositoryRoot, 'styles.css'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docs', 'requirements', 'new-task-v1.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'DESIGN.md'), 'utf8'),
      readFile(path.join(repositoryRoot, 'design-qa.md'), 'utf8'),
    ]);

    expect(adr).toContain('状态：已接受，Batch 8D 已实现');
    expect(adr).toContain('Ardot 未修改、只读核对');
    expect(adr).toContain('默认展示三个文件');
    expect(adr).toContain('任一不匹配时零写入');
    expect(adr).toContain('本批不加入“在 VS Code 中打开”');
    expect(adr).toContain('本批也不加入“另存为”');
    expect(fileActions).toContain('validateWorkspace(workspace.path)');
    expect(fileActions).toContain('file_action_not_text');
    expect(fileActions).toContain('file_action_path_escape');
    expect(controller).toContain('undoTaskTurn(turnId: string)');
    expect(controller).toContain('taskTurns: this.snapshot.taskTurns.map');
    expect(view).toContain('DEFAULT_VISIBLE_TASK_FILES = 3');
    expect(view).toContain("const menu = new Menu()");
    expect(view).toContain("this.options.conversationHost.undoTaskTurn(result.turnId)");
    expect(view).toContain('任何文件在任务结束后又有变化时，整个撤销都不会写入');
    expect(styles).toContain('.dsh-task-result__files');
    expect(styles).toContain('box-shadow: none');
    expect(requirements).toContain('用户明确请求后复制完整路径');
    expect(requirements).toContain('不加入“另存为”');
    expect(design).toContain('Batch 8C/8D 接通单一 Vault 外工作区、任务控制器、逐请求权限、真实文件卡');
    expect(designQa).toContain('Batch 8D implementation and remote CI gate: passed');
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
