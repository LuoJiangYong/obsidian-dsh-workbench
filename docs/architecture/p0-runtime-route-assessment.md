# P0 运行时路线评估

- 评估日期：2026-08-21
- 目标 DSH：`0.1.1-rc.1`
- 上游快照：`deepseek-ai/deepseek-harness@528c682e061696f5a160f363f236ecbf53cbd006`

## 决策问题

Workbench 后续需要一条生产运行时路线，同时满足：受管子进程、真实会话状态、可观察事件、真正取消、权限请求、明确关闭和 Windows 无残留进程。Batch 0B 只做路线判定与只读健康检查，不实现聊天、生产 bridge 或 Vault 内容访问。

用户已批准本批升级本机 DSH，并明确“先不考虑兼容”。因此本批只支持当前目标版本 `0.1.1-rc.1`；检测到其他版本时显示“不受支持”，不增加旧版本 fallback。这里的一行版本矩阵不是对未来兼容性的承诺。

## 证据分级

| 证据 | 含义 |
| --- | --- |
| 官方契约 | 来自目标上游提交的 README 或公开接口，只证明上游声明 |
| 本机实测 | 在 Windows 与 Vault 外临时目录实际执行，只证明本机当前组合 |
| 假运行时测试 | 证明本项目的启动、状态和清理逻辑，不冒充真实 DSH 协议 |
| 推断 | 由官方可扩展点推导出的可行性，必须在生产实现前重新验证 |

## 当前版本矩阵

| DSH | Node.js | 本批状态 | 说明 |
| --- | --- | --- | --- |
| `0.1.1-rc.1` | `25.5.0` | 目标版本 | 健康检查要求精确版本；一次性 headless 回路已在本机通过 |
| 其他版本 | 未评估 | 不支持 | 不建立兼容分支，不声称不可运行 |

## 本机实测

1. 全局 DSH 从 `0.1.0-rc.6` 升级为 `0.1.1-rc.1`，`dsh --version` 与 npm 全局清单读回一致。
2. 升级时发现旧 web profile 仍占用运行文件；只终止该已识别进程，重跑安装后临时目录由 npm 正常清理，再以隐藏窗口恢复 web profile。
3. 在 Vault 外临时目录执行一次非敏感任务 `只回复：P0_OK`，headless profile 返回 `P0_OK` 且退出码为 0。
4. 请求完成后未发现残留 headless 进程；持续存在的进程只有升级后主动恢复的 web profile，不属于插件受管进程。
5. 本项目假运行时测试已覆盖裸命令、绝对 shim、缺失命令、目标/非目标版本、无效输出、stderr 限长脱敏、超时和 `dispose` 进程树清理。它们不证明 SDK、ACP 或模型行为。
6. 隔离 Vault 已验证真实 `dsh --version`、缺失绝对 `.cmd` 的结构化失败、设置持久化/重载、超时和插件禁用后的进程树清理。

本批没有执行第二次模型请求。真实取消能力不从“终止进程”推断，而由官方协议契约和后续 bridge 验收单独证明。

## 路线 A：TypeScript SDK

官方 SDK client 以显式 `command`/`args` 启动完整 DSH 子进程，通过 stdio JSON-RPC 执行 `initialize`、`session/prompt` 和 `shutdown`。它能接收完整 session events、状态与 subagent 通知，并提供 EOF、SIGTERM、SIGKILL 的关闭阶梯。

不能满足生产 Workbench 的关键点：

- 协议没有 prompt cancel 或 per-session close；放弃 turn 等于关闭整个运行时。
- 没有协议版本协商，`serverInfo.version` 当前也不由 client 验证。
- client→server notification 与 server→client request 尚未实现，不能承载完整人工审批闭环。
- SDK 不解析或打包运行时，调用方仍需知道具体启动组合。

结论：事件可观察性强，适合自动化或测试，但不能作为本产品唯一生产适配器。关闭整个运行时不得包装为“停止生成”。

## 路线 B：ACP

官方 ACP bridge 支持 `initialize`、fresh `session/new`、`session/prompt`、`session/cancel` 和一次性 `session/request_permission`。它具有真实取消语义，并在连接释放时清理自己拥有的 Agents。

不能满足生产 Workbench 的关键点：

- 只输出已提交的 assistant 消息；raw delta、实时进度、reasoning、工具活动、plan、title 和 usage 都不在协议上。
- 只支持新会话；load、list、resume、delete、fork 均未实现。
- 生命周期属于整个连接，没有 per-session close。
- 官方明确将其定位为 automation adapter，而不是 UI integration 或 capability seam。

结论：取消和权限语义正确，但交互可观察性与会话生命周期不足，不能作为本产品唯一生产适配器。

## 路线 C：薄 `obsidian-bridge`

薄 bridge 是一个加载在 DSH Cordis composition 内的专用插件，只暴露 Workbench 当前需要的窄协议，不复制 Agent、session、permission 或持久化实现。可行性来自官方 SDK server 与 ACP bridge 均通过 Cordis `ctx.agents` 对外适配这一事实；具体 API 仍是 P0 推断，尚未运行验证。

后续生产实现的最小能力门必须同时包括：

- 初始化时返回精确 bridge/DSH 版本和显式 capability；不做静默兼容。
- 会话标识、受管 prompt 入队、带顺序依据的真实 session events。
- 调用 Agent 取消能力的 mid-turn cancel；不得以杀死整个进程冒充。
- 权限请求与用户决定的双向回路；默认拒绝未知或失联请求。
- 明确关闭与进程退出；插件卸载后无受管进程和监听器残留。

它不应：读取 Vault、接受任意 Shell、直接保存凭据、复制 DSH session 日志，或同时维护 SDK/ACP 两套生产传输。

结论：这是唯一能在单一窄协议内同时保留事件、取消、权限和生命周期语义的候选。代价是项目必须维护协议、版本握手和对上游漂移的测试。

## P0 结论

| 路线 | 事件可观察性 | 真正取消 | 权限回路 | 会话生命周期 | 结论 |
| --- | --- | --- | --- | --- | --- |
| SDK | 强 | 否 | 否 | 运行时级关闭 | 不选为生产主路线 |
| ACP | 仅已提交消息 | 是 | 是 | fresh session、连接级关闭 | 不选为生产主路线 |
| 薄 bridge | 可按窄契约提供 | 可按 Agent 语义提供 | 可按窄契约提供 | 可显式设计 | 选为唯一生产路线，待单独批次实现 |

唯一架构决定见 [ADR-001](./ADR-001-runtime-integration.md)。Batch 0B 实现的 `--version` 健康检查与生产传输解耦；健康检查成功只表示目标命令可执行，不表示已连接、已认证或会话可用。

## 官方来源

- [DSH TypeScript SDK client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/client/README.md)
- [DSH SDK protocol](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)
- [DSH SDK JSON-RPC server](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.md)
- [DSH ACP bridge](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)
