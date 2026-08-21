# 启动审计基线

审计日期：2026-08-21

## 审计目标

在实现 DSH 连接、Vault Bridge、发布或社区提交前，记录仓库、工具链、官方契约和当前能力边界。本文件只陈述已观察到的事实；没有运行证据的项目一律标记为未验证或延期。

## 初始仓库状态

- 审计开始时，工作目录不是 Git 仓库。
- 初始文件仅包含已批准的 `AGENTS.md`、开发宪法评估和 CI/CD 路线图。
- GitHub 账号已认证为 `LuoJiangYong`。
- 目标仓库 `LuoJiangYong/obsidian-dsh-workbench` 在审计时不存在。
- Obsidian 社区目录中，显示名 `DeepSeek Harness Workbench` 和插件 ID `deepseek-harness-workbench` 的精确匹配均为 0。
- 社区目录查重不等于占位；只有社区目录正式接纳后，插件 ID 才能视为已占位。

## 本机工具与可观察环境

| 项目 | 审计结果 |
| --- | --- |
| Node.js | `v25.5.0` |
| npm | `11.8.0` |
| Git | `2.54.0.windows.1` |
| GitHub CLI | `2.91.0` |
| Obsidian CLI / App | `1.13.7` |
| Obsidian 安装器版本 | `1.12.7` |
| 本机可识别 Vault | 3 个；其中 2 个为隔离测试 Vault，1 个为个人知识库 |
| 本机 DSH | npm shim 可执行，版本 `0.1.0-rc.6` |

Batch 0A 没有使用个人知识库进行开发或验收，也没有启动或修改本机 DSH。

## Batch 0B 当前增量

- 用户批准本批升级本机 DSH，并明确暂不考虑旧版本兼容。
- 全局 DSH 已升级到 `0.1.1-rc.1`；升级后命令版本与 npm 全局清单读回一致。
- 旧 web profile 的已识别进程在升级期间被定向重启；npm 遗留的临时包目录在第二次安装后正常清理。
- 升级后的 web profile 以隐藏窗口恢复在 `127.0.0.1:3080`；它是本机既有服务，不由当前插件管理。
- 在 Vault 外临时目录完成 1 次非敏感 headless 请求，返回 `P0_OK`、退出码为 0，且没有残留 headless 进程。
- 当前插件只实现手动固定 `--version` 的健康检查，不发起模型请求，不把“可执行”显示为“已连接”。
- 隔离 Vault 已完成设置页、设置持久化、真实版本检查、缺失路径恢复、超时与禁用清理验收；测试安装和临时假运行时均已清理。

## 官方契约快照

本批次参考的上游事实来源：

- [Obsidian 插件开发者政策](https://docs.obsidian.md/community-directory/developer-policies)
- [Obsidian 插件提交要求](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Obsidian 插件 manifest 参考](https://docs.obsidian.md/Reference/Manifest)
- [Obsidian 插件发布说明](https://docs.obsidian.md/plugins/releasing/submit-plugin)
- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)

由这些契约落实到当前基线的边界为：桌面端专用、无客户端遥测、无自行更新、如实披露外部进程和文件访问、Release 与社区提交保持独立。

## 能力分类

| 分类 | 当前事实 |
| --- | --- |
| 已实现 | 原生 `ItemView`、ribbon、命令入口、固定身份文件、Phase A 与最小 Phase B 脚本和 workflow |
| 已通过本地质量门 | Windows `npm ci`、TypeScript 类型检查、ESLint 零警告、6 项契约测试、生产构建与全部自检 |
| 已实现并验证 | DSH 命令设置、固定 `--version` 健康检查、状态展示、超时与受管进程清理；已通过隔离 Vault 验收 |
| 计划中 | 薄 `obsidian-bridge`、流式会话、真实取消、权限回路、Vault Bridge |
| 未实现 | DSH 会话连接、插件模型网络访问、Vault 读取和写入、凭据存储 |
| 已通过真实宿主验收 | 隔离测试 Vault 中的发现、启用、设置读回、重载、命令打开、真实健康检查、错误恢复、超时/禁用进程清理、DOM、截图和错误检查；测试安装已清理 |
| 已通过远端验证 | `main` 远端 SHA 与本地一致；Windows 与 Ubuntu Phase A 成功；2 个 check-run 的原始 annotations 合计为 0 |
| 延期，未通过 | Windows DSH 进程生命周期、真实协议能力、Vault 安全矩阵、Release 自动化、社区提交 |
| 当前阻塞 | 无；后续阶段仍需逐批批准和对应真实环境证据 |

## Batch 0A 停止边界

本批次只建立可构建、可在隔离 Vault 验收的原生插件基线与 CI。即使所有门通过，也不表示 DSH 已可用，不授权读写 Vault，不创建 Release，不提交社区目录。

## 已取得的 Batch 0A 证据

- 第一次干净安装发现锁文件含错误的 `extraneous` 平台包，Windows `npm ci` 如实失败；重新规范化锁文件后，第二次 `npm ci` 成功且 0 个已知漏洞。
- `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 和 `npm run verify` 全部成功。
- Obsidian `1.13.7` 在隔离测试 Vault 中识别 `0.1.0` 插件，完成启用、重载和 `deepseek-harness-workbench:open-workbench` 命令。
- `.dsh-workbench` DOM 数量为 1，显示内容与当前未连接 DSH、健康检查未实现、Vault 未启用和仅桌面端的事实一致。
- 启用、重载和禁用后的插件错误均为 0；附加调试器后的错误级控制台消息为 0。
- 插件禁用后，隔离 Vault 中的三个临时构建资产和空插件目录已清理；这些内容可由生产构建恢复。
- 首次远端 CI 的两个 job 虽然成功，但各产生 1 条 Node 20 action runtime 弃用 annotation，因此未被视为完成。
- `actions/checkout` 与 `actions/setup-node` 升级为 Node 24 runtime 的当前版本并固定到完整提交 SHA；CI 自检同时加入防回退断言。
- 修正提交 `7656e15c60eef25b802fe21f2359217351ec94be` 的远端 SHA 与本地一致，Windows 与 Ubuntu job 均成功，两个 check-run 的原始 annotations 合计为 0。
