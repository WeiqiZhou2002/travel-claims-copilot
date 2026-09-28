# 航司 DP 待审核批次（2026-09-27）

主文件：[candidates.json](candidates.json)。17 个新增事件：15 条证据门槛齐全、2 条暂缓；全部 needs_review。没有写入正式案例库。

Chrome 初始化失败，本批采用网页搜索与原帖文本读取。历史案例已标明年份；相对日期保留原文，未强行换算当地日期。论坛自述不等于独立核验。

金额和阶段以 JSON 为准；以下只给审阅索引，避免把多个补偿形式合成一个数值。

| ID | 案例 | 时间 | 状态 | 已知结果阶段 |
| --- | --- | --- | --- | --- |
| uscf-484406-dfw | AA 取消后重出票异常：7500 里程及食宿补偿 | 2026-01-24 | ready_for_review | reported |
| uscf-528095-alzuhod | AA 错失衔接：拒绝食宿，升级投诉后获小额补偿 | relative | ready_for_review | reported |
| uscf-496402-jerry66 | DL281 取消返家后，积分退款被拒 | 2026-03 | ready_for_review | not_reported |
| uscf-477236-gcjy | JL12 取消：拒绝降舱后在羽田完成改签 | 2026-01-24 | ready_for_review | reported |
| uscf-473103-mrmitchelldevis | VS 出 KLM 联程取消：多次改签后实际乘 BA 到 PIT | 2026-01-09 | ready_for_review | reported |
| uscf-493023-soulhom | AS 出 QR：先绕 ORD，后签转 TK | 2026-05 | ready_for_review | reported |
| uscf-493023-xiaodaobay | QR 取消 SFO 出发：改 SEA，选座收费另待确认 | 2026-06 | ready_for_review | not_reported |
| uscf-493023-minalinsky | QR 取消 SFO 出发：仅提供 DFW 出发选项 | 2026-06-05 | ready_for_review | not_reported |
| uscf-126649-frozenz0717-outbound | Porter 延误错失衔接：住宿与代金券 | 2022-05-28 | ready_for_review | reported |
| uscf-126649-frozenz0717-return | AC 返程取消：拒赔并给折扣码 | 2022-06-01 | ready_for_review | not_reported |
| uscf-469439-qaz158aaa | AA 机组问题延误：安排次日衔接及食宿 | relative | ready_for_review | reported |
| uscf-216182-fureddo | TK 夜间延误：签转 LH/CI，后续赔偿待核对 | relative | hold | pending |
| uscf-352934-xiaoerge | Finnair 取消 LAX–HEL：改经伦敦 | relative | ready_for_review | not_reported |
| uscf-407456-itworks | AA95 临时取消：官网换经伦敦行程 | 2025-06-28 | ready_for_review | not_reported |
| uscf-331713-7700 | EI3243 取消：酒店交通已安排，赔款仍未收到 | 2024 | hold | pending |
| uscf-467467-randomperson-ac | AC 取消：从三天后改签到次日 | relative | ready_for_review | reported |
| uscf-103731-anon17276958 | LH 让座改道：经日本抵美并提供现金卡 | relative | ready_for_review | reported |

## uscf-484406-dfw

1. 异常事件 R：见 JSON 的 `event`，PVG–DFW；改签经日本，日本机场未披露。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/484406)（主楼及 #2–14；重点 #1、3）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：只统计航司处置；CSP 保险不计入。未读取截图中的金额。原出票方不因 AA 处理改签而回填。

## uscf-528095-alzuhod

1. 异常事件 R：见 JSON 的 `event`，BUF–PHL–SEA；替代 PHL–ORD–SEA。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/528095)（主楼更新至 2026-09-01；#2–12）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：$25 的人数单位未明确；不默认每人。保险结果未纳入。

## uscf-496402-jerry66

1. 异常事件 R：见 JSON 的 `event`，受影响 SEA–PVG；前段出发城市未披露。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/496402)（#1–20；作者 #1、7、8、10、12、13、19）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：23 万是五人原票积分总量，不是赔偿额。柜台承诺与退款部门拒绝按先后保留；未获最终解决更新。

## uscf-477236-gcjy

1. 异常事件 R：见 JSON 的 `event`，受影响 HND–DFW；全程 CTS–HND–DFW。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/477236)（主楼三次更新；#2–20）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：未明确本人对应 AA 还是 AS，provider 留空。最终舱等与实际到达时间未明确。$991 为保险报销，排除。

## uscf-473103-mrmitchelldevis

1. 异常事件 R：见 JSON 的 `event`，受影响 AMS–LHR；原兑换行程 AMS–LHR–MIA。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/473103)（#1–20；重点 #1、14、15、19）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：#19 对同步问题有修正，未把作者早期系统猜测认定为故障原因。未飞 PIT–MIA 不转化为建议。

## uscf-493023-soulhom

1. 异常事件 R：见 JSON 的 `event`，受影响 DOH–SFO；全程 MLE–DOH–SFO。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/493023)（首页 #1–20；重点各报告者本人楼层）；[原帖 s2](https://www.uscardforum.com/t/topic/493023?page=2)（第二页 #21–40）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：#1 初发帖仅疑似取消，确认取消证据在第二页 #22、24；不据战争讨论填写原因。

## uscf-493023-xiaodaobay

