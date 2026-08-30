# CI/CD 路线图

更新时间：2026-08-24

## 定位

CI/CD 是 `AGENTS.md` 的自动执行器，不是产品决策者、下一阶段批准者或自动发布机器人。每个开发批次必须检查新增行为是否真正进入 CI；测试文件存在但 workflow 未执行，不算覆盖。

## 覆盖原则

完整执行链应为：

```text
用户结果或契约变化
→ 最小相关测试
→ 本地共用验证脚本
→ GitHub Actions workflow
→ 远端结果与 annotations
→ 治理状态回写
```

任何一环缺失都必须标记为 `未覆盖` 或 `延期，未通过`。

## Phase A：工程质量门

状态：已通过；Windows 完整本地质量门、远端 Windows/Ubuntu CI 和原始零 annotations 均已有证据。

在最小插件骨架建立的同一批次实施：

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- manifest、package 和 versions 一致性
- 仓库边界与禁止文件检查
- 凭据和敏感文件扫描
- 构建产物清理或忽略检查

Phase A 不创建 Release，不提交社区目录，也不批准 Phase B。

当前已接入同一组 npm 脚本和 GitHub Actions：

- Ubuntu 与 Windows 双平台、Node.js 24、`npm ci`。
- 类型检查、ESLint 零警告、Vitest、生产构建。
- manifest/package/versions 一致性与构建资产检查。
- 仓库边界、禁止文件、敏感路径和凭据模式检查。
- workflow 命令与 package scripts 的覆盖自检。
- 中央 Workbench 标签页复用、内部导航、运行状态切换和按需右侧任务环境由插件基线测试覆盖；正式会话、显式新建任务与环境投影由独立 UI/控制器测试覆盖，`verify:ci-coverage` 明确校验这些用例仍属于双平台完整 `npm test`。
- Ardot v2 文件与画板 ID、AI 默认只读边界、插件只显示“新建任务 / 运行”、未实现模块不渲染、左右半圆模式控件、产品 UI 不显示开发/发布文案、设计/实现差异和首个社区发布门由治理契约覆盖；`verify:ci-coverage` 明确校验该契约仍属于双平台完整 `npm test`。
- 新建任务 v1 的模式、只读 Vault、外部工作区、单终态、真实取消、正式 bridge 最新预发布候选与自动演进边界由治理契约覆盖；这只证明需求基线一致，不证明运行实现通过。
- Node 24 action runtime 版本固定与防止退回 Node 20 runtime 的自检。

## Phase B：治理与架构门

状态：固定身份、非官方声明、桌面端范围、Ardot v2 UI 权威和发布边界的最小契约已接入本地与双平台 CI。治理实现提交 `f3fa2402431868519164e65ebded27aa9bfe8f6a` 已通过远端 [CI run 32700464511](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32700464511) 的 Ubuntu 与 Windows job，原始 annotations 合计为 `0`。

新建任务 v1 需求、宿主状态、正式 bridge 最新预发布候选、自动演进边界和社区发布路线的治理实现提交 `516903d171a34196b2b48d4793a441db0ba1570d` 已通过远端 [CI run 32705249728](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32705249728) 的 Ubuntu 与 Windows job；两个 check-run 的声明 annotations 和原始 annotations 数组合计均为 `0`。该证据只证明治理契约一致，不证明正式 bridge 或“新建任务”运行实现通过。

计划覆盖：

- 固定显示名、插件 ID、仓库名、非官方声明和 `isDesktopOnly: true`。
- `AGENTS.md`、ADR、路线评估和发布状态文件存在且语义一致。
- 已实现、仅规划、未验证、阻塞和延期用语不漂移。
- `RuntimeAdapter`、事件和设置等公共契约变化有依赖同步证据。

Phase B 只证明治理与架构契约一致，不证明运行时已经可用。

## Phase C：运行时与 Vault 安全门

状态：部分建立，整体未通过。

进入运行时和 Vault Bridge 实现后逐项建立：

