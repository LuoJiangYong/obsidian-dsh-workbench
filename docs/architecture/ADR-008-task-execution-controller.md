# ADR-008：Vault 外任务执行控制器

- 状态：已接受，Batch 8C 已实现并通过完整本地门与双平台 CI；Obsidian 运行验收进入后续完整 UI 门
- 日期：2026-08-28
- 关联：[ADR-005](./ADR-005-new-task-v1-host-contract.md)、[ADR-006](./ADR-006-conversation-runtime-storage.md)、[ADR-007](./ADR-007-task-workspace-ledger.md)
- UI 审阅真相：Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）；本批 Ardot 未修改、只读核对

## 决策

“任务执行”只在用户通过 Obsidian 桌面原生目录选择器明确选择一个目录、且统一工作区校验确认该目录与 Vault 和插件 Vault 外状态目录完全分离后启用发送。选择结果只保存在当前插件内存；普通界面与审阅界面只显示目录名称，不写入 Vault、不复制到插件设置，也不把完整绝对路径写入日志或对话文本。

首个任务 turn 使用以下唯一闭环：

```text
原生选择目录
→ 真实路径与边界校验
→ 发送前审阅任务、只读笔记、工作区名称和权限边界
→ 在同一 turnId 建立文件基线
→ 以 task session、该工作区 cwd、workspace-write + ask 启动 DSH
→ 每次文件工具请求只允许“拒绝 / 仅本次允许”
→ turn 终态、意外断开、启动失败、取消超时或插件卸载时完成变更扫描
→ 只投影真实变更摘要或明确失败
```

同一已连接 session 只在模式和规范工作区路径都相同时复用；模式或工作区变化必须释放旧受管进程并建立新 session。对话模式继续使用 Vault 外状态目录作为 cwd 和 `read-only`，不得因任务模式接通而获得文件工具。

## 输入、状态与输出

- 输入：非空任务、用户显式选择的只读笔记快照、已校验的单一 Vault 外工作区、当前模式。
- 运行状态：控制器在内存中绑定 `sessionId`、`turnId`、模式与工作区；逐轮基线和审核材料由 ADR-007 的 Vault 外账本持久化。
- DSH 状态：模型、提供方、插件、Agent 预设、凭据和完整 session 仍由用户原生 `$DSH_HOME` 管理。
- 输出：公开助手文本、工具名称、一次性权限请求、明确终态，以及账本确认的文件数和确定性文本增删统计。
- 失败：缺少工作区、路径身份变化、账本建立/完成失败或运行断开均 fail closed；无法核对变更时不得显示“任务完成”。

## Claudian 参考取舍

本批只参考 Claudian 当前 `ExternalContextSelector.openFolderPicker()` 使用 Electron 原生 `openDirectory` 对话框的宿主机制。Workbench 不采用其多目录外部上下文列表、持久化外部路径或把所选目录作为长期上下文的产品语义；这里只允许一个当次任务工作区，并继续由共享路径 guard 和逐轮账本约束实际访问。

## 明确不包含

- Vault 写入、删除或移动。
- 任意 Shell、网络、Skill、子代理或跨工作区访问。
- “完全权限”、跨会话永久授权或自动允许。
- 已编辑文件的默认三项列表、右键菜单、diff 审核与撤销 UI；这些属于 Batch 8D。
- 正式会话页、跨重启 session 恢复与右侧环境栏；这些属于 Batch 9。
- Ardot 修改、Release、社区目录提交或 DSH 自动安装/更新。

## 验证

- 原生目录选择宿主测试证明：取消不产生状态，确认路径必须经过统一校验。
- 控制器测试证明：任务 session 与工作区绑定、缺少工作区不启动、基线与 DSH 使用同一 `turnId`、真实文件变化进入终态摘要。
- 故障测试证明：变更捕获失败不会伪装完成，意外断开仍先核对已发生的实际变化。
- UI 测试证明：选择工作区前发送禁用，发送前显示边界，完成后只显示真实摘要。
- `npm test` 由 Ubuntu/Windows CI 双平台执行；任务账本与正式 rc.2 bridge 继续进入既有 runtime jobs。
- 实现提交 `91b21345a52657520633475dfc9e86db7b720e65` 已通过远端 [CI run 33188573187](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33188573187)：Ubuntu check `98907874384` 与 Windows check `98907874519` 均成功，两个原始 annotations 数组均为 `[]`。
