# R1 DSH 0.1.2-alpha.2 正式控制面候选证据

- 证据日期：2026-09-01
- 批次状态：已实现并验证；只形成候选能力结论，未切换生产版本
- 唯一结果：独立验证 DSH 公开控制面能否支撑后续 session 列举/恢复、标题、附件、权限和运行投影，并给出生产版本建议
- 生产基线：`@deepseek-ai/dsh 0.1.1-rc.2`，保持不变
- 候选目标：`@deepseek-ai/dsh 0.1.2-alpha.2`
- 停止边界：不修改生产 bridge/运行夹具，不安装到用户环境，不进入 R2

## 1. 候选身份与供应链边界

| 项目 | 精确值 |
| --- | --- |
| npm 包 | `@deepseek-ai/dsh@0.1.2-alpha.2` |
| npm integrity | `sha512-4TvTC5kRKlgtSU2UTBv+cID9a2Z+6+m6mpvjXWJfVzuTkflCff6s4MsQpFJTCmwFh/k7zNWe7qFXcLYMV/5VvA==` |
| GitHub tag | `dsh-v0.1.2-alpha.2` |
| tag commit | `0a53fb55bea101816fa226bb964ae2bed71c343b` |
| 许可证 | MIT |
| 上游 Node 范围 | `^22.19.0 || >=24.0.0` |
| 本仓候选夹具 Node 范围 | `>=24 <26` |
| session controller | `@deepseek-ai/dsh-api-session-controller@0.1.2-alpha.2` |
| session controller integrity | `sha512-X2YSKLSlD8ncitlzSdqzeBV92V4Sa7wEkOB65u32Xy04rovR+vKlqm4TpSGjHUT7Q0U8vOQ6eVlrMmOuJ+nkbw==` |

上游 alpha 包之间使用 `^0.1.2-alpha.2`。若在 `2026-09-01` 直接重新解析依赖，npm 会把 209 个 DSH 内部包提升到 `alpha.3`，使结果不再代表纯 alpha.2。候选 lockfile 因此按 `2026-08-31T00:00:00.000Z` 的 registry 时间截面生成，并由契约测试要求所有 215 个顶层 `@deepseek-ai/dsh*` 包都精确为 `0.1.2-alpha.2`；CI 只执行该已提交 lockfile 的 `npm ci`。

`2026-09-01` 重新查询时，npm `latest` 与 `next` 仍为 `0.1.1-rc.2`，`alpha` 已推进到 `0.1.2-alpha.3`。R1 的批准目标仍是 alpha.2；alpha.3 未经本批验证，也不因 dist-tag 前移自动进入范围。

## 2. 官方公开源码证据

以下 SHA-256 来自上述 tag commit 的原文件，用于防止把后续源码误当作 alpha.2：

| 文件 | SHA-256 | 用途 |
| --- | --- | --- |
| `packages/api/session-controller/src/index.ts` | `46796ebe25f19a4662317dad2ca810951c659010c77e7c1f3a37aa069fc7754d` | controller 注册与公开入口 |
| `packages/api/session-controller/src/types.ts` | `7643a2fc1860ba8e86c8e625934a750ef9b0d0604c1897a147d61f7cdbf97ebb` | list/inspect/follow/control/attachment 类型 |
| `packages/api/session-controller/src/client/contract/sessions.ts` | `aa67caae0cef2fdd6d88723e1a2dfabfbc3a1be2a2df4fdee1515319cee5f69d` | client session 契约 |
| `packages/api/session-controller/README.md` | `ff4f1c37572e7ca7cbad2a934d72d86ebd8a1dcf6ac83ba0a4a25fc99814f823` | 公开控制面与进程边界 |
| `packages/interaction/user-approval/README.md` | `1562cc906aee1155d82beecd1e9798219643c057e4201babd42674a456aa6b4c` | 一次性权限请求 |
| `packages/attachment/README.md` | `a9c9fc5889e2858185f0295502470d01513f63cf8f1a457a678a2fb14daff461` | 附件归属与规范化 |
| `packages/session/session-persistence/README.md` | `ba2be33475130326496d24a87da458fa781304f2ccf5a72f58e77a82c2d80583` | session 持久化与恢复限制 |
| `packages/bundle/web-app/cordis.patch.yml` | `80da0e94922cc5097aaadd8b0116f6e42eb852be69fcb4f9ec59b0d7247b175d` | 官方装配参考 |

## 3. 能力矩阵