- 假运行时：成功、错误、乱序、超时和取消。
- Windows：裸命令、绝对路径、`.cmd` shim、隐藏窗口和进程树清理。
- 插件禁用和卸载后无残留进程与监听器。
- DSH 版本与协议能力握手。
- 未授权路径、绝对路径、`..`、二进制和超限输入拒绝。
- 未确认 proposal 不写入。
- base hash 冲突不覆盖。
- stderr、错误和日志脱敏。

Batch 0B 已建立其中的只读健康检查子集：

- 固定 `--version`，拒绝附加参数、相对路径、Windows `.ps1` 和 Shell 元字符。
- 精确目标版本 `0.1.1-rc.1`；其他版本明确显示不支持，不增加兼容分支。
- 假运行时覆盖 PATH 裸命令、绝对路径、Windows `.cmd` shim、无效输出、超时、stderr 限长脱敏、`dispose` 与进程树清理。
- Windows matrix 增加显式 `npm run test:runtime` 专项步骤；完整 `npm test` 仍在 Windows 与 Ubuntu 运行。
- SDK、ACP 与薄 bridge 的 P0 评估已形成唯一 ADR；Batch 4 已实现生产 bridge，Batch 5A 已实现 Obsidian 宿主 UI，Batch 6 已实现只读上下文，Batch 7 已实现模型发送链并统一 rc.2 健康检查。

正式 bridge 的版本演进门已冻结为：每个实现或兼容批次重新读取 GitHub 最新预发布与 npm dist-tag，以一致结果建立待验证候选并精确锁定；当前目标为 `0.1.1-rc.2`。计划中的上游监测只允许生成 issue、兼容提案或 draft PR，不得自动安装/更新 DSH、自动合并、自动发布或自动提交社区目录。监测 workflow 尚未实现。

Batch 2 已建立 rc.2 固定 tag 的源码能力证据与兼容矩阵，确认 `ctx.agents.create`/owned dispose、完整 `session/event`、真实 Agent cancel、一次性 approval 和 fail-closed 默认结果可供后续薄 bridge 使用。治理契约由双平台完整 `npm test` 执行；这不证明 rc.2 Windows 真实运行、正式握手或进程清理通过，Phase C 整体仍未通过。

Batch 2 实现提交 `d456a807215775e16da97ad60e388be2925249c2` 已通过远端 [CI run 32708553927](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32708553927) 的 Ubuntu 与 Windows job；两个 check-run 的声明 annotations 与原始 annotations 数组合计均为 `0`。

Batch 3 已实现 bridge 协议 v1、严格入站校验、client 状态约束与假 bridge，覆盖精确握手、response 关联、session/turn/seq、未知 required/ignorable 事件、权限一次性、cancel 确认、唯一终态、业务错误、shutdown/EOF 与超时。实现提交 `39023169811fc591be5fe33fde05662fbbc9657e` 已通过远端 [CI run 32711052033](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32711052033)；Ubuntu check `97382324601` 与 Windows check `97382324697` 均成功，声明 annotations 与原始 annotations 数组合计均为 `0`。`verify:ci-coverage` 明确校验这些用例仍由双平台完整 `npm test` 执行；正式 bridge 与 Windows rc.2 仍未通过。

Batch 4 已实现正式 `obsidian-bridge`、NDJSON、受管进程与独立 rc.2 运行夹具。本地 Windows 真实验收覆盖 artifact 加载、精确握手、Agent session、环回模型请求后的 mid-turn cancel、session close、正常退出；假进程专项覆盖 `.cmd` shim、隐藏窗口、超时强制终止整棵进程树、限长脱敏诊断。正式 artifact 版本、协议、DSH npm integrity、字节数和 SHA-256 由构建清单与 `verify:bridge-artifact` 固定。首个实现提交 `f04dfd07d2648b0c9152d9354b91e94d3ce87902` 的 CI `32717476733` 在干净检出中揭示进程单测依赖未跟踪构建产物；最小修复 `a719b03c88807740581a2a0327a462fa5e5b7664` 改为临时 artifact，并通过远端 [CI run 32717711862](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32717711862)。Ubuntu check `97402381390`、Windows check `97402381253` 均成功，两个原始 annotations 数组均为 `[]`。

