# ADR-005：新建任务 v1 宿主、状态与版本演进契约

- 状态：已接受
- 日期：2026-08-24
- 决策范围：首发“新建任务”的 Obsidian 宿主边界、状态机、正式 bridge 版本政策与兼容演进
- 不在本 ADR 内：运行实现、Vault 写入、依赖安装、Release、社区提交

## 背景

ADR-004 已把“新建任务”固定为唯一主对话与任务入口，但实现前仍需消除四类歧义：v1 究竟开放哪些模式、Vault 上下文与外部工作区如何分界、取消何时可以称为成功，以及正式 bridge 如何跟随仍处于预发布阶段的 DSH 演进。

本 ADR 接受时，代码只实现 DSH `0.1.1-rc.1` 的只读 `--version` 健康检查。后续 Batch 3–10 在 rc.2 上完成协议、bridge、宿主 UI、只读上下文、对话、Vault 外任务和专用 Vault 产品闭环；R1-M 又把健康检查与正式 bridge 统一迁移并精确支持 `0.1.2-alpha.3`。R2 只补充 Vault 外任务身份与 DSH 公开恢复事实，未改变本 ADR 的 Vault、权限或宿主 UI 边界。

## 决定

1. v1 真实实现“对话”和“任务执行”；“代码协作”不属于当前社区首发门，只能在需要保留信息架构时呈现真实禁用态。
2. Vault 上下文只来自当前笔记、当前选区、用户明确选择的文件，或用户明确选择的非根文件夹在选择当下递归展开得到的确定 Markdown 笔记集合，并在发送时形成不可变快照。文件夹展开先完成整批去重、数量和字节校验，不持续追踪新增文件。v1 不隐式读取整个 Vault，不写入、删除或移动 Vault 内容。
3. 任务执行只能使用用户明确选择的 Vault 外工作目录。Vault 不得成为默认可写 `cwd`，插件不提供任意 Shell 或危险权限模式。
4. 每个 turn 采用 `idle -> validating -> starting -> running <-> awaiting_permission -> cancelling -> cancelled` 状态链；`running` 或 `awaiting_permission` 也可进入唯一终态 `completed` 或 `failed`。
5. `cancelled` 只由 bridge/DSH 的取消确认与 turn 终态共同建立。取消超时后的进程终止属于 `failed(runtime_terminated)`。
6. 生产集成只使用薄 `obsidian-bridge`。每个实现或兼容批次以当时 GitHub 与 npm 一致的最新 DSH 预发布为候选，并在批准后精确锁定版本、tag、commit、bridge 与 lockfile。
7. bridge 握手必须返回精确 bridge、DSH、协议版本和 capability；不匹配、缺失或陈旧时 fail closed，不增加 SDK、ACP 或 CLI 文本解析 fallback。
8. 后续自动同步只负责发现上游新版本并生成 issue、提案或 draft PR。它不得自动安装/更新用户 DSH、自动合并、自动 Release 或自动提交社区目录。
9. 兼容矩阵只有经过上游差异审计、协议与假 bridge 测试、Windows 真实运行时及清理证据、必要的隔离 Vault 验收和用户明确批准后才能推进。

## 原因

- 单一主入口与两种真实模式足以覆盖首发工作流，避免为未批准的“代码协作”建立空行为。
- 不可变上下文快照让一次提交可解释、可测试，且不把用户后续编辑静默注入运行中任务。
- 外部工作区与只读 Vault 分离，缩小误写知识库和任意 Shell 的失败范围。
- 取消确认与运行时终止分开，避免用杀进程制造虚假成功状态。
- “发现候选”与“确认兼容”分开，使项目能跟踪快速变化的预发布版本，同时保持用户环境和发布门不被自动化越权。

## 后果与边界

