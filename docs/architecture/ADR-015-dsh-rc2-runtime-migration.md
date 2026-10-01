# ADR-015：DSH 0.2.0-rc.2 兼容迁移

- 状态：已实现，本地质量与真实运行门通过；精确提交 CI 待核实，隔离 Vault 与最终运行验收未完成，不声明 supported
- 日期：2026-10-01
- 基线：N1 `8cc2bc1c9af506b057943cc66e7adc32fb4ec807`；CI `36817240377` 的 Windows `110224867876`、Ubuntu `110224867986` 均 success，原始 annotations 均为 `[]`

## 唯一结果、范围与停止门

让既有任务工作流在精确 DSH `0.2.0-rc.2` 下保持真实流式回复、同身份恢复、取消与进程所有权，不复制运行时数据库。用户另行批准本机 DSH 更新及后续官方版本核实后更新/锁定；本机已经是目标版本，不重复安装。

允许修改 bridge 公开接缝、健康检查目标、构建清单、测试夹具锁文件、协议的窄流式投影与宿主消费者、测试、CI 和相关治理文档。不建设项目管理、统一权限、附件 UI、原生归档/删除 UI、模型配置镜像或其他运行时适配器；不改 Ardot、Vault、用户 profile/凭据、Node/Python、Release 或社区目录。

预计模块：`obsidian-bridge.ts`、`bridge-protocol.ts`、`new-task-conversation.ts`、`dsh-health.ts`、受管 overlay、两个当前运行夹具及必要的历史迁移测试夹具、build manifest、公开契约与真实 DSH 测试、CI workflow/coverage guard；README、兼容矩阵、相关 ADR 和验收文档伴随更新。插件自安装/更新仍禁用。

## 证据与最小方案

- Claudian 参考固定 `c269ac64e35673566b0c958d956c6d0367556c3e` 的 README 与 session organizer：身份与宿主生命周期可参考，不 fork、不采用私有历史或第二执行器。
- 官方 release `dsh-v0.2.0-rc.2` / commit `639ed015397290b3745d163aafe02ffee4aa3f84` 与 npm `latest/next` 一致。CLI integrity 为 `sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==`。
- 原生复用：sessionQuery listSessions/readSession/readTitle、sessionTitle rename/flush、WorkspaceRegistry、AgentRegistry create/resume/setup/owned disposer、Agent cancel/followup、scoped tools restrict/guard、模型原生配置、公开 `agent/assistant-stream`。未批准能力不因上游存在而自动进入产品。
- 真实启动基线发现 rc.2 session controller 新增 fileUploads 必需依赖；其 Connection 激活会通过 credentials 创建浏览器签名密钥。因此生产不挂载 controller/file-upload/Connection，不为读取会话新增凭据或 HTTP 监听。改用 controller 本身委托的公开 sessionQuery 和 sessionTitle；控制面候选测试仅在临时 DSH_HOME 挂载完整原生服务，生产 overlay 单独断言不包含这些服务。
- 模型传输已改为原生 Messages API，不能继续用旧 OpenAI SSE 夹具冒充成功。真实 rc.2 环回请求按 Messages 帧完成文本、文件工具、拒绝越界和取消；模型/提供方由 DSH 管理，不复制配置、不切回旧协议。
- 已核实漂移：alpha.3 的 durable `assistant/chunk` 不再是新版本直播源；新公开 start/chunk/end 帧按 attempt/revision/index 排序，revision 随每帧递增而非固定于一次 attempt，不伪造 durable sourceSeq。插件只增加窄投影与失败拒绝；新的 `assistant.reset` 只撤回本轮临时回复，不是持久消息或假成功，用于原生 attempt 替换。
- 恢复优先使用公开 `agents.resume` 的 unpublished setup，在发布/执行之前安装模式、模型、cwd 工具边界并持有 disposer；不先恢复后补权限，不清空原生 inbox。若公开 inbox 仍有待处理输入，拒绝自动执行，保留记录和原因。
- 官方 JSONL 层具有 v0→v4 迁移链，不能根据底层 assertVersion 推断旧会话都不可恢复。迁移由 DSH 自己承担；插件不解析私有文件、不改写旧日志。源码 writer 为 v4，但该 tag 的发布状态文档仍记录 v3，以精确 tag 源码和实测为准，登记上游文档漂移。
- Obsidian 沿用 ItemView/leaf、现有主题与 Vault 外数据边界，未引入新宿主 API；最小供应商边界仍为 bridge，未建设多运行时框架。

