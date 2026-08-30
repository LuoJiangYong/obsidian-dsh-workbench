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

## Batch 6：只读知识库实施门

- 日期：`2026-08-26`，插件 UI 直接反馈更新于 `2026-08-27`；Ardot 文件仍为 `718186366720195`，用户审阅页面仍为 `UI 真相 v2`（`12:1`）。Ardot 未修改，只读核对；知识库交互只演进插件、`DESIGN.md`、ADR、测试与 CI 契约。
- 插件入口使用“选择知识库”，结果标题使用“已选笔记”；选择项去除方框阴影并增加次级说明。宿主流程支持当前笔记、当前选区、单个 Vault Markdown 文件和“选择文件夹”。当前选区是真实编辑器选中文本：先在 Markdown 编辑器中选择，打开 Workbench 后加入时冻结；不可用时显示明确操作提示。
- 文件夹选择递归展开所选非根文件夹当下已有且尚未选择的 Markdown 笔记，冻结为逐篇文件 ID；整批通过去重、数量与字节检查后一次加入，空集或超限不允许部分成功，后来新增的文件不会静默进入既有选择。
- Vault 边界保持只读：文件与文件夹建议器只列出 Obsidian 已加载的元数据，只有用户显式加入的文件在发送前通过 `Vault.cachedRead` 重新读取；bridge 不持有 Vault API。隐式整库内容读取、持续索引、写入、删除和移动均未实现。
- 限制冻结为 `10` 项、单项 `96 KiB`、合计 `192 KiB`；单元测试以最大引号/换行内容验证上下文 JSON 投影到 `turn/start` 后仍小于 `1 MiB` frame。
- 测试已覆盖单项与原子批量选择、递归文件夹展开、去重、预览、移除、草稿保留、失效/二进制/路径/数量/字节错误、发送时重读、不可变快照、宿主 modal 清理和插件卸载边界；反馈后的 `typecheck`、零警告 `lint`、`77` 项完整测试、生产构建、完整自检、`13` 项 Windows 进程专项测试和 `1` 项真实 rc.2 bridge 测试均通过。
- 当前发送、权限和附件仍禁用；未启动正式 bridge、模型网络或任务执行，没有写入真实 Vault，也未创建 Release 或社区提交。

### 实现、远端 CI 与部署指纹

- Batch 6 初始上下文实现提交为 `c00800f41f9ac8ea68f03537770ced91e6bb4a50`；`2026-08-27` 插件直接反馈后的最终实现状态为 `7ee4b07d4afc0a67b8034e57c513599c7d562b19`。
- 最终实现状态通过远端 [CI run 33031107880](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33031107880)：Ubuntu check `98383584575`、Windows check `98383584694` 均成功，两个原始 annotations 数组均为 `[]`。Windows job 实际执行 rc.2 运行夹具、进程专项与正式 bridge 测试。
- 专用 Vault 固定为 `D:\codex workspace\_test-vaults\obsidian-dsh-workbench-evidence`，每个 Obsidian CLI 命令均显式指定 `vault=obsidian-dsh-workbench-evidence`；宿主版本为 Obsidian `1.13.7`（installer `1.12.7`）。
- 源构建与部署资产逐项一致：`main.js` 为 `36910` bytes、SHA-256 `35529DE68C0E14A21F02D57FE9B2E036C38241E5E3DB8436B08511A4852BB498`；`manifest.json` 为 `329` bytes、`81BDF8F237FA070C3F0DECCC9C09A21F4915196633072D892428E705060F25A6`；`obsidian-bridge.mjs` 为 `13528` bytes、`1CF83B3E977ED5B5DA6CA5C59A5D42CEB70D67E475CE3B8DEC0279A5B27139D6`；`styles.css` 为 `15739` bytes、`2C176837A7E4C1F4884BB3E873ED56C3CB48DD7ACC9D74D049AD469F8671AC7B`。

### 专用 Vault 运行读回

