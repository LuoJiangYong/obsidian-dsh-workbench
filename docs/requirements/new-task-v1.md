# 新建任务 v1 需求基线

- 状态：已实现并验证；正式 bridge、宿主 UI、只读上下文、对话/任务链、逐轮文件 UI 与正式会话均已实现，Batch 10 专用 Vault 技术运行门、双平台 CI 与原始零 annotations 已通过；用户已于 `2026-08-31` 明确确认第一批开发目标完成
- 日期：2026-08-24
- UI 审阅基线：Ardot `UI 真相 v2`（页面 `12:1`）
- 发布关系：首个 Obsidian 社区插件发布功能

## 用户结果

用户在 Obsidian 中只通过“新建任务”开始一次 DeepSeek Harness 工作：选择“对话”或“任务执行”，明确提交内容与上下文，观察真实执行状态，在需要时审阅权限并真正取消当前 turn。失败、取消、完成和运行时终止不得互相冒充。

本文件冻结 v1 的产品与宿主契约。当前连续 Goal 已授权按 Batch 2–10 实施协议、bridge、UI、只读上下文与外部工作区任务；仍不授权 Vault 写入、DSH 自动安装/更新、Release 或社区提交。

## 模式与入口

- “新建任务”是唯一主对话与任务入口，固定在 Workbench 内部导航首位。
- v1 发布门必须真实实现“对话”和“任务执行”。
- “代码协作”不属于当前社区首发门。若批准后的实现仍需保留该入口，只能使用原生 `disabled` 或 `aria-disabled="true"` 与浅灰文字、图标表达不可用，不得接入占位行为。
- “运行”位于导航最后，合并当前能力真值与只读 DSH 健康检查。
- 右侧任务环境保持默认关闭和可选，不替代“新建任务”，不承载唯一确认。
- 产品 UI 不显示开发批次、发布门、“规划中”或“尚未实现”等治理文案。

## 输入、上下文与快照

一次提交由以下输入组成：

1. 用户输入的任务文本。
2. 当前选择的模式：“对话”或“任务执行”。
3. 用户显式加入的上下文：当前笔记、当前选区、一个或多个明确选择的 Vault 文件，或明确选择的文件夹在选择当下递归展开得到的 Markdown 笔记集合。
4. 任务执行模式下由用户显式选择的 Vault 外工作目录。

发送前必须以“已选笔记”显示逐项来源并允许移除。文件夹展开必须先对全部候选完成去重、数量和字节校验，再一次性加入；失败不得留下部分笔记。发送动作建立不可变上下文快照；后续编辑原笔记或更换活动文件不得静默改变已经发送的 turn。空输入、已失效文件、二进制文件、越界路径和超限输入必须在启动 DSH 前以可定位错误失败，并保留草稿。

v1 不把整个 Vault 作为默认上下文，不索引整个 Vault，也不写入、删除或移动 Vault 内容。上下文项目数、单项字节数与合计字节数已由 Batch 6 基于 frame 测量冻结；Batch 7 将任务文本上限冻结为 UTF-8 `64 KiB`，诊断尾部固定为 `2 KiB`。未完成测量的边界不得虚构数值。

Batch 6 已依据现有 `1 MiB` NDJSON frame 上限冻结上下文子集：最多 `10` 项、单项 `96 KiB`、合计 `192 KiB`。测试把最大合计内容分别填充为引号与换行，经过上下文 JSON 和 `turn/start` wire frame 的双重转义后仍小于 `1 MiB`，为任务文本、标识和协议字段保留余量。最终实现状态 `7ee4b07d4afc0a67b8034e57c513599c7d562b19` 已通过远端 CI `33031107880` 的 Ubuntu/Windows job 与原始零 annotations，并在专用 Vault 完成选择、冻结、重载清理、宽窄屏和明暗主题运行验收。Batch 7 的 `64 KiB` 任务上限与确定性 `{ version, task, contexts, notice }` 信封由对话控制器测试固定。

