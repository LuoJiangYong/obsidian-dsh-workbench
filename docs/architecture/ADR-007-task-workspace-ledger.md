# ADR-007：Vault 外任务工作区与逐轮变更账本

- 状态：已接受
- 日期：2026-08-28
- 决策范围：Batch 8 的外部工作区选择边界、逐轮基线、真实变更统计、审核材料与安全撤销归属
- 不在本 ADR 内：任务工作区选择 UI、正式任务控制器、文件右键菜单、diff 审核 UI、撤销二次确认 UI、Vault 写入、任意 Shell、Release、社区提交

## 用户结果

任务执行只能修改用户当次明确选择的 Vault 外工作区。任务结束后，插件以实际文件前后快照生成“已编辑文件”事实；撤销只恢复该 turn 能完整归属且结束后未被再次编辑的内容，不依赖 Git，也不覆盖后来发生的用户修改。

## 输入、状态、输出与失败

- 输入：现存绝对目录、当前 Vault 真实路径、Vault 外插件状态目录、唯一 `turnId`。
- 处理：启动 DSH 前扫描可跟踪普通文件并写入基线；turn 结束后重新扫描，按 SHA-256 比较 created/modified/deleted，文本文件计算逐行增删并保留前后审阅内容。
- 状态：活动基线与完成账本存入操作系统应用数据目录的 `task-turns/<workspace-hash>/<turnId>.json`，不进入 Vault 或仓库。
- 输出：工作区显示名、turn 身份、真实变更列表、可得时的总增删行数、逐文件审阅内容和 `canUndo`。
- 失败：目录不可用、边界重叠、符号链接越界、文件/总量超限、账本篡改、过期或撤销冲突均 fail closed；不得输出虚假变更卡或继续撤销。

## 工作区边界

1. 工作区必须是用户明确选择、已经存在且可解析真实路径的绝对目录。
2. 工作区不得等于当前 Vault、包含当前 Vault、位于当前 Vault 内，也不得与插件 Vault 外状态目录互相包含。
3. 候选目录存在标准 Obsidian 配置目录时拒绝。外部目录没有 Obsidian `Vault` 实例可查询，因此这只是附加信号；产品 UI 仍必须明确说明“不要选择任何 Obsidian Vault”。
4. 扫描跳过符号链接和非普通文件；真实路径越过工作区时立即失败。
5. bridge 和变更账本共用同一排除目录表：`.cache`、`.git`、`.hg`、`.next`、`.svn`、`.venv`、`__pycache__`、`build`、`coverage`、`dist`、`node_modules`、`venv`。DSH 文件工具也不得访问这些目录。

## 数据与留存

默认限制固定为：

- 最多 `10,000` 个可跟踪文件；
- 单文件最多 `2 MiB`；
- 一次基线原始内容合计最多 `64 MiB`；
- 每个工作区最多 `20` 个账本；
- 账本有效期 `7` 天；每次建立新基线时清理过期与超量账本。

活动账本需要保存全部可跟踪文件的基线内容；完成后只保存本 turn 发生变化的 before/after 快照。内容以 base64 进入权限受限的 Vault 外 JSON，并同时保存字节数、SHA-256、相对路径和文件 mode；JSON 文件名只含工作区哈希与 turn ID。绝对工作区路径只存在于本机私有账本中，用于恢复前重新绑定真实目录，不进入界面日志、Git 或发布资产。

## 审核与撤销

- 文本文件在前后合计不超过 `4,000` 行时，以确定性 LCS 计算新增/删除行数并提供 before/after；二进制或过大文本仍报告文件变化，但行数与内嵌文本审核标记为不可得。
- UI 的“审核”必须读取账本公开投影，不重新推断一个不同的变更事实源。
- UI 的“撤销”必须先二次确认；调用账本前，对全部文件做一次性预检。当前文件任一 SHA-256 与 turn 结束快照不一致时，整个撤销不写任何文件。
- 预检通过后只恢复该 turn 的 before 快照：恢复修改/删除文件，移除该 turn 新建文件。若中途失败，先按 after 快照回滚已执行项；回滚不完整必须显示高优先级错误。
- 不调用 `git reset --hard`、`git checkout` 或工作区级覆盖，不删除未归属到本 turn 的文件。
- 账本版本、结构、base64、字节数、SHA-256、文本解码、变更类型、diff 统计和相对路径在撤销前全部读回校验；篡改时 fail closed。

## CI 与状态边界

- `tests/task-workspace.test.ts` 覆盖 Vault/状态目录隔离、排除目录、真实变更、行数、删除目录恢复、新建文件移除、后续编辑冲突、篡改和大小上限。
- `tests/obsidian-bridge.test.ts` 覆盖任务模式对依赖、缓存、构建产物和版本控制目录的执行拒绝。
- 双平台完整 `npm test` 执行上述测试；Windows `npm run test:runtime` 再显式执行任务工作区账本测试。
- 实现提交 `5f88c95b7795dd2494aee30da4bf01d29b7d86ac` 的首轮 [CI run 33148906025](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33148906025) 仅在 Windows 暴露 `GetTempPath` 短路径与 `realpath` 长路径断言差异；生产边界没有放宽。最小测试修复 `e9563cda85bbf6cb05d18984d0c5c8b47af6cf74` 改为按真实路径比较。
- 修复后的 [CI run 33149126275](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33149126275) 已通过 Ubuntu check `98776774841` 与 Windows check `98776774966`，两个原始 annotations 数组均为 `[]`。
- 本 ADR 证明纯文件边界与账本契约已实现并进入 CI；任务控制器、文件操作 UI、真实 DSH 工作区执行、隔离 Vault 运行验收和最终用户 UI 验收仍未通过。

Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）在本批未修改，只按用户要求只读核对。
