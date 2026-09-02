# `obsidian-bridge` 协议 v1

- 协议版本：`1`
- 目标 bridge 版本：`0.2.0`
- 目标 DSH：`0.1.2-alpha.3`
- 当前状态：既有协议、正式 bridge、NDJSON、受管进程与 DSH `0.1.2-alpha.3` 真实运行保持；R2 已增加精确 session 读取/恢复和原生标题接缝，本地真实 DSH 跨进程验证通过，远端 CI 尚待本批精确 SHA 完成
- 明确延期或未授权：项目/最近 UI、完整历史复制、隔离 Vault 部署、Release、发布资产与社区提交未获授权

## 目标与边界

协议 v1 只服务首发“新建任务”的对话与任务执行共同运行时需求。它不是通用 DSH API，不复制 DSH session 日志，不提供 SDK/ACP/CLI fallback，也不读取 Vault、接受任意 Shell 或保存凭据。

Batch 3 的假 bridge 直接交付已解析对象，用于验证协议和状态。Batch 4 已补 Windows 受管进程与换行分隔 JSON（NDJSON）stdio framing，并由独立锁定的 rc.2 运行夹具真实加载 artifact；Batch 5/6 已实现宿主入口与只读上下文；Batch 7 由插件级控制器把发送时快照交给真实 bridge，投影流式文本、一次性权限、取消和明确终态；Batch 8/9 已接通 Vault 外任务、文件结果和正式会话。对话模式在 DSH scoped context 中隐藏并拒绝全部工具，并在最终系统提示中要求只消费信封内的 `contexts[].content`、不输出 DSML 或其他工具调用标记。Batch 10 专用 Vault 已验证真实对话与任务链，用户随后明确确认第一批开发目标完成。R2 只增加任务身份与可恢复性接缝：完整消息仍由 DSH 原生 session 管理，插件不复制历史，也不把本批扩大为导航或发布动作。

## 精确握手

client 第一个请求固定为：

```json
{
  "type": "request",
  "id": "request-1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1",
    "client": {
      "name": "deepseek-harness-workbench",
      "version": "0.1.0"
    },
    "requiredCapabilities": [
      "session",
      "events",
      "cancel",
      "permission",
      "session-read",
      "shutdown"
    ]
  }
}
```

成功响应的 `result` 必须精确返回：

```json
{
  "protocolVersion": "1",
  "bridgeVersion": "0.2.0",
  "dshVersion": "0.1.2-alpha.3",
  "capabilities": [
    "session",
    "events",
    "cancel",
    "permission",
    "session-read",
    "shutdown"
  ]
}
```

版本、已知 capability 集合、字段或类型任一缺失/漂移，连接进入 `failed(handshake_mismatch|invalid_result)`；不尝试协商、降级或 fallback。

## 请求与响应

所有请求使用 `{ type: "request", id, method, params }`。`id` 在连接内唯一且单调生成；响应必须精确匹配一个未决请求，未知或重复 response id 使连接失败。

| method | 最小 params | 成功 result | 前置状态 |
| --- | --- | --- | --- |
| `initialize` | 协议、client 身份、required capabilities | 精确身份与 capability | 新连接 |
| `session/create` | `sessionId`、`mode: chat|task`、非空限长 `title` | `{ sessionId }` | ready、ID 未占用 |
| `session/read` | 精确、非重复的 `sessionIds[]` | 与请求一一对应的 `available | missing | subagent | unreadable` | ready、无本地活动 session |
| `session/restore` | `sessionId`、`mode: chat|task` | `{ sessionId }` | 已读回为普通、非运行、可读取且 cwd 一致 |
| `turn/start` | `sessionId`、`turnId`、非空 `text` | `{ accepted: true }` | idle session |
| `turn/cancel` | `sessionId`、`turnId` | `{ accepted: true }` | 当前活动 turn |
| `permission/resolve` | session/turn/request 三重身份、`allow-once|reject` | `{ accepted: true }` | 当前一次性权限请求 |
| `session/close` | `sessionId` | `{ closed: true }` | 无活动 turn |
| `shutdown` | 空对象 | `{ accepted: true }` | 无活动 turn |