Batch 5A 原实现提交 `c8f6922b1a44e5bc0fdb325fce183e95b85320d1` 的代码与双平台 CI 证据有效：[CI run 32919119819](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32919119819) 的 Ubuntu check `98028935782`、Windows check `98028935888` 均成功，两个原始 annotations 数组均为 `[]`。原运行截图误用了属于另一个插件的 `obsidian-trend-radar-evidence` Vault，已撤回。插件反馈与证据纠正提交 `a41c93b43245c9b1cfb84c4adb243ef4217c8253` 已通过 [CI run 32963736114](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32963736114)：Ubuntu check `98161570546`、Windows check `98161570396` 均成功，两个原始 annotations 数组均为 `[]`。证据提交 `d19cb1e81eee18fb882e9230dddc1493ebf2e4e1` 已通过 [CI run 32965459435](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32965459435)：Ubuntu check `98166848190`、Windows check `98166848475` 均成功，两个原始 annotations 数组均为 `[]`。Ardot 保持用户审阅原状、AI 只读；专用 `obsidian-dsh-workbench-evidence` Vault 已完成运行与视觉修正验收。

Batch 6 已实现只读知识库纯契约、Obsidian 宿主适配与 Workbench UI：当前笔记、当前选区、单个 Markdown 文件和明确选择的非根文件夹均需用户主动操作；文件夹递归展开为选择当下的确定 Markdown 集合，并在整批去重、数量和字节校验通过后原子加入。文件在发送前重新读取，失效/二进制/路径/数量/字节错误 fail closed 并保留草稿。限制为 `10` 项、单项 `96 KiB`、合计 `192 KiB`，最坏 JSON 双重转义的 wire frame 实测低于 `1 MiB`。最终实现状态 `7ee4b07d4afc0a67b8034e57c513599c7d562b19` 已通过本地完整门和远端 [CI run 33031107880](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33031107880)：Ubuntu check `98383584575`、Windows check `98383584694` 均成功，两个原始 annotations 数组均为 `[]`。专用 `obsidian-dsh-workbench-evidence` Vault 已在 Obsidian `1.13.7` 完成当前笔记、真实当前选区冻结、递归文件夹、后来新增文件不静默跟踪、快速助手、Light/Dark、精确 `700px`、禁用/重载复位、零错误与零 bridge 残留验收；临时夹具与部署资产已清理，原始笔记哈希不变。Ardot 未修改、只读核对。

Batch 7 已实现插件级 `NewTaskConversationController`、发送前任务/只读笔记确认、确定性 `64 KiB` 任务信封、DSH session 复用、流式回复、真实 turn cancel、取消超时强制清理和可见错误终态。运行数据按 [ADR-006](./architecture/ADR-006-conversation-runtime-storage.md) 分层：完整历史/设置/凭据保留在用户原生 `$DSH_HOME`，bridge overlay 位于 Vault 哈希分区的操作系统状态目录，Workbench 只保存内存投影；所有运行目录在启动 DSH 前校验不位于 Vault。对话 session 使用空工具清单、执行 guard 与只读系统提示三重拒绝工具；专用 Vault 已完成真实回复、流式停止、重载清理与视觉技术验收，合成冻结笔记的本机真实模型复验确认不再输出 DSML。最终修复 `1810aa9779bb7d3439a1b73c7c1cfdbbf2f04b80` 已通过远端 [CI run 33132970545](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33132970545)：Windows check `98726441325` 与 Ubuntu check `98726441475` 均成功，原始 annotations 均为 `[]`。

Batch 8A 已把任务 session 固定为六个文件工具、共享路径 guard、无 Shell/网络/Skill/子代理，并只在任务受管进程显式使用 rc.2 `workspace-write + ask`。正式 bridge artifact 和 Windows rc.2 真实运行门已同步验证。实现提交 `4f56372ae93ea9e01731b4ec19dcb8329d48aa28` 已通过远端 [CI run 33135433215](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33135433215)：Ubuntu check `98734194893`、Windows check `98734195115` 均成功，两个原始 annotations 数组均为 `[]`。

