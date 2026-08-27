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
    expect(readme).toContain('| 新建任务 | 宿主 UI、只读知识库与不可变快照已完成 Batch 6 验收；Batch 7 已实现只读真实发送、发送前审阅、流式回复、停止和错误终态，正在等待远端 CI 与专用隔离 Vault 运行验收；任务执行尚未接通 |');
    expect(readme).toContain('| 中央 Workbench 与当前内部导航 | 按 `2026-08-26` 用户直接反馈仅渲染“新建任务”和“运行”，未开放模块不进入插件导航；专用隔离 Vault 验收已通过 |');
    expect(readme).toContain('| 可选右侧快速助手容器 | Ardot `v2` 宿主 UI 已实现；当前显示健康、Workbench 已选笔记摘要或真实空态，两个快捷提问保持禁用，不承担主对话；Batch 6 专用 Vault 运行验收已通过 |');
    expect(readme).toContain('| ribbon 与中央标签页命令入口 | 已实现并通过本地测试、双平台 CI 与专用隔离 Vault 的加载、复用和禁用验收 |');
    expect(readme).toContain('| DSH 路径配置与健康检查 | 命令校验和进程边界已实现；目标已统一为 `0.1.1-rc.2` 并通过本地测试，正在等待本批双平台 CI 与专用隔离 Vault 读回 |');
    expect(readme).toContain('用户在发送前确认后，插件才启动正式 bridge');
    expect(readme).toContain('当前健康检查与正式 bridge 统一精确支持 DSH `0.1.1-rc.2`');
    expect(readme).toContain('| DSH 会话、流式事件与取消 | 对话发送链已接入 Obsidian 宿主：插件级 session、流式文本、停止、失败与清理已实现；对话模式禁止全部 DSH 工具，任务执行尚未接通 |');
    expect(readme).toContain('| Vault 读取与写入 | 仅用户显式选择的 Markdown 文件、文件夹当下展开的确定笔记集合或当前选区可进入只读上下文；该只读子集已通过专用 Vault 运行验收，写入、删除、移动、整库索引和隐式整库读取仍禁用 |');
    expect(readme).toContain('| Obsidian 社区提交 | 尚未进行 |');
    expect(readme).toContain('凡使用 `obsidian-trend-radar-evidence` 的 Obsidian 运行读回与截图均已撤回');
    expect(readme).toContain('最终用户 UI 验收尚未完成');
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
    expect(readme).toContain('Obsidian ribbon、活动标签页、Workbench 左上角和快速助手继续使用同一 DeepSeek 鲸鱼几何');
    expect(adr).toContain('状态：已接受');
    expect(adr).toContain('当前批准基线为页面 `UI 真相 v2`（`12:1`）');
    expect(adr).toContain('同一 Ardot 项目持续演进');
    expect(releaseGateAdr).toContain('“新建任务”固定为 Workbench 内部导航第一个功能');
    expect(releaseGateAdr).toContain('原“概览”和“运行状态”合并为“运行”，固定在功能导航最后');
    expect(releaseGateAdr).toContain('发布门和实现差异只记录在治理文档、测试、CI 与验收证据中');
    expect(releaseGateAdr).toContain('当前源码与单元测试已同步只含“新建任务 / 运行”的导航');
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

  it('Batch 5A UI 基线与 Batch 7 插件级对话状态各自保持单一职责', async () => {
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
    expect(quickAssistant).toContain("promptEl.disabled = true");
    expect(quickAssistant).toContain('新建任务是主对话入口');
    expect(newTaskState).toContain("mode: 'chat'");
    expect(newTaskState).toContain("'awaiting_permission'");
    expect(newTaskState).not.toContain('reviewStatus');
    expect(conversation).toContain("runtimeStatus: 'disconnected'");
    expect(conversation).toContain('NewTaskConversationController');
    expect(workbench).toContain('NewTaskReviewModal');
    expect(styles).toContain('@container dsh-workbench-view (max-width: 760px)');
    expect(styles).toContain('.dsh-workbench-sidebar {');
    expect(styles).toContain('border-radius: 999px;');
    expect(styles).toContain('.dsh-workbench-view button.dsh-new-task-mode__button:first-child');
    expect(styles).toContain('.dsh-workbench-view button.dsh-new-task-mode__button:last-child');
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
    expect(design).toContain('宿主 UI 与只读知识库已完成 Batch 6 验收');
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
    const [requirements, hostContract, storageContract, assessment, roadmap, releaseStatus]
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
    expect(requirements).toContain('Batch 7 已把不可变快照接入产品发送链');
    expect(requirements).toContain('任务结束后的已编辑文件');
    expect(requirements).toContain('插件自动安装或更新 DSH');
    expect(hostContract).toContain('状态：已接受');
    expect(hostContract).toContain('只读 `--version` 健康检查');
    expect(hostContract).toContain('当前正式 bridge 与健康检查统一精确锁定 DSH `0.1.1-rc.2`');
    expect(storageContract).toContain('Claudian `15b78af785cda04fccc96f4effcfae6367f9be65`');
    expect(storageContract).toContain('不复制 `.claudian/sessions`');
    expect(storageContract).toContain('操作系统应用数据目录下按 Vault 绝对路径 SHA-256');
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
    expect(matrix).toContain('| `0.1.1-rc.2` | 健康检查 | 已实现并本地验证；本批远端/专用 Vault 待验收 |');
    expect(matrix).toContain('| `0.1.1-rc.2` | 正式 bridge + 产品对话 | `windows_runtime_passed`；Batch 7 产品发送链已实现；尚未 `supported` |');
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
    expect(readme).toContain('| 正式 bridge、协议 v1 与 NDJSON | 已实现；DSH `0.1.1-rc.2` 已真实加载并完成握手、Agent session、mid-turn cancel 与正常关闭；Batch 7 已由“新建任务”的对话发送链启动 |');
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
      artifactSha256: 'f5ecd64ee9f2104bde9502469d841eff7dc8cf9f8bdb79da2bfcff6d9ac17ecf',
    });
    expect(manifest.dshIntegrity).toMatch(/^sha512-/u);
    expect(fixture.dependencies['@deepseek-ai/dsh']).toBe('0.1.1-rc.2');
    expect(protocol).toContain('正式 bridge、NDJSON、受管进程');
    expect(protocol).toContain('CI run 32717711862');
    expect(protocol).toContain('Ubuntu check `97402381390`、Windows check `97402381253`');
    expect(protocol).toContain('两个原始 annotations 数组均为 `[]`');
    expect(matrix).toContain('`windows_runtime_passed`；Batch 7 产品发送链已实现；尚未 `supported`');
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
