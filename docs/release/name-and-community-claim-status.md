# 名称、仓库与社区占位状态

核验日期：2026-08-24

状态补记：用户已于 `2026-08-31` 明确确认第一批开发目标完成，当前 v1 产品与用户验收门已闭环；GitHub Release、发布资产验收和 Obsidian 社区提交仍未批准或执行，社区名称与 ID 也未占位。

## 固定身份

| 项目 | 固定值 |
| --- | --- |
| 显示名 | `DeepSeek Harness Workbench` |
| 插件 ID | `deepseek-harness-workbench` |
| GitHub 仓库名 | `obsidian-dsh-workbench` |
| GitHub 所有者 | `LuoJiangYong` |
| 首版平台 | Obsidian 桌面端，`isDesktopOnly: true` |
| 对外声明 | `Unofficial community integration for DeepSeek Harness.` |

## 当前状态

| 边界 | 当前事实 | 是否已占位 |
| --- | --- | --- |
| GitHub 仓库 | 已创建公开仓库 `LuoJiangYong/obsidian-dsh-workbench`，`main` 首次推送与 CI 已完成 | 是，仅指 GitHub 仓库名 |
| Obsidian 社区显示名 | 官方社区目录精确匹配为 0 | 否 |
| Obsidian 社区插件 ID | 官方社区目录精确匹配为 0 | 否 |
| GitHub Release | 未创建 | 不适用 |
| 社区提交 | 未进行 | 否 |

目标仓库地址为 `https://github.com/LuoJiangYong/obsidian-dsh-workbench`，已通过 GitHub API 回读确认为公开仓库。GitHub 仓库名占位与 Obsidian 社区名称或插件 ID 占位互不等价。

社区目录查重结果只证明核验时没有精确冲突，不产生保留权或占位权。创建 GitHub 仓库、提交 `manifest.json`、构建 `main.js` 或创建 Release，也都不等于 Obsidian 社区 ID 已占位。

## 社区发布路线

社区发布是两个彼此独立、都需要单独批准的外部动作：

1. **GitHub Release**：在 Phase A-D、首发“新建任务”功能门、隔离 Vault 运行验收和最终 UI 用户验收全部通过后，复核 tag、`manifest.json.version`、`package.json.version`、`versions.json` 与构建资产一致，再创建不可变 Release 并附加 `main.js`、`manifest.json` 和可选 `styles.css`。
2. **Obsidian 社区提交**：在提交当天重新检查 `community.obsidian.md` 目录中的名称与 ID，使用已绑定的 GitHub 账号发起插件提交；接受对默认分支 HEAD、GitHub Release 资产和审阅分支的自动扫描及人工审阅。只有社区目录接受并发布后，名称和 ID 才能标记为“已占位”。

Release 成功不自动授权社区提交；社区扫描或审阅结果也不能反向修改 Release、仓库或用户环境。任何自动 Release、自动社区提交、自动修复扫描结果或绕过人工审批的流程均未批准。

## 首发产品门

首个社区发布功能固定为“新建任务”，且必须真实实现“对话”和“任务执行”、上下文快照、外部工作区边界、权限请求、真实取消和明确错误状态。“代码协作”不属于当前首发门；Vault 写入、任意 Shell、DSH 自动安装/更新和移动端明确排除。当前 v1 功能门与用户运行验收已随第一批目标确认闭环，但这不创建或批准 Release，不完成发布资产验收，也不授权 Obsidian 社区提交。设计、治理测试、CI、用户验收或 GitHub Release 任一单项都不能替代其他发布门。

## 本批次禁止动作

- 不创建 GitHub Release 或 tag。
- 不向 `obsidianmd/obsidian-releases` 提交 PR。
- 不声称官方、首个、唯一、已认证或已进入社区目录。
- 不把本地测试、mock 或 CI 成功描述为真实 DSH 集成已完成。