- “选择知识库”入口、标题“已选笔记”、modal 标题“选择知识库内容”和四个选择项均从运行 DOM 读回；四个选择项计算样式 `box-shadow` 均为 `none`，草稿在选择过程中保持不变。
- “加入当前选区”不是假功能：在 Markdown 编辑器中真实选择 `DeepSeek Harness`（`16` 个字符）后加入，插件显示冻结预览；随后把两个编辑器 leaf 的实时选区都改为 `#`，已选预览仍保持 `DeepSeek Harness`，原笔记内容没有写入。
- 临时文件夹 `Batch 6 文件夹验收` 含父目录笔记和子目录笔记；文件夹建议器读回父项“`2` 篇可加入”与子项“`1` 篇可加入”。选择父项后两篇笔记一次加入；随后创建第三篇测试笔记，已选列表仍保持 `4` 项，重新打开文件夹选择器只显示父项“`1` 篇可加入”，证明既有文件集合不会静默跟踪后来新增文件。
- 快速助手读回“已选择 `4` 项”并列出当前笔记、冻结选区和两篇 Vault 文件；发送保持禁用。运行页继续显示“只读上下文（显式选择）”，健康检查边界不变，Workbench 无横向溢出。
- 深色主题和精确 `700px` 容器均完成视觉复核；窄屏前置断言为 `clientWidth = 700`、`scrollWidth = 700`、固定侧栏 `display: none`、紧凑导航 `display: flex`。验收结束前主题恢复为 `system`，内联宽度已移除。
- 禁用插件时，打开的知识库 modal、Workbench DOM/leaf、快速助手 DOM/leaf 均归零；重新启用并打开两个入口后，草稿为 `""`、已选笔记为 `0`、快速助手显示“未选择笔记或工作范围”、发送禁用，证明内存状态不跨插件重载泄漏。

### 专用 Vault 截图与视觉复核

- `context-picker-wide-light.png`：`2880 × 1824`，`286505` bytes，SHA-256 `86E19C947D11F84193707915AF94C5B4ACBFB0E2CE01C72DF0A1A3772BDD3C62`。
- `context-selected-wide-light.png`：`2880 × 1824`，`248542` bytes，SHA-256 `411E8E3FFF133DDA8F2C41D98D0977667BB1C9F3C25199F1A6A13FEFA747B156`。
- `folder-picker-open-wide-light.png`：`2880 × 1824`，`272846` bytes，SHA-256 `CF6A3345AB0FEC511AFA283546BCF4447C546A978B23F1E08DAE9D328F0D4873`。
- `folder-selected-final-wide-light.png`：`2880 × 1824`，`257122` bytes，SHA-256 `19C5D6E4A41FDD9F28C73DE54935D7B51756FEA2FDA4AB4FB998B26EAA74C6BB`。
- `context-with-quick-assistant-visible.png`：`2880 × 1824`，`262014` bytes，SHA-256 `1622CEED41093903C31E045705579253AEA868B7C3713DD9A9FAAA203CCC2F13`。
- `context-selected-wide-dark-visible.png`：`2880 × 1824`，`410474` bytes，SHA-256 `0DCA39B12CBED741D5F441DDE0EB3A1B51E7279EB8EB53EACFEC76B380B54115`。
- `context-selected-narrow-700-final.png`：`2880 × 1824`，`250733` bytes，SHA-256 `4E4A78E3E414A4F1CFDE65364CE5E74E61207E565735BB2317807C83E35F86AA`。
- `run-readonly-context-wide-light-final.png`：`2880 × 1824`，`246886` bytes，SHA-256 `AC0F4BD0B9B6585685FF016FBC716A2FD2E8FE03DE04E5AC1556DFBDAE3FD924`。
- 八张最终截图已逐张视觉复核；旧状态、动画中间态和错误 Vault 截图均未进入本证据集合。

### 清理与停止边界

