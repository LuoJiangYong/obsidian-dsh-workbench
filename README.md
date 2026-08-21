# DeepSeek Harness Workbench

> Unofficial community integration for DeepSeek Harness.

将 Obsidian 作为基于个人知识库、可审阅并可持续扩展的 Agent 工作台；外部 DeepSeek Harness 负责 Agent、Skill、MCP 和 Cordis 插件能力。

## 当前状态

当前版本是开发基线，不是社区发布版本。

| 能力 | 状态 |
| --- | --- |
| 原生 Workbench 视图 | 已实现，已通过隔离 Vault 加载与重载验收 |
| ribbon 与命令入口 | 已实现，命令入口已通过隔离 Vault 验收 |
| DSH 路径配置与健康检查 | 已实现；只读检查已通过本地测试和隔离 Vault 运行验收 |
| DSH 会话、流式事件与取消 | 尚未实现 |
| Vault 读取与写入 | 未启用 |
| GitHub Release | 未创建 |
| Obsidian 社区提交 | 尚未进行 |

当前视图只展示真实的工程状态，并提供手动 `--version` 健康检查；不提供不可用的聊天输入、发送或停止入口。DSH 命令可在插件设置中配置为 PATH 裸命令或受支持扩展名的绝对路径。

## 开发运行

要求：

- Node.js 24 或 25。
- npm 11。
- Obsidian 桌面端。
- 独立的插件开发测试 Vault；不要在真实个人知识库中开发。

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

构建后，把 `main.js`、`manifest.json` 和 `styles.css` 复制到隔离 Vault 的：

```text
.obsidian/plugins/deepseek-harness-workbench/
```

然后在 Obsidian 的社区插件设置中启用插件。

## 隐私、网络与文件访问

当前开发基线：

- 只有用户手动点击“检查 DSH”时才启动外部子进程，并且只附加固定参数 `--version`。
- 健康检查本身不发起模型请求或产品网络请求；外部 DSH 可执行文件的内部行为仍由其自身版本与用户配置负责。
- 不读取、写入或删除 Vault 内容。
- 只访问用户配置的 DSH 命令或绝对可执行路径；不接受任意参数或 Shell 命令。
- DSH 命令设置由 Obsidian 保存到当前插件的 `data.json`，不保存会话内容或凭据。
- 子进程使用隐藏窗口，stdout/stderr 限长；错误诊断会脱敏，超时或插件卸载会终止受管进程树。
- 不采集客户端遥测。
- 不保存 API Key、Token 或其他凭据。
- 插件不安装或更新 DSH、Node、Python 或其他外部依赖。

当前健康检查精确支持 DSH `0.1.1-rc.1`；其他版本会明确显示不受支持，不做兼容 fallback。后续若加入外部 DSH 会话，网络、进程、凭据和数据流向必须在功能进入前更新本文档与设置界面，并经过新的批准批次。

## 平台与身份

- 插件 ID：`deepseek-harness-workbench`
- 首版仅支持 Obsidian 桌面端：`isDesktopOnly: true`
- 本项目不是 DeepSeek 官方产品，不得描述为官方或首个 DeepSeek Harness 插件。

## 发布状态

项目公开仓库为 [LuoJiangYong/obsidian-dsh-workbench](https://github.com/LuoJiangYong/obsidian-dsh-workbench)。没有公开 Release，尚未向 Obsidian 社区目录提交。创建 GitHub 仓库、提交 manifest 或生成构建产物均不等于社区 ID 已占位。

## Batch 0A 验收

- Windows 上从锁文件执行 `npm ci` 成功，依赖审计为 0 个已知漏洞。
- 类型检查、ESLint 零警告、6 项测试、生产构建和仓库自检通过。
- 隔离测试 Vault 中完成插件发现、启用、重载、命令打开和禁用。
- Workbench DOM 唯一匹配；重载与禁用后的插件错误和错误级控制台消息均为零。
- 测试插件目录已在禁用后清理，构建资产可由 `npm run build` 重建。
- GitHub Actions 的 Windows 与 Ubuntu Phase A 均成功，原始 check-run annotations 合计为 0。
- 这些证据只证明原生插件基线，不证明 DSH 或 Vault 功能可用。

## Batch 0B 验收

- 本机 DSH 已升级并精确锁定到 `0.1.1-rc.1`；插件不会执行安装或更新。
- 在 Vault 外完成 1 次非敏感 headless 请求，返回 `P0_OK`、退出码为 0，且没有残留 headless 进程。
- 设置契约和假运行时覆盖 PATH 裸命令、绝对路径、Windows `.cmd` shim、缺失命令、版本不匹配、无效输出、诊断脱敏、超时和进程树清理。
- 隔离 Vault 中完成设置页渲染、`data.json` 写入读回、插件重载、真实 `dsh --version`、缺失路径失败与恢复。
- Workbench 同时显示 `DSH 可执行（0.1.1-rc.1）` 与“尚未连接 DSH”，没有把健康检查冒充为会话连接。
- 真实宿主中，10 秒超时和插件禁用分别终止了临时假运行时的 runner 与 child；插件错误和错误级控制台消息均为 0。
- 测试插件目录、临时假运行时和测试设置已清理；没有读取或写入 Vault 内容。
- P0 只接受薄 `obsidian-bridge` 作为未来生产路线；SDK 与 ACP 不作为并行 fallback，生产 bridge 仍未实现。

## 开发治理

- 项目开发宪法：[AGENTS.md](./AGENTS.md)
- 开发宪法评估：[docs/governance/development-constitution-assessment.md](./docs/governance/development-constitution-assessment.md)
- CI/CD 路线图：[docs/ci-cd-roadmap.md](./docs/ci-cd-roadmap.md)
- P0 运行时路线评估：[docs/architecture/p0-runtime-route-assessment.md](./docs/architecture/p0-runtime-route-assessment.md)
- 生产运行时 ADR：[docs/architecture/ADR-001-runtime-integration.md](./docs/architecture/ADR-001-runtime-integration.md)

## License

[MIT](./LICENSE)