保持旧版本不满足本机新版本的真实流式契约；只改版本会漏掉流式与恢复权限漂移。局部公开适配比新框架回滚范围更小。

## 输入、处理、状态、输出与失败

输入是用户已配置 DSH、精确 session 引用与公开直播帧。读取不发模型请求；恢复重复核对 cwd/ordinary/non-running 身份，并在 unpublished setup 再校验真实 Agent 身份和待处理 inbox。直播只投影文本，推理与工具参数不进入 UI；缺口、重复、跨 attempt 或身份漂移 fail closed，不吞错继续。

公开消息与终态仍由 durable session/event 决定，临时直播不冒充完成。取消仍要求原生 user-abort 终态；关闭/卸载处置自己持有的 handle 和进程。任务/项目 schema 不迁移，DSH 会话数据继续由 DSH 所有。

## 验证与回滚

先跑 bridge/协议/会话相关测试，再 `typecheck`、`lint`、`test`、`build`、`verify`、`test:runtime`、`test:runtime:candidate`、`test:bridge:runtime`；CI 必须实际执行 rc.2 真实进程、冷读取/恢复、文本直播、取消、Workspace 和历史迁移证据，原始 annotations 必须为 `[]`。

`2026-10-01` 本地读回：完整 `npm test` 为 189 passed / 2 平台 skipped；`test:runtime` 为 48 passed / 1 平台 skipped；公开候选/Workspace/历史迁移为 6 passed；正式 bridge 为 3 passed。`typecheck`、`lint`、生产构建及完整 `verify` 均通过。新增原生版本用例由产品健康检查实际执行裸 `dsh` 与绝对 shim，不以假运行时替代。跨 attempt 的 revision 缺口先由失败测试复现后修正，单调计数也覆盖 attempt 间隔。

构建读回：bridge `0.4.0` / protocol `1`，24,639 bytes，SHA-256 `68b7b49d9fa4300f3115164f2c1e00e228ff04f6bbe8b949f55c96f020d389b9`。公共影响已检查：桥事件注册、解析与宿主消费者同步；任务/项目 schema、Obsidian leaf 注册、用户设置与根依赖均无需修改。Windows/Ubuntu workflow 安装当前与 legacy 精确夹具并实际执行新测试；Release job 与隔离 Vault 写入没有扩权。

失败测试临时目录 `real-dsh-bridge-xKvBLi` 的删除被执行环境策略拒绝，已明确保留于系统 Temp；无进程引用该目录，不含用户凭据，不在仓库/Vault，也不进入构建或提交。其余当前成功用例完成各自受管进程与临时数据清理。

不新增根插件运行依赖；DSH 为 MIT，仅存在测试夹具和用户独立安装，独立精确 lockfile、npm integrity 和全部 278 个直接 DSH 包全图校验。新增 legacy 夹具精确保留 alpha.3 的 215 个 DSH 包，仅用于真实旧 Agent 生成历史会话再交由 rc.2 原生迁移，证明原 ID/标题、旧字节保留、零自动模型请求和无凭据创建；不作生产 fallback，也不打入 artifact/Release。

依赖风险读回：rc.2 测试夹具 npm audit 为 8 moderate、0 high/critical，根因是 LibreOffice 链的 fflate ZIP64 DoS（GHSA-px8p-9vwx-vf98），其余为传递告警；Office/ZIP 转换没有在生产 headless overlay 挂载，任务工具只暴露六个文件工具，插件 artifact 没有打包 DSH。历史 alpha.3 夹具安装提示 2 moderate/2 high，仅是隔离历史 producer，不新增用户运行路径。不执行 npm audit fix/override，不宣称上游无漏洞；启用 Office 能力或变更上游依赖图需另行风险决策。安装体积仅作用于开发/CI，不增加插件资产；单份 rc.2 锁文件包含 608 个非根包节点（含可选平台包），不用另一份消息数据库替代历史夹具。

优先一个可回滚实现提交，必要时最多两个实质提交，测试/文档/CI 随实现。源码回滚不删除索引、账本或原生 session；DSH 的新格式不能假设可被旧运行时降级读取，旧 generation 保留由原生机制负责，不自动降级本机或改写数据。失败停在当前门，不通过放宽边界推进。

本地/CI 门之后展示专用隔离 Vault 精确身份、版本和资产 diff，再单独请求部署批准；在此之前不写任何 Vault，不宣称新组合完整 supported，不进入 P1 或发布。