- 原始验收笔记 `DeepSeek Harness Workbench 验收说明.md` 的 SHA-256 在运行前后均为 `97ADAA09E558EF57745C4304E12D67DD0B2789F31AAA56D16E10943FAE67C319`；清理后 Vault 文件列表只剩该笔记。
- 三篇临时笔记、两个临时文件夹和四个插件部署资产均通过 Obsidian API 逐项删除并读回不存在；插件处于禁用且未加载状态，modal、Workbench、快速助手及对应 leaf 均为 `0`，Obsidian 错误缓冲、error 级控制台消息和 `obsidian-bridge.mjs` Node 进程均为 `0`。
- Ardot 文件、页面和画板均未修改，只读核对。真实模型发送、权限请求、外部工作区、任务执行、最终 Obsidian UI 用户验收、Release 与社区提交仍未通过或未授权。

Batch 6 implementation and dedicated Vault result: passed; final Obsidian UI user acceptance: pending

## Batch 7：真实只读对话实施门

- 日期：`2026-08-27`；Ardot 文件仍为 `718186366720195`，用户审阅页面仍为 `UI 真相 v2`（`12:1`），相关产品画板仍为 `12:2`、`12:41`、`12:120`、`12:191`、`12:275`、`12:360` 与 QA `12:530`。
- Ardot 未修改、只读核对。本批只根据用户对插件的直接反馈演进 `DESIGN.md`、ADR、插件 UI、测试、CI 契约和本文；没有新增、删除、移动或更新 Ardot 节点、画板、文案、样式、变量或截图。
- 本批先对照 Claudian 当前提交 `15b78af785cda04fccc96f4effcfae6367f9be65` 的 provider 原生历史、共享存储、路径防护和标签生命周期。采用“provider 原生 session 为完整历史真相、插件级运行所有权、串行清理、路径包含关系防护”；拒绝把类似 `.claudian/sessions` 或 `.inputs.json` 的运行账本写入 Vault。详细决策见 ADR-006。
- Workbench “对话”模式已接入发送前 modal，展示任务、已选笔记和“不开放 DSH 工具、不写入知识库”边界；取消保留草稿，确认后才重读笔记、建立确定性快照并启动 DSH。
- 对话区使用介于左侧导航背景与主背景之间的无阴影浅底边框容器；重复的页头已移除，输入框缩短。流式事件只更新消息区，不重绘 textarea；活动 turn 的主操作变为“停止”。
- DSH “对话” session 执行空 allow-list、guard 与 `obsidian:chat-boundary` 系统提示三层拒绝；标准 preset 中的 Shell、文件系统、Web 等工具不可枚举、不可执行，模型也不得按路径读取或把 DSML 工具调用标记作为回答输出。当前对话因此不会写入 Vault 或外部工作区；协议保留工具/权限投影供后续任务模式使用。
- 完整历史、设置和凭据继续由用户原生 `$DSH_HOME` 管理；插件 bridge overlay 位于操作系统应用数据目录中的 Vault 哈希分区，当前草稿与消息投影只在内存。状态目录、DSH `cwd` 或 `$DSH_HOME` 落入 Vault 时在任何 DSH 检查前失败。
- 用户新增的“每个任务 turn 结束显示已编辑文件、默认三个/可展开、右键操作、审核与安全撤销”属于 Batch 8 外部工作区真实变更结果，不在本批显示假卡片；需求已写入 `docs/requirements/new-task-v1.md`。

### 当前证据状态