远端业务错误使用 `{ type: "response", id, ok: false, error: { code, message } }`。已知业务错误只拒绝对应请求；解析错误、未知 code 或状态矛盾属于协议失败。`session/create` 失败不得留下 session 成功事实。读取结果多出、遗漏或重复 session 身份属于 `invalid_result`；恢复遇到运行中、子代理、缺失、不可读或 cwd 不一致返回 `session_unrecoverable`，本地 ID 冲突返回 `session_conflict`，不得静默创建新 session。

## R2 精确读取与恢复边界

- `session/read` 只列举调用方索引中给出的精确 ID。bridge 可以调用 DSH 公开 `list()`/`inspect()`，但不得把全部原生 session、私有 JSONL 路径或消息内容投影给插件。
- `available` 只包含规范 `cwd`、`running`、`blank` 与可选原生 `title`。完整历史继续由 DSH 保存。
- `session/restore` 使用公开 `sessionController.create({ sessionId, cwd })` 采用既有 ID，再安装现有模式边界；它不恢复进程内 job、follow/control 或 mid-turn handle。
- headless 启动只在 Vault 外临时 overlay 中装配 DSH 公开 `workspace` 与 `session-controller` 服务，不修改用户 profile 或 DSH 安装。
- 详细数据所有权、索引与失败状态见 [ADR-012](./ADR-012-session-read-and-minimal-task-index.md)。

## 事件信封与顺序

已知事件使用：

```json
{
  "type": "event",
  "event": "assistant.delta",
  "sessionId": "session-1",
  "turnId": "turn-1",
  "seq": 1,
  "sourceSeq": 4,
  "payload": { "text": "..." }
}
```

- `seq` 是 bridge 为每个 session 生成的连续协议序号，从 `0` 开始；重复、回退或缺口使连接失败。
- `sourceSeq` 是可选 DSH 原始 session-event seq；因为 bridge 只投影窄事件，允许有缺口，但出现时必须严格递增。
- session/turn 必须精确关联当前活动 turn。
- 未知 required 事件拒绝；只有显式 `ignorable: true` 的未知事件可以只推进 `seq`，且不进入产品事件流。
- 已知 frame 使用封闭字段集合；未知字段、错误类型或未知 error/outcome 都 fail closed。

## v1 事件

| event | payload | 状态作用 |
| --- | --- | --- |
| `turn.started` | 空对象 | `starting → running` |
| `assistant.delta` | `{ text }` | 流式文本；不产生终态 |
| `assistant.message` | `{ text, interrupted? }` | 一步提交消息；不产生终态 |
| `tool.started` | `{ callId, toolName }` | 只公开关联身份，不复制参数 |
| `permission.requested` | `{ requestId, toolName, callId?, reason? }` | `running → awaiting_permission` |
| `turn.ended` | completed/cancelled，或 failed + errorCode | 唯一 turn 终态，session 回到 idle |

`turn.ended.failed.errorCode` 只接受 `context_invalid`、`network_error`、`permission_rejected`、`runtime_error`、`runtime_terminated`。

## 权限与取消

- permission request id 在 session 内不可复用；决定只允许当前 session/turn/request 一次。
- `allow-once` 不是持久授权；没有 `allow-always` 或全局允许。
- 过期、重复、错误关联和失联请求默认拒绝；bridge 不得凭空补 action/target/scope。
- `turn/cancel` 的 `{ accepted: true }` 只表示 bridge 已接收请求，不能建立 `cancelled`。
- 只有当前 turn 已进入 `cancelling` 且收到 `turn.ended { outcome: "cancelled" }`，宿主才建立取消终态。
- 没有 cancel 请求却收到 cancelled、或终态后再收到第二终态，均为协议失败。
- cancelling 竞态中若上游先完成，可接受 completed/failed；不得把进程终止映射为 cancelled。
- Batch 7 对话模式使用 `tools.restrict({ allow: [] })`、`tools.guard(...)` 和 `obsidian:chat-boundary` 系统提示三重拒绝全部 DSH 工具；最终 assembly 的 `tools` 必须为空，模型只回答信封中的 `task` 与 `contexts[].content`，不得按 path 读取或把 DSML 工具标记作为文本返回。因此当前对话正常情况下不会产生权限请求。协议保留该事件与决定，供 Batch 8 任务模式在独立权限政策下复用。

## Batch 8 任务模式文件边界

