# Batch 2：正式 bridge `0.1.1-rc.2` 能力证据尖峰

- 审计日期：2026-08-24
- 审计对象：DeepSeek Harness 最新预发布 `0.1.1-rc.2`
- 上游 tag：`dsh-v0.1.1-rc.2`
- tag commit：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- 证据状态：源码能力已验证；Windows 真实 rc.2 运行未验证
- 批次边界：不实现协议、bridge、产品 UI，不安装或更新本机 DSH

## 用户结果与停止边界

本批把薄 `obsidian-bridge` 的关键依赖从 P0 推断推进为固定 tag 的官方源码证据，明确哪些 seam 可以被 Batch 3/4 直接消费，哪些能力仍需项目协议或 Windows 运行验收。停止在协议类型和进程实现之前。

禁止范围保持不变：不启动真实模型任务，不下载或安装 rc.2，不修改 DSH profile，不读取 Vault 内容，不增加 SDK/ACP/CLI 文本解析 fallback，不创建 Release 或社区提交。

## 候选身份读回

| 检查 | 2026-08-24 读回 | 结论 |
| --- | --- | --- |
| npm `@deepseek-ai/dsh` `version` | `0.1.1-rc.2` | 与候选一致 |
| npm `latest` / `next` | 均为 `0.1.1-rc.2` | 两个 dist-tag 一致 |
| GitHub release | `dsh-v0.1.1-rc.2`，pre-release | 与 npm 一致 |
| `git ls-remote` tag | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | 固定为轻量 tag commit |
| 上游根 `package.json` | `0.1.1-rc.2`，Node `^22.19.0 || >=24.0.0` | 本仓库 Node 24 CI 在声明范围内 |
| 本机 `dsh --version` | `0.1.1-rc.1` | 不能用于 rc.2 运行验收 |

本机没有可运行的 rc.2 源码检出，且 AGENTS.md 禁止自动安装或更新外部 DSH。因此本批没有把官方源码审计表述为“本机已兼容”或“Windows 已通过”。

## 固定 tag 源码能力

| Workbench 所需能力 | rc.2 官方 seam | 固定 tag 证据 | 本批结论 |
| --- | --- | --- | --- |
| 创建和拥有 session/Agent | `ctx.agents.create` 以 options 创建并返回 `AgentHandle`；持有者调用 `handle.dispose()` | `packages/core/agent/src/index.ts` | 源码能力已验证 |
| 完整事件与顺序 | `session/event` 发布不可变事件；事件带 session 内单调 `seq`，`turn/start`、`turn/end`、chunk、message、tool call 均带可关联 turn | `packages/core/session/src/index.ts`、`types.ts` | 源码能力已验证；Batch 3 只投影所需事件 |
| 真正 mid-turn cancel | `agent.cancel({ kind: 'user' })` 中止当前活动；`agent.whenIdle()` 等待整个 Agent 静止 | `packages/core/agent/src/runtime-types.ts`、agent-loop `cancel.spec.ts` | 源码语义与上游测试已验证 |
| 取消终态 | 取消 turn 产生 `turn/end`，reason 为 `aborted/user`；首个取消 cause 在生命周期竞态中保持 | agent-loop `cancel.spec.ts` | 可用于宿主 `cancelled` 判定；仍须真实运行读回 |
| 一次性权限 | `approval/request` waterfall；结果仅为 `allowed-once`、`rejected`、`cancelled`、`unavailable` | `packages/interaction/user-approval/src/index.ts`、`approval.spec.ts` | 源码能力已验证；缺失/异常 answerer 默认 `unavailable` |
| 权限关联 | `ApprovalRequest` 提供 exact `agent`、`toolName`、可选 `callId`/`reason`；相同 `callId` 可关联已发布 `tool/call` 的 turn 和 arguments | user-approval 与 session 类型 | Batch 3 必须按 session/turn/callId 关联；缺失或冲突 fail closed |
| 关闭与所有权 | `AgentHandle.dispose()` 停止、排空、注销 Agent、移除 session；ACP/SDK server 已示范连接/服务释放时等待 owned handles | agent、ACP、SDK server 源码与 ACP `dispose.spec.ts` | 同进程源码模式已验证；Windows 进程阶梯留给 Batch 4 |
| 精确握手 | 上游 Agent seam 没有 Workbench 需要的 bridge/DSH/协议/capability 握手 | SDK README 也明确无协议版本协商 | 必须由 Batch 3 的项目窄协议提供，未知/不匹配 fail closed |

`agent.whenIdle()` 只表示整个 Agent 静止，不直接标识某条 prompt 的结果。宿主必须用当前 session 的 `turn/start`/`turn/end` 和 turn number 建立活动区间，不能把 `whenIdle()` 单独解释为完成或取消。