- 最终本地门通过：`typecheck`、零警告 `lint`、完整 `npm test` 为 `89 passed / 1 skipped`，生产构建与完整 `verify` 通过；Windows 进程专项为 `17 passed / 1 skipped`，rc.2 正式 artifact 运行验收为 `1 passed`。
- 实现提交 `13794bfe1403ada6ed2911420d715ffd037bb66f` 的 CI `33071659160` 在 Windows 揭示临时目录短路径与真实路径断言不一致；没有把该失败冒充完成。最小修复 `24fcc55bec9342d062db8df7577bcf9df4de8c3e` 已通过 CI `33132044870` 的 Windows/Ubuntu job。
- 用户在专用 Vault 使用已选笔记追问时发现标准 persona 曾把 DSML 工具调用标记作为普通文本返回。修复 `1810aa9779bb7d3439a1b73c7c1cfdbbf2f04b80` 在最终 prompt assembly 固定空 `tools` 和只读上下文指令；rc.2 正式 artifact 测试读回模型请求确认系统提示存在且无 `tools`，使用合成冻结笔记的本机真实模型复验直接返回笔记日期且无 DSML、`tool_calls` 或 `invoke` 标记。
- 精确修复 SHA 的远端 [CI run 33132970545](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33132970545) 已成功；Windows check `98726441325` 与 Ubuntu check `98726441475` 的原始 annotations 均为 `[]`。
- 专用 Vault 固定为 `D:\codex workspace\_test-vaults\obsidian-dsh-workbench-evidence`，未使用 `D:\codex workspace\_test-vaults\obsidian-trend-radar-evidence`。截图时部署资产与本地构建逐项一致：`main.js` 为 `3A6923A048172155AEB2ADD5B0A2BAB8466A0C1A87C2F6B097BFD7CFA117A0BA`，`manifest.json` 为 `81BDF8F237FA070C3F0DECCC9C09A21F4915196633072D892428E705060F25A6`，`styles.css` 为 `BFB3B7F32DA6E9D573D01125C4B555AB1C2DB089DECCC7769BF601148ED578E2`，当时的 `obsidian-bridge.mjs` 为 `CEF62EE2F2DB91FA6B8691892E9AC99796BB482BE73B1FB15277B065200A1840`。协议泄漏修复后的 bridge 为 `BE5B2F1C9803498FF540989254FE60331ABD92EAD7E9E94ADFECF1BE9E75F4C5`；为避免覆盖用户正在进行的会话，没有自动重载该窗口，最终统一 UI 验收前再部署。
- 专用 Vault 实际完成一个模型回复并显示完成终态；另一轮在已流式产生 `4,681` 字符后点击“停止”，收到真实 `cancelled` 终态并显示“已停止”。立即取消但未收到取消终态的路径显示 `runtime_terminated` 失败，没有冒充取消成功。插件重载后内存消息清空、受管进程为零；Light/Dark 与精确 `700px` 下无横向溢出，对话区 `box-shadow: none`。
- 原始验收笔记在运行前后未变化；检测到用户开始手工测试后，自动 UI 操作立即停止，只关闭本次自动测试创建的 modal/草稿并读回用户原有 `4` 条消息与 `1` 个已选上下文仍保留。

### 专用 Vault 截图与视觉复核

- [浅色空闲态](./docs/assets/design-qa/new-task-conversation/01b-light-idle-compact.png)：重复页头已移除，输入框缩短，对话区为无阴影浅底边框。
- [浅色真实完成态](./docs/assets/design-qa/new-task-conversation/03-light-completed-compact.png)：真实模型文本与完成终态进入同一对话容器。
- [浅色真实停止态](./docs/assets/design-qa/new-task-conversation/05-light-cancelled.png)：流式过程中停止后显示来自 bridge 的取消终态。
- [深色精确 700px](./docs/assets/design-qa/new-task-conversation/06c-dark-700px-compact.png)：紧凑导航、缩短输入区与对话容器均无横向溢出。
- 两张无效、未跟踪截图已删除：一张未包含目标审阅框，另一张误拍了用户手工会话；它们不作为证据。
- Ardot 文件、页面和画板保持用户审阅原状，AI 只读且未修改。

Batch 7 implementation and technical runtime: passed; final Obsidian UI user acceptance: pending

## Batch 8C：Vault 外任务控制器实施门

