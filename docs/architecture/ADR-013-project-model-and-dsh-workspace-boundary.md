# ADR-013：项目模型与 DSH Workspace 边界

- 状态：已接受、已实现并完成本地验证；D1 完成门为对应实现提交的双平台 CI 成功及原始零 annotations；只交付数据模型与公开读取接缝，不包含项目 UI
- 日期：`2026-09-28`
- 目标生产 DSH：`0.1.2-alpha.3`
- 最新上游候选（2026-09-30 核对，不纳入生产）：`0.2.0-rc.2`，tag commit `639ed015397290b3745d163aafe02ffee4aa3f84`，发布于 `2026-09-29T09:42:36Z`；npm `latest/next` 同值
- bridge：`0.3.0` / protocol `1`

## 1. 唯一结果

插件能够在 Vault 外以版本化双槽快照保存和读回项目显示名、一个或多个 DSH Workspace 引用、置顶状态和用户项目顺序。项目索引不写入、扫描、移动或删除源文件夹；当前批次不渲染项目/最近导航。

## 2. 能力核对与数据归属

### 2.1 Claudian 参考实现

本批于 2026-09-28 初读公开仓库 `YishenTu/claudian` commit `ce7195e7d073b5f0c6c0807cffbbe6063300a83a`，2026-09-30 续作时重新核对 `main` commit `738c456e2ee6448c3142c3a815387f2e8dcb8ae7`。最新 README 已将协作产品指向独立仓库；本次读取 `src/app/storage/SharedStorageService.ts` 与 `TabWorkspaceMigrationCoordinator.ts`，确认宿主存储、会话持久化和 view 生命周期分层。插件只参考显式所有权和迁移完成后再退役旧数据的原则；Claudian 的 VaultFileAdapter、Vault 作为执行 cwd、多 provider、私有会话历史和协作数据均不采用，也不 fork Claudian。

### 2.2 DSH 公开 Workspace 能力

当前生产夹具和两个 lockfile 继续精确锁定 `@deepseek-ai/dsh` `0.1.2-alpha.3`。本地真实 alpha.3 控制面探针已证明 `@deepseek-ai/dsh-workspace` 的公开 `ctx.workspaceRegistry` 能力：

- `create(path, title?)` 对既有目录执行 `realpath` canonicalization，返回稳定 `WorkspaceId`；同一 canonical path 重复创建幂等；
- `list()` 返回公开的 `id/path/title/createdAt/updatedAt/sessionIds`；`status()` 只读检查目录存在性；
- 两个独立 headless 进程共享临时 `$DSH_HOME` 后，Workspace ID、canonical path、标题和顺序可读回；不解析 DSH 私有文件；
- alpha.3 Workspace 源码 blob：`packages/workspace/workspace/src/index.ts` 为 `87edb28cad939a77b2b80fbe61fc5ab8bea3cde8`，`types.ts` 为 `4eee4659611cbefeef95c263bc84816e32a88c99`。

2026-09-28 核对的最新 `0.1.7-rc.2` 仍公开同一类 Workspace 事实，但源码已演进：`index.ts` 为 `4b4176c573c0eaae5b3331d3df6cb02787a2be2b`，`types.ts` 为 `6355aee02cda6934b5dbd98fb50a964648b27a2b`。最新候选还增加默认 Workspace、归档/恢复/置顶等控制面；这些不是当前生产支持，也不在 D1 升级或实现。

2026-09-30 续作重新核对的最新 release/npm 已为 `0.2.0-rc.2`，对应 `master`/tag commit `639ed015397290b3745d163aafe02ffee4aa3f84`。其 Workspace `index.ts/types.ts` 两个 blob SHA 与上述 `0.1.7-rc.2` 相同；已重新读取官方 Workspace README 和类型。最新文档的 pin/archive/restore 指的是 session 控制面，不能当作插件项目置顶已由 DSH 管理。D1 不升级生产、不安装新候选、不宣称新版本运行兼容。

2026-10-01 提交前再次核对 GitHub 最新 release、tag commit 与 npm dist-tags，仍为上述 `0.2.0-rc.2` 与同一 commit；本批源码对照快照继续采用 2026-09-30 的记录。

因此 D1 不建立第二套 raw path registry：DSH WorkspaceId、DSH canonical path、DSH session membership 由 DSH 负责；插件只保存 `projectId` 与项目对 DSH Workspace 的最小关系。索引中的 `canonicalPath` 是创建/更新时的最后公开事实快照，用于检测路径漂移、重复和包含关系，不用于启动、创建、执行或删除 DSH Workspace。

### 2.3 Obsidian 边界

当前官方 `obsidian-api` 源码 commit 为 `cc1744324150c632416857c98964f87b1574a5fc`。`Plugin.loadData()/saveData()` 对应插件目录内的 `data.json`，仍位于 Vault 配置边界；因此项目索引继续放在现有按 Vault 哈希划分的操作系统应用数据目录，不使用 `data.json`，不写真实或专用 Vault。

## 3. 最小插件职责

`ProjectIndexStore`（schema `version: 1`）拥有以下最小事实：

- `projectId`：插件项目身份，不由项目显示名或路径派生；
- `displayName`：插件显示名，同一索引内必须唯一；
- `workspaces[]`：DSH `workspaceId` 与最后公开的 `canonicalPath`；同一 DSH Workspace 只能归属一个插件项目；同一项目集合内以及跨项目集合的路径不能重复或互相包含；
- `pinned`：置顶状态；
- `projects[]` 数组顺序：用户项目顺序；创建、更新和重排均以单次快照提交；
- `createdAt/updatedAt`：插件记录自身的审计时间，不替代 DSH Workspace 时间。