Batch 8B 已实现 [ADR-007](./architecture/ADR-007-task-workspace-ledger.md) 的 Vault 外逐轮变更账本：工作区/Vault/状态目录隔离、共享排除目录、文件数与大小上限、真实 created/modified/deleted、确定性文本行数与审核材料、`7` 天/每工作区 `20` 个账本清理、全量冲突预检、账本完整性校验与精确回滚。实现提交 `5f88c95b7795dd2494aee30da4bf01d29b7d86ac` 的首轮 [CI run 33148906025](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33148906025) 只在 Windows 暴露临时目录短路径与 `realpath` 长路径的测试断言差异；最小测试修复 `e9563cda85bbf6cb05d18984d0c5c8b47af6cf74` 未放宽生产边界。修复后的 [CI run 33149126275](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33149126275) 已通过 Ubuntu check `98776774841` 与 Windows check `98776774966`，两个原始 annotations 数组均为 `[]`。该提交只证明账本；当时任务控制器、工作区选择和变更 UI 尚未接通，后续 Batch 8C 才建立产品链路。

Batch 8C 已接通 Obsidian 桌面原生目录选择、共享边界校验、工作区与 task session 绑定、`workspace-write + ask` 受管进程、逐请求权限和所有任务终止路径的真实变更扫描。缺少工作区、路径身份变化或变更扫描失败均 fail closed；普通 UI 只显示工作区名称、文件数与文本增删摘要。完整本地门为 `112 passed / 1 skipped`、runtime `27 passed / 1 skipped`、真实 rc.2 bridge `1 passed`，构建、仓库边界、CI 覆盖和 artifact 自检通过。实现提交 `91b21345a52657520633475dfc9e86db7b720e65` 已通过远端 [CI run 33188573187](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33188573187)：Ubuntu check `98907874384` 与 Windows check `98907874519` 均成功，两个原始 annotations 数组均为 `[]`。专用 Vault 任务运行验收进入后续完整 UI 门，不冒充当前已通过。

Batch 8D 已把逐轮账本投影为真实文件卡：默认显示三个、可展开/收起，审核只读取账本前后快照，撤销经二次确认后调用同一 turn 的全量冲突预检。右键使用 Obsidian 原生 `Menu`，当前文件操作每次重新校验工作区、路径和普通文件；“另存为”和 VS Code 专属入口因账本外写入面与未验证外部依赖而不进入 v1。文件操作、控制器和 UI 测试由双平台 `npm test` 执行，无需新增 workflow job。本地完整测试为 `119 passed / 2 skipped`、runtime `27 passed / 1 skipped`、默认锁文件夹具的真实 rc.2 bridge `1 passed`，构建和完整自检通过。实现 `759ec97d4c21748016eb8e6a462ed3c78f153edb` 已通过 CI `33239392369`；Ubuntu `99065994296` 与 Windows `99065994274` 均成功且原始 annotations 为 `[]`。专用 Vault 运行验收进入 Batch 10。

这些证据证明正式 bridge、Obsidian 宿主 UI、只读上下文和产品对话发送链已形成代码与技术运行闭环，任务文件工具、逐轮变更账本、产品任务控制器和详细文件 UI 也已接通并通过双平台 CI。Batch 9 已接通同 leaf 正式会话、显式新建任务、插件生命周期内恢复边界与原生任务环境；完整测试为 `123 passed / 2 skipped`、runtime 为 `27 passed / 1 skipped`、真实 rc.2 bridge 为 `1 passed`，构建与完整自检通过。实现 `cf13ca7e87b51a927fadaaa092a2ca5af51587fd` 已通过 CI `33294157748`；Windows `99210845045` 与 Ubuntu `99210845119` 均成功且原始 annotations 为 `[]`。跨重启恢复明确延期，最终用户 UI 验收尚未通过，因此 Phase C 整体仍是“部分建立”。