1. 异常事件 R：见 JSON 的 `event`，SFO–DOH；另购 DOH–MLE，不合并为联程。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/493023)（首页 #1–20；重点各报告者本人楼层）；[原帖 s2](https://www.uscardforum.com/t/topic/493023?page=2)（第二页 #21–40）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：未见选座费减免结果与实际成行更新；同帖另两人各有独立 DP。

## uscf-493023-minalinsky

1. 异常事件 R：见 JSON 的 `event`，SFO–DOH–MLE。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/493023)（首页 #1–20；重点各报告者本人楼层）；[原帖 s2](https://www.uscardforum.com/t/topic/493023?page=2)（第二页 #21–40）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：后续仍讨论日期选择；未把 offered 写成已改签。；QR 不承担 SFO–DFW 的直接依据是第二页 #23。

## uscf-126649-frozenz0717-outbound

1. 异常事件 R：见 JSON 的 `event`，EWR–YTZ–YQB。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/126649)（#1–20；重点 #1、12、15）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：历史样本。币种未明确，不推定 USD 或 CAD；餐费金额作者记忆不确定，不填数值。

## uscf-126649-frozenz0717-return

1. 异常事件 R：见 JSON 的 `event`，YUL–EWR。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：未披露，不表示未行动。
4. 航司回应 R：初始 `not_reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/126649)（#1–20；重点 #1、12、15）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：历史样本。与同作者 5/28 事件日期、航司及航线不同，分为独立 DP；保险不计入。

## uscf-469439-qaz158aaa

1. 异常事件 R：见 JSON 的 `event`，已识别 LAX–DFW；后续目的地未披露。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：未披露，不表示未行动。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/469439)（#1–2）；[原帖 s2](https://www.uscardforum.com/t/topic/478003)（主楼总结及其原帖链接；提取主楼 AA 条目）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
需核对：前序原因：原帖 equipment change；关联总结 weather。当前航段 crew unavailable 一致；不据此判断可控性。
限制：第二来源明确链接本帖；没有把保险报销混为航司赔款。

## uscf-216182-fureddo

1. 异常事件 R：见 JSON 的 `event`，受影响 IST–TPE；原联程 MAD–IST–TPE。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `pending`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/216182)（#1–20；重点 #1、19、20）；[原帖 s2](https://www.uscardforum.com/t/topic/230221)（主楼及 #10 作者更新）

审核：R 内容齐全；`hold`；未独立核验；未发现与既有库精确重复。
需核对：原帖是 2023-12 现场记录；关联帖称 1 月往返，虽直接链接原帖，是否同一次完整行程尚未确认；关联赔偿先 hold。
限制：历史样本。600 EUR 未写 received；关联帖不明原因票款退回不计入本事件补偿。

## uscf-352934-xiaoerge

1. 异常事件 R：见 JSON 的 `event`，原 LAX–HEL；替代 LAX–LHR–HEL。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/352934)（#1–20；重点 #1、4、18；第4页访问失败）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：历史样本。搜索出现第4页赔款更新，但原页无法读取，未作为到账证据；后续需复核。未复制评论中的签证规则。

## uscf-407456-itworks

1. 异常事件 R：见 JSON 的 `event`，MAD–JFK。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `not_reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/407456)（#1–20；重点 #1、3、9、19）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：历史样本。原因只有评论者查询结果，cause 留空；评论中的 600 欧元不是已获得赔款。

## uscf-331713-7700

1. 异常事件 R：见 JSON 的 `event`，ABZ–DUB。
2. 原因 O：未披露。
3. 当事人做法 O：未披露，不表示未行动。
4. 航司回应 R：初始 `reported`，最终 `pending`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/331713?page=2)（第二页；重点 #29 年度回顾）

审核：R 内容齐全；`hold`；未独立核验；未发现与既有库精确重复。
限制：历史样本。EI 为报告的航司标识；未验证具体实际承运子公司。赔偿金额、申请过程未披露。；provider/carrier 均未确认，暂不导出；仅 airline_reported 可识别。

## uscf-467467-randomperson-ac

1. 异常事件 R：见 JSON 的 `event`，蒙特利尔–温哥华。
2. 原因 O：未披露。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/467467)（#1–20；仅提取 AC 事件，ZIPAIR 后续另案未纳入）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
限制：#7 周一表述与主楼三天后不完全吻合，保留相对时间，未计算具体日期。ZIPAIR 的 $500 与 AC 无关，未混入。

## uscf-103731-anon17276958

1. 异常事件 R：见 JSON 的 `event`，BKK–ORD；原中转点未披露，替代经 NRT。
2. 原因 O：有作者陈述，归因及证据见 cause。
3. 当事人做法 O：按顺序见 passenger_actions。
4. 航司回应 R：初始 `reported`，最终 `reported`；逐项金额与履行状态见 responses。

来源：[原帖 s1](https://www.uscardforum.com/t/topic/103731)（#1–20；重点主楼及 #7、20）

审核：R 内容齐全；`ready_for_review`；未独立核验；未发现与既有库精确重复。
需核对：作者主动让座，但称拿到 involuntary denied boarding 文件；仅按自述保留，不认定法定非自愿拒载。
限制：历史样本；boarding_context=voluntary。两种降舱补偿不相加；未见所选方式及到账证明。
