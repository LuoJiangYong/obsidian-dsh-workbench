# DeepSeek Harness Workbench

> Unofficial community integration for DeepSeek Harness.

将 Obsidian 作为基于个人知识库、可审阅并可持续扩展的 Agent 工作台；外部 DeepSeek Harness 负责 Agent、Skill、MCP 和 Cordis 插件能力。

## 当前状态

当前版本是开发基线，不是社区发布版本。

| 能力 | 状态 |
| --- | --- |
| Ardot UI 用户审阅真相 | `v2` 保持用户审阅基线；Ardot 默认由 AI 只读，只有用户明确要求时才允许修改 |
| 新建任务 | 宿主 UI、只读知识库、真实对话与 Vault 外任务链均已实现；R1-M 已把生产运行时迁移到 DSH `0.1.2-alpha.3`，本地、专用 Vault 与双平台 CI 门均纳入同一支持闭环 |
| 新建任务 v1 需求与宿主契约 | 已批准并纳入 CI；R2 已实现公开 session 精确读取/恢复和 Vault 外最小任务索引，可在重启后重建可继续或明确不可恢复的任务事实；项目/最近 UI、Vault 写入和删除工具不属于当前范围 |
| 中央 Workbench 与当前内部导航 | 按 `2026-08-26` 用户直接反馈仅渲染“新建任务”和“运行”，未开放模块不进入插件导航；专用隔离 Vault 验收已通过 |
| ribbon 与中央标签页命令入口 | 已实现并通过本地测试、双平台 CI 与专用隔离 Vault 的加载、复用和禁用验收 |
| 可选右侧任务环境 | 原“快速助手”已原位演进为默认关闭的原生 `ItemView`；专用 Vault 已验证打开/复用、公开事实投影、完整路径排除和关闭不影响中央会话 |
| DSH 路径配置与健康检查 | 命令校验和进程边界已实现；生产目标统一为 `0.1.2-alpha.3`，本地与专用隔离 Vault 读回通过，并由双平台 CI 执行精确夹具 |
| 正式 bridge、协议 v1 与 NDJSON | bridge `0.2.0` / protocol `1` 已实现；DSH `0.1.2-alpha.3` 已真实加载并完成握手、Agent session、精确读取/同 ID 恢复、mid-turn cancel、JSONL session 与正常关闭；现有对话/任务边界保持不变 |
| DSH 会话、流式事件与取消 | 对话与任务链均已接入 Obsidian 宿主；专用 Vault 已验证成功、明确失败与恢复、真实文件变更/审核/撤销，以及禁用后受管进程从 `2` 归零 |
| Vault 读取与写入 | 仅用户显式选择的 Markdown 文件、文件夹当下展开的确定笔记集合或当前选区可进入只读上下文；该只读子集已通过专用 Vault 运行验收，写入、删除、移动、整库索引和隐式整库读取仍禁用 |
| GitHub Release | 未创建 |
| Obsidian 社区提交 | 尚未进行 |

当前 ribbon 和“打开工作台”命令打开或复用一个中央 Workbench 标签页，默认进入“新建任务”。插件自有左导航按用户 `2026-08-26` 的直接反馈只显示“新建任务”和“运行”；项目、专家/Skill/连接器、自动化、资料库和领域工作台尚未实现，因此不在插件中渲染。“运行”仍合并原概览与运行状态。

