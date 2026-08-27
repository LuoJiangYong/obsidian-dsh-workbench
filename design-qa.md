# Workbench 壳层与 Ardot UI 真相设计验收

状态：Ardot 设计证据有效；误用测试 Vault 的 Obsidian 运行证据已撤回；专用 Vault 修正验收已通过，最终 Obsidian UI 用户验收待完整功能后执行

> `2026-08-26` 纠正：本文早期 Workbench 壳层运行截图使用了属于另一个插件的 `obsidian-trend-radar-evidence` Vault，不能作为本插件隔离验收证据；`docs/assets/design-qa/workbench-shell/` 只保留为历史工件，不再支撑“已通过”结论。Ardot 设计审阅证据不受影响；`docs/assets/design-qa/new-task-host-ui/` 五张截图已全部由专用 `obsidian-dsh-workbench-evidence` Vault 覆盖，当前有效运行结论只以后文修正批次为准。

## 视觉来源

- 结构参考：`docs/assets/design-reference/workbuddy-structure.png`，`2880 × 1824`。
- Obsidian 原生参考：`docs/assets/design-reference/trend-radar-overview-wide-light.png`，`1396 × 889`。
- 用户审阅 UI 真相：[Ardot `DeepSeek Harness Workbench · UI 真相`](https://ardot.tencent.com/file/718186366720195)。
- 稳定文字契约：`DESIGN.md`。

WorkBuddy 参考图只用于内部左导航和主内容区的空间关系；Trend Radar 参考图用于 Obsidian 宿主中的实际几何、语义 token 和状态真值表达。参考图中的任务数据、聊天输入、模型选择和品牌装饰不属于本批实现目标。

## 实现目标与环境

- 原宿主：误用 `obsidian-trend-radar-evidence`，该环境属于另一个插件，以下运行证据已撤回；Obsidian 版本读回为 `1.13.7`，安装器 `1.12.7`。
- 安装资产：仓库构建的 `main.js`、`manifest.json`、`styles.css`，复制后 SHA-256 逐项一致。
- 宽屏：浏览器内容区 `1440 × 912` CSS px，设备像素比 `2`；Workbench 内容区 `1396 × 834` CSS px。
- 几何读回：本地导航 `194px`；主内容 padding `24px 28px 32px`。
- 主题：默认浅色；深色截图通过非持久的 body 主题类切换取得，随后恢复浅色。
- 窄屏：在同一宿主中把 Workbench 容器临时限制为 `700px`，验证容器查询；截图后移除临时 inline 宽度，读回恢复 `1396px`。

## 实现截图

- 概览宽屏浅色：`docs/assets/design-qa/workbench-shell/overview-wide-light.png`，`2880 × 1824`。
- 概览宽屏深色：`docs/assets/design-qa/workbench-shell/overview-wide-dark.png`，`2880 × 1824`。
- 运行状态与真实 DSH 结果：`docs/assets/design-qa/workbench-shell/runtime-status-available-wide-light.png`，`2880 × 1824`。
- Workbench 与右侧快速助手：`docs/assets/design-qa/workbench-shell/runtime-with-quick-assistant-wide-light.png`，`2880 × 1824`。
- `700px` 窄容器：`docs/assets/design-qa/workbench-shell/runtime-narrow-700-light.png`，`2880 × 1824`。

`overview-wide-current.png` 和 `runtime-status-wide-light.png` 分别保留首次视觉检查与检查中状态，作为本批修复历史证据，不代表最终比较目标。

## 同屏比较

- WorkBuddy 完整结构比较：`docs/assets/design-qa/workbench-shell/comparison-workbuddy-full.png`。左侧为参考，右侧为实现；两侧原图均为 `2880 × 1824`。
- 左导航局部比较：`docs/assets/design-qa/workbench-shell/comparison-navigation-focus.png`。左右各裁取原图左侧 `530px`，用于检查导航层级、图标、活动态和密度。
- Trend Radar 完整比较：`docs/assets/design-qa/workbench-shell/comparison-trend-radar-full.png`。两侧统一缩放到 `900px` 高；左侧为 Trend Radar，右侧为本实现。

## 比较结论

### 完整画面

- 已满足 ribbon 入口、中央标签页、插件自有左导航和单一主内容区的结构目标。
- 主内容没有复制 WorkBuddy 的聊天输入和任务列表，而是展示当前真实能力、唯一运行时主操作和安全边界；这是批准范围决定的有意差异。
- 实现保留 Obsidian 标题栏、ribbon、标签页和侧边栏，不重建独立桌面应用 chrome。
- 与 Trend Radar 一致使用 `194px` 左导航、语义色、平面边框、紧凑纵向节奏和宽松横向留白。

### 局部布局

- 活动页使用 accent 浅背景、accent 文字与 `aria-current="page"`。
- 六个未来模块均为原生 `disabled`，显示“规划中”，且没有点击处理。
- “专家 · Skill · 连接器”在 `194px` 导航中换为两行；实时几何读回为 label 右边界 `191px`、规划标识左边界 `199px`，无重叠。
- `700px` 容器下固定侧栏读回为 `display: none`，紧凑选择器为 `display: flex`，`clientWidth` 与 `scrollWidth` 均为 `700`，没有水平溢出。
- 右侧快速助手只显示 DSH 健康、上下文空态、快捷提问不可用说明；输入和 textarea 数量为 `0`。

## 发现与修复历史

1. 首次隔离 Vault 截图发现 Obsidian 核心按钮背景与阴影覆盖了规划导航的平面样式，使禁用项看起来像可操作卡片。已用 Workbench 范围内的精确选择器清除背景图和阴影；实时读回为透明背景、`box-shadow: none`。
2. 首次局部比较发现“专家 · Skill · 连接器”和“规划中”在 `194px` 导航中重叠。已允许标签自然换行并增加 `overflow-wrap`；重新构建、重载、截图和几何读回均通过。
3. 修复后重新生成完整和局部比较；未发现剩余 P0、P1 或 P2 视觉问题。

## 功能与运行证据

- workspace 树显示 Workbench 位于 `main` tabs；快速助手位于 `right` tabs。
- 连续两次打开 Workbench 和再次打开快速助手后，两个视图的 DOM 数量均保持 `1`。
- 手动健康检查显示 `DSH 可执行（0.1.1-rc.1）`，同时继续显示“尚未连接 DSH”。
- 快速助手没有输入、发送、停止或模型选择控件。
- 规划项全部禁用；可用导航可在概览和运行状态之间切换。
- 最终 Obsidian 错误缓冲为 `0`，错误级控制台消息为 `0`。

Workbench 壳层运行实现 final result: passed

## Ardot UI 真相 v1

### 审阅范围与状态

- Ardot 文件 ID：`718186366720195`；页面 `UI 真相 v1`（`0:1`）。
- 设计系统与同步协议：`2:31`。
- 概览宽屏浅色：`2:32`；运行状态宽屏浅色：`2:265`。
- 运行状态与可选快速助手：`2:368`；概览宽屏深色：`2:452`。
- `700px` Workbench 容器：`2:36`。
- 本批只建立用户审阅 UI 真相和治理同步契约；运行代码的插件图标仍为 Lucide `bot`，同步实现明确延期，未冒充已经交付。

### Ardot 画板证据

- 设计系统：`docs/assets/design-qa/ardot-ui-truth/design-system.png`，`1440 × 900`。
- 概览宽屏浅色：`docs/assets/design-qa/ardot-ui-truth/overview-wide-light.png`，`1440 × 912`。
- 运行状态宽屏浅色：`docs/assets/design-qa/ardot-ui-truth/runtime-wide-light.png`，`1440 × 912`。
- 快速助手宽屏浅色：`docs/assets/design-qa/ardot-ui-truth/quick-assistant-wide-light.png`，`1440 × 912`。
- 概览宽屏深色：`docs/assets/design-qa/ardot-ui-truth/overview-wide-dark.png`，`1440 × 912`。
- `700px` 容器画板：`docs/assets/design-qa/ardot-ui-truth/runtime-narrow-700.png`，`1440 × 1040`；其中实际 Obsidian + Workbench 画面为 `744 × 912`。

### 同视口比较证据

以下比较左侧为当前隔离 Vault 运行实现，右侧为 Ardot 审阅真相；宽屏两侧均统一为 `1440 × 912`。窄屏两侧均裁取左侧 `44px` Ribbon + `700px` Workbench，尺寸为 `744 × 912`。

- 概览浅色：`docs/assets/design-qa/ardot-ui-truth/comparison-overview-light.png`。
- 运行状态浅色：`docs/assets/design-qa/ardot-ui-truth/comparison-runtime-light.png`。
- 可选快速助手：`docs/assets/design-qa/ardot-ui-truth/comparison-assistant-light.png`。
- 概览深色：`docs/assets/design-qa/ardot-ui-truth/comparison-overview-dark.png`。
- `700px` 运行状态：`docs/assets/design-qa/ardot-ui-truth/comparison-runtime-narrow.png`。

### 比较结论与修复

1. Ardot 保留当前实现的 Obsidian ribbon、中央标签页、`194px` 内部左导航、单一主内容和按需右侧快速助手结构；规划模块继续禁用，没有制造任务、阅读、资讯或聊天假数据。
2. DeepSeek Harness Web 前端鲸鱼 SVG 以原始矢量写入组件，SHA-256 为 `C61A62A9D47D8660F9CFE08AAC6775FF0476F7D6C5053F7659C1F8493FD6D814`，并用于 Ribbon、活动标签页、Workbench 左上角和快速助手。
3. 首次深色画板检查发现黑色鲸鱼和部分图标在深色表面上对比不足。鲸鱼改用白色承载底且不重绘原始矢量；通用矢量图标改为 Light/Dark 语义色。复核截图中四个鲸鱼位置和功能图标均清晰。
4. `700px` 容器隐藏固定内部左导航，使用紧凑页面选择器；状态列表、主操作、安全边界和图例全部保留，无横向滚动需求。
5. Ardot 布局诊断只报告有意的图标/承载底叠放、活动态背景叠放和内容区域留白；截图复核确认均为设计结构，不是遮挡、裁切或缺失。未发现剩余 P0、P1 或 P2 视觉问题。

final result: passed

## Ardot UI 真相 v2

### 批次结果与实现差异

- Ardot 文件 ID：`718186366720195`；页面 `UI 真相 v2`（`12:1`）。
- 设计系统与交互状态：`12:2`。
- 新建任务宽屏浅色：`12:41`；运行宽屏浅色：`12:120`。
- 新建任务与快速助手：`12:191`；新建任务宽屏深色：`12:275`。
- 新建任务 `700px` Workbench 容器：`12:360`。
- 参考截图与 v2 同屏 QA：`12:530`。
- `UI 真相 v1`（`0:1`）保留为历史与失败回退基线，没有覆盖或删除。
- 本批结果是`仅设计已更新，运行代码未同步`。当前源码仍使用 Lucide `bot`，仍渲染分离的“概览”“运行状态”和禁用“助手”；没有实现 DSH 对话、任务执行、上下文或 Vault 能力。

### v2 画板证据

- 设计系统与交互状态：`docs/assets/design-qa/ardot-ui-truth-v2/design-system.png`，`1440 × 900`。
- 新建任务宽屏浅色：`docs/assets/design-qa/ardot-ui-truth-v2/new-task-wide-light.png`，`1440 × 912`。
- 运行宽屏浅色：`docs/assets/design-qa/ardot-ui-truth-v2/run-wide-light.png`，`1440 × 912`。
- 新建任务与快速助手：`docs/assets/design-qa/ardot-ui-truth-v2/new-task-with-quick-assistant.png`，`1440 × 912`。
- 新建任务宽屏深色：`docs/assets/design-qa/ardot-ui-truth-v2/new-task-wide-dark.png`，`1440 × 912`。
- 新建任务 `700px` 容器：`docs/assets/design-qa/ardot-ui-truth-v2/new-task-narrow-700.png`，`1440 × 1040`；实际 Obsidian + Workbench 画面为 `744 × 912`。

### 同屏参考比较

- 对照证据：`docs/assets/design-qa/ardot-ui-truth-v2/comparison-reference-v2.png`，`1440 × 900`。
- 左侧为用户提供的 WorkBuddy 新建任务参考，右侧为 Ardot v2 新建任务宽屏浅色；两张原图具有相同宽高比，并在对照画板中统一为 `650 × 412` 可视槽。
- 参考图只提供“新建任务在导航首位、产品自有左导航、中央任务输入”的空间关系。v2 没有复制 WorkBuddy 品牌、账号、最近任务、第三方入口、模型名称或机器人装饰。
- v2 只保留任务输入与执行前确认等产品语义；暂不可用导航使用浅灰文字与图标，不显示开发阶段、发布批次或治理审批文案。运行实现差异继续单独记录在本文档，不进入产品画板。
- 由于运行代码未同步 v2，本批没有制造“Ardot ↔ Obsidian v2 运行实现”比较，也没有声明最终用户 UI 验收通过。

### 需求核对

1. “新建任务”在所有宽屏导航中位于第一项；在 `700px` 容器中是紧凑选择器的当前页。
2. “概览”和“运行状态”合并为“运行”，汇总四项概览真值和四项只读运行状态，位于功能导航最后。
3. 左上角名称严格为三行：`DeepSeek`、`Harness`、`Workbench`。
4. 右侧快速助手标题只显示“快速助手”，展示健康、当前上下文和快捷提问，不承担主对话。
5. 各产品画板均不显示“首发”“规划中”“尚未实现”等开发或发布文案；暂不可用导航只使用浅灰禁用态，不添加状态徽标。
6. 社区发布门仍由 `AGENTS.md`、`DESIGN.md` 和 ADR 管理，没有进入 Ardot 或插件产品界面。
7. 浅色、深色、宽屏、快速助手组合和 `700px` 容器均有明确画板；没有使用假历史任务、假回复或假 Vault 数据。

### 资产与布局诊断

- DeepSeek 鲸鱼继续使用 `@deepseek-ai/dsh-web-frontend@0.1.1-rc.1/dist/favicon.svg`，SHA-256 为 `C61A62A9D47D8660F9CFE08AAC6775FF0476F7D6C5053F7659C1F8493FD6D814`。
- 新建任务图标来自官方 Lucide `icons/circle-plus.svg`，SHA-256 为 `6FA978530075DF975AD05E2742896A1950B74C2B133A0D208891B038A4A41C17`；Ardot 组件为 `12:555`。
- 六个产品画板和同屏 QA 已在移除开发/发布文案、应用浅灰禁用态并更新嵌入式新建任务截图后逐张复核。Ardot 布局诊断报告的承载底/图标叠放、活动导航背景叠放、宿主标题栏留白、任务输入留白和窄屏说明区留白均与截图一致，属于有意结构。
- 截图未发现文字裁切、横向溢出、错误层级、错误主题 token 或剩余 P0、P1、P2 视觉问题。
- 治理实现提交 `f3fa2402431868519164e65ebded27aa9bfe8f6a` 的远端 [CI run 32700464511](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32700464511) 已通过 Ubuntu 与 Windows；两个 check run 的原始 annotations 合计为 `0`。

Ardot v2 design-only final result: passed

## Batch 5A：宿主 UI 证据撤回与专用 Vault 修正

### 范围与真相

- 日期：`2026-08-26`；Ardot 文件仍为 `718186366720195`，用户审阅页面仍为 `UI 真相 v2`（`12:1`）。
- Ardot 是用户审阅和完善 UI 的界面，AI 默认只读。本次用户反馈只授权修改插件：未实现模块不在插件导航中渲染，模式分段控件使用左右半圆胶囊边界；Ardot 未修改。
- “对话”和“任务执行”仍只切换宿主状态；“代码协作”、附件、上下文、权限和发送保持原生禁用。没有启动正式 bridge、读取 Vault、持久化草稿或发起模型请求。

### 已撤回的运行证据

- 原 Batch 5A 运行截图和 DOM 读回使用了 `D:\codex workspace\_test-vaults\obsidian-trend-radar-evidence`。该 Vault 属于另一个插件，不能作为本插件隔离验收环境。
- 原截图、唯一视图、禁用语义、reload 复位、`700px`、Light/Dark、错误缓冲和进程残留读回全部从本插件验收结论中撤回；它们不参与下列修正结论。
- 原实现提交 `c8f6922b1a44e5bc0fdb325fce183e95b85320d1` 与 [CI run 32919119819](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32919119819) 的代码门仍有效：Ubuntu check `98028935782`、Windows check `98028935888` 均成功，两个原始 annotations 数组均为 `[]`。CI 成功不替代运行验收。

### 专用 Vault 有效运行证据

- 专用 Vault 固定为 `D:\codex workspace\_test-vaults\obsidian-dsh-workbench-evidence`，每个 Obsidian CLI 命令必须显式指定该 Vault。
- 宿主版本为 Obsidian `1.13.7`（installer `1.12.7`）。插件反馈与证据纠正提交为 `a41c93b43245c9b1cfb84c4adb243ef4217c8253`；[CI run 32963736114](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/32963736114) 的 Ubuntu check `98161570546` 与 Windows check `98161570396` 均成功，两个原始 annotations 数组均为 `[]`。
- `a41c93b` 生产构建与专用 Vault 部署资产 SHA-256 逐项一致：`main.js` 为 `E9E24FAA6BFAD7253AC4313FA88C1DDA7894284A079ED0CB22432B9D1C4F6367`，`manifest.json` 为 `81BDF8F237FA070C3F0DECCC9C09A21F4915196633072D892428E705060F25A6`，`obsidian-bridge.mjs` 为 `1CF83B3E977ED5B5DA6CA5C59A5D42CEB70D67E475CE3B8DEC0279A5B27139D6`，`styles.css` 为 `02FB08C4F93B2E3EEEA11202EC1C516EBC228F9A704CD350F585CE60AEFB33F2`。
- 连续两次打开命令后 Workbench DOM 与 leaf 均为 `1`；宽屏导航精确为“新建任务 / 运行”，禁用导航数为 `0`，五个未实现模块在 Workbench 文本与紧凑选择器中均不存在。
- 模式外框计算样式为 `border-radius: 999px`；首个按钮四角依次为 `999px / 0px / 0px / 999px`，最后按钮为 `0px / 999px / 999px / 0px`。对话与任务执行可切换，“代码协作”保持禁用；附件、上下文、权限和发送全部禁用。
- 任务执行模式与内存草稿可在当前视图更新，发送仍禁用；plugin reload 后恢复“对话”、空草稿和禁用发送，Workbench 与 leaf 仍各为 `1`。
- “运行”页真实执行固定 `dsh --version` 后显示 `DSH 可执行（0.1.1-rc.1）`，连接状态仍为“尚未连接 DSH”；受管 `obsidian-bridge.mjs` 进程为 `0`。
- 快速助手连续打开后 DOM 与 leaf 均为 `1`，显示 `DSH 可执行（0.1.1-rc.1）`、`未选择笔记或工作范围`，两个快捷提问均为原生禁用。
- `700px` 容器前置断言为 `clientWidth = 700`、`scrollWidth = 700`、固定侧栏 `display: none`、紧凑选择器 `display: flex`，选项仅“新建任务 / 运行”且均可用；composer footer 保持横向。测试 inline 宽度随后移除，宽屏恢复 `clientWidth = scrollWidth = 1396`。
- 深色主题中品牌圆形承载底为 `rgb(255, 255, 255)`、图标颜色为 `rgb(0, 0, 0)`；验收结束前已恢复浅色。

### 专用 Vault 截图与视觉复核

- `new-task-wide-light.png`：`2880 × 1824`，`165779` bytes，SHA-256 `6F79863879C0AB0E7A34B46CA54916802BDE9D3B5039EAF488AC5A413F2AD231`。
- `new-task-with-quick-assistant.png`：`2880 × 1824`，`243563` bytes，SHA-256 `6575F08DFC2EE4E162CDCCB9A6A5FA08B56620C85CAEE88967B1EF3F46071F15`。
- `run-wide-light.png`：`2880 × 1824`，`206174` bytes，SHA-256 `E85BB8DC0EBB197E5F5E8B6C5B647BFC7A667CB7E45B6D1D7B30AFCC39278242`。
- `new-task-wide-dark.png`：`2880 × 1824`，`166010` bytes，SHA-256 `A86C987D3E58CC6A392BFBB8E7A089735F8140550C44C74C713754543533A336`。
- `new-task-narrow-700.png`：`2880 × 1824`，`145406` bytes，SHA-256 `80014D474DFD159FE6D814D9DB76C4EF486782646AF31976F96372A1F25646B2`。
- 每张截图均在目标 DOM 读回后先执行稳定化截图，再执行正式截图；两张因空宿主右侧栏或侧栏动画尚未完成而产生的中间截图均被拒绝并覆盖。五张最终图已逐张视觉复核，未发现文字裁切、横向溢出、错误主题 token 或剩余 P0 / P1 / P2 视觉问题。

### 清理与边界

- Vault 文件列表始终只有 `DeepSeek Harness Workbench 验收说明.md`；读回内容仍为隔离验收说明，没有写入任务、上下文或模型输出。
- 验收结束后已禁用插件；Workbench、快速助手及对应 leaf 均为 `0`，Obsidian 错误缓冲与 error 级控制台消息均为 `0`，受管 bridge 进程为 `0`。
- `main.js`、`manifest.json`、`obsidian-bridge.mjs`、`styles.css` 已通过 Obsidian adapter 逐项删除并读回不存在；五个稳定化临时截图已删除。
- Ardot 未修改，只读核对；本批只更新插件实现差异、仓库契约、测试、CI 与专用 Vault 证据。

Batch 5A dedicated Vault remediation result: passed; final Obsidian UI user acceptance: pending

## Batch 6：只读上下文实施门

- 日期：`2026-08-26`；Ardot 文件仍为 `718186366720195`，用户审阅页面仍为 `UI 真相 v2`（`12:1`）。Ardot 未修改，只读核对；上下文交互只演进插件、`DESIGN.md`、ADR、测试与 CI 契约。
- 插件已把“选择上下文”从禁用态升级为原生宿主选择流程，支持当前笔记、当前选区和单个 Vault Markdown 文件；已选来源在 composer 内可见，当前选区显示文本预览，文件明确提示发送时读取，可逐项移除；快速助手同步显示 Workbench 已选上下文摘要。
- Vault 边界保持只读：文件建议器只列出 Markdown 元数据，只有用户显式加入的文件在发送前通过 `Vault.cachedRead` 重新读取；bridge 不持有 Vault API。整库内容读取、索引、写入、删除和移动均未实现。
- 限制冻结为 `10` 项、单项 `96 KiB`、合计 `192 KiB`；单元测试以最大引号/换行内容验证上下文 JSON 投影到 `turn/start` 后仍小于 `1 MiB` frame。
- 本地测试已覆盖选择、去重、预览、移除、草稿保留、失效/二进制/路径/超限错误、发送时重读、不可变快照、宿主 modal 清理和插件卸载边界；`typecheck`、零警告 `lint`、`72` 项完整测试、生产构建、完整自检、`13` 项 Windows 进程专项测试和 `1` 项真实 rc.2 bridge 测试均通过。远端 CI、专用 Vault 运行读回与截图仍待本批后续步骤。
- 当前发送、权限和附件仍禁用；未启动正式 bridge、模型网络或任务执行，没有写入真实 Vault，也未创建 Release 或社区提交。

Batch 6 implementation result: full local gates passed; dedicated Vault runtime and remote CI pending; final Obsidian UI user acceptance: pending
