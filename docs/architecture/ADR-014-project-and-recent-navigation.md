# ADR-014：项目与最近导航及原身份打开

- 状态：已批准并实现；完整本地门与 Windows 真实 DSH 通过；精确 SHA CI 门待闭合，隔离 Vault 与最终运行 UI 验收未完成
- 日期：`2026-10-01`
- 基线：`main / 55f2a2f15bf7461873c33bd737a187ac1e8a8e18`，远端同值、工作树干净；D1 最终 CI `36743757135` 的 Ubuntu `109984585272`、Windows `109984585380` 均成功、原始 annotations 均为 `[]`
- 生产：DSH `0.1.2-alpha.3`，bridge `0.3.0` / protocol `1`；不改 artifact 或锁文件

范围变更：用户在 N1 实施期间另行授权升级 `0.2.0-rc.2`，并授权开发会话今后核实官方新版本后更新本机 DSH、验证并精确锁定仓库。本 ADR 记录导航在 alpha.3 的独立验证基线；升级必须另有公开契约漂移、bridge、安全、Windows 与 CI 证据，不把授权冒充已支持，不自动部署 Vault。本机已核实为 `0.2.0-rc.2`，无需重复安装；插件自身仍不得安装或更新运行时。

## 1. 唯一结果与批准范围

N1 让 Workbench 上方只保留新建任务和运行，下方展示真实项目与最近任务；用户能够打开原正式会话或查看明确失败原因。只修改只读导航投影、会话打开路由、选择/空/禁用态、响应式与无障碍，以及伴随测试、CI 和治理文档。用户同时明确调整 UI 权威：实时代码与过往已完成的用户验收为真相，Ardot 降为历史参考，不再作为实施前置门。

不实现项目创建/编辑、项目选择、排序交互、置顶操作、归档/删除、统一权限、附件、Vault 写入、DSH 更新、Release 或社区提交。Ardot 未修改；开始时曾只读核对文件 `718186366720195` / 历史 v2 页面 `12:1`、宽屏 `12:41`，后续按用户新指令不再把它作为验收权威。

## 2. 原生能力优先与事实归属

- Claudian：只读核对 `YishenTu/claudian` main `c269ac64e35673566b0c958d956c6d0367556c3e`（`2026-10-01T03:45:48Z`）的 README 和 `SessionListOrganizer.ts`。参考显式关联、稳定身份和活动排序；不 fork，不采用 Vault cwd、私有历史文件、多 provider 框架或第二消息数据库。
- DSH：生产 alpha.3 公开 session controller 的 list/inspect/恢复、标题、持久化与既有 bridge `session/read`、`session/restore` 足够承担 N1。插件复用这些能力，不解析私有文件；桥接恢复再次校验精确 ID、普通 session、非运行状态及 canonical cwd。最新 GitHub/npm `0.2.0-rc.2` / tag commit `639ed015397290b3745d163aafe02ffee4aa3f84` 只读核对公开 session controller 和 Workspace 类型。新候选的客户端引用、历史跟随/投影和归档等变化不冒充 alpha.3 已支持。
- Obsidian：官方 API commit `cc1744324150c632416857c98964f87b1574a5fc` 的 `ItemView`、leaf 和插件数据边界已核对。沿用原中央 leaf 与主题变量；`loadData/saveData` 的插件目录 `data.json` 不用于任务或项目索引。
- 插件必须新增：R2/D1 到宿主导航的只读投影、当前选择态、原身份打开与明确失败界面。没有新增持久数据库、公共运行时框架或私有供应商协议，最小可替换边界仍是现有 bridge 窄 session 事实与生命周期。

## 3. 归属与排序决策

R2 task-index v1 没有 projectId 或 DSH WorkspaceId；D1 的项目引用也不代表用户曾为某条任务选择项目。目录相同和 DSH `sessionIds` 都不授权追溯改变插件项目归属。因此本批读取的所有 v1 任务只进入“最近”，项目按 D1 已保存数组顺序显示真实名称及“暂无任务”，不填充假任务。

项目选择及首次发送时固定归属仍由 P1/U1 实施。本批不迁移 schema、不创建索引关系、不自动扫描导入原生 session。最近按插件任务索引 `updatedAt` 倒序，时间相同以 taskId 确定顺序；它是本插件已索引活动，不承诺反映用户在其他 DSH 客户端的全部活动。

## 4. 输入、处理、状态、输出与失败

