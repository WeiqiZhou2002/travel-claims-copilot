# 航司 DP 记录契约 v0.3

这是 skill 的输出约定，尚未接入产品运行时 schema。输出 JSON 使用下列字段，不把未收集的数据伪装为实测案例。

## R/O

R 表示评为完整 DP 时必须有原文支持；采集中可以暂缺，但状态为 needs_more_evidence。O 表示可选，缺失不阻止完成。缺失记 null 或 unknown；不使用“无”表示未提及。

| 部分 | 要求 | 完整条件 |
| --- | --- | --- |
| event | R | 非空事件描述、时间表述、航司、起终点或可识别航线，且有来源支持 |
| cause | O | 原文报告了原因才填，保留陈述者；无法核实不提升为确定事实 |
| passenger_actions | O | 有明确行为才记录；未提及用 null，明确没有行动可记空数组并附相应证据 |
| airline_handling | R | 至少一项作者报告的实际航司回应或处置，清楚表明目前知道哪些阶段 |

时间可以精确到日、月、年，或有可解析上下文的相对时间，但必须保留精度与原文。不能以采集时间/发帖时间替代事件时间。航班号、精确分钟、实际承运角色、舱等、会员等为扩展信息，不增加 R 门槛。

airline_handling 设 initial/intermediate/final 三个阶段。原帖只有初始方案就保留该方案并将 final 记 not_reported；只有最终处置就明确 initial 缺失，不反推初始方案。完整表示 R 证据齐全，不要求未公开阶段凭空齐全。

## 数据对象

每条候选包含：

- `schema_version`: "0.3"
- `dp_id`: 批次内唯一、后续更新稳定的标识。
- `event`: `{description, occurred_at, provider, carrier, airline_reported, route, issue_type, evidence_ids}`。`occurred_at` 为 `{text, normalized, precision}`，normalized 无法可靠确定则 null；precision 为 day/month/year/relative/unknown。provider 是原出票/办理方，carrier 是受影响航段实际承运人，二者均为规范名称字符串或 null；airline_reported 保留原文名称。至少一方可识别，另一方未知明确标记，不相互回填。`route` 保留起终点及原文，不能凭航司国籍推断地区。issue_type 为 airline_delay/airline_cancellation/denied_boarding/unknown。

例：AS 出 AA 票 → provider=Alaska Airlines，carrier=American Airlines；ANA 出国航航段 → provider=ANA，carrier=Air China。改签到另一家航空公司后，不修改原 carrier；后续航司写入 responses。OTA/门户与 validating carrier 同时出现时，provider 记录原办理服务方，额外的票证所属航司另保留说明，不能混成一个名字。酒店不在本 skill 范围。
- `cause`: null 或 `{description, attributed_to, evidence_ids}`；attributed_to 为 airline/passenger/other/unknown。
- `passenger_actions`: null 或 `{action_id, order, time_text, description, channel, evidence_ids}` 数组。渠道未知记 null。
- `airline_handling`: `{initial_status, final_status, responses}`。
- `sources`: `{source_id, url, forum, post_locator, posted_at, observed_at, reading_scope}` 数组。只能填真实访问过的 URL；用户粘贴内容时 url 可 null、reading_scope 标记 supplied_text，来源未访问状态写进 review。
- `evidence`: `{evidence_id, source_id, locator, excerpt, supports}` 数组；supports 为所支持的字段路径。短摘录遵守来源的引用限制；不能取得可引用原文时保留明确定位与自述摘要并注明。
- `review`: `{record_status, workflow_status, review_status, missing_required, missing_optional, conflicts, duplicate_of, rationale}`。

`responses` 每项为：

- `response_id`、`order`、`time_text`、`phase`（initial/intermediate/final/unknown）。
- `description`：航司说了或做了什么，明确拒绝也是有效回应。
- `after_action_id`：原文明确能与某次当事人行为关联时引用对应 ID，否则 null；只表示顺序关联，不自动证明该行为导致方案改变。
- `measures`：可为空；每项包含 `kind`（rebooking/refund/expense_reimbursement/cash_compensation/voucher/miles/points/care/other）、`description`、`amount`、`currency_or_program`、`unit`、`fulfillment`、`evidence_ids`。
- `fulfillment`：offered/promised/accepted/received/rejected/withdrawn/unknown。原文同时涉及多个阶段时分条保留；收到是作者自述，不是独立交易验证。
- `evidence_ids`：支持这次回应的证据。

initial_status 为 reported/not_reported/unknown；final_status 为 reported/pending/not_reported/unknown。只有作者明确仍在等候才用 pending；看不到后续用 not_reported，不猜测仍在处理中。final 的 reported 不代表所有承诺已经履行；履行情况逐个项目记录。

`review.record_status` 为 complete/incomplete，依据 R 项；`workflow_status` 为 ready_for_review/needs_more_evidence/hold/excluded；`review_status` 固定 needs_review。记录完整但来源未访问或存在关键冲突时仍应 hold，不能进入 ready_for_review。

完整候选必须能把 event 的描述、时间、航司、航线和至少一次航司回应定位到 evidence；引用必须能在 sources 中解析。O 项存在时也必须有证据。补充未知值不算证据补齐。

## 输出阅读顺序

每条 review.md 使用以下四段，之后另列来源及审核信息：

1. 异常事件：时间、航司、航线、发生了什么。
2. 事件原因：原文怎么说、谁说的；未提及则明确写未提及。
3. 当事人做法：按顺序写已报告行为；未提及则明确写未提及。
4. 航司回应：初始方案、后续变更、最终方案及实际履行，未知阶段明确标注。

审核信息区分“内容 R 项齐全”“结果阶段”“待审核”；避免单个 complete 同时表示三者。

## 行为验收用例

以下均为流程测试情形，不得写进真实案例库：

| 情形 | 预期 |
| --- | --- |
| 事件时间、航司、航线和初始改签方案齐全，没写原因和乘客做法 | complete；O 项未知；final not_reported；可待审核 |
| 作者报告投诉后收到代金券，但没写初始方案 | initial not_reported；记录投诉与收到的阶段；不补造初始方案 |
| 只有事件和乘客求助，无航司回应 | incomplete，缺 airline_handling |
| 网友建议索要酒店，作者没说自己照做 | 不计入 passenger_actions 或航司方案 |
| 航司承诺退款，作者随后说尚未到账 | promised；不能写 received |
| 航司明确拒绝，其他 R 项齐全 | complete 的拒绝案例，可待审核 |
| 发帖日期已知，但事件日期无描述 | incomplete，不能直接借用发帖日期 |
| 同帖两人乘坐同一航班，处置不同 | 分为两个 DP，不混合方案 |
| 后续只说已解决，没有细节 | 记录作者报告已解决；不补金额、方式或到账状态 |
