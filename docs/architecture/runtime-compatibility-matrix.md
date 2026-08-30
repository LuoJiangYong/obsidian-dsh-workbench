# DSH 运行时与正式 bridge 兼容矩阵

- 更新时间：2026-08-30
- 权威范围：本仓库已实现健康检查、正式 bridge 候选和晋级证据
- 相关证据：[Batch 2 bridge 能力证据尖峰](./batch-2-bridge-capability-spike.md)

## 当前矩阵

| DSH | 消费路径 | 状态 | bridge/协议 | 证据边界 |
| --- | --- | --- | --- | --- |
| `0.1.1-rc.2` | 健康检查 | 已实现并通过本地、双平台 CI 与专用 Vault 读回 | 无；固定 `--version` | 只证明命令可执行与版本匹配，不证明 session 可用 |
| `0.1.1-rc.2` | 正式 bridge + 产品对话/任务 | `isolated_vault_passed`；尚未 `supported` | bridge `0.1.0` / protocol `1` / artifact SHA-256 `3342ef13d3f68b65f3336e97257f63fc585ca2a8708bd85759100d28ac9c945c` | Batch 4–9 已完成真实加载、Agent session、取消、只读上下文、任务文件边界、逐轮账本、文件 UI 与正式会话；Batch 10 专用 Vault 已验证真实对话、Vault 外创建/修改、审核、原生菜单、原子撤销、错误恢复、深色 `700px` 和同步卸载零残留，实现 `ae37a7bf1c719ab871930a2b04d53ff5d7e6378f` 已通过 CI `33314880417` 双平台与原始零 annotations。当前 DSH 工具集不含删除，删除请求明确失败；跨重启恢复和用户最终 UI 明确批准仍未完成 |
| 其他版本 | 无 | 不支持 | 无 fallback | 不尝试、不中和、不静默降级 |

健康检查与正式 bridge 仍是两个独立消费路径，但当前都精确锁定 `rc.2`。Batch 10 已把当前候选推进到 `isolated_vault_passed` 并完成实现 SHA 的双平台 CI；只有用户最终 UI 明确批准后才可进入 `supported`。跨重启恢复继续明确延期，不能由当前插件生命周期内恢复冒充。

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
