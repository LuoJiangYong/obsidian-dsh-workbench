# ADR-012：Session 读取接缝与最小任务索引

- 状态：已接受并实现；本地真实 DSH 验证已通过，远端 CI 与隔离 Vault 运行门待本批后续完成
- 日期：`2026-09-02`
- 目标 DSH：`0.1.2-alpha.3`
- bridge：`0.2.0` / protocol `1`

## 1. 唯一结果

插件重启后，能够依据 DSH 公开 session 事实与 Vault 外最小索引，重建“可以继续”或“明确不可恢复”的任务投影；插件不复制完整对话数据库，不解析 DSH 私有文件，也不把不可恢复任务伪装为可以继续。

## 2. 第一性原理结论

1. 用户要恢复的是“这个任务能否继续”的事实，而不是由插件复制第二份完整消息历史。
2. DSH 继续拥有完整 session、JSONL 历史、原生标题和 Agent 生命周期；Obsidian 继续拥有 Vault 内容；插件只拥有宿主任务身份、恢复投影和 Vault 外索引。
3. 当前 DSH 公开 session controller 能按 ID 列举、检查、采用既有 session ID、读取标题并创建 Agent。它不能跨进程恢复正在执行的 job、follow/control 所有权或 mid-turn 状态，因此重启前处于 `running` 的插件任务必须投影为已中断，不能宣称仍在运行。
4. 最小机制是精确 ID 读取、显式恢复和小型版本化索引，不建立公共多运行时仓库。当前只有 DSH 一个真实消费者，不满足多运行时框架门槛。

### 2.1 Claudian、DSH 与 Obsidian 只读对照

- Claudian：R2 开始时只读核对公开 HEAD `191e7c541bd9d0662067939e58166c651c2d2560`。复用的宿主思路是 repository/lifecycle 分层、generation fence 与路径包含关系防护；不采用其 provider registry 产品语义，不复制 `.claudian` 会话/输入存储，也不把它作为 fork 或长期基线。
- DSH：继续精确锁定 `0.1.2-alpha.3`，直接复用公开 `@deepseek-ai/dsh-api-session-controller` 的 `list`、`inspect`、显式 ID `create`、`rename` 和 DSH 原生 JSONL 持久化；follow/control 与运行 job 是进程内事实，不能跨重启伪造恢复。无法直接复用的是 Obsidian 产品 task 身份、输入摘要和宿主恢复状态，因此这些才进入插件最小索引。
- Obsidian：当前官方 `Plugin.loadData()/saveData()` 对应插件目录中的 `data.json`，仍位于 Vault 配置目录内，不适合作为 DSH session、任务索引或运行账本。Workbench 只通过桌面 `FileSystemAdapter` 取得并校验 Vault 身份；R2 数据继续使用现有操作系统应用数据分区，不写 Vault。
- 插件职责与供应商边界：插件只承担 `taskId ↔ sessionId`、Vault 外最小索引、精确恢复检查和 fail-closed 状态投影；DSH 私有 JSONL 结构留在 bridge 边界之外。该窄接缝允许未来重新评估其他运行时，但本批不建立注册框架，也不实现 PI/Codex 适配器。

## 3. 数据与所有权

| 事实 | 权威来源 | 插件是否复制 |
| --- | --- | --- |
| 完整消息、工具事件、原生标题、JSONL session | DSH `$DSH_HOME` | 否 |
| Vault 笔记与附件 | Obsidian Vault | 否 |
| `taskId ↔ sessionId`、模式、工作区身份、48 字符输入摘要、生命周期与失败原因 | Vault 外最小任务索引 | 是，仅保存这些最小字段 |
| 当前可恢复性、session 是否存在/运行/空白、规范 cwd | DSH 公开 session controller 的实时读回 | 否，只投影结果 |

索引位于现有 Vault 哈希分区的操作系统应用数据状态目录下，不使用 Obsidian `data.json`，不进入 Vault。工作区路径只保存在 Vault 外；面向用户的失败原因不得带本机绝对路径。

## 4. 公开运行时接缝

bridge v1 增加 `session-read` capability，并提供两个窄请求：

- `session/read`：只接收调用方给出的精确 session ID 列表；结果必须一一对应且不允许多出、遗漏或重复身份。bridge 通过公开 `sessionController.list()` 与 `inspect()` 建立 `available | missing | subagent | unreadable` 事实，不向插件暴露私有存储结构。
- `session/restore`：只恢复已被 `session/read` 确认为普通、非运行、可读取且规范 cwd 与当前进程工作区一致的 session。bridge 使用公开 `sessionController.create({ sessionId, cwd })` 采用原 ID，再取得 Agent 并安装现有对话/任务执行边界。