当前实现只在用户点击“选择知识库”后列出 Obsidian 已知的 Markdown 文件或非根文件夹元数据；不会预读整个 Vault。选择文件夹时递归枚举当下已有且尚未选择的 Markdown 笔记，冻结为逐篇文件 ID，不持续跟踪后来新增的文件。当前笔记和明确选择的 Vault 文件在发送前以 `Vault.cachedRead` 重新读取；当前选区是用户先在 Markdown 编辑器中选中的文本，在加入时固定。已选来源可见并可逐项移除。bridge 只接收后续宿主建立的快照，不获得 Vault API 或文件系统读取能力。

## 工作区与权限边界

- Vault 默认只读；上下文读取仅限用户显式选择的文件或选区。
- “任务执行”要求用户显式选择 Vault 外工作目录，且该目录不得由插件静默记为全局无限权限。
- 整个 Vault 不得成为 DSH 默认可写 `cwd`。
- v1 不提供任意 Shell 输入，不启用 `danger-full-access`，不扩大到全磁盘访问。
- DSH 工具需要权限时，bridge 必须发出与当前 session/turn/request 绑定的权限请求；未知、过期、失联或无法关联的请求默认拒绝。
- 权限决定只作用于当前明确请求；持久授权与更大写入范围不属于 v1。
- Batch 7 “对话”模式不需要工具：DSH scoped context 使用空工具清单、执行 guard 与 `obsidian:chat-boundary` 系统提示三层拒绝全部工具，模型只消费冻结信封的 `task` 与 `contexts[].content`，不得按 path 读取或输出 DSML 工具调用标记。协议中的工具与权限投影保留给 Batch 8 任务模式，不等于对话已经开放权限。

## 会话与运行数据

- 运行所有权属于插件级 `NewTaskConversationController`；关闭 Workbench 视图只移除订阅，不取消活动 turn。插件禁用或 Obsidian 退出必须关闭受管进程。
- 完整会话历史、DSH 设置和凭据以用户原生 `$DSH_HOME` 为唯一事实来源；插件不得在 Vault 或 `data.json` 复制 session 内容。
- bridge overlay 与插件运行状态位于操作系统应用数据目录下的 Vault 哈希分区；目录名不得包含 Vault 原始路径。
- 插件内存只保存当前草稿、已选笔记和公开消息投影；插件重载后清除，不伪造跨重启会话恢复。
- 首条消息经确认且校验通过后建立当前插件生命周期内的 session 投影；关闭/重开 Workbench leaf 重新订阅并恢复正式页，模式与规范工作区保持锁定。
- 返回开启页只能由用户显式确认“新建任务”；控制器先处置受管运行时，再清空当前投影。此操作不删除 DSH 原生 session 或 Vault 外逐轮账本。
- `stateDirectory`、DSH `cwd` 或 `$DSH_HOME` 经真实路径/符号链接解析后位于 Vault 内时，必须在执行任何 DSH 检查或启动前 fail closed。

详细归属与 Claudian 设计比较见 [ADR-006](../architecture/ADR-006-conversation-runtime-storage.md)。

## 状态机与失败语义

```text
idle
  -> validating
  -> starting
  -> running
  <-> awaiting_permission
  -> cancelling
  -> cancelled

running | awaiting_permission
  -> completed | failed

cancelled | completed | failed
  -> idle（新提交）或 retry（显式重试）
```

约束：

- 每个 turn 只能产生一个终态：`cancelled`、`completed` 或 `failed`。
- 只有 bridge/DSH 已确认取消并收到该 turn 的取消终态后，UI 才能显示 `cancelled`。
- 取消超时后若必须终止运行时，终态是 `failed(runtime_terminated)`，不得冒充已确认取消。
- 关闭 Workbench 视图不等于取消；插件禁用或 Obsidian 退出必须关闭所有受管运行时并移除监听器。
- v1 不承诺 Obsidian 重启后恢复运行中会话；重启后发现未完成 turn 时必须显示为“已中断”，不得显示仍在运行或已完成。
- 校验失败或启动失败保留任务草稿和已选上下文，且不得生成 session 成功状态。
- 乱序、重复或无法关联到当前 session/turn 的事件必须拒绝或隔离，并留下脱敏且限长的诊断。