最新获用户批准的 [Ardot UI 真相 v2](https://ardot.tencent.com/file/718186366720195)仍是用户审阅基线，Ardot 由用户审阅和完善，AI 默认只读。`2026-08-26` 至 `2026-08-30` 的直接反馈只授权修改插件：未实现模块从插件导航移除，任务模式控件使用左右半圆胶囊边界；知识库选择入口使用“选择知识库 / 已选笔记”，选择项去除方框阴影并增加文件夹入口；真实对话使用无阴影浅底消息区和缩短的输入框；正式会话、显式新建任务、文件结果与默认关闭的原生任务环境均已接通。Obsidian ribbon、活动标签页、Workbench 左上角和任务环境继续使用同一 DeepSeek 鲸鱼几何。Batch 10 已在专用 Vault 完成技术运行验收，用户于 `2026-08-31` 明确确认第一批开发目标完成。R2 只新增后端任务身份与恢复事实，没有新 UI；Ardot 未修改、只读核对，项目/最近导航仍未实现。

`2026-08-28` 的插件路线进一步吸收 Codex 的会话导航、中央工作流和可选环境栏关系，但不复制桌面窗口或 Git 专属操作：确认首条消息后，开启页已在同一个 Workbench leaf 内切换为正式会话；右侧信息使用默认关闭的 Obsidian 原生 leaf。DSH 原生配置继续管理模型、插件、Agent 预设、凭据和完整 session，插件只投影当前公开且实际启用的能力。该方向已写入 [Codex 参考界面评估与正式会话路线](./docs/design/codex-reference-ui-assessment.md)，Ardot 未修改。

“新建任务”承担 DeepSeek Harness 主对话、任务执行、上下文和权限审阅。它是首个 Obsidian 社区插件发布功能：完整实现、双平台 CI、隔离 Vault 运行验收和用户对最终 Obsidian 运行 UI 的明确验收均是进入社区发布审批的前置条件。当前 v1 的产品与用户验收前置条件已随第一批目标确认完成；Release 批次、发布资产验收和 Obsidian 社区提交仍未批准，也尚未执行。Ardot、CI、用户验收或 GitHub Release 任一单项都不能替代其他发布门。

“新建任务”允许切换“对话”与“任务执行”、编辑内存草稿，并从原生“选择知识库”流程显式加入当前笔记、当前选区、单个 Vault Markdown 文件或文件夹当下已有的 Markdown 笔记集合。文件夹选择递归包含子文件夹，但在选择时即冻结为逐篇笔记 ID，不会静默追踪后来新增的文件；超限时整体失败，不部分加入。已选笔记可预览来源并逐项移除，文件内容在确认发送后由 Obsidian 宿主重新读取并建立不可变快照。首条消息经确认和校验后，同一个 Workbench leaf 切换为正式会话；关闭/重开 leaf 会恢复当前插件生命周期内的会话，模式与规范工作区保持锁定，只有显式“新建任务”会在处置运行时后返回开启页。当前“对话”会启动受管 DSH `0.1.2-alpha.3` session、显示流式回复并支持真实停止；该模式通过空工具清单、执行 guard 和只消费冻结上下文的系统提示三重禁止 DSH 工具，因此只读且不会写入 Vault。“任务执行”已接通单一 Vault 外工作区和逐轮账本；每个 turn 的真实文件卡默认展示三项并可展开，支持真实快照审核、Obsidian 原生右键文件操作和二次确认撤销。R2 在重启后只重建任务身份、输入摘要与可恢复状态；完整消息仍由 DSH 原生 session 管理，当前 UI 尚不显示项目/最近列表。“代码协作”与附件继续禁用；可选右侧任务环境只投影公开事实，不承担主对话。插件不伪造运行中 turn、具体模型/预设、私有推理或完整本机路径。

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

# 仅开发/CI：安装独立的精确 alpha.3 生产运行夹具并执行真实 bridge 验收
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

- 用户手动点击“检查 DSH”时只执行固定 `--version`；用户在发送前确认后，插件才启动正式 bridge、DSH session 和由 DSH 配置管理的模型请求。
- 健康检查本身不发起模型请求；对话的网络端点、账号和模型由用户原生 DSH 配置负责。
- 只通过 Obsidian API 读取用户明确加入的 Markdown 笔记或冻结选区；不写入、删除或移动 Vault 内容，也不索引整个 Vault。
- 只访问用户配置的 DSH 命令或绝对可执行路径；不接受任意参数或 Shell 命令。
- DSH 命令设置由 Obsidian 保存到当前插件的 `data.json`；完整会话历史、设置和凭据继续由用户原生 `$DSH_HOME` 管理，插件不复制到 Vault。R2 的最小任务索引只保存任务/session 引用、模式、Vault 外工作区身份、48 字符输入摘要和生命周期，位于 Vault 外应用数据分区。
- 子进程使用隐藏窗口，stdout/stderr 限长；错误诊断会脱敏，超时或插件卸载会终止受管进程树。
- 不采集客户端遥测。
- 不保存 API Key、Token 或其他凭据。
- 插件不安装或更新 DSH、Node、Python 或其他外部依赖。
- 仓库内 `tests/runtime-fixture` 只供开发与 Windows CI 精确复现 `0.1.2-alpha.3`，不由插件安装，不进入用户 DSH profile 或 Release 运行依赖。

当前健康检查与正式 bridge 统一精确支持 DSH `0.1.2-alpha.3`；其他版本会明确显示不受支持，不做兼容 fallback。插件不会安装或更新 DSH；只有用户确认发送只读对话或已校验的 Vault 外任务后，`main.ts` 才启动正式 bridge 与模型请求。

正式 `obsidian-bridge` 是独立 ESM artifact，只投影公开文本、工具身份、一次性权限关联和 R2 精确 session 可恢复事实，不复制工具参数、推理内容或完整消息。插件用固定 `--profile headless --patch <Vault 外 overlay>` 参数启动用户配置的 DSH；DSH 原生 `$DSH_HOME` 继续保存其设置、凭据和 session，插件生成的 overlay 位于操作系统应用数据目录下按 Vault 哈希分区的状态目录。任何状态目录、DSH `cwd` 或 `$DSH_HOME` 落入 Vault 都会在启动 DSH 前失败。对话模式在 DSH 层以空工具清单、执行 guard 和只读系统提示拒绝全部工具；任务模式只允许 `edit/glob/grep/read/read_image/write`，拒绝 Shell、网络、Skill、子代理、路径越界和依赖/缓存/构建/版本控制目录。逐轮基线、撤销材料与 R2 最小索引保存在同一 Vault 外状态分区；索引采用版本化双槽快照、原子替换、损坏隔离和独占锁。关闭时先请求协议退出，超时后终止整棵进程树。Batch 7 最终 bridge 修复 `1810aa9779bb7d3439a1b73c7c1cfdbbf2f04b80` 已通过远端 [CI run 33132970545](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33132970545) 的双平台 job 与原始零 annotations；Batch 10 与 `2026-08-31` 用户确认已把正式 bridge + 产品对话/任务组合推进到 `supported`。R2 不授权项目/最近 UI、隔离 Vault 部署、Release、发布资产或社区提交。

Batch 8A 实现提交 `4f56372ae93ea9e01731b4ec19dcb8329d48aa28` 已通过 [CI run 33135433215](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33135433215) 的 Ubuntu check `98734194893`、Windows check `98734195115` 和两个原始 `[]` annotations。Batch 8B 实现提交 `5f88c95b7795dd2494aee30da4bf01d29b7d86ac` 首轮 CI 只暴露 Windows 临时路径断言差异；最小测试修复 `e9563cda85bbf6cb05d18984d0c5c8b47af6cf74` 后，[CI run 33149126275](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33149126275) 的 Ubuntu check `98776774841`、Windows check `98776774966` 均成功，原始 annotations 均为 `[]`。这证明任务安全边界和逐轮账本已进入 CI，不证明任务 UI 或 Obsidian 运行验收通过。

后续兼容批次继续以当时 GitHub 与 npm 一致的最新 DSH 预发布为候选。计划中的自动同步只发现上游版本并生成 issue、提案或 draft PR，不会自动安装/更新用户 DSH、自动合并、自动发布或自动提交社区目录。

## 平台与身份

- 插件 ID：`deepseek-harness-workbench`
- 首版仅支持 Obsidian 桌面端：`isDesktopOnly: true`
- 本项目不是 DeepSeek 官方产品，不得描述为官方或首个 DeepSeek Harness 插件。

## 发布状态

项目公开仓库为 [LuoJiangYong/obsidian-dsh-workbench](https://github.com/LuoJiangYong/obsidian-dsh-workbench)。没有公开 Release，尚未向 Obsidian 社区目录提交。创建 GitHub 仓库、提交 manifest 或生成构建产物均不等于社区 ID 已占位。

## Batch 0A 验收

> `2026-08-26` 证据纠正：下列历史批次中凡使用 `obsidian-trend-radar-evidence` 的 Obsidian 运行读回与截图均已撤回，不能继续支撑本插件的隔离 Vault 通过结论；源码、本地测试和已核实的远端 CI 证据不受影响。当前运行结论只以后文专用 `obsidian-dsh-workbench-evidence` Vault 的修正验收为准。

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

以下条目记录当时实现行为，但其中基于错误 Vault 的宿主运行读回已按上方纠正声明撤回，不再支撑当前结论；有效宿主证据只以后文 Batch 5A 专用 Vault 修正验收为准。

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

## Batch 5A：新建任务宿主 UI 与证据修正

- 默认页已切换为“新建任务”；“对话”和“任务执行”更新确定性内存状态，“代码协作”保持原生禁用。
- 空草稿、未连接运行时、未完成审阅或非空闲阶段任一成立时，发送都不可执行；当前上下文、权限与发送统一保持禁用。
- 原“概览”和“运行状态”已合并为“运行”；按 `2026-08-26` 用户直接反馈，未实现的五个模块不在插件导航中渲染，模式分段控件使用左右半圆胶囊边界。
- DeepSeek 鲸鱼 path 已用于 ribbon、活动标签页、Workbench 品牌和快速助手；当前 alpha.3 夹具中的上游 SVG path 与已锁定的品牌矢量逐字符一致。
- 原 Batch 5A 运行截图误用了属于另一个插件的 `obsidian-trend-radar-evidence` Vault，现已撤回，不再作为本插件隔离 Vault 证据；五张宿主截图已全部由专用 `obsidian-dsh-workbench-evidence` Vault 重新捕获并逐张复核。
- 实现提交 `c8f6922b1a44e5bc0fdb325fce183e95b85320d1` 已通过远端 [CI run 32919119819](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32919119819) 的 Ubuntu 与 Windows job；check `98028935782`、`98028935888` 的原始 annotations 均为 `[]`。
- 插件反馈与证据纠正提交 `a41c93b43245c9b1cfb84c4adb243ef4217c8253` 已通过远端 [CI run 32963736114](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32963736114)；Ubuntu check `98161570546`、Windows check `98161570396` 均成功，两个原始 annotations 数组均为 `[]`。
- 专用 Vault 已验证唯一 Workbench/快速助手、精简导航、左右半圆模式控件、reload 复位、真实健康检查、Light/Dark、`700px` 无溢出、零笔记写入、零错误和零残留受管进程；验收后插件已禁用，四个可重建资产已移除。
- 当前证明宿主 UI 与状态骨架的代码门和专用 Vault 运行门通过；不证明模型对话、上下文、权限或任务执行已可用，也不是最终 Obsidian UI 用户验收。

## Batch 6：只读知识库（实现与运行门已通过）

- “选择知识库”已接入 Obsidian 原生宿主选择流程：当前笔记、当前选区、单个 Vault Markdown 文件或明确选择的文件夹都需要用户主动操作。文件夹递归展开为选择当下的确定 Markdown 笔记集合，排除已选笔记；根 Vault 不作为文件夹候选，不建立持续跟踪或整库索引。
- Workbench 使用“已选笔记”显示来源、当前选区文本预览、发送时读取提示与逐项移除；选择器选项去除方框阴影，并在当前选区不可用时提示先在 Markdown 编辑器中选中文本。快速助手同步显示 Workbench 已选笔记摘要。重复项、失效文件、非 Markdown、路径越界、文件夹空集和超限均产生可定位错误并保留草稿。
- 上下文限制冻结为最多 `10` 项、单项 `96 KiB`、合计 `192 KiB`。测试使用最大合计内容中的引号与换行做最坏 JSON 双重转义，确认投影后的 `turn/start` wire frame 仍小于现有 `1 MiB` bridge 上限。
- 文件内容在发送前通过 Obsidian `Vault.cachedRead` 重新读取；当前选区在显式加入时固定，具体操作是先在 Markdown 编辑器中选中文本，再打开 Workbench 的“选择知识库”并点击“加入当前选区”。快照及其项目为不可变对象，后续编辑不会改变已经建立的快照；bridge 不读取 Vault。
- Ardot 文件 `718186366720195`、用户审阅页 `UI 真相 v2`（`12:1`）保持只读且未修改。本批只演进插件实现、文字镜像、测试与 CI 契约。
- 最终实现状态 `7ee4b07d4afc0a67b8034e57c513599c7d562b19` 已通过 `typecheck`、零警告 `lint`、`77` 项完整测试、生产构建、仓库/CI/bridge 自检、`13` 项 Windows 进程专项测试和 `1` 项真实 rc.2 bridge 测试；远端 [CI run 33031107880](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33031107880) 的 Ubuntu check `98383584575` 与 Windows check `98383584694` 均成功，两个原始 annotations 数组均为 `[]`。
- 专用 `obsidian-dsh-workbench-evidence` Vault 已在 Obsidian `1.13.7`（installer `1.12.7`）完成当前笔记、真实当前选区冻结、递归文件夹原子加入、后来新增文件不静默跟踪、快速助手摘要、Light/Dark、精确 `700px`、运行页真值、禁用/重载复位和零残留验收；原始验收笔记 SHA-256 前后均为 `97ADAA09E558EF57745C4304E12D67DD0B2789F31AAA56D16E10943FAE67C319`。验收后临时夹具与四个部署资产已通过 Obsidian API 删除，插件已禁用，错误缓冲、error 级控制台和 bridge 进程均为 `0`。真实模型发送、权限请求、外部工作目录、Vault 写入、Release 和社区提交均不在本批。

## Batch 7：真实只读对话（实现与技术运行门已通过）

- 插件级控制器复用同一 DSH session，并在发送确认后重读已选笔记、冻结确定性信封；完成、失败、真实停止和取消超时强制终止使用互不冒充的终态。
- 专用 `obsidian-dsh-workbench-evidence` Vault 已完成真实模型回复、4,681 字符流式过程中真实停止、重载清空内存投影与零残留进程、Light/Dark 和精确 `700px` 无横向溢出；原始验收笔记未变化。
- 用户在上下文追问时发现标准 persona 曾把 DSML 工具调用标记作为普通文本返回。修复 `1810aa9779bb7d3439a1b73c7c1cfdbbf2f04b80` 在最终 prompt assembly 固定空 tools 和 `obsidian:chat-boundary`；rc.2 正式 artifact 测试读回模型请求确认无 `tools`，随后使用合成冻结笔记的本机真实模型验收直接返回笔记日期且无 DSML/tool 标记。
- 最终本地门为 `89` 项通过、`1` 项既有跳过；Windows 进程专项 `17` 项通过、`1` 项既有跳过；rc.2 正式 artifact 运行验收 `1` 项通过。远端 [CI run 33132970545](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33132970545) 的 Windows check `98726441325` 与 Ubuntu check `98726441475` 均成功，原始 annotations 均为 `[]`。
- 为避免覆盖用户正在进行的专用 Vault 会话，修复后的资产没有自动重载到该窗口；该项与 Batch 8–10 完整界面一起进入最终 Obsidian UI 用户验收，不影响已完成的 bridge/真实模型技术门。Ardot 未修改、只读核对。

## Batch 8A–8D：任务安全边界、逐轮账本、控制器与文件审核

- 任务 session 只允许 `edit/glob/grep/read/read_image/write` 六个文件工具，并以共享路径 guard 拒绝 Shell、网络、Skill、子代理、Vault、状态目录、依赖、缓存、构建和版本控制目录。
- Vault 外逐轮账本记录真实 created/modified/deleted、文本增删与审核前后内容；默认上限为 `10,000` 个文件、单文件 `2 MiB`、基线 `64 MiB`、保留 `7` 天且每工作区最多 `20` 个。
- 撤销先校验账本与全部当前文件 SHA；冲突或篡改时零写入，成功时只恢复该 turn 的修改/删除并移除该 turn 新建文件，中途失败执行 after 快照回滚。
- Batch 8A 的 [CI run 33135433215](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33135433215) 与 Batch 8B 修复后的 [CI run 33149126275](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33149126275) 均双平台成功且原始 annotations 为 `[]`。
- Batch 8C 已实现 Obsidian 桌面原生目录选择、Vault/状态目录隔离复验、工作区与 session 绑定、`workspace-write + ask` 进程路由、逐次权限、所有终止路径的变更核对，以及“已编辑 N 个文件”真实摘要；完整本地门为 `112 passed / 1 skipped`、runtime `27 passed / 1 skipped`、真实 rc.2 bridge `1 passed`，构建和完整自检通过。
- 实现提交 `91b21345a52657520633475dfc9e86db7b720e65` 已通过 [CI run 33188573187](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33188573187)：Ubuntu check `98907874384` 与 Windows check `98907874519` 均成功，两个原始 annotations 数组均为 `[]`。
- Batch 8D 已实现默认三项/展开、原生右键菜单、账本前后快照审核、二次确认和全量冲突预检撤销；文件操作每次重新校验工作区与真实路径，普通 UI 不显示完整绝对路径。实现 `759ec97d4c21748016eb8e6a462ed3c78f153edb` 已通过远端 [CI run 33239392369](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33239392369)：Ubuntu `99065994296`、Windows `99065994274` 均成功且原始 annotations 为 `[]`；专用 Vault 运行与最终用户 UI 验收仍属于 Batch 10。Ardot 未修改、只读核对。
- Batch 9 已实现同 leaf 正式会话、确定性标题、模式/工作区锁定、显式新建任务、关闭/重开 leaf 恢复和插件重载清空边界；原快速助手已原位演进为默认关闭且复用 right leaf 的“任务环境”。具体模型/预设在当前协议未公开，UI 只显示由 DSH 管理；不展示私有推理、假历史或完整路径。本地完整测试为 `123 passed / 2 skipped`、runtime 为 `27 passed / 1 skipped`、真实 rc.2 bridge 为 `1 passed`，构建与完整自检通过。实现 `cf13ca7e87b51a927fadaaa092a2ca5af51587fd` 已通过远端 [CI run 33294157748](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33294157748)：Windows `99210845045`、Ubuntu `99210845119` 均成功且原始 annotations 为 `[]`。专用 Vault 运行读回进入 Batch 10，Ardot 未修改、只读核对。

## Batch 10：最终 Obsidian 技术运行门

- 专用 `obsidian-dsh-workbench-evidence` Vault 已完成宽屏浅色、精确 `700px` 深色、键盘、启动失败/恢复、只读选区冻结、真实模型回复、正式会话与右侧任务环境验收；原始笔记 SHA-256 保持不变，普通 UI 未显示绝对路径或私有推理。
- Vault 外真实任务创建一个文件并修改一个文件；文件卡、前后快照审核、Obsidian 原生菜单、复制相对路径和安全撤销均读回一致。Batch 10 的 rc.2 allow-list 不含删除，删除请求明确失败且目标文件未变化；R1-M 迁移未扩大当前任务工具清单。
- 运行验收发现并修复 turn 完成后“新建任务”仍禁用，以及同步插件卸载未立即终止进程树两个缺陷；新实现的专用 Vault 复验在禁用插件后 `800ms` 内从两个目标进程降为零。
- 最终本地门为 `126 passed / 2 skipped`，runtime 为 `28 passed / 1 skipped`，真实 rc.2 bridge 为 `1 passed`；构建与完整自检通过。实现 `ae37a7bf1c719ab871930a2b04d53ff5d7e6378f` 已通过远端 [CI run 33314880417](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33314880417)：Ubuntu `99266341200`、Windows `99266341269` 均成功，两个原始 annotations 数组均为 `[]`。用户于 `2026-08-31` 明确确认第一批开发目标完成；跨重启恢复明确进入下一批，Release 与社区提交仍未授权。Ardot 未修改、只读核对。

## R1-M：DSH alpha.3 生产运行时迁移门

- 独立候选提交 `b271c8f8dc6b28c53184f37db68c7d64bf29a14e` 把 215 个直接 DSH 包、CLI 与公开 session controller 全部精确锁定 `0.1.2-alpha.3`，并通过 [CI run 33467939672](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33467939672)：Ubuntu `99731576496`、Windows `99731576685` 均成功，两个原始 annotations 数组均为 `[]`。
- 生产健康检查、bridge 握手、运行夹具和构建清单已统一 alpha.3；正式 artifact SHA-256 为 `63d6ac6ddd35c74b14ae5d0f31e1ae4f70ee0bc4d7d605fef815cd6381e16e54`。Windows 本地真实 bridge 已验证回复、mid-turn cancel、JSONL session 与零残留。
- 用户确认具体资产 diff 后，只替换专用隔离 Vault 的 `main.js` 与 `obsidian-bridge.mjs`；`data.json`、`manifest.json`、`styles.css` 未修改。Obsidian CLI 原生重载无错误，插件健康检查读回 alpha.3；空上下文真实对话完成、工具数 `0`、无权限请求，显式重置后为 `idle/disconnected` 且目标 Node 进程为 `0`。
- alpha.3 删除的可选 SQLite session 后端从未被本插件使用；完整 session 继续由 DSH 原生 `$DSH_HOME` 的 JSONL 管理。R1-M 不实现 R2、不修改 Ardot 或真实 Vault，也不授权 Release、发布资产或社区提交。

## R2：Session 读取接缝与最小任务索引

- bridge `0.2.0` / protocol `1` 新增 `session-read` capability；只检查索引给出的精确 session ID，并使用 DSH 公开 controller 读取可用性、cwd、运行/空白状态和原生标题。恢复必须采用同一 ID，身份、cwd 或状态矛盾时 fail closed。
- 首次有效发送前建立 Vault 外版本 `1` 最小任务记录，保存 `taskId ↔ sessionId`、模式、工作区身份、48 字符输入摘要、时间和生命周期。双槽快照、原子替换、损坏隔离与活跃写锁防止静默覆盖；不复制 DSH 完整历史。
- 启动恢复投影为 `continuable`、`unrecoverable`、`startup_failed` 或 `check_failed`。不可恢复任务保留记录、摘要和明确原因，只允许显式重试或新建；重启前运行中的 turn 标为已中断，不伪造仍在运行，也不自动删除原生 session。
- 本地真实 alpha.3 测试已由两个独立 bridge 进程完成创建、关闭、精确读取标题/缺失项和同 ID 恢复。实现 `fd476a2e590c7281aa1de12640628e12a73b69d8` 已通过远端 [CI run `33581009658`](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33581009658)：Windows job `100095105463` 与 Ubuntu job `100095105593` 均成功，两个原始 annotations 数组均为 `[]`。隔离 Vault 部署未获授权，必须展示精确身份、版本和资产 diff 后另行确认。
- R2 没有修改 UI、Ardot、真实 Vault、用户 DSH、Release 或社区目录；D1 与后续批次未获授权。详细契约见 [ADR-012](./docs/architecture/ADR-012-session-read-and-minimal-task-index.md)。

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
- Codex 参考界面评估与正式会话路线：[docs/design/codex-reference-ui-assessment.md](./docs/design/codex-reference-ui-assessment.md)
- P0 运行时路线评估：[docs/architecture/p0-runtime-route-assessment.md](./docs/architecture/p0-runtime-route-assessment.md)
- 生产运行时 ADR：[docs/architecture/ADR-001-runtime-integration.md](./docs/architecture/ADR-001-runtime-integration.md)
- 新建任务 v1 需求：[docs/requirements/new-task-v1.md](./docs/requirements/new-task-v1.md)
- 统一工作台下一批未来实施契约：[docs/requirements/unified-workbench-next-batch.md](./docs/requirements/unified-workbench-next-batch.md)
- 统一工作台分批实施路线：[docs/implementation/unified-workbench-roadmap.md](./docs/implementation/unified-workbench-roadmap.md)
- 新建任务 v1 宿主契约 ADR：[docs/architecture/ADR-005-new-task-v1-host-contract.md](./docs/architecture/ADR-005-new-task-v1-host-contract.md)
- Vault 外任务执行控制器 ADR：[docs/architecture/ADR-008-task-execution-controller.md](./docs/architecture/ADR-008-task-execution-controller.md)
- 逐轮文件审核与安全撤销 ADR：[docs/architecture/ADR-009-task-change-review-and-undo-ui.md](./docs/architecture/ADR-009-task-change-review-and-undo-ui.md)
- 正式会话与任务环境 ADR：[docs/architecture/ADR-010-formal-conversation-and-task-environment.md](./docs/architecture/ADR-010-formal-conversation-and-task-environment.md)

## License

[MIT](./LICENSE)