| 后续需求 | alpha.2 公开机制 | R1 证据 | 结论与边界 |
| --- | --- | --- | --- |
| session 列举 | `sessionController.list()` | 第二个全新进程在未激活 Agent 前列出首进程持久化的 session | 通过；DSH 保持 session 事实权威 |
| 跨进程恢复 | `sessionController.create({ sessionId })` + `inspect()` | 第二进程以同一显式 ID 重新建立 Agent，并读回原历史 | 通过；这是公开 adopt/resume，不解析私有文件 |
| 标题 | session title 事件、list/inspect/control 投影 | 首进程命名、第二进程重命名，两条事件和最新投影均可读回 | 通过 |
| 历史 | `inspect()` 与 `follow()` | balanced turn、用户消息、权限结果在 snapshot 中读回 | 通过；完整历史仍归 DSH |
| 附件 | `attachment.save/read()` | PNG 保存后由 DSH 规范化为 WebP，第二进程按引用读回字节一致 | 通过；插件不能假设原始媒体格式或建立第二套附件库 |
| 权限 | `approval/request` 与 approval 事件 | 自有 listener 只对本次请求返回 `allowed-once`，历史保留 asked/decided/policy | 一次性结果通过；不证明永久授权、跨会话记忆或默认策略已决定 |
| 运行投影 | `control()` baseline/projection | session、标题和权限投影可读 | 只读投影通过；jobs/queue 的 control baseline 是进程内事实，不能在 Host 重启后重建 |
| 当前 bridge 兼容 | alpha.2 artifact 加载现有 `obsidian-bridge.mjs` | 完成协议握手、session 创建/关闭、正常 shutdown 与零 PID 残留 | 仅兼容证据；bridge manifest/握手仍声明 rc.2，不能冒充生产切换 |
| session 关闭/删除 | 无公开持久 session delete/retention API | bridge 可释放自有 Agent，两个候选进程均正常退出且 PID 消失 | “关闭”只指受管 Agent/进程结束；不宣称删除原生 session |

官方持久化说明还明确：当前没有 session 删除/retention API，list 没有分页和过滤；崩溃可修复中断 turn，但 control 中的运行 job 不能跨 Host 进程恢复。这些限制必须进入 R2 的产品设计，不能用插件私有解析或宽松 fallback 掩盖。

## 4. Claudian 只读对照

- 对照 commit：`e66f41c2674f03664788996851490512b3875744`（2026-08-31 公开 HEAD）。
- 可复用宿主思路：将产品导航/会话引用仓库与 provider 执行生命周期分离；用 generation fence 防止旧执行句柄在重启后写回新状态。
- 明确不采用：Claudian 的多 provider registry、provider 私有历史解析和第二套 conversation 数据库。DSH 已提供公开 session/controller/persistence 时，插件只保存后续导航所需的 Vault 外最小引用与投影。
- 最小可替换接缝：未来只在插件侧消费公开的 list/adopt/inspect/follow/control/attachment/approval 语义；DSH 仍是唯一生产运行时。本批不建立多运行时框架，也不实现 PI/Codex adapter。

## 5. 可复现验证与安全

失败基线是在实现前确认候选 fixture 与 `test:runtime:candidate` 均不存在，运行 npm script 返回 `Missing script`。最小实现新增独立 fixture、公开控制面探针和一个双平台 CI 入口；生产 `tests/runtime-fixture` 继续精确锁定 rc.2。

```powershell
npm ci --prefix tests/runtime-candidate-fixture
npm run build
npm run test:runtime:candidate
```

本地结果为 `1` 个 test file、`4` 个测试全部通过：精确供应链身份、真实 shim 版本、现有 bridge artifact 握手/生命周期、两个真实 DSH 进程的控制面恢复。GitHub Actions 在 Ubuntu 与 Windows 都先按 lockfile 安装候选夹具，再执行同一 `npm run test:runtime:candidate`；该测试不读取用户凭据，也不请求模型或网络服务。

所有运行使用临时 `DSH_HOME` 和临时工作区，子进程设置 `windowsHide: true`，输出不保存凭据或本机绝对路径；没有写入真实或隔离 Vault，没有修改 Ardot，没有安装或更新用户 DSH。测试结束读回 session artifact，并要求受管 PID 消失。

## 6. 版本建议与停止结论

建议继续保留生产 `0.1.1-rc.2`，不把 alpha.2 晋级为 `supported`。理由不是控制面能力失败，而是：

1. alpha.2 所需公开能力已经技术验证通过，但 npm `alpha` 已推进到 alpha.3；现在切换到已被前移的候选没有版本治理价值。
2. 当前生产 bridge 的握手清单、运行夹具、专用 Vault 与用户验收全部仍以 rc.2 为权威，R1 没有获准改动这些消费者。
3. alpha.2 没有公开持久 session 删除/retention，control 运行 job 不能跨 Host 进程恢复；后续产品仍需显式处理边界。

若后续批准生产版本迁移，应以批准当日的精确候选重新开始：核验 tag/commit/integrity/license、锁定全部 DSH 内部包、重跑本文件的控制面矩阵和现有 rc.2 全量回归，再同步修改生产夹具、bridge manifest/握手、兼容矩阵与隔离 Vault 验收。该迁移不是 R1 的一部分；R2 也仍需新的明确批准。