## 正式 bridge 与 DSH 版本策略

生产路线只采用 ADR-001 的单一薄 `obsidian-bridge`，不把 SDK 或 ACP 作为并行生产 fallback。

- 每个 bridge 实现或兼容批次开始时，分别读取 DeepSeek Harness 官方 GitHub 最新预发布与 npm `@deepseek-ai/dsh` 的 `latest`/`next` dist-tag；两者一致后才形成候选。
- 当前正式 bridge 目标是 `0.1.2-alpha.3`，GitHub tag 指向提交 `dd6322d604e00eec1ba5e0c8541159906a21094a`。R1-M 以纯 215 包依赖图验证公开 session controller，再同步迁移健康检查、bridge、生产夹具、构建清单、Windows 运行门与专用隔离 Vault。既有 Batch 4–10 的对话、任务、取消、Vault 外账本与 UI 边界保持有效；跨重启恢复仍属于 R2，尚未实现。
- 获批实现必须精确锁定 DSH 版本、上游 tag/commit、bridge 版本和 lockfile，不使用浮动版本范围。
- 握手必须返回精确 bridge 版本、DSH 版本、协议版本和 capability；缺失、陈旧或不匹配时失败可见且 fail closed。
- 当前插件健康检查与正式 bridge 已统一精确支持 `0.1.2-alpha.3`；版本不匹配时两条路径都 fail closed，不增加兼容 fallback。
- 项目[bridge 协议 v1](../architecture/bridge-protocol-v1.md)已实现严格类型、client 状态约束、正式 bridge、NDJSON 与 Windows 受管进程；Batch 7 最终修复 `1810aa9779bb7d3439a1b73c7c1cfdbbf2f04b80` 已通过 CI `33132970545` 的 Ubuntu/Windows job 与原始零 annotations。任务执行已接通；当前正式工具集固定为 `edit/glob/grep/read/read_image/write`，不含删除工具。

## 任务结束后的已编辑文件

该能力属于 Batch 8 外部工作区任务，不得在只读对话中显示空卡或假变更：

- 每个任务 turn 结束后以真实变更证据显示“已编辑 N 个文件”、总新增/删除行数；默认展示 `3` 个文件，超出项可展开/收起。
- 每个文件行显示相对工作区路径和新增/删除行数。右键使用 Obsidian 原生菜单，支持审核、系统默认应用打开、在资源管理器中显示、复制相对路径、用户明确请求后复制完整路径，以及复制当前 UTF-8 文本。操作前必须重新校验路径仍在用户显式工作区内；已删除文件的当前内容操作保持禁用。
- v1 不加入 VS Code 专属入口和桌面“打开方式”克隆，因为前者依赖未验证外部应用，后者不是 Obsidian 原生工作流；不加入“另存为”，因为它会新增逐轮账本之外的写入面，无法由当前审核与撤销契约覆盖。
- “审核”打开该 turn 的真实 diff；“撤销”只允许撤销能够归属到该 turn 且基线仍匹配的变更，必须二次确认。不得调用 `git reset --hard`、覆盖无关用户修改或把运行时终止冒充撤销成功。
- 外部工作区文件是当前内容真相；逐轮基线、diff 索引和撤销材料只允许进入 Vault 外状态目录，并必须限制大小、保留期与清理时机。数据契约和失败回滚由 ADR-007 冻结，产品交互由 [ADR-009](../architecture/ADR-009-task-change-review-and-undo-ui.md) 固定；UI 只消费真实账本结果，不得用占位结果冒充接通。

Batch 8 变更账本契约已由 [ADR-007](../architecture/ADR-007-task-workspace-ledger.md) 实现：默认跟踪最多 `10,000` 个普通文件、单文件 `2 MiB`、原始基线合计 `64 MiB`，每工作区最多 `20` 个账本、有效期 `7` 天；标准依赖、缓存、构建和版本控制目录与符号链接不进入基线。活动账本保存全部可跟踪基线，完成后只保存真实变化文件的前后快照，均位于 Vault 外。撤销前校验全部当前哈希与账本完整性，任一冲突则零写入。Batch 8C 已接通工作区选择和正式任务控制器；Batch 8D 已实现默认三项/展开、原生右键菜单、真实前后快照和二次确认撤销，并进入双平台 `npm test` 覆盖；Batch 10 已在专用 Vault 完成真实创建/修改、审核、菜单与原子撤销读回。

