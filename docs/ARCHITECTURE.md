# 架构

## 用户处理链路

自然语言 → LLM 结构化抽取 → ClaimFacts schema 校验 → 缺失字段追问 / 人工修正 → 确定性政策与案例检索 → 条件判断 → 建议、证据清单和模板。

- `lib/intake.ts`：将此前事实和最新消息一起交给模型，不再执行正则抽取或字段优先级覆盖。失败抛出有类别的错误；`/api/intake` 与自由文本 `/api/analyze` 都返回可重试错误。
- `lib/claimFacts.ts`：运行时类型检查与结构化字段规范化。航司名仅做完整别名 / 代码匹配，不对整句话查关键词。地域规范化与业务条件校验仍是确定性的。
- `lib/retrieval.ts`：按事实、出票方、承运人、地域、事件和来源类型匹配；生产案例来自 `lib/case-library.ts` 的静态发布数据。
- `lib/policyScope.ts`、`lib/remedies.ts`：计算条件是否齐全、哪些请求不适用；不把资料存在当成赔付保证。
- `lib/generator.ts`、`lib/handlingPlaybook.ts`：当前仍使用模板和规则生成建议及话术。
- `app/hooks/use-claim-conversation.ts`：对话、取消、版本检查、失败恢复和可选本地草稿；`app/components/` 分开事实、依据、案例、建议及话术展示。

旧 `lib/classifier.ts` 保留供离线历史检索回归测试使用，公共入口不再以它抽取自然语言事实。范围保护仍可以在模型前阻止明显高风险请求，不属于事实抽取 fallback。

## 已报告原因与确定性补偿排除

`passenger_side` 表示报告的旅客证件、值机/登机迟到、行为或旅客相关健康/安全问题；`other_reported` 表示已有具体原因但不在其他分类中，如空管、罢工、机场安检。两者均归一化为 `reported`，模型输出通过 schema 后，应用不再追问缺失原因。

可控性保留现有三值：`passenger_side → uncontrollable` 指从航司角度不可控，不新增与原因分类重复的 passenger 维度；`other_reported → unknown`，不推断控制主体或法律免责。原因关键词仅用于社区案例检索，不能覆盖 LLM 事实；`other_reported` 不参与原因匹配加分或相反原因排除。

在既有 `evaluateRemedyConditions` 中，旅客原因拒载对 DOT、EU、UK、加拿大均生成 `denied_boarding_kind: not_met`。这是补偿条件的排除，不是删除整个政策来源或否定一切权利。`assessRemedies` 将固定补偿标为不支持，检索过滤要求 involuntary 的话术，生成器换用证件/时间线/票规证据清单，并提示票规内改签或退款的选择。

法律边界的依据包括 [14 CFR 250.6(a)](https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-250/section-250.6)、[EU261 第 2(j) 条](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32004R0261)、[英国发布的第 2(j) 条文本](https://www.legislation.gov.uk/eur/2004/261/pdfs/eur_20040261_adopted_en.pdf) 和 [加拿大 CTA 对拒载与拒绝运输的区分](https://otc-cta.gc.ca/eng/publication/denied-boarding-a-guide)。这里只记录本次排除条件的依据，不改写既有政策数据或更新其 last_checked。

不能仅因航司声称证件不符就断言旅客有错：错误的证件判断可能属于法规保护范围，参见 [欧委会说明](https://ireland.representation.ec.europa.eu/live-work-study-eu/air-passenger-rights-frequently-asked-questions_en)。提示词将有争议的证件判断、航司值机系统故障与旅客原因分开；具体争议仍需核实。此次没有新增争议裁决模型。

## 审核与发布隔离

采集候选 → 本地审核服务 → 本地事务存储 → 显式导出经审核发布快照 → Git 提交 / 部署 → 线上静态案例检索。

审核与线上可用性完全分开。本地文件丢失或损坏不会影响已构建的线上分析。发布快照整份替换，撤回案例在下一次发布中移除；发布不是实时同步。

`ReviewRepository` 保留未来数据库事务的边界。审核身份来自服务端，采集入口只能新增待审候选。每次修改校验 expectedVersion，历史、当前草稿和审核快照一起提交。本机锁记录进程身份，只有确认原进程已退出才回收；不会仅按时间抢占活跃进程。

完整 DP 在审核存储中；公开 Case 只携带用于检索与展示的字段。ID 不再使用论坛用户名，但来源链接仍可追溯作者；不承诺完全匿名。

## 远程演进

未来远程采集 agent 使用单独机器凭证提交候选，人工审核使用服务端会话授权，Postgres 同一事务提交版本、审计和发布快照。数据库适配应进一步加入按 ID 查询和分页，不将当前全量文件读取原样搬到大数据量场景。

语义检索可替换 retrieval 的召回实现，不能绕过来源分类、审核状态和条件判断。若异步写入 embedding，应以 DP ID + 审核版本去重，撤回时同步屏蔽旧索引。

## 政策与信件的下一步

当前仅有政策级摘要和链接。下一阶段需要人工核验条款片段、定位、适用日期及版本；再让模型基于事实和这些片段生成逐项带引用的投诉信。未核验条款不得称为已审定，善意请求与法定权利必须区分。

界面按 90 天编辑复核周期提醒需要复核的政策；这不是法律失效日期，不代表已验证内容仍有效。真实条款复核、航司承诺拆分、法域时效数据仍需单独完成。
