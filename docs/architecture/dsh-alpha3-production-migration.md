# DSH 0.1.2-alpha.3 生产运行时迁移门

- 批次：`R1-M`（一个生产迁移批次；候选核验与生产切换只是批次内分步提交）
- 更新时间：`2026-09-01`
- 当前状态：`candidate_verified`；生产仍为 `0.1.1-rc.2`
- 唯一结果：把健康检查、正式 bridge、运行夹具和兼容矩阵精确迁移到已验证的 `0.1.2-alpha.3`，且 v1 对话/任务、Windows 进程、Vault 外数据和失败语义不回归
- 停止边界：完成迁移、隔离 Vault 技术验收和远端双平台 CI 后停止，不进入 R2

## 1. 实时身份与供应链

| 项目 | 精确值 |
| --- | --- |
| npm 包 | `@deepseek-ai/dsh@0.1.2-alpha.3` |
| npm dist-tag | `alpha=0.1.2-alpha.3`；`latest/next=0.1.1-rc.2` |
| GitHub release/tag | `dsh-v0.1.2-alpha.3`，pre-release |
| tag commit | `dd6322d604e00eec1ba5e0c8541159906a21094a` |
| DSH integrity | `sha512-VvATzYmQ4LMJREJ9e2POKksSHRfqP3y9pghplLBaQBuw2BqfbC0mQUVsaPwxe4wlcpj+riEgn8OJB01YnpF+3A==` |
| session controller integrity | `sha512-uMkeiIXaK49KF8ddU4nWMBVikOxEc8uG5jsRDpCsU9VwXflbsILWxWs7/v3t+jPxDwwbDQIo038YHULvJU4BlQ==` |
| 许可证 | `MIT` |
| 上游 Node 范围 | `^22.19.0 || >=24.0.0`；本仓库 CI 继续固定 Node 24 |

上游 alpha 包内部使用 caret 范围。仓库提交的候选 lockfile 因此要求 215 个直接 `@deepseek-ai/dsh*` 包全部精确为 `0.1.2-alpha.3`，CI 只执行 lockfile 的 `npm ci`，禁止后续 alpha 混入当前证据。

## 2. 第一性原理与职责边界

改善的工作流是：R2 在不解析 DSH 私有文件、不复制完整会话数据库的前提下，能够使用生产版本公开的 session 列举、显式恢复和 follow/control 接缝。当前 rc.2 生产依赖图没有公开 session controller，因此保持现状无法满足这个前置条件；本批只迁移运行时版本，不实现 R2。

| 层 | 本批复用或承担的职责 | 本批明确不建设 |
| --- | --- | --- |
| DSH 原生 | session、JSONL 持久化、标题、附件、权限请求、follow/control、模型/提供方/Agent/工具事实 | 插件私有 session 数据库、配置复制、自动安装或更新 DSH |
| Obsidian 原生 | 插件生命周期、设置保存、专用隔离 Vault 技术验收 | 真实 Vault 写入、移动端、非原生窗口系统 |
| Workbench 插件 | 精确版本健康检查、窄 bridge 投影、Vault 外 overlay/账本、受管进程与 fail-closed 握手 | R2 任务索引、项目/最近 UI、多运行时注册框架、PI/Codex 适配器 |

alpha.3 删除的是可选 SQLite session persistence 后端；现有插件没有配置、读取或迁移 SQLite，生产事实一直是 DSH 原生 `$DSH_HOME` 下的 JSONL session。候选探针仍读回 `session.jsonl` 或 `session.jsonl.zstd`，因此该上游变化不会触发插件数据迁移，但正式切换仍必须复跑真实 bridge、Windows 进程和隔离 Vault 技术门。

## 3. Claudian 只读对照

`2026-09-01` 核对 Claudian 公开 HEAD `e66f41c2674f03664788996851490512b3875744`：

- 复用其 `ConversationRepository` 与 `ExecutionSessionSupervisor` 分离持久化事实和执行生命周期、用 generation/实例身份隔离晚到事件的宿主思路；
- 不采用多 provider registry、provider 私有历史解析、Vault 内 conversation 元数据或第二套 conversation 数据库；
- DSH 是本仓库唯一生产运行时。供应商私有结构只留在 bridge artifact 内，项目 protocol v1 继续只暴露稳定的 session/turn/event/permission 语义；没有第二个获批消费者前不建立公共多运行时抽象。

## 4. 候选验证结果

`tests/runtime-candidate-fixture` 已从历史 R1 alpha.2 证据前移到当前 alpha.3，并保持与生产夹具隔离。Windows 本地已验证：

1. 候选 package、lock 根规格、顶层 CLI 和 session controller 的版本与 integrity 精确匹配；215 个直接 DSH 包全部为 alpha.3。
2. 真实 `.cmd` shim 读回 `0.1.2-alpha.3`。
3. 真实 alpha.3 artifact 加载当前 rc.2 bridge，完成握手、session 创建/关闭、正常退出和零 PID 残留；这只是加载兼容，不表示生产握手已经迁移。
4. 两个独立 DSH 进程在临时 `DSH_HOME` 中完成 session 创建、冷列举、显式 ID 恢复、标题、规范化附件、一次性权限、follow/control 投影和 JSONL artifact 读回。

本阶段没有调用真实模型、读取用户凭据、修改用户 DSH、写入 Vault 或 Ardot。生产健康检查、正式 bridge 和运行夹具仍精确拒绝 alpha.3；下一分步才允许迁移这些消费者。

## 5. 生产迁移与回退门

后续同一批次只允许：

1. 将生产健康检查、bridge 握手/构建清单和运行夹具同步锁定 alpha.3；
2. 更新直接测试、CI job 名称、兼容矩阵、README/DESIGN/需求/ADR 中的生产版本事实；
3. 复跑 typecheck、lint、完整 test、build、verify、候选控制面、Windows runtime/bridge 和进程零残留；
4. 先输出专用隔离 Vault 的脱敏路径身份、当前/拟部署版本与三项资产 hash diff，经用户确认后才写入并读回；
5. 精确提交、push，确认 Ubuntu/Windows CI 和原始零 annotations。

任一 v1 行为、JSONL 读回、Windows 进程清理、隔离 Vault 或 CI 失败时，回退整个生产迁移提交并继续支持 rc.2；不得增加宽松 fallback、双版本静默接受或自动修改用户环境。
