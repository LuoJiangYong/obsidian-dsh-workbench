# ADR-001：生产运行时采用单一薄 `obsidian-bridge`

- 状态：已接受
- 日期：2026-08-21
- 决策范围：未来 DSH 交互传输路线
- 不在本 ADR 内：生产实现、聊天 UI、Vault 内容访问、Release 与社区提交

## 背景

Workbench 需要的不只是“能得到最终回答”，还包括真实 session events、mid-turn cancel、权限请求、明确会话生命周期和 Windows 受管进程清理。官方 TypeScript SDK 与 ACP 各自只覆盖其中一部分；并行维护两条生产传输会产生两套状态、取消和错误事实来源。

[P0 运行时路线评估](./p0-runtime-route-assessment.md) 已把官方契约证据、本机实测、假运行时测试和推断分开记录。

[Batch 2 能力证据尖峰](./batch-2-bridge-capability-spike.md)针对 `dsh-v0.1.1-rc.2` 固定 tag 读取公开 Agent、session、approval seam；Batch 4 已在这些 seam 上实现正式 bridge，并通过本地及 Windows CI 的真实运行与进程清理。

[bridge 协议 v1](./bridge-protocol-v1.md)已固定精确握手、session/turn/seq、一次性权限、取消确认、shutdown、EOF 与单终态；Batch 4–10 已完成 rc.2 下的产品闭环。R1-M 在不改变项目协议和产品边界的前提下把生产目标迁移到 alpha.3，并重新验证公开控制面、真实 bridge、Windows 生命周期与专用隔离 Vault。

## 决定

未来生产集成只采用一条薄 `obsidian-bridge` 路线：在受管 DSH Cordis composition 中加载专用 bridge，以项目拥有的窄协议向 Obsidian 插件暴露所需能力。

- 不把官方 SDK 或 ACP 作为第二条生产 fallback。
- bridge 复用 DSH 的 Agent、session、permission 和持久化服务，不复制其业务状态。
- bridge 协议必须精确握手版本与 capability；目标版本不匹配时失败可见。
- cancel 必须调用 DSH Agent 的真实取消语义；进程终止只用于关闭或故障清理。
- 权限请求必须 fail closed，并能把用户决定关联回原请求。
- 插件只管理 bridge 子进程和协议状态；Vault 内容访问仍需后续独立批准的 Vault Bridge。
- Batch 0B 的固定 `--version` 健康检查保持独立，只判断命令与目标版本，不建立连接。

## 理由

官方 SDK 提供完整事件与可靠进程关闭，但缺少 prompt cancel、session close、版本协商和双向审批。官方 ACP 提供真实取消与权限，但只交付已提交消息，缺少交互 Workbench 所需的实时事件与会话恢复/关闭。

薄 bridge 是唯一能在单一状态源内同时提供事件、取消、权限和生命周期的路线，也允许协议只覆盖实际用户工作流。该选择增加自有协议维护成本，但比在 UI 中拼接 SDK 与 ACP 两种不等价语义更小、更可测试。

## 后果

正向后果：

- UI 只消费一个运行时契约。
- 取消、权限、事件和错误可以在同一 session 身份下验证。
- 协议可保持窄小，不承担 DSH 通用客户端职责。

成本与约束：

- 项目必须维护 bridge/DSH 精确版本矩阵、协议契约测试和上游漂移审计。
- 协议、假 bridge、正式 bridge 与真实 alpha.3 已覆盖握手漂移、乱序、超时、取消、权限、EOF、正常关闭、JSONL session 和 Windows 进程树清理；专用隔离 Vault 已读回健康检查、真实无工具对话、显式运行时处置与零残留。当前生产目标为 alpha.3；跨重启最近会话恢复继续明确延期，Release 与社区提交仍未授权。
- 需要单独的批准批次选择 bridge 的部署与打包方式；本 ADR 不授权自动安装或修改用户 DSH profile。
- 当前连续目标已授权 Batch 3/4 在保持“不自动安装、不修改用户 DSH profile”的前提下完成协议、部署与 Windows 验证；Release 和社区提交仍未授权。

## 被否决方案

1. TypeScript SDK 作为唯一生产路线：无法实现真实 mid-turn cancel 与权限闭环。
2. ACP 作为唯一生产路线：缺少实时事件、完整交互状态与可恢复会话能力。
3. SDK 与 ACP 双路线并存：会制造双状态源和不可等价的取消/输出语义。
4. 由 Obsidian 插件解析 DSH CLI 文本输出：没有稳定协议，且会把诊断 stdout 与产品事件混为一谈。

## 后续激活门

Batch 4 已把本 ADR 推进到“生产 bridge 已实现并完成本地与远端 Windows rc.2 运行验收”。最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664` 的 CI run `32717711862`、Ubuntu check `97402381390`、Windows check `97402381253` 均成功，两个原始 annotations 数组均为 `[]`。这不等于“新建任务”已交付，也不授权 Release、社区提交或 Vault 写入。
