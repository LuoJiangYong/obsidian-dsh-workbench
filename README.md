# DeepSeek Harness Workbench

> Unofficial community integration for DeepSeek Harness.

将 Obsidian 作为基于个人知识库、可审阅并可持续扩展的 Agent 工作台；外部 DeepSeek Harness 负责 Agent、Skill、MCP 和 Cordis 插件能力。

## 当前状态

当前版本是开发基线，不是社区发布版本。

| 能力 | 状态 |
| --- | --- |
| 原生 Workbench 视图 | 已实现，已通过隔离 Vault 加载与重载验收 |
| ribbon 与命令入口 | 已实现，命令入口已通过隔离 Vault 验收 |
| DSH 路径配置与健康检查 | 尚未实现 |
| DSH 会话、流式事件与取消 | 尚未实现 |
| Vault 读取与写入 | 未启用 |
| GitHub Release | 未创建 |
| Obsidian 社区提交 | 尚未进行 |

当前视图只展示真实的工程状态，不提供不可用的聊天输入、发送、停止或配置入口。

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

- 不使用网络。
- 不读取、写入或删除 Vault 内容。
- 不访问 Vault 外文件。
- 不启动 DSH 或其他子进程。
- 不采集客户端遥测。
- 不保存 API Key、Token 或其他凭据。
- 不安装或更新 DSH、Node、Python 或其他外部依赖。

后续若加入外部 DSH 连接，网络、进程、凭据和数据流向必须在功能进入前更新本文档与设置界面，并经过新的批准批次。

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
- 这些证据只证明原生插件基线，不证明 DSH 或 Vault 功能可用。

## 开发治理

- 项目开发宪法：[AGENTS.md](./AGENTS.md)
- 开发宪法评估：[docs/governance/development-constitution-assessment.md](./docs/governance/development-constitution-assessment.md)
- CI/CD 路线图：[docs/ci-cd-roadmap.md](./docs/ci-cd-roadmap.md)

## License

[MIT](./LICENSE)
