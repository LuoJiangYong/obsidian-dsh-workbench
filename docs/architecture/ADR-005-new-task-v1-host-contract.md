# ADR-005：新建任务 v1 宿主、状态与版本演进契约

- 状态：已接受
- 日期：2026-08-24
- 决策范围：首发“新建任务”的 Obsidian 宿主边界、状态机、正式 bridge 版本政策与兼容演进
- 不在本 ADR 内：运行实现、Vault 写入、依赖安装、Release、社区提交

## 背景

ADR-004 已把“新建任务”固定为唯一主对话与任务入口，但实现前仍需消除四类歧义：v1 究竟开放哪些模式、Vault 上下文与外部工作区如何分界、取消何时可以称为成功，以及正式 bridge 如何跟随仍处于预发布阶段的 DSH 演进。

当前代码只实现 DSH `0.1.1-rc.1` 的只读 `--version` 健康检查；它没有会话、事件、上下文、权限或取消能力。2026-08-24 重新核验的正式 bridge 候选为 DSH `0.1.1-rc.2`；Batch 2 已确认固定 tag 的 Agent/session/approval 源码 seam，但 bridge 尚未实现，rc.2 也未完成 Windows 运行验收。

## 决定

1. v1 真实实现“对话”和“任务执行”；“代码协作”不属于当前社区首发门，只能在需要保留信息架构时呈现真实禁用态。
2. Vault 上下文只来自当前笔记、当前选区或用户明确选择的文件，并在发送时形成不可变快照。v1 不读取整个 Vault，不写入、删除或移动 Vault 内容。
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
- 当前正式 bridge 候选是 DSH `0.1.1-rc.2`；其状态是“源码能力已验证，生产兼容未通过”。当前代码仍只验证健康检查 `0.1.1-rc.1`，两者均须如实展示。
- [Batch 2 能力尖峰](./batch-2-bridge-capability-spike.md)与[运行时兼容矩阵](./runtime-compatibility-matrix.md)记录了上游 seam、证据指纹和自动演进门。
- 数量和字节上限必须在实现批次以测量证据确定；本 ADR 不设占位常数。
- `DESIGN.md`、ADR-003 和 ADR-004 已检查：本批不改变获批页面、布局、导航、图标或响应式规则，无需修改。
- 后续 bridge 打包、自动监测 workflow、实现源码、运行验收、Release 与社区提交仍受各自边界约束；当前连续目标只授权 Batch 3–10，不授权 Release 或社区提交。

## 验证

- `tests/contracts.test.ts` 固定模式、只读 Vault、外部工作区、单终态、真实取消、`rc.1`/`rc.2` 状态分层和只读自动演进边界。
- `scripts/verify-ci-coverage.mjs` 确认上述治理契约由双平台完整 `npm test` 执行。
- 当前批次只验证文档契约一致性，不声称真实 bridge、DSH 会话、Windows 运行或隔离 Vault 产品验收通过。
