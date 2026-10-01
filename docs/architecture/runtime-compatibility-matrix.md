# DSH 运行时与正式 bridge 兼容矩阵

- 更新时间：2026-10-01；上游只读快照：2026-09-30
- 权威范围：本仓库已实现健康检查、正式 bridge 候选和晋级证据
- 相关证据：[Batch 2 bridge 能力证据尖峰](./batch-2-bridge-capability-spike.md)、[R1 alpha.2 正式控制面候选证据](./r1-dsh-alpha2-control-capability.md)、[alpha.3 生产运行时迁移门](./dsh-alpha3-production-migration.md)

## 当前矩阵

| DSH | 消费路径 | 状态 | bridge/协议 | 证据边界 |
| --- | --- | --- | --- | --- |
| `0.1.1-rc.2` | 历史健康检查与正式 bridge + v1 | `superseded`（历史证据保留） | bridge `0.1.0` / protocol `1` / artifact SHA-256 `3342ef13d3f68b65f3336e97257f63fc585ca2a8708bd85759100d28ac9c945c` | Batch 4–10 与用户第一批确认曾使该组合进入支持；R1-M 后当前握手与健康检查不再接受 rc.2，不提供双版本 fallback，历史 CI/Vault 证据不被改写 |
| `0.1.2-alpha.2` | 独立候选夹具 + 公开 session controller | `candidate_verified`（R1 证据完成，不晋级生产） | 顶层 CLI 与 215 个直接 DSH 包全部锁定 alpha.2；现有 bridge artifact 仅作加载兼容探针 | 真实 shim、现有 bridge 握手/session 生命周期、两个独立进程的冷列举/显式 ID 恢复、标题、规范化附件、一次性权限、follow/control 投影与零 PID 残留通过；未修改当时的 rc.2 生产夹具或握手。npm `alpha` 随后前移到 alpha.3，且持久 session 删除/retention 与跨 Host job 恢复无公开能力，因此 R1 当时建议保留 rc.2 |
| `0.1.2-alpha.3` | 健康检查、正式 bridge + 产品对话/任务、公开 session controller/WorkspaceRegistry、R2 精确读取/恢复、D1 项目数据模型 | `supported`（当前生产 D1） | bridge `0.3.0` / protocol `1` / artifact `22,518` bytes / SHA-256 `3c69c61d67fe7398b08d87f83a07d1fdbf99c81012560430ae834d0a291e644d`；两个独立 lockfile 的 215 个直接 DSH 包均为 alpha.3 | 既有真实 shim、标题、附件、一次性权限、follow/control、回复、mid-turn cancel、JSONL、Windows 清理与 R1-M 专用 Vault 门保持；R2 精确读取/同 ID 恢复，D1 公开 Workspace 创建/列举/状态、第三个进程的正式 bridge available/missing 读取及真实双目录项目索引重启读回通过。D1 完成门要求本提交双平台 CI 成功和原始零 annotations；隔离 Vault 部署未授权，不包含项目/最近 UI、Release 或社区提交 |
| `0.2.0-rc.2` | 最新 GitHub/npm 候选的只读能力漂移记录 | `candidate_unverified`（不进入生产） | release `dsh-v0.2.0-rc.2` / tag commit `639ed015397290b3745d163aafe02ffee4aa3f84` | Workspace `index.ts/types.ts` blob 与前次 `0.1.7-rc.2` 相同，公开文档包含默认 Workspace、session 归档/恢复/置顶等控制面；本批只记录源码/版本，不安装、不升级、不改变生产 alpha.3 支持范围 |
| 其他版本 | 无 | 未验证，不支持 | 无 fallback | 不尝试、不中和、不静默降级 |

健康检查与正式 bridge 仍是两个独立生产消费路径，并共同精确锁定 alpha.3。R1-M 先以独立候选提交和双平台 CI 建立纯依赖图与公开控制面证据，再迁移生产常量、夹具和构建清单，并完成 Windows 与专用隔离 Vault 技术验收；用户对该具体迁移和资产 diff 均已批准。R2 在此生产基线上增加公开 session 读取/恢复接缝与 Vault 外最小索引，D1 复用 alpha.3 的公开 WorkspaceRegistry 增加精确 `workspace/read` 和 Vault 外项目索引；两批都不改变 DSH 版本，也不提供 rc.2/0.1.7 双版本 fallback。当前 `supported` 仍只覆盖 alpha.3 + bridge 0.3.0 的本地和远端自动门，不代表 D1 隔离 Vault 已部署，更不包含统一工作台后续能力、Release 或社区提交。

N1 补充（2026-10-01）：导航提交仍为上表 alpha.3 / bridge 0.3.0，artifact 与两个锁文件不变。最新 GitHub/npm 候选重新核对仍为 `0.2.0-rc.2` / `639ed015397290b3745d163aafe02ffee4aa3f84`；用户另获兼容迁移及开发会话本机更新授权，本机已是 rc.2，不重复安装。N1 复用现有 session 读取/恢复接缝接入宿主导航，Windows 真实索引→导航→原 session 打开/继续已通过；新增 UI 隔离 Vault 与用户验收未完成，不能从 D1 或 v1 supported 推断 UI 通过。

## 兼容晋级状态机

```text
detected
→ candidate_metadata_matched
→ source_audited
→ protocol_contract_passed
→ windows_runtime_passed
→ isolated_vault_passed
→ user_approved
→ supported
```

- GitHub 最新预发布与 npm `latest`/`next` 不一致时停在 `detected`，标记 `blocked(upstream_metadata_mismatch)`。
- 新版本只产生“待验证候选”，不得直接进入 `supported`。
- 候选 CLI 的内部包使用 semver 范围时，必须同时锁定并校验完整依赖图；混用后续 alpha 内部包不能冒充原候选通过。
- 任一门失败时保留当前受支持事实，不自动删除、覆盖或放宽范围。
- 只有矩阵行明确为 `supported`，产品握手才可以接受该 bridge/DSH/协议组合。

## 精确锁定项

一个正式 bridge 兼容批次必须同时固定并读回：

1. DSH npm version、GitHub tag、tag commit 与 npm integrity；
2. bridge package version 与构建产物哈希；
3. protocol version 与 required capabilities；
4. Node 支持范围和 lockfile；
5. Windows 启动命令、配置/patch 身份和受管进程所有权；
6. 对应测试、CI SHA、run、jobs 与原始 annotations。

缺少任一项时握手 fail closed，不能用 SDK、ACP 或 CLI 文本解析补位。

## 自动同步演进规划

计划中的只读上游监测只负责发现和准备证据，不负责批准兼容：

1. 定时或手动读取 GitHub 最新 pre-release、tag commit 与 npm `version`/`latest`/`next`。
2. 与本矩阵比较；无变化时不产生提交。
3. 元数据不一致时创建或更新阻塞 issue，附原始值和检索时间。
4. 出现一致的新候选时创建兼容 issue 或 draft PR，只更新候选元数据、源码差异清单和待运行验收清单。
5. draft PR 必须依次运行源码 API 漂移检查、编译、项目协议、假 bridge、Windows 真实运行、取消/权限/清理以及必要的隔离 Vault 门。
6. 所有门完成后仍需人工审阅和明确批准，才可把矩阵推进到 `supported`。

自动化不得自动安装或更新用户 DSH，不得修改用户 DSH profile，不得自动合并、Release 或提交社区目录，也不得因为新版本出现而静默移除仍受支持的旧版本。

监测 workflow 本身不属于 Batch 2；实现时需要独立检查 GitHub token 最小权限、fork 安全、并发去重、供应链固定和 issue/draft PR 外部写入边界。
