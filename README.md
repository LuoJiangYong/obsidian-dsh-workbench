# DeepSeek Harness Workbench

> Unofficial community integration for DeepSeek Harness.

将 Obsidian 作为基于个人知识库、可审阅并可持续扩展的 Agent 工作台；外部 DeepSeek Harness 负责 Agent、Skill、MCP 和 Cordis 插件能力。

## 当前状态

当前版本是开发基线，不是社区发布版本。

| 能力 | 状态 |
| --- | --- |
| Ardot UI 用户审阅真相 | 已更新为 `v2`；含新建任务、合并后的运行、宽屏/窄屏、Light/Dark 与可选快速助手；产品画板不显示开发进度或发布门文案 |
| 新建任务 | Ardot `v2` 宿主 UI 与确定性状态骨架已实现并通过单元测试；真实发送、对话、上下文和任务执行尚未接通 |
| 新建任务 v1 需求与宿主契约 | 已批准并纳入 CI；正式 bridge 与宿主 UI 子集已实现，只读上下文与任务执行仍在实施 |
| 中央 Workbench 与当前内部导航 | Ardot `v2` 导航已实现：新建任务首位、运行置底、五个中间入口真实禁用；Batch 5A 隔离 Vault 运行验收已通过 |
| ribbon 与中央标签页命令入口 | 已实现；已通过既有隔离 Vault 运行验收 |
| 可选右侧快速助手容器 | Ardot `v2` 宿主 UI 已实现；显示健康、上下文空态和两个真实禁用的快捷提问，不承担主对话 |
| DSH 路径配置与健康检查 | 已实现；只读检查已通过本地测试和隔离 Vault 运行验收 |
| 正式 bridge、协议 v1 与 NDJSON | 已实现；本地与 Windows CI 已由 DSH `0.1.1-rc.2` 真实加载并完成握手、Agent session、mid-turn cancel 与正常关闭；尚未接入产品 UI |
| DSH 会话、流式事件与取消 | bridge 内部路径已实现并通过本地真实运行验收；Obsidian 宿主入口已实现，但模型调用链、上下文与任务执行尚未接通 |
| Vault 读取与写入 | 未启用 |
| GitHub Release | 未创建 |
| Obsidian 社区提交 | 尚未进行 |

当前 ribbon 和“打开工作台”命令打开或复用一个中央 Workbench 标签页，默认进入“新建任务”。插件自有左导航已按 Ardot `v2` 同步：新建任务位于首位，项目、专家/Skill/连接器、自动化、资料库和领域工作台使用浅灰原生禁用态，“运行”位于最后并合并原概览与运行状态。