- 输入：R2 最小记录、DSH 精确恢复事实、D1 项目记录，用户刷新或点击任务。
- 处理：串行读取索引；手动刷新复用 R2 控制器；生命周期索引更新只重载投影，不在活动 turn 启动第二个 DSH 读取 Host。点击可继续项后仍由正式 bridge 重新读取/恢复原 session，禁止 missing 转 create。
- 状态：只保留 UI 投影、选中项和当前正式会话内存；索引仍为 v1。运行中禁止切换其他任务/刷新/新建；关闭 leaf 移除视图订阅但不关闭插件级会话，插件卸载处置全部受管进程。
- 输出：原 taskId/sessionId 的正式页，或不可恢复/启动失败/未能核对的原因页。正式任务选中下方任务项，不占“新建任务”选中态；窄屏采用原生页面选择器与可折叠的项目/最近区域。
- 历史：完整消息继续由 DSH 保存，插件不复制；重新打开只显示本次打开后的消息，并明确提示历史、上下文和权限不会被静默重新授权。已有文件账本不会删除，但不把未读回的旧卡片伪造成可撤销结果。
- 失败：索引损坏、读取失败或身份/cwd/运行状态变化均明确显示；恢复失败禁用发送，显式重新打开仍只能恢复原 ID；不可恢复记录保留输入摘要和原因，可刷新或显式新建，不自动删除原生 session。无未知身份 fallback。

## 5. 为什么采用这个最小方案

真实瓶颈是 `main.ts` 的 R2 恢复结果没有 UI 消费者，Workbench 只有两个功能页，重启后无法选回任务。保持现状不能完成导航结果；新增持久任务/项目关系会越过 P1/U1；本批的只读投影和恢复路由足以解除瓶颈，且可以独立回滚，不引入新的依赖。

预计/实际模块：`src/task-navigation.ts`、`task-recovery.ts`、`new-task-conversation.ts`、`main.ts`、`workbench-view.ts`、`styles.css`；伴随导航/会话/UI/真实 DSH/治理测试、CI 守卫及相关文字契约。公共契约检查覆盖主视图、可选右侧环境、索引和卸载生命周期；设置、索引 schema、bridge/protocol、模板、fixture 锁文件、Release workflow 与插件版本已检查，无需修改。

## 6. 验收矩阵与命令

| 门 | 证据/命令 | 边界 |
| --- | --- | --- |
| 身份、排序和互斥 | `tests/task-navigation.test.ts` | 真实临时索引；同路径不推断归属，不自动导入原生任务 |
| 恢复与失败 | `tests/new-task-conversation.test.ts`、`task-recovery.test.ts` | 缺失不重建、恢复失败禁发、显式重试、运行中禁切换；mock 不是运行验收 |
| 宿主交互与无障碍 | `tests/workbench-conversation-ui.test.ts`、`plugin-baseline.test.ts`、`contracts.test.ts` | 选择态、原因页、原生 button/details、订阅清理、流式事件不重建导航；不冒充视觉通过 |
| Windows 真实 DSH | `npm run test:bridge:runtime` | alpha.3 shim、独立进程冷读取、导航打开同 ID、继续回复、正常关闭；模型使用本地测试服务，不调用用户账号 |
| 完整质量门 | `typecheck`、`lint`、`test`、`build`、`verify`、`test:runtime`、`test:runtime:candidate` | CI 的双平台完整测试及 Windows 真实 DSH 入口实际执行新增行为 |
| 精确 SHA CI | 两个平台 success + 原始 annotations `[]` | 未闭合不得声称自动门完成 |
| 隔离 Vault | 本地门通过后展示 Vault 身份/版本/资产 diff，单独审批部署 | 700px/宽屏、明暗、Tab/Enter/Space、重启恢复、失败、零残留与最终用户 UI 验收；尚未执行 |

本地完整 `npm test`：26 个测试文件，182 passed / 2 skipped；跳过为平台条件，不冒充对应平台运行验收。`typecheck`、`lint`、`build`、`verify`、`test:runtime`（48 passed / 1 skipped）与 `test:runtime:candidate`（5 passed）均通过，bridge artifact 保持 alpha.3 原 hash。真实模型使用本地 fixture 服务，不调用用户账号、不读写用户 DSH session。补充验证异步打开期间卸载不启动进程，以及视图通知异常不覆盖索引写入结果。

## 7. 提交、回滚与停止

一个 N1 批次，优先一个实现提交；只有独立回滚所需时最多两个实质提交，测试/文档/CI 随实现，不另拆证据批次。回滚到上一插件实现时保留 task-index、project-index、DSH session 和账本，不迁移、不删文件。

本地与 CI 通过后仍停在隔离 Vault/用户 UI 门，不自动部署；部署必须单独批准。N1 完成不自动授权 P1/O1/U1、Ardot 修改、真实 Vault 或发布。