保存前只允许既有、可 `realpath` 到目录的 canonical path；符号链接别名、失效或非目录路径 fail closed。已保存项目源文件夹后来失效时，读取仍保留记录，交给后续投影层显示不可用，不静默删除。

源目录必须与当前 Vault 和运行状态分区完全分离；索引子目录的 realpath 也必须位于该状态分区，子目录 junction 越界在创建文件前失败。D1 是可调用的数据模块与 bridge 读取实现，当前 `main.ts` 不新增项目启动加载或写入口；产品创建/导航消费者按 P1/N1 的批准范围接入。

## 4. 公开运行时接缝

bridge `0.3.0` / protocol `1` 增加 `workspace-read` capability 和窄请求 `workspace/read`。请求只携带调用方给出的精确 Workspace ID 列表，响应逐项返回 DSH 公开字段或 `missing | unreadable`；未知、重复、多出或遗漏身份均由协议客户端 fail closed。bridge 通过公开 `ctx.workspaceRegistry.list()`，不读取 DSH 私有 domain、JSONL 或数据库。

当前没有 `workspace/create`、rename、delete、reorder、archive、pin 或多 cwd 执行请求；这些属于 P1/O1/L1 或另行决策，不由 D1 偷渡。

## 5. 输入、处理、状态、输出与失败

- 输入：用户/未来项目选择器提供的显式项目名、已经由 DSH 公开读回的 Workspace 引用、置顶和完整项目顺序。
- 处理：验证名称、Workspace ID、canonical path、重复/大小写/符号链接/包含关系；在 Vault 外目录持有独占锁；写临时文件、`fsync`、原子替换、读回；下一 revision 写另一槽位。
- 状态：`project-index/index-0.json`、`index-1.json`、`write.lock` 与短期 `write.lock.guard`，均位于现有 Vault 哈希状态目录。
- 输出：版本化 `ProjectIndexDocument`，按数组顺序提供项目；`load()` 返回 `degraded` 与只读隔离的损坏槽文件名，读取不移动文件，下一次显式写入才将损坏目标槽移至 `.corrupt.*`。
- 失败：未知版本即使另有旧槽也禁止自动覆盖；两槽均损坏、活跃/不完整锁、Vault 内状态目录、名称/Workspace/path 冲突和非法源路径均 fail closed；单槽损坏回退上一有效槽。完整且已证明进程死亡的写锁可以在互斥 guard 下隔离，竞争者显式失败；中断遗留的 guard 不自动接管，需要用户检查后单独恢复。原子 rename 替换目标槽，不预先删除有效文件；源文件夹不删除。

## 6. 验证与边界

- 单元：多 Workspace、重名、重复身份、大小写/符号链接/包含关系、失效目录、双槽损坏隔离、原子读回、并发锁、Vault/junction 外部边界。
- 真实 DSH：`tests/dsh-alpha3-workspace.test.ts` 在 Ubuntu/Windows 候选夹具中用两个独立 headless 进程验证 `ctx.workspaceRegistry.create/list/status`、稳定 ID、canonical path 和重启读回；`tests/dsh-alpha3-control.test.ts` 同时验证正式 artifact 的 `workspace/read` 精确缺失项响应。
- 完整接缝：Workspace 探针创建两条公开记录后，第三个独立进程加载正式 bridge，按两个 ID 读取 available 和精确缺失项；实际公开引用保存为一个双目录项目并由新 store 实例读回。本地通过，由双平台候选 job 同步执行。
- CI：项目索引由双平台 `npm test` 和 Windows `test:runtime` 执行；真实 Workspace 探针并入双平台 `test:runtime:candidate`；现有 typecheck、lint、build、边界与 bridge artifact 门继续执行。生产 fixture 不升级 alpha.3。
- Vault/Ardot：D1 没有 Vault 写入或部署，没有 Ardot 修改；若未来需要隔离 Vault，只能在本地门通过后展示精确身份、版本和资产 diff，再另行请求确认。

公共契约影响已检查：协议类型、客户端解析、bridge 路由、overlay 注入、假/真实运行时、构建清单、文档及 CI 覆盖同步；无新依赖，现有 workflow 通过更新后的 npm scripts 执行新增测试，无需新增 job。插件版本、设置、UI、样式、Release job、任务索引 v1 和用户 DSH profile 已检查，无需修改。

邻近问题登记（2026-10-01）：根锁文件 `npm ci` 的开发依赖审计报告 6 项告警（3 moderate、3 high），涉及既有 lint/Obsidian 类型依赖链；`npm audit --omit=dev` 为 0。本批未新增或升级依赖，也未执行 `audit fix`；依赖升级与告警处置需另行评估，不能把 D1 自动门通过表述为所有依赖安全问题已关闭。

## 7. 回滚与停止边界

回滚时整体移除 D1 项目模块、bridge workspace-read 协议和对应治理/测试提交；Vault 外 `project-index` 文件不会被旧插件读取、迁移或删除，DSH 原生 Workspace 和源文件夹不受影响。D1 完成后停止，不实现项目/最近导航、创建/编辑 UI、排序交互、统一权限、归档/删除、DSH 升级、Vault/Ardot/Release 或社区提交。
