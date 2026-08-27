# 新建任务 v1 需求基线

- 状态：已批准的实现输入；正式 bridge、宿主 UI 与只读上下文子集已实现，完整“新建任务”仍在实施
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
- 右侧快速助手保持可选，不替代“新建任务”。
- 产品 UI 不显示开发批次、发布门、“规划中”或“尚未实现”等治理文案。

## 输入、上下文与快照

一次提交由以下输入组成：

1. 用户输入的任务文本。
2. 当前选择的模式：“对话”或“任务执行”。
3. 用户显式加入的上下文：当前笔记、当前选区、一个或多个明确选择的 Vault 文件。
4. 任务执行模式下由用户显式选择的 Vault 外工作目录。

发送前必须显示已选上下文，并允许逐项移除。发送动作建立不可变上下文快照；后续编辑原笔记或更换活动文件不得静默改变已经发送的 turn。空输入、已失效文件、二进制文件、越界路径和超限输入必须在启动 DSH 前以可定位错误失败，并保留草稿。

v1 不把整个 Vault 作为默认上下文，不索引整个 Vault，也不写入、删除或移动 Vault 内容。文件数、单文件字节数、合计字节数、任务字符数和诊断尾部长度的具体上限，必须由后续实现批次基于测量证据冻结并进入测试；当前文档不虚构数值。

Batch 6 已依据现有 `1 MiB` NDJSON frame 上限冻结上下文子集：最多 `10` 项、单项 `96 KiB`、合计 `192 KiB`。测试把最大合计内容分别填充为引号与换行，经过上下文 JSON 和 `turn/start` wire frame 的双重转义后仍小于 `1 MiB`，为后续任务文本、标识和协议字段保留余量。任务字符上限由真实发送批次冻结；当前诊断尾部已由受管进程实现固定为 `2 KiB`。

当前实现只在用户点击“选择上下文”后列出 Obsidian 已知的 Markdown 文件元数据；不会预读整个 Vault。当前笔记和明确选择的 Vault 文件在发送前以 `Vault.cachedRead` 重新读取，当前选区在加入时固定；已选来源可见并可逐项移除。bridge 只接收后续宿主建立的快照，不获得 Vault API 或文件系统读取能力。

## 工作区与权限边界

- Vault 默认只读；上下文读取仅限用户显式选择的文件或选区。
- “任务执行”要求用户显式选择 Vault 外工作目录，且该目录不得由插件静默记为全局无限权限。
- 整个 Vault 不得成为 DSH 默认可写 `cwd`。
- v1 不提供任意 Shell 输入，不启用 `danger-full-access`，不扩大到全磁盘访问。
- DSH 工具需要权限时，bridge 必须发出与当前 session/turn/request 绑定的权限请求；未知、过期、失联或无法关联的请求默认拒绝。
- 权限决定只作用于当前明确请求；持久授权与更大写入范围不属于 v1。

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
- 当前核验到的正式 bridge 目标是 `0.1.1-rc.2`，GitHub tag 指向提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。Batch 4 已实现 bridge `0.1.0`，并通过本地与远端 Windows 的真实加载、握手、Agent session、mid-turn cancel 与清理；当前产品 UI 尚未启动该路径，兼容矩阵也尚未完成隔离 Vault 与用户验收。
- 获批实现必须精确锁定 DSH 版本、上游 tag/commit、bridge 版本和 lockfile，不使用浮动版本范围。
- 握手必须返回精确 bridge 版本、DSH 版本、协议版本和 capability；缺失、陈旧或不匹配时失败可见且 fail closed。
- 当前插件只读健康检查仍精确支持 `0.1.1-rc.1`；它与正式 bridge 候选 `0.1.1-rc.2` 是两条不同状态，不得合并为“已支持 rc.2”。
- 项目[bridge 协议 v1](../architecture/bridge-protocol-v1.md)已实现严格类型、client 状态约束、正式 bridge、NDJSON 与 Windows 受管进程；最终实现状态 `a719b03c88807740581a2a0327a462fa5e5b7664` 已通过 CI `32717711862` 的 Ubuntu/Windows job 与原始零 annotations，产品 UI 仍待后续批次。

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
| 隔离 Vault | 上下文选择/预览/移除/快照、草稿保留、禁用与重载清理、最终宽窄屏与明暗主题 | 真实个人 Vault 安全 |
| CI | Ubuntu/Windows 实际执行相关测试，构建与边界检查通过，原始 annotations 为 0 | 社区发布已批准 |
| 用户验收 | 最终 Obsidian 运行 UI 与获批 Ardot 同步，用户明确批准 | 自动批准 Release 或社区提交 |

任何一项缺少证据均标记为“延期，未通过”，不能进入社区发布审批。