- 任务 session 只枚举并允许 `edit`、`glob`、`grep`、`read`、`read_image`、`write` 六个 DSH 文件工具；Shell、PowerShell、网络、Skill、子代理和其他工具同时从工具列表与执行 guard 拒绝。
- 受管 DSH 进程只有在任务模式下显式使用 alpha.3 的 `workspace-write + ask` 组合；它不是全局设置，也没有 `allow-always`。
- 所有工具路径必须位于已校验的 Vault 外工作区。绝对越界、`..`、不存在祖先越界、符号链接越界和权限升级参数 fail closed。
- `.git`、`node_modules`、`dist` 等依赖、缓存、构建产物与版本控制目录使用 [ADR-007](./ADR-007-task-workspace-ledger.md) 的共享排除表，不能由文件工具访问或进入变更基线。
- bridge 只负责执行边界与窄事件投影；逐轮变更事实、审核材料和安全撤销由 Vault 外 `TaskWorkspaceLedger` 提供。详细文件、审核、原生菜单和撤销 UI 已接通；当前插件 v1 allow-list 仍只有 `edit/glob/grep/read/read_image/write`，不包含删除，因此删除请求明确失败，不得伪装为已执行。

## 关闭、EOF 与超时

- `shutdown` 成功响应后连接进入 `closing`；随后 transport EOF 才进入 `closed`。
- initialize 前、ready/running 或 shutdown 响应前的 EOF 是 `failed(unexpected_eof)`。
- 每个 client 必须由调用方提供正安全整数 `requestTimeoutMs`；任一未决请求超时使连接失败并拒绝全部未决请求。
- 常规会话处置先走协议 shutdown，失败/超时后区分受控强制终止与 `failed(runtime_terminated)`；Obsidian 的 `onunload(): void` 无法等待异步 shutdown，因此插件禁用/重载使用同步进程树终止入口，确保渲染器销毁前零残留。

## 实现与 CI 证据边界

- `src/bridge-protocol.ts`：封闭 frame/type、严格入站校验与结果解析。
- `src/bridge-protocol-client.ts`：请求匹配、连接/session/turn 状态、seq、权限、取消、EOF 与超时。
- `tests/fakes/fake-bridge.ts`：不启动外部进程的可控 transport。
- `tests/bridge-protocol.test.ts`：假 bridge 行为矩阵，由 Windows/Ubuntu 的完整 `npm test` 执行。
- `src/obsidian-bridge.ts`：正式 Cordis plugin、DSH 事件窄投影、Agent 所有权与一次性权限回路。
- `src/bridge-ndjson-transport.ts` 与 `src/managed-bridge-process.ts`：1 MiB 封闭 framing、精确版本预检、用户原生 `$DSH_HOME`、Vault 外插件 overlay、隐藏启动、正常退出与强制清理。
- `src/new-task-conversation.ts`、`src/task-index.ts`、`src/task-recovery.ts` 与 `src/workbench-view.ts`：插件级 session 所有权、确定性上下文信封、Vault 外最小任务索引、启动恢复投影、流式/取消与错误终态。
- `tests/task-index.test.ts` 与 `tests/task-recovery.test.ts`：双槽原子快照、损坏隔离、并发锁、Vault 边界、恢复状态和失败保留；由双平台 `test:runtime` 执行。
- `tests/real-dsh-bridge.test.ts`：独立精确锁定 alpha.3，真实加载 artifact、以 Vault 外 cwd 创建 Agent、读回模型请求中的只读系统提示且确认没有 `tools`、完成一次模型回复、DSH 原生 JSONL session 落盘、mid-turn cancel、关闭与进程退出；R2 还以第二个独立 bridge 进程精确读取标题和缺失项，并通过公开 controller 恢复同一 session ID。由 Windows CI 专项脚本执行。
- 实现提交 `39023169811fc591be5fe33fde05662fbbc9657e` 已通过远端 [CI run 32711052033](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32711052033)：Ubuntu check `97382324601`、Windows check `97382324697` 均成功，声明 annotations 为 `0`，原始 annotations 数组也均为 `[]`。

Batch 4 最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664` 已通过远端 [CI run 32717711862](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32717711862)：Ubuntu check `97402381390`、Windows check `97402381253` 均成功，两个原始 annotations 数组均为 `[]`。本地及远端证据证明 rc.2 artifact 加载、环回模型请求、mid-turn cancel、Windows 隐藏进程、正常/强制关闭与清理；它不证明真实外部模型账号、Vault、Obsidian UI 或发布验收通过。