- 日期：`2026-08-28`；Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）与产品画板 `12:2`、`12:41`、`12:120`、`12:191`、`12:275`、`12:360`、QA `12:530` 保持只读，Ardot 未修改。
- 用户结果：任务模式通过 Obsidian 桌面原生目录选择器选择一个 Vault 外工作区；只有统一真实路径与隔离校验通过后才启用发送。发送前显示工作区名称和逐次确认边界，任务结束显示逐轮账本确认的文件数与文本增删摘要。
- 权限边界：任务进程使用所选工作区 cwd、`workspace-write + ask` 与六个文件工具；不开放 Shell、网络、Skill、子代理、Vault 写入、完全权限或跨会话永久授权。完整绝对路径不进入普通 UI。
- 失败边界：缺少工作区不启动进程；路径身份变化、账本建立/完成失败、启动失败、意外断开、取消超时与插件卸载均核对或明确报告失败，无法核对时不得显示任务完成。
- 完整本地门通过：`typecheck`、零警告 `lint`、完整 `npm test` 为 `112 passed / 1 skipped`；runtime jobs 为 `27 passed / 1 skipped`；真实 rc.2 bridge 为 `1 passed`；生产构建、仓库边界、CI 覆盖与 bridge artifact 自检均通过。
- 实现提交 `91b21345a52657520633475dfc9e86db7b720e65` 已通过远端 [CI run 33188573187](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33188573187)：Ubuntu check `98907874384` 与 Windows check `98907874519` 均成功，两个原始 annotations 数组均为 `[]`。
- 专用 Vault 任务运行和视觉验收进入 Batch 8D/10 完整 UI 门。
- Batch 8D 的默认三项/展开、原生右键菜单、真实 diff 与二次确认撤销未在本批伪造。

Batch 8C implementation and CI: passed; final Obsidian UI user acceptance: pending

## Batch 8D：逐轮文件审核与安全撤销实施门

- 日期：`2026-08-29` 至 `2026-08-30`；Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）与产品画板 `12:2`、`12:41`、`12:120`、`12:191`、`12:275`、`12:360`、QA `12:530` 保持只读。Ardot 未修改，只读核对。
- 用户结果：每个任务 turn 的真实文件卡默认展示三个相对路径并可展开/收起；文件行显示变更类型和文本增删，主点击打开账本修改前/后快照，右键使用 Obsidian 原生 `Menu`。
- 文件菜单：提供审核、系统默认应用、资源管理器、复制相对路径、用户明确请求后复制完整路径，以及复制当前 UTF-8 内容；每次操作重新校验规范工作区、路径包含关系、排除目录、普通文件和真实路径。已删除文件的当前内容操作保持禁用。
- 产品取舍：不加入 VS Code 专属入口、桌面“打开方式”克隆或“另存为”；前两者不是已验证的 Obsidian 原生依赖，后者会新增逐轮账本无法覆盖的写入面。
- 撤销边界：二次确认列出本 turn 全部文件；活动 turn 禁止撤销，账本完整性、工作区身份或任一当前 SHA 冲突时零写入并保持错误可见，成功后卡片显示“已撤销”且不能重复撤销。
- 视觉与可访问性：文件卡与触发行无方框阴影；展开同步 `aria-expanded`；撤销错误使用 `role="alert"`；“审核本轮”先渲染前 `50` 个文件，其余可逐项打开；单份预览超过 `2,000` 行或 `200,000` 字符只截断 UI，窄窗口前后快照改为单列。
- 本地质量门：`typecheck`、零警告 `lint`、完整 `npm test` 为 `119 passed / 2 skipped`；runtime 为 `27 passed / 1 skipped`；默认锁文件夹具重新执行 `npm ci` 后真实 rc.2 bridge 为 `1 passed`；生产构建、仓库边界、CI 覆盖和 artifact 自检均通过。初次安装发现一个已不再使用的本仓库 DSH 遗留进程；经用户确认后只终止该精确进程树，读回零残留并恢复默认夹具。
- 专用 `obsidian-dsh-workbench-evidence` Vault 的真实任务、菜单、审核、撤销、明暗主题、精确 `700px` 与零残留验收进入 Batch 10；不得使用 `obsidian-trend-radar-evidence`。最终 Obsidian UI 用户验收仍未通过。

