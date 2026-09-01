# DSH 0.1.2-alpha.3 生产运行时迁移门

- 批次：`R1-M`（一个生产迁移批次；候选核验与生产切换只是批次内分步提交）
- 更新时间：`2026-09-01`
- 当前状态：`supported`；生产健康检查与正式 bridge 均精确锁定 `0.1.2-alpha.3`
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

候选分步没有调用真实模型、读取用户凭据、修改用户 DSH、写入 Vault 或 Ardot；当时生产健康检查、正式 bridge 和运行夹具仍精确拒绝 alpha.3。随后同一 R1-M 的生产分步才迁移这些消费者，候选通过本身没有被冒充为生产支持。

## 5. 生产迁移结果

1. `TARGET_DSH_VERSION`、`TARGET_BRIDGE_DSH_VERSION`、生产夹具、bridge 构建清单、直接测试和 Windows CI job 已同步锁定 alpha.3；生产 lockfile 的 215 个直接 DSH 包全部为 alpha.3，根插件仍不依赖 DSH。
2. bridge `0.1.0` / protocol `1` 保持不变；正式 artifact 为 `17,460` bytes，SHA-256 `63d6ac6ddd35c74b14ae5d0f31e1ae4f70ee0bc4d7d605fef815cd6381e16e54`，DSH npm integrity 与候选读回一致。
3. Windows 本地重新通过健康/进程专项、真实 alpha.3 bridge、环回模型回复、无 `tools` 请求、mid-turn cancel、JSONL session、正常退出和独立候选控制面；没有增加兼容 fallback。
4. 候选分步提交 `b271c8f8dc6b28c53184f37db68c7d64bf29a14e` 已通过 CI `33467939672`：Ubuntu `99731576496`、Windows `99731576685` 成功，两个原始 annotations 数组均为 `[]`。

## 6. 专用隔离 Vault 技术验收

用户在看到专用 Vault 路径身份、插件版本与四项资产 diff 后明确批准写入。实际只替换：

- `main.js`：SHA-256 从 `92fe738b5f3818ab8dc8ab23ce4caafe356557bebad84c2e8832cb83a263bec7` 变为 `bb49043eb0729feed212f300731647865cd2dbfa8522f34f3a446f283a1228fa`；
- `obsidian-bridge.mjs`：SHA-256 从 `3342ef13d3f68b65f3336e97257f63fc585ca2a8708bd85759100d28ac9c945c` 变为 `63d6ac6ddd35c74b14ae5d0f31e1ae4f70ee0bc4d7d605fef815cd6381e16e54`。

`data.json`、`manifest.json` 与 `styles.css` 未修改，插件版本保持 `0.1.0`。Obsidian CLI 原生重载后插件保持 enabled/loaded，无加载错误或 error 级控制台消息；插件实例自身的健康检查读回 alpha.3。空上下文真实对话完成并匹配预期短回复，工具数 `0`、无权限请求；显式“新建任务”后为 `idle/disconnected`、消息数 `0`，目标 Node 进程读回为 `0`。没有写入真实 Vault、修改用户 DSH 或 Ardot。

## 7. 回退与停止

旧资产在验收期间保存在 Vault 外，任一运行或 CI 门失败即可恢复 rc.2 的两个部署资产并回退生产提交。迁移成功后 rc.2 仅保留历史矩阵证据，不提供双版本静默接受。R1-M 到此只关闭运行时迁移；R2 仍需新的明确批准。