新 session 仍使用 DSH `agents.create()`，以保留当前模型、提供方和原生组装行为；创建后通过公开 controller `rename()` 保存经限长的任务标题。恢复不会伪造正在执行的 handle，关闭由 DSH `appExit` 和现有受管进程清理负责。

DSH headless 默认 profile 没有装配公开 session controller。Workbench 只在每次启动的 Vault 外临时 overlay 中显式加入公开 `@deepseek-ai/dsh-workspace` 与 `@deepseek-ai/dsh-api-session-controller` 服务；不修改用户 profile、配置或 DSH 安装，不引入私有包或私有文件解析。

## 5. 最小索引与恢复状态

索引 schema 固定为版本 `1`，采用两个不可变快照槽与单调 revision。写入流程为同目录临时文件、原子替换和读回验证；独占 `write.lock` 阻止活跃并发写，死亡进程锁被隔离保存。首次写入结果不确定时，同一 `taskId/sessionId` 与相同字段可以幂等重试，不能另造身份。损坏或不支持版本的快照不会被覆盖：单槽损坏时标记降级并读取上一有效槽，在下次覆盖该槽前改名保留原件；全部不可读时 fail closed，保留损坏证据并显示启动检查失败。

任务只保存以下生命周期：`starting | ready | running | failed | interrupted`。启动恢复投影为：

- `continuable`：DSH session 存在、普通、非运行、可读取且 cwd 与索引一致；索引中的 `running` 同时标记 `interrupted: true`。
- `unrecoverable`：session 缺失、是子代理、不可读取或 cwd 不一致；保留任务、输入摘要和明确原因。
- `startup_failed`：索引记录的启动阶段已失败，没有伪造 DSH session。
- `check_failed`：索引或 DSH 读取暂时失败；不把临时检查错误写成永久不可恢复，也不删除原记录。

不可恢复任务默认保留记录、原始输入摘要和原因；只允许用户显式重试或新建任务。显式新建只清除当前内存投影，不删除索引记录或 DSH 原生 session。

## 6. 输入、处理、输出与失败行为

- 输入：首次有效发送形成的任务身份、模式、工作区和标题摘要；启动时的索引快照；调用方给出的精确 DSH session ID。
- 处理：先写 `starting`，再读取精确 session 事实并选择创建或恢复；turn 前后更新生命周期；启动恢复只投影事实，不遍历或复制完整历史。
- 状态：索引 revision、最小任务记录、只读恢复快照；完整会话状态继续由 DSH 管理。
- 输出：`continuable | unrecoverable | startup_failed | check_failed` 任务投影，或当前对话控制器的真实失败终态。
- 失败：身份、cwd、版本、字段、锁、快照或 DSH 响应任一矛盾均 fail closed；不静默重建 session、不自动删除、不用新 ID 冒充旧任务。

## 7. 验证与证据边界

- 单元/契约：精确 session 身份、创建/恢复、标题、损坏隔离、双槽回退、并发锁、Vault 边界、任务生命周期与重启投影。
- 真实 DSH：两个独立 bridge 进程共享临时 `$DSH_HOME`；第一进程创建并关闭 session，第二进程精确读取标题、确认缺失项并用公开 controller 恢复同一 ID。该本地测试已通过。
- Windows 与 CI：`test:runtime` 覆盖索引/恢复；`test:bridge:runtime` 覆盖真实跨进程接缝；Windows/Ubuntu 完整门与原始 annotations 必须在精确实现 SHA 上通过后，本批才完成。
- 隔离 Vault：开发批准不授权部署。只有本地门通过、展示精确 Vault 身份、插件版本和资产 diff 并另获批准后才能执行。

## 8. 明确不做

本批不实现项目模型或 UI、“项目/最近”导航、排序/置顶/归档/删除、统一权限、附件、知识库健康检查、完整消息数据库、DSH 私有文件解析、多运行时框架、PI/Codex 适配器、Ardot 修改、真实 Vault 写入、Release、社区提交或用户 DSH 自动安装/更新。

## 9. 回滚

bridge、协议 client、任务控制器、索引和启动投影可随同一个 R2 实质提交整体回滚。索引是 Vault 外独立文件，回滚旧插件不会读取或覆盖它；DSH 原生 session 未被迁移或删除。若未来 schema 演进，未知版本继续只读隔离并 fail closed。