- 实现提交：`759ec97d4c21748016eb8e6a462ed3c78f153edb`。
- 远端 CI：[run `33239392369`](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33239392369) 已完成且结论为 `success`；Ubuntu job `99065994296`、Windows job `99065994274` 均成功，两个 check-run 的原始 annotations 数组均为 `[]`。

Batch 8D implementation and remote CI gate: passed; final Obsidian UI user acceptance: pending

## Batch 9：正式会话与原生任务环境实施门

- 日期：`2026-08-29`；Ardot 文件 `718186366720195`、页面 `UI 真相 v2`（`12:1`）与产品画板 `12:2`、`12:41`、`12:120`、`12:191`、`12:275`、`12:360`、QA `12:530` 保持只读。Ardot 未修改，只读核对。
- 用户结果：首条消息经发送前审阅和真实校验后，同一个 Workbench leaf 从开启页切换为正式会话；开启标题与正式标题互斥，公开消息、权限、文件结果和一个紧凑 composer 保持连续。重复点击 ribbon/命令只复用 leaf，不重置会话。
- 会话边界：插件级控制器只保存当前生命周期内的 session 投影；关闭/重开 Workbench leaf 会恢复正式页，模式与规范工作区锁定，输入不一致时 fail closed。插件重载后投影清空，不显示“最近任务”或伪造跨重启恢复。
- 新建任务：正式页显式按钮先打开确认；仅在无活动 turn 时先处置受管运行时，再清空当前消息、权限、工具、逐轮结果和 session 投影。DSH 原生 session 与 Vault 外账本不删除。
- 任务环境：原“快速助手”沿用既有 view type/命令 ID 原位演进为默认关闭的右侧 `ItemView`，重复开启复用同一 right leaf；只显示 DSH 健康/连接、已选笔记、工作区名称、当前权限、已观察工具和最近变更。模型/预设具体标识因当前协议未公开，只显示由 DSH 管理。
- 隐私与能力真相：普通 UI 不显示完整绝对路径、DSH 私有推理、未经读回的 token/速度/缓存指标、假历史或“完全权限”；右侧栏不承载唯一权限确认、停止、审核或撤销。
- 可访问性与布局：正式消息流使用 `aria-live="polite"`，活动阶段同步 `aria-busy="true"`；composer 初始三行并允许垂直增长；`760px` 容器门继续折叠内部导航，正式页头在窄容器改为纵向。精确 `700px` 几何、明暗主题与真实运行截图进入 Batch 10。
- 自动验证：控制器覆盖投影冻结、同 session 续轮、模式/工作区锁定、活动 turn 拒绝重置和终态处置；Workbench 覆盖开启/正式互斥、关闭/重开恢复、显式返回开启页、环境按钮和绝对路径排除；任务环境覆盖公开事实更新、权限/工具/变更、关闭解除订阅；插件基线覆盖默认关闭和同一 right leaf 复用。
- 本地质量门通过：`typecheck`、零警告 `lint`、完整 `npm test` 为 `123 passed / 2 skipped`；runtime 为 `27 passed / 1 skipped`；默认锁文件夹具重新执行 `npm ci` 后真实 rc.2 bridge 为 `1 passed`；生产构建、仓库边界、CI 覆盖与 bridge artifact 自检均通过。
- 实现 `cf13ca7e87b51a927fadaaa092a2ca5af51587fd` 已通过远端 [CI run `33294157748`](https://github.com/LuoJiangYong/obsidian-dsh-workbench/actions/runs/33294157748)：Windows job `99210845045` 与 Ubuntu job `99210845119` 均为 `success`，两个 check-run 的原始 annotations 数组均为 `[]`。专用 Vault 运行与最终 Obsidian UI 用户验收仍属于 Batch 10。

Batch 9 implementation and remote CI gate: passed; final Obsidian UI user acceptance: pending