`ApprovalRequest` 不重复工具参数；上游注释要求通过 `callId` 关联已经展示的 `tool/call`。因此 bridge 不得伪造 action、target 或 scope。只有同一 Agent/session 中找到唯一 callId、turn 和参数事件时才允许生成派生展示；否则返回 `unavailable`/拒绝并记录脱敏诊断。

## 可复核源码指纹

以下 SHA-256 对固定 tag 的 UTF-8 原文计算，只用于检测本次审计引用是否漂移，不替代上游签名或 npm integrity：

| 路径 | SHA-256 |
| --- | --- |
| `package.json` | `4adbdffa373754a048a214c5de3ec0671ac6e1f3c1521ec5b37e8fad1a4986d7` |
| `packages/core/agent/src/index.ts` | `e4986fec8aa6e991378f0195df4e931e4ca5bf31b2af886f55a3242691db6804` |
| `packages/core/agent/src/runtime-types.ts` | `c2151e5b245fef908e8fcb0a1ea8d0a32e222c753cbaea23aee6dc865e2d6010` |
| `packages/core/agent-loop/tests/cancel.spec.ts` | `2b887b61be648f46d53940b73c503d7327e093bef70597e5f749bcf25cc841a3` |
| `packages/core/session/src/index.ts` | `9594e128e8b170845d703e37a54902cd0cd8b2e73e8555e94594575bd18af8f9` |
| `packages/core/session/src/types.ts` | `f809a8774e05aa73da3a092bc5f3e31af6556c3ffdffc866be6c3335c0a97117` |
| `packages/interaction/user-approval/src/index.ts` | `b90b5af8a85fb4326950f74aa96285921175e2f287860ec8bdaa7f3563d91b7c` |
| `packages/interaction/user-approval/tests/approval.spec.ts` | `1aab6f367c543d9c4c26c8a9a52a569391fbf0352242ee808cb16ff24f20732c` |
| `packages/acp/acp/src/index.ts` | `ee37dc713d76061443c658fd704484aa4621d4ac7a4e41833b87eac0acdee422` |
| `packages/acp/acp/tests/dispose.spec.ts` | `330932b66bd005abcef1f7a0d22944808265a67004c512881abd4875c13f6dec` |
| `packages/sdk/server/src/server.ts` | `6707cf3cd51d42f03beab41a48b5335144c3510447a7458f0d9b5f094627c685` |

## 生产路线判断

- SDK server 的完整 session events 和正常 shutdown 是实现参照，但 SDK wire 没有 prompt cancel、session close 或双向权限请求，不能成为 fallback。
- ACP 的取消、一次性权限和 owned-agent 清理是实现参照，但它只面向自动化且不提供 Workbench 所需的完整事件呈现，不能成为 fallback。
- 薄 bridge 可以直接消费公开的 Agent/session/approval seam，不需要复制 DSH 状态机。
- bridge 的版本握手、窄事件投影、请求超时、幂等、EOF 和错误码仍由项目协议负责。
- bridge 的可解析部署方式、隐藏窗口、正常 shutdown、超时强杀和 Windows 零残留进程必须在 Batch 4 用真实 rc.2 验证。

## 后续批次输入

Batch 3 只冻结并测试最小项目协议：精确 initialize、session/turn 身份、基于 `seq` 的事件信封、一次性权限、cancel 请求/确认、shutdown、EOF 与单终态；使用假 bridge，不声称真实 DSH 通过。

Batch 4 才允许精确加入 rc.2 bridge 依赖和 lockfile，选择不修改用户 DSH profile 的部署方式，并在 Windows 验证裸命令/绝对路径/`.cmd` shim、隐藏窗口、真实 cancel、正常关闭、强制终止回退与零残留进程。

## 结论

**Batch 2 结论：协议可行，生产兼容未通过。**

当前可以依据固定 tag 的公开 seam 进入 Batch 3；仍不得对用户声称 rc.2 已安装、正式 bridge 已实现、Windows 生命周期已通过或“新建任务”已可运行。

## 官方固定来源

- [DeepSeek Harness `dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2)
- [Agent public runtime types](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/core/agent/src/runtime-types.ts)
- [Agent registry and handle](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/core/agent/src/index.ts)
- [Session event contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/core/session/src/types.ts)
- [Agent cancellation tests](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/core/agent-loop/tests/cancel.spec.ts)
- [User approval seam](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/interaction/user-approval/src/index.ts)
- [ACP implementation reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/acp/acp/src/index.ts)
- [SDK server implementation reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/sdk/server/src/server.ts)