## 正式会话与任务环境

- 开启页标题与正式会话标题互斥；首条消息只有在发送前确认及校验通过后才切换到正式页，同一个 Workbench leaf 和控制器继续承载公开消息、权限、文件结果与后续 turn。
- 正式页提供确定性首条任务标题、真实状态、模式/工作区权限摘要、一个消息流和一个三行紧凑且可垂直增长的 composer；活动 turn 主操作仍是停止。
- 当前恢复边界只到插件生命周期：关闭/重开 leaf 可恢复，插件重载清空；没有官方 session 恢复读回前不显示最近会话。
- 原右侧视图原位演进为“任务环境”，默认关闭且复用同一 right leaf，只显示健康/连接、已选笔记、工作区名称、当前权限、实际观察工具和最近账本统计。
- 当前 bridge 未公开模型/预设具体标识，因此 UI 只显示“由 DSH 配置管理”；完整绝对路径、私有推理、未验证指标和虚构历史均禁止显示。

详细契约见 [ADR-010](../architecture/ADR-010-formal-conversation-and-task-environment.md)。

## 自动同步演进计划

后续只读上游监测按[运行时兼容矩阵](../architecture/runtime-compatibility-matrix.md)规划：定时比较 GitHub 最新预发布、npm dist-tag 与仓库兼容矩阵，发现新版本后创建或更新 issue、兼容性提案或 draft PR。监测 workflow 尚未实现；自动化不得：

- 修改用户本机或插件中的 DSH 安装；
- 自动合并兼容矩阵、自动发布插件或自动提交 Obsidian 社区目录；
- 未经测试移除当前受支持版本或把未知版本静默视为兼容。

兼容矩阵只有在完成上游源码差异审计、编译与协议契约、假 bridge、Windows 真实运行时、取消与进程清理、必要的隔离 Vault 验收，并获得用户明确批准后才能推进。新预发布出现只产生“待验证候选”，不产生“已支持”事实。

## v1 明确排除

- Vault 写入、删除、移动与批量修改。
- 任意 Shell、危险模式或全磁盘权限。
- 插件自动安装或更新 DSH、Node、Python、MCP Server 或 bridge。
- SDK/ACP/CLI 文本解析的生产 fallback。
- Dida MCP、微信读书 Skill、微信文章抓取、资讯雷达、行业雷达、房地产工作台、人生仪表盘。
- 移动端、遥测、自动 Release 与自动社区提交。

## 最小验收矩阵

| 层级 | 必须证明的行为 | 不得冒充的证据 |
| --- | --- | --- |
| 单元/契约 | 模式、输入、不可变上下文快照、状态迁移、单终态、失败码、权限关联 | 真实 DSH 或 Obsidian 运行通过 |
| 假 bridge | 握手不匹配、乱序/重复事件、权限失联、取消确认与超时、EOF、关闭 | 正式 bridge 已兼容当前 DSH |
| Windows 真实运行时 | 裸命令、绝对路径、`.cmd` shim、隐藏窗口、真实取消、正常关闭、强制终止回退、无残留进程 | UI 或 Vault 验收通过 |
| 隔离 Vault | 上下文选择/预览/移除/快照、发送前审阅、真实流式回复、停止/失败、重载与进程清理、最终宽窄屏与明暗主题 | 真实个人 Vault 安全 |
| CI | Ubuntu/Windows 实际执行相关测试，构建与边界检查通过，原始 annotations 为 0 | 社区发布已批准 |
| 用户验收 | 最终 Obsidian 运行 UI 与获批 Ardot 同步，用户明确批准 | 自动批准 Release 或社区提交 |

任何一项缺少证据均标记为“延期，未通过”，不能进入社区发布审批。