最新获用户批准的 [Ardot UI 真相 v2](https://ardot.tencent.com/file/718186366720195)是产品 UI 的用户审阅基线：导航首位为“新建任务”，中间保留暂不可用模块的浅灰禁用入口，原“概览”和“运行状态”合并为导航最后的“运行”；左上角品牌固定为 `DeepSeek` / `Harness` / `Workbench` 三行。产品画板与当前宿主 UI 都不显示“首发”“规划中”“尚未实现”等开发进度、发布批次或治理审批文案。Obsidian ribbon、活动标签页、Workbench 左上角和快速助手已使用同一 DeepSeek 鲸鱼几何；宿主 UI 已同步，真实模型连接和最终用户 UI 验收尚未完成。

“新建任务”承担未来的 DeepSeek Harness 主对话、任务执行、上下文和权限审阅。它是首个 Obsidian 社区插件发布功能：只有完整实现、双平台 CI 与隔离 Vault 运行验收通过，并获得用户对最终 Obsidian 运行 UI 的明确验收后，才允许进入社区发布审批。Ardot、CI 或 GitHub Release 单独通过都不能越过此门。

“新建任务”允许切换“对话”与“任务执行”并编辑内存草稿；“代码协作”、附件、上下文、权限和发送保持真实禁用，不会启动 DSH 或持久化草稿。“运行”只提供手动 `--version` 健康检查；可选右侧快速助手只展示健康状态、上下文空态和两个禁用的快捷提问，不提供聊天输入、发送、停止或模型选择。DSH 命令可在插件设置中配置为 PATH 裸命令或受支持扩展名的绝对路径。

## 开发运行

要求：

- Node.js 24 或 25。
- npm 11。
- Obsidian 桌面端。
- 独立的插件开发测试 Vault；不要在真实个人知识库中开发。

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify

# 仅开发/CI：安装独立的精确 rc.2 运行夹具并执行真实 bridge 验收
npm run prepare:runtime-fixture
npm run test:bridge:runtime
```

构建同时生成 `main.js` 与 `obsidian-bridge.mjs`。后续运行时接入验收需要把二者连同 `manifest.json`、`styles.css` 复制到隔离 Vault 的：

```text
.obsidian/plugins/deepseek-harness-workbench/
```

然后在 Obsidian 的社区插件设置中启用插件。

## 隐私、网络与文件访问

当前开发基线：

- 只有用户手动点击“检查 DSH”时才启动外部子进程，并且只附加固定参数 `--version`。
- 健康检查本身不发起模型请求或产品网络请求；外部 DSH 可执行文件的内部行为仍由其自身版本与用户配置负责。
- 不读取、写入或删除 Vault 内容。
- 只访问用户配置的 DSH 命令或绝对可执行路径；不接受任意参数或 Shell 命令。
- DSH 命令设置由 Obsidian 保存到当前插件的 `data.json`，不保存会话内容或凭据。
- 子进程使用隐藏窗口，stdout/stderr 限长；错误诊断会脱敏，超时或插件卸载会终止受管进程树。
- 不采集客户端遥测。
- 不保存 API Key、Token 或其他凭据。
- 插件不安装或更新 DSH、Node、Python 或其他外部依赖。
- 仓库内 `tests/runtime-fixture` 只供开发与 Windows CI 精确复现 rc.2，不由插件安装，不进入用户 DSH profile 或 Release 运行依赖。

当前健康检查精确支持 DSH `0.1.1-rc.1`；其他版本会明确显示不受支持，不做兼容 fallback。该设置页路径与正式 bridge 的 rc.2 路径相互独立，当前 `main.ts` 尚未启动后者；“新建任务”发送保持禁用，因此现有 Obsidian UI 不会发起模型请求。

正式 `obsidian-bridge` 已实现为独立 ESM artifact：只投影公开文本、工具身份和一次性权限关联，不复制工具参数或推理内容；插件侧只用固定 `--profile headless --patch <隔离 overlay>` 参数启动用户已配置的 DSH，设置独立于 Vault 和用户 profile 的 `DSH_HOME`，关闭时先请求协议退出，超时后终止整棵进程树。bridge/协议/DSH/artifact 哈希均精确锁定；最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664` 已通过远端 [CI run 32717711862](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32717711862) 的 Ubuntu 与 Windows job，两个原始 annotations 数组均为 `[]`。产品 UI、只读 Vault 上下文、外部工作区权限和隔离 Vault 运行验收仍属于后续批次，因此矩阵尚未进入 `supported`。

后续兼容批次继续以当时 GitHub 与 npm 一致的最新 DSH 预发布为候选。计划中的自动同步只发现上游版本并生成 issue、提案或 draft PR，不会自动安装/更新用户 DSH、自动合并、自动发布或自动提交社区目录。

## 平台与身份

- 插件 ID：`deepseek-harness-workbench`
- 首版仅支持 Obsidian 桌面端：`isDesktopOnly: true`
- 本项目不是 DeepSeek 官方产品，不得描述为官方或首个 DeepSeek Harness 插件。

## 发布状态

项目公开仓库为 [LuoJiangYong/obsidian-dsh-workbench](https://github.com/LuoJiangYong/obsidian-dsh-workbench)。没有公开 Release，尚未向 Obsidian 社区目录提交。创建 GitHub 仓库、提交 manifest 或生成构建产物均不等于社区 ID 已占位。

## Batch 0A 验收

- Windows 上从锁文件执行 `npm ci` 成功，依赖审计为 0 个已知漏洞。
- 类型检查、ESLint 零警告、6 项测试、生产构建和仓库自检通过。
- 隔离测试 Vault 中完成插件发现、启用、重载、命令打开和禁用。
- Workbench DOM 唯一匹配；重载与禁用后的插件错误和错误级控制台消息均为零。
- 测试插件目录已在禁用后清理，构建资产可由 `npm run build` 重建。
- GitHub Actions 的 Windows 与 Ubuntu Phase A 均成功，原始 check-run annotations 合计为 0。
- 这些证据只证明原生插件基线，不证明 DSH 或 Vault 功能可用。

## Batch 0B 验收

- 本机 DSH 已升级并精确锁定到 `0.1.1-rc.1`；插件不会执行安装或更新。
- 在 Vault 外完成 1 次非敏感 headless 请求，返回 `P0_OK`、退出码为 0，且没有残留 headless 进程。
- 设置契约和假运行时覆盖 PATH 裸命令、绝对路径、Windows `.cmd` shim、缺失命令、版本不匹配、无效输出、诊断脱敏、超时和进程树清理。
- 隔离 Vault 中完成设置页渲染、`data.json` 写入读回、插件重载、真实 `dsh --version`、缺失路径失败与恢复。
- Workbench 同时显示 `DSH 可执行（0.1.1-rc.1）` 与“尚未连接 DSH”，没有把健康检查冒充为会话连接。
- 真实宿主中，10 秒超时和插件禁用分别终止了临时假运行时的 runner 与 child；插件错误和错误级控制台消息均为 0。
- 测试插件目录、临时假运行时和测试设置已清理；没有读取或写入 Vault 内容。
- P0 只接受薄 `obsidian-bridge` 作为未来生产路线；SDK 与 ACP 不作为并行 fallback；在 Batch 0B 当时生产 bridge 尚未实现。

## Workbench 壳层批次验收

- ribbon 和命令打开或复用中央 Workbench 标签页；连续打开后主工作区内只有一个 Workbench。
- 插件自有 `194px` 左导航开放概览与运行状态，六个未来模块保持原生禁用并显示“规划中”。
- DSH 健康检查移动到运行状态页；隔离 Vault 读回 `DSH 可执行（0.1.1-rc.1）`，同时仍显示“尚未连接 DSH”。
- 可选快速助手只在显式命令后出现在右侧，展示健康、上下文空态和快捷提问不可用说明；没有输入、发送、停止或模型选择。
- 宽屏浅色、宽屏深色、`700px` 窄容器和右侧快速助手截图通过同屏参考比较；设计验收结果为 `passed`。
- Obsidian 错误缓冲与错误级控制台消息均为 0；没有读取或写入 Vault 内容。

## Ardot UI 真相 v2 设计批次

- 页面 `UI 真相 v2`（`12:1`）保留六个产品画板：设计系统与交互状态、新建任务浅色、运行浅色、新建任务与快速助手、新建任务深色和 `700px` 新建任务。
- `06 参考截图与 v2 对照 QA`（`12:530`）把用户参考截图和 v2 新建任务放在同一画板比较；只继承导航首位、左导航和中央任务输入的结构关系，不复制第三方品牌、账号、模型或历史任务。
- 左上角固定三行 `DeepSeek`、`Harness`、`Workbench`；“新建任务”采用官方 Lucide `circle-plus.svg`，鲸鱼继续来自已锁定的 DeepSeek Harness Web 前端资产。
- “运行”合并概览真值与只读健康检查并置于导航最后；右侧快速助手保持可选；暂不可用导航只用浅灰文字与图标表达，不显示额外状态徽标。
- 本批没有修改 `src/`、`styles.css` 或运行协议；运行实现和最终用户 UI 验收明确延期到新的获批批次。
- 画板截图和同屏 QA 证据保存在 `docs/assets/design-qa/ardot-ui-truth-v2/`，结论记录在 `design-qa.md`。

## Batch 5A：新建任务宿主 UI

- 默认页已切换为“新建任务”；“对话”和“任务执行”更新确定性内存状态，“代码协作”保持原生禁用。
- 空草稿、未连接运行时、未完成审阅或非空闲阶段任一成立时，发送都不可执行；当前上下文、权限与发送统一保持禁用。
- 原“概览”和“运行状态”已合并为导航最后的“运行”；五个中间入口只显示浅灰禁用态，不显示开发或发布文案。
- DeepSeek 鲸鱼 path 已用于 ribbon、活动标签页、Workbench 品牌和快速助手；当前 rc.2 夹具中的上游 SVG 与 Ardot 锁定的 rc.1 资产 SHA-256 相同。
- 隔离 Vault 已验证宽屏浅色、快速助手组合、运行、宽屏深色和 `700px` 响应式；宿主错误、错误级控制台消息和受管 bridge Node 进程均为 `0`。
- 实现提交 `c8f6922b1a44e5bc0fdb325fce183e95b85320d1` 已通过远端 [CI run 32919119819](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32919119819) 的 Ubuntu 与 Windows job；check `98028935782`、`98028935888` 的原始 annotations 均为 `[]`。
- 该结果只证明宿主 UI 与状态骨架，不证明模型对话、上下文、权限或任务执行已可用，也不是最终用户 UI 验收。

## 开发治理

- 项目开发宪法：[AGENTS.md](./AGENTS.md)
- UI 用户审阅真相：[Ardot `DeepSeek Harness Workbench · UI 真相`](https://ardot.tencent.com/file/718186366720195)
- UI 文字契约：[DESIGN.md](./DESIGN.md)
- Ardot 权威 ADR：[docs/architecture/ADR-003-ardot-ui-authority.md](./docs/architecture/ADR-003-ardot-ui-authority.md)
- 新建任务与首发门 ADR：[docs/architecture/ADR-004-new-task-first-release-gate.md](./docs/architecture/ADR-004-new-task-first-release-gate.md)
- Workbench 壳层 ADR：[docs/architecture/ADR-002-workbench-shell.md](./docs/architecture/ADR-002-workbench-shell.md)
- 设计验收：[design-qa.md](./design-qa.md)
- 开发宪法评估：[docs/governance/development-constitution-assessment.md](./docs/governance/development-constitution-assessment.md)
- CI/CD 路线图：[docs/ci-cd-roadmap.md](./docs/ci-cd-roadmap.md)
- P0 运行时路线评估：[docs/architecture/p0-runtime-route-assessment.md](./docs/architecture/p0-runtime-route-assessment.md)
- 生产运行时 ADR：[docs/architecture/ADR-001-runtime-integration.md](./docs/architecture/ADR-001-runtime-integration.md)
- 新建任务 v1 需求：[docs/requirements/new-task-v1.md](./docs/requirements/new-task-v1.md)
- 新建任务 v1 宿主契约 ADR：[docs/architecture/ADR-005-new-task-v1-host-contract.md](./docs/architecture/ADR-005-new-task-v1-host-contract.md)

## License

[MIT](./LICENSE)