## Phase D：隔离 Vault 与发布门

状态：部分建立，整体未通过。

计划覆盖：

- 在独立测试 Vault 安装、加载、禁用和重新加载。
- 原生 Workbench 视图与健康检查人工验收。
- Release blocker 验收矩阵。
- `main.js`、`manifest.json`、可选 `styles.css` 的生产构建与安装冒烟。
- README 的依赖、网络、隐私、桌面端和非官方声明。
- Release tag、manifest、package、versions 和附件一致性。
- 提交当天社区 name/id 实时查重。

Phase D 未通过时不得创建公开 Release 或提交社区目录。

Phase D 中既有代码门仍有效；此前使用 `obsidian-trend-radar-evidence` 的本插件运行与视觉证据已经撤回，且已在专用 `obsidian-dsh-workbench-evidence` Vault 重新完成加载/禁用、健康检查、默认“新建任务”、精简导航、宽窄/Light/Dark、可选快速助手、Batch 6 显式只读知识库与 Batch 7 真实对话技术验收。外部工作区、完整 Vault 安全矩阵、最终用户 UI 和发布资产验收仍未完成，因此 Phase D 整体未通过。

Ardot v2 进一步把“新建任务”固定为首个社区发布功能。它的完整实现、相应 CI、隔离 Vault 运行验收和用户对最终运行 UI 的明确验收，都是进入社区发布审批的前置条件；设计稿通过不改变 Phase D 的`延期，未通过`状态。

## Phase E：Release Automation

状态：未批准，禁止实施。

只有插件真实可加载、至少一项功能完成隔离 Vault 验收、Phase A-D 全部通过并获得单独批准后，才能：

- 根据无 `v` 前缀的语义化 tag 构建生产资产。
- 校验 tag 与版本文件一致。
- 上传 `main.js`、`manifest.json` 和可选 `styles.css`。
- 创建不可变 GitHub Release。

Phase E 不得自动提交 Obsidian 社区目录；社区提交仍是独立外部动作和单独验收门。

## 每批 CI 更新检查表

- [ ] 本批要改善的用户结果、允许范围、禁止范围和停止边界是什么？
- [ ] 本批新增或修改了哪些行为、平台、协议、安全或发布边界？
- [ ] 每项行为是否有最小相关测试？
- [ ] workflow 是否实际执行这些测试？
- [ ] 本地与 CI 是否调用相同脚本？
- [ ] 是否需要新增 Windows 或隔离 Vault job？
- [ ] 是否需要更新版本、边界、凭据或 Release 校验？
- [ ] diff 中每处修改是否都能映射到验收条件？
- [ ] 是否存在 `any`、空 catch、宽松 fallback、降低断言或 mock 冒充真实验收？
- [ ] 是否更新了本路线图的实际状态？
- [ ] 远端 CI 是否成功且原始 annotations 为零？

若 workflow 没有实际执行证明行为变化的测试，必须在同一批次更新 CI；否则该批次不得标记完成。mock 只证明受控契约，不得替代真实 DSH、Windows 进程、Obsidian 或隔离 Vault 验收。

## 当前下一步

用户当前已批准在同一 Goal 内按 Batch 2–10 顺序推进，并允许批次内自动拆分、精确提交和 push，不需要在既定范围内逐批重复确认。Batch 5A、Batch 6、Batch 7 与 Batch 8A–9 的精确范围已经通过本地门、双平台 CI 和原始零 annotations。Batch 10 进入专用 `obsidian-dsh-workbench-evidence` Vault 的完整 UI 与最终用户验收；DSH 模型、插件、预设、凭据与完整 session 仍由原生配置管理，插件只投影公开且实际启用的能力。Ardot 默认只读，除非用户明确要求不得修改。该连续授权不包括 Release、社区提交、真实 Vault 写入、任意 Shell、自动安装/更新 DSH 或上游监测 workflow 的实现。