- [新建任务 v1 需求基线](../requirements/new-task-v1.md) 是本 ADR 的详细验收契约。
- 当前正式 bridge 与健康检查统一精确锁定 DSH `0.1.2-alpha.3`。R1-M 已重新执行公开控制面、Windows 真实 bridge、专用 Vault 健康检查/真实无工具对话和零残留门；R2 已实现精确 session 读取/恢复、Vault 外最小任务索引和启动恢复投影，本地真实 DSH 跨进程门、实现 SHA 的双平台 CI 与原始零 annotations 均通过，R2 隔离 Vault 部署仍需另行批准。项目/最近 UI、下一批统一运行与发布动作不包含在 R2 中。
- [Batch 2 能力尖峰](./batch-2-bridge-capability-spike.md)与[运行时兼容矩阵](./runtime-compatibility-matrix.md)记录了上游 seam、证据指纹和自动演进门。
- [bridge 协议 v1](./bridge-protocol-v1.md)固定项目握手、事件、权限、取消、关闭、精确 session 读取/恢复和 fail-closed 行为；[ADR-012](./ADR-012-session-read-and-minimal-task-index.md)固定最小索引、所有权与失败状态。当前已通过假 bridge、正式 artifact 与本地 Windows alpha.3 跨进程运行验收。
- Batch 6 以现有 `1 MiB` NDJSON frame 和最坏 JSON 双重转义实测冻结上下文上限：最多 `10` 项、单项 `96 KiB`、合计 `192 KiB`。文件夹展开同样受这些限制并采用原子加入；任务字符上限由真实发送批次冻结。
- `DESIGN.md`、ADR-003 和 ADR-004 已检查：`2026-08-27` 用户直接反馈只演进插件中的知识库入口文案、扁平选择项和文件夹来源；Ardot 未修改，导航、图标与响应式总规则不变。
- 后续 bridge 打包、自动监测 workflow、实现源码、运行验收、Release 与社区提交仍受各自边界约束；当前连续目标只授权 Batch 3–10，不授权 Release 或社区提交。

## 验证

- `tests/contracts.test.ts` 固定模式、只读 Vault、外部工作区、单终态、真实取消、精确 alpha.3 版本、协议状态和只读自动演进边界。
- `tests/bridge-protocol.test.ts` 固定精确握手、session/turn/seq、一次性权限、cancel 确认、唯一终态、shutdown/EOF 和超时。
- `scripts/verify-ci-coverage.mjs` 确认上述治理契约由双平台完整 `npm test` 执行。
- Batch 5 宿主 UI 的状态与禁用行为由 `tests/new-task-state.test.ts` 和 `tests/plugin-baseline.test.ts` 固定。
- Batch 6 的显式选择、原子批量加入、去重、移除、失效/二进制/超限失败、发送时重读、不可变快照与 frame 余量由 `tests/new-task-context.test.ts` 固定；Obsidian 当前笔记/选区、Markdown 文件与文件夹建议器、递归展开、整批超限、只读 `cachedRead` 和 modal 清理由 `tests/obsidian-context-host.test.ts` 固定；`tests/plugin-baseline.test.ts` 固定“选择知识库 / 已选笔记”、UI 加入/预览/移除和草稿保留。
- Batch 7 的运行数据归属与 Claudian 对照由 [ADR-006](./ADR-006-conversation-runtime-storage.md) 固定；`tests/runtime-storage.test.ts`、`tests/new-task-conversation.test.ts` 和 `tests/workbench-conversation-ui.test.ts` 分别覆盖 Vault 外存储、对话状态机和真实 UI 行为。
- `scripts/verify-ci-coverage.mjs` 明确读取上述测试，双平台 `npm test` 实际执行。Batch 6 实现 `7ee4b07d4afc0a67b8034e57c513599c7d562b19` 的远端 CI `33031107880` 双平台成功且原始 annotations 均为 `[]`；后续 Batch 7–9 远端门和 Batch 10 专用 Vault/远端 CI 证据记录在 `docs/ci-cd-roadmap.md` 与 `design-qa.md`。R2 新增的 `tests/task-index.test.ts`、`tests/task-recovery.test.ts` 与真实 DSH 跨进程用例已在实现 `fd476a2e590c7281aa1de12640628e12a73b69d8` 的 CI `33581009658` 闭环。Release、发布资产与社区提交仍需独立批准和验证。
