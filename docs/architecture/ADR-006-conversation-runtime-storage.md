# ADR-006：真实对话生命周期与运行数据归属

- 状态：已接受
- 日期：2026-08-27
- 决策范围：Batch 7 真实对话的宿主所有权、DSH 会话归属、插件运行状态目录与 Vault 边界
- 参考实现：Claudian `15b78af785cda04fccc96f4effcfae6367f9be65`，只作设计比较，不作为 fork 或产品基线
- 不在本 ADR 内：外部工作区写入、逐轮文件 diff/撤销、会话恢复 UI、Vault 写入、Release、社区提交

## 用户结果

用户在 Workbench 关闭或切换页面后，当前 DSH 运行不被视图意外杀死；插件禁用或 Obsidian 退出时，受管进程必须被完整关闭。会话、凭据、配置和插件运行文件各有唯一事实来源，不把模型回复、运行日志或路径索引偷偷写入知识库。

## Claudian 对照结论

本批重新读取 Claudian 当前源码后，确认其中有四个值得沿用的思路：

1. 视图/标签生命周期与运行资源所有权分开；关闭一个视图不应让状态机失去唯一所有者。
2. provider 原生会话记录继续作为完整历史真相，插件只保存自身需要的投影或索引。
3. 关闭动作串行化，插件卸载时统一释放监听器、活动执行与外部资源。
4. 文件路径进入持久层前做归一化、包含关系和符号链接检查。

Claudian 把共享设置、session 元数据和输入账本放入 Vault 的 `.claudian`。该机制适合其产品取舍，但不适合本仓库已经冻结的“Vault 默认只读、DSH 会话/缓存/日志/凭据必须位于 Vault 外”宪法。因此不复制 `.claudian/sessions`、`.inputs.json` 或类似 Vault 内运行账本。

## 决定

### 1. 单一运行所有者

- `NewTaskConversationController` 由插件实例拥有；Workbench 视图只订阅内存投影。
- 关闭 Workbench 只移除订阅并清空该视图草稿/已选笔记，不取消活动 turn，不销毁 DSH session。
- 插件禁用或 Obsidian 退出调用控制器 `dispose`，先走协议 shutdown，超时后由受管进程终止整棵进程树。
- 当前不承诺跨 Obsidian 重启恢复运行中 turn；不得把 DSH 原生 session 文件复制进插件状态来伪造恢复。

### 2. 运行数据唯一事实来源

| 数据 | 唯一位置 | 当前持久性 | 边界 |
| --- | --- | --- | --- |
| DSH 凭据、模型设置、完整 session 历史 | 用户原生 `$DSH_HOME`，未设置时为 `~/.dsh` | 由 DSH 管理 | 插件不复制、不解析私有推理、不记录凭据 |
| 插件命令设置 | Obsidian 插件 `data.json` | 持久 | 当前只保存 `dshCommand`，不保存会话内容 |
| bridge overlay 与受管运行状态 | 操作系统应用数据目录下按 Vault 绝对路径 SHA-256 截断值分区 | overlay 可重建 | 目录名不含 Vault 原始路径，不进入 Vault |
| 当前草稿、已选笔记、消息投影、权限与终态 | 插件内存 | 插件重载即清除 | 不复制 DSH 完整 session，不持久化笔记正文或回复 |
| Vault Markdown | Vault 自身 | 原文件 | 仅通过 Obsidian API 读取用户明确选择的内容，不写入 |

Windows 状态目录固定为 `%LOCALAPPDATA%\DeepSeek Harness Workbench\vaults\<vault-hash>`；macOS 使用 `~/Library/Application Support/DeepSeek Harness Workbench/vaults/<vault-hash>`；Linux 使用 `$XDG_STATE_HOME/deepseek-harness-workbench/vaults/<vault-hash>`，未设置时回退 `~/.local/state`。

### 3. 路径与启动顺序

- `stateDirectory`、DSH `cwd` 或 `$DSH_HOME` 解析后位于 Vault 内时 fail closed。
- 检查必须解析已存在祖先和符号链接，并在创建状态目录后再次读回真实路径。
- 路径边界在执行 `dsh --version` 或启动正式 bridge 之前完成；失败不得产生 DSH 子进程。
- 对话 session 的 `cwd` 固定为上述已校验的 Vault 外插件状态目录，并显式传给 `ctx.agents.create({ meta: { cwd } })`；这只补齐 DSH prompt/workspace 身份，不开放任何工具或写入能力。
- 正式 bridge artifact 仍从插件安装目录只读加载；其 overlay、cwd、会话、日志和凭据均不得写在该目录或 Vault 中。

### 4. 对话最小权限

- Batch 7 “对话” session 在 DSH scoped context 同时使用 `tools.restrict({ allow: [] })` 与 `tools.guard(...)`，枚举与执行两层都拒绝全部 DSH 工具。
- 同一 scoped context 在 `system-prompt/assemble` 末端写入命名为 `obsidian:chat-boundary` 的只读边界，并把最终 `tools` 固定为空；模型只能回答用户信封的 `task` 与 `contexts[].content`，不得尝试按路径读取文件，也不得把 DSML/工具调用标记当作回答输出。
- 只读笔记由 Obsidian 宿主在发送前重读并封装进确定性文本信封；bridge 不获得 Vault API 或文件系统工具。
- bridge 协议保留工具/一次性权限的窄投影，是 Batch 8 任务模式的公共传输契约，不代表 Batch 7 对话已开放工具。

## 后续任务执行与已编辑文件

用户要求任务结束后显示真实“已编辑文件”卡片：默认三项、可展开、逐文件右键操作、审核和逐轮撤销。该能力进入 Batch 8 外部工作区实现，不在只读 Batch 7 生成空卡或假数据。

Batch 8 必须先冻结真实变更来源与数据留存：外部工作区文件是内容真相；逐轮基线、diff 索引和可撤销材料只能放在上述 Vault 外状态目录，必须绑定 workspace/session/turn、限制大小与保留期，并在展示前重新校验工作区包含关系。不得把整个仓库复制进 Vault，不得用 `git reset --hard` 或无归属覆盖冒充“撤销本轮”。

## 验证

- `tests/runtime-storage.test.ts`：系统目录解析、Vault 哈希、不暴露原始路径、显式 `$DSH_HOME`、Vault/符号链接包含关系。
- `tests/managed-bridge-process.test.ts`：边界检查先于 DSH、原生 `$DSH_HOME`、Vault 外 overlay、只读环境、隐藏启动、正常/强制清理与脱敏诊断。
- `tests/real-dsh-bridge.test.ts`：rc.2 真实 artifact、发送给模型的只读系统提示且无 tools、原生 DSH session 落盘、插件 overlay 分离、mid-turn cancel 与零残留。
- `tests/new-task-conversation.test.ts`：插件级 session 复用、发送时快照、流式投影、一次性权限、取消确认/超时和视图订阅分离。
- `tests/workbench-conversation-ui.test.ts`：发送前审阅、取消保留草稿、流式消息、停止入口、一次性权限和错误终态。
- `tests/obsidian-bridge.test.ts`：对话模式工具枚举、执行与系统提示三重拒绝，并验证既有 persona 不被覆盖。
- 上述测试由双平台 `npm test` 执行；运行存储与进程边界另由 Windows `npm run test:runtime` 显式执行，rc.2 artifact 由 `npm run test:bridge:runtime` 执行。

Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）在本批仅只读核对，未新增、删除、移动或修改任何节点、画板、文案、样式、变量或截图。
