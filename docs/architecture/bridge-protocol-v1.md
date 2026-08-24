# `obsidian-bridge` 协议 v1

- 协议版本：`1`
- 目标 bridge 版本：`0.1.0`
- 目标 DSH：`0.1.1-rc.2`
- 当前状态：协议、正式 bridge、NDJSON、受管进程与本地/远端 Windows DSH `0.1.1-rc.2` 真实运行已实现并验证
- 未通过：Obsidian 产品 UI、只读上下文、外部工作区权限与隔离 Vault 运行验收

## 目标与边界

协议 v1 只服务首发“新建任务”的对话与任务执行共同运行时需求。它不是通用 DSH API，不复制 DSH session 日志，不提供 SDK/ACP/CLI fallback，也不读取 Vault、接受任意 Shell 或保存凭据。

Batch 3 的假 bridge 直接交付已解析对象，用于验证协议和状态。Batch 4 已补 Windows 受管进程与换行分隔 JSON（NDJSON）stdio framing，并由独立锁定的 rc.2 运行夹具真实加载 artifact；这仍不表示 Obsidian 产品入口或隔离 Vault 已通过。

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
      "shutdown"
    ]
  }
}
```

成功响应的 `result` 必须精确返回：

```json
{
  "protocolVersion": "1",
  "bridgeVersion": "0.1.0",
  "dshVersion": "0.1.1-rc.2",
  "capabilities": [
    "session",
    "events",
    "cancel",
    "permission",
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
| `session/create` | `sessionId`、`mode: chat|task` | `{ sessionId }` | ready、ID 未占用 |
| `turn/start` | `sessionId`、`turnId`、非空 `text` | `{ accepted: true }` | idle session |
| `turn/cancel` | `sessionId`、`turnId` | `{ accepted: true }` | 当前活动 turn |
| `permission/resolve` | session/turn/request 三重身份、`allow-once|reject` | `{ accepted: true }` | 当前一次性权限请求 |
| `session/close` | `sessionId` | `{ closed: true }` | 无活动 turn |
| `shutdown` | 空对象 | `{ accepted: true }` | 无活动 turn |

远端业务错误使用 `{ type: "response", id, ok: false, error: { code, message } }`。已知业务错误只拒绝对应请求；解析错误、未知 code 或状态矛盾属于协议失败。`session/create` 失败不得留下 session 成功事实。

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

## 关闭、EOF 与超时

- `shutdown` 成功响应后连接进入 `closing`；随后 transport EOF 才进入 `closed`。
- initialize 前、ready/running 或 shutdown 响应前的 EOF 是 `failed(unexpected_eof)`。
- 每个 client 必须由调用方提供正安全整数 `requestTimeoutMs`；任一未决请求超时使连接失败并拒绝全部未决请求。
- Batch 3 不实现进程终止。Batch 4 必须在协议 shutdown 失败/超时后区分正常退出、受控强制终止与 `failed(runtime_terminated)`。

## 实现与 CI 证据边界

- `src/bridge-protocol.ts`：封闭 frame/type、严格入站校验与结果解析。
- `src/bridge-protocol-client.ts`：请求匹配、连接/session/turn 状态、seq、权限、取消、EOF 与超时。
- `tests/fakes/fake-bridge.ts`：不启动外部进程的可控 transport。
- `tests/bridge-protocol.test.ts`：假 bridge 行为矩阵，由 Windows/Ubuntu 的完整 `npm test` 执行。
- `src/obsidian-bridge.ts`：正式 Cordis plugin、DSH 事件窄投影、Agent 所有权与一次性权限回路。
- `src/bridge-ndjson-transport.ts` 与 `src/managed-bridge-process.ts`：1 MiB 封闭 framing、精确版本预检、隔离 `DSH_HOME`、隐藏启动、正常退出与强制清理。
- `tests/real-dsh-bridge.test.ts`：独立精确锁定 rc.2，真实加载 artifact、创建 Agent、mid-turn cancel、关闭与进程退出；由 Windows CI 专项脚本执行。
- 实现提交 `39023169811fc591be5fe33fde05662fbbc9657e` 已通过远端 [CI run 32711052033](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32711052033)：Ubuntu check `97382324601`、Windows check `97382324697` 均成功，声明 annotations 为 `0`，原始 annotations 数组也均为 `[]`。

Batch 4 最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664` 已通过远端 [CI run 32717711862](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32717711862)：Ubuntu check `97402381390`、Windows check `97402381253` 均成功，两个原始 annotations 数组均为 `[]`。本地及远端证据证明 rc.2 artifact 加载、环回模型请求、mid-turn cancel、Windows 隐藏进程、正常/强制关闭与清理；它不证明真实外部模型账号、Vault、Obsidian UI 或发布验收通过。
