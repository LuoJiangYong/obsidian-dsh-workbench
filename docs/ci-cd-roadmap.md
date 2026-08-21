# CI/CD 路线图

更新时间：2026-08-21

## 定位

CI/CD 是 `AGENTS.md` 的自动执行器，不是产品决策者、下一阶段批准者或自动发布机器人。每个开发批次必须检查新增行为是否真正进入 CI；测试文件存在但 workflow 未执行，不算覆盖。

## 覆盖原则

完整执行链应为：

```text
用户结果或契约变化
→ 最小相关测试
→ 本地共用验证脚本
→ GitHub Actions workflow
→ 远端结果与 annotations
→ 治理状态回写
```

任何一环缺失都必须标记为 `未覆盖` 或 `延期，未通过`。

## Phase A：工程质量门

状态：已通过；Windows 完整本地质量门、远端 Windows/Ubuntu CI 和原始零 annotations 均已有证据。

在最小插件骨架建立的同一批次实施：

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- manifest、package 和 versions 一致性
- 仓库边界与禁止文件检查
- 凭据和敏感文件扫描
- 构建产物清理或忽略检查

Phase A 不创建 Release，不提交社区目录，也不批准 Phase B。

当前已接入同一组 npm 脚本和 GitHub Actions：

- Ubuntu 与 Windows 双平台、Node.js 24、`npm ci`。
- 类型检查、ESLint 零警告、Vitest、生产构建。
- manifest/package/versions 一致性与构建资产检查。
- 仓库边界、禁止文件、敏感路径和凭据模式检查。
- workflow 命令与 package scripts 的覆盖自检。
- Node 24 action runtime 版本固定与防止退回 Node 20 runtime 的自检。

## Phase B：治理与架构门

状态：固定身份、非官方声明、桌面端范围和发布边界的最小契约已通过本地与远端 CI。

计划覆盖：

- 固定显示名、插件 ID、仓库名、非官方声明和 `isDesktopOnly: true`。
- `AGENTS.md`、ADR、路线评估和发布状态文件存在且语义一致。
- 已实现、仅规划、未验证、阻塞和延期用语不漂移。
- `RuntimeAdapter`、事件和设置等公共契约变化有依赖同步证据。

Phase B 只证明治理与架构契约一致，不证明运行时已经可用。

## Phase C：运行时与 Vault 安全门

状态：部分建立，整体未通过。

进入运行时和 Vault Bridge 实现后逐项建立：

- 假运行时：成功、错误、乱序、超时和取消。
- Windows：裸命令、绝对路径、`.cmd` shim、隐藏窗口和进程树清理。
- 插件禁用和卸载后无残留进程与监听器。
- DSH 版本与协议能力握手。
- 未授权路径、绝对路径、`..`、二进制和超限输入拒绝。
- 未确认 proposal 不写入。
- base hash 冲突不覆盖。
- stderr、错误和日志脱敏。

Batch 0B 已建立其中的只读健康检查子集：

- 固定 `--version`，拒绝附加参数、相对路径、Windows `.ps1` 和 Shell 元字符。
- 精确目标版本 `0.1.1-rc.1`；其他版本明确显示不支持，不增加兼容分支。
- 假运行时覆盖 PATH 裸命令、绝对路径、Windows `.cmd` shim、无效输出、超时、stderr 限长脱敏、`dispose` 与进程树清理。
- Windows matrix 增加显式 `npm run test:runtime` 专项步骤；完整 `npm test` 仍在 Windows 与 Ubuntu 运行。
- SDK、ACP 与薄 bridge 的 P0 评估已形成唯一 ADR，生产 bridge 仍未实现。

这些证据不证明真实会话、协议握手、mid-turn cancel、权限回路或 Vault 安全门通过，因此 Phase C 整体保持未通过。

## Phase D：隔离 Vault 与发布门

状态：延期，未通过。

计划覆盖：

- 在独立测试 Vault 安装、加载、禁用和重新加载。
- 原生 Workbench 视图与健康检查人工验收。
- Release blocker 验收矩阵。
- `main.js`、`manifest.json`、可选 `styles.css` 的生产构建与安装冒烟。
- README 的依赖、网络、隐私、桌面端和非官方声明。
- Release tag、manifest、package、versions 和附件一致性。
- 提交当天社区 name/id 实时查重。

Phase D 未通过时不得创建公开 Release 或提交社区目录。

当前已完成 Phase D 中与 Batch 0A 对应的最小加载/禁用冒烟，以及 Batch 0B 的设置读回、真实健康检查、错误恢复、超时和禁用进程清理验收。测试插件目录和临时运行时均已清理。完整会话、Vault 安全矩阵和发布资产验收仍未实现，因此 Phase D 整体仍是延期，未通过。

## Phase E：Release Automation

状态：未批准，禁止实施。

只有插件真实可加载、至少一项功能完成隔离 Vault 验收、Phase A-D 全部通过并获得单独批准后，才能：

- 根据无 `v` 前缀的语义化 tag 构建生产资产。
- 校验 tag 与版本文件一致。
- 上传 `main.js`、`manifest.json` 和可选 `styles.css`。
- 创建不可变 GitHub Release。

Phase E 不得自动提交 Obsidian 社区目录；社区提交仍是独立外部动作和单独验收门。

## 每批 CI 更新检查表

- [ ] 本批要改善的用户结果、允许范围、禁止范围和停止边界是什么？
- [ ] 本批新增或修改了哪些行为、平台、协议、安全或发布边界？
- [ ] 每项行为是否有最小相关测试？
- [ ] workflow 是否实际执行这些测试？
- [ ] 本地与 CI 是否调用相同脚本？
- [ ] 是否需要新增 Windows 或隔离 Vault job？
- [ ] 是否需要更新版本、边界、凭据或 Release 校验？
- [ ] diff 中每处修改是否都能映射到验收条件？
- [ ] 是否存在 `any`、空 catch、宽松 fallback、降低断言或 mock 冒充真实验收？
- [ ] 是否更新了本路线图的实际状态？
- [ ] 远端 CI 是否成功且原始 annotations 为零？

若 workflow 没有实际执行证明行为变化的测试，必须在同一批次更新 CI；否则该批次不得标记完成。mock 只证明受控契约，不得替代真实 DSH、Windows 进程、Obsidian 或隔离 Vault 验收。

## 当前下一步

Batch 0B 已完成只读健康检查、P0 路线决策和隔离 Vault 验收。Windows 专项 CI 已接入；远端 CI 与原始 annotations 由本批提交后的 GitHub 检查确认。完整协议、真实取消、权限回路与 Vault 安全仍属于后续独立批次。
