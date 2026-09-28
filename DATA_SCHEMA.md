# 数据结构设计

## ClaimFacts

用户自然语言经过多轮 intake 后形成的结构化事实。事件、法律适用和操作阶段必须分开：

- `issueType`: `hotel_walk | airline_delay | airline_cancellation | denied_boarding | unknown`
- `providerType`: `hotel | airline | unknown`
- `provider`: string | null

此处 ClaimFacts.provider 暂保留旧 intake 的服务商识别字段，不作为出票方匹配依据。航司案例检索通过适配读取 `bookingProvider ?? validatingCarrier` 为出票方、`operatingCarrier` 为 carrier；未知 carrier 不再从 provider 回填。页面分别展示出票方和实际承运方。
- `origin`, `destination`: city / airport / country / region
- `disruptionType`, `disruptionReason`, `disruptionReasonStatus`
- `arrivalDelayMinutes`, `isOvernight`, `deniedBoardingKind`
- `bookingChannel`: `direct | ota | portal | travel_agent | corporate_travel | unknown`
- `bookingProvider`: string | null
- `journeyStage`: `pre_trip | at_airport | en_route | completed | unknown`
- `disruptionTiming`: `planned_schedule_change | close_in_irrops | unknown`
- `ticketType`: `cash | award | unknown`
- `validatingCarrier`, `marketingCarrier`, `operatingCarrier`, `disruptingCarrier`
- `awardProgram`: string | null
- `autoRebooked`: boolean | null
- `acceptedAlternative`: boolean | null，用户明确接受或使用替代航班、credit 或 voucher；自动改签不等于接受。
- `riskContext`: optional string[]，保留已触发范围限制的输入片段供后续检查；不是可信身份或服务器会话。
- `autoRebookedItinerary`: string | null
- `recoveryPriorities`: (`earliest_arrival | same_date | nonstop | same_airport | same_cabin | preserve_trip_length`)[]
- `preferredAlternatives`: string[]
- `hasConnectionsOrReturnSegments`: boolean | null
- `loyaltyStatus`, `expenses`, `evidence`, `userGoal`, `confidence`

`journeyStage` 表示用户当前处于行程前、机场、途中还是已经结束；`disruptionTiming`
表示应采用提前航变还是临近出发 IRROPS 的处理流程。它们都不是 incident type。

## HandlingPlaybook

由服务器根据 `ClaimFacts` 确定性生成的操作建议，不由 LLM 自由生成：

- `status`: `actionable | needs_context`
- `situation`: `hotel_walk | planned_schedule_change | close_in_irrops | completed_disruption | unknown`
- `contactFirst`: role / name / reason
- `askLadder`: string[]
- `ticketingChecks`: string[]
- `fallback`: string[]
- `uncertainties`: string[]
- `sources`: sourceType / title / url
- `notGuaranteed`: true

`sources.sourceType` 必须区分 `industry_guidance`、`community_guide` 和
`official_policy_required`。操作指南不能替代法规或航司当前官方政策，也不能承诺改签、
报销或补偿。

## Policy

官方政策、法规、航司/酒店公开承诺。

字段：

- policy_id: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota" | "government"
- provider: string
- policy_name: string
- legal_regime: "provider_policy" | "EU261" | "UK261" | "US_DOT_REFUND" | "US_DOT_DENIED_BOARDING" | "US_AIRLINE_COMMITMENT" | "CA_APPR" | "AU_ACL" | "CN_FLIGHT_REGULATION"
- applicability_rule: "any_route" | "listed_provider" | "origin_region" | "origin_or_destination_region" | "eu261_route" | "uk261_route" | "australia_consumer_law" | "china_flight_regulation"
- incident_types: ("hotel_walk" | "airline_delay" | "airline_cancellation" | "denied_boarding")[]
- applicable_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global")[]
- applicable_providers: string[]
- required_controllability: "controllable" | "uncontrollable" | "unknown" | "any"
- source_url: string
- source_type: "official_policy" | "government_regulation" | "regulator_guidance" | "official_dashboard" | "terms"
- authority_level: "high" | "medium" | "low"
- applicable_conditions: string[]
- compensation_or_rights: string[]
- summary: string
- last_checked: string

`applicable_regions` records geography, while `legal_regime` identifies the legal or policy
framework. `applicability_rule` is evaluated deterministically against route direction and,
where required, the operating carrier. It must not be inferred solely from the incident type.

## Case

社区案例、用户 DP、历史反馈案例。

字段：

- case_id: string
- source_type: "community_dp" | "user_submitted" | "synthetic_example"
- source_name: string
- source_url: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota"
- provider: string | null；航司案例为原出票/订票服务方，酒店案例仍为酒店集团。
- carrier: string | null；受影响航段的实际承运方；非航司案例为 null。
- legacy_provider?: string；迁移前标签，仅供追溯，不参与角色匹配。
- role_notes?: string[]；角色来源及未知说明。
- brand_or_airline: string
- issue_type: string
- location_country: string
- booking_channel: "direct" | "ota" | "portal" | "travel_agent" | "corporate_travel" | "unknown"
- loyalty_status: string
- reservation_type: "paid" | "points" | "award" | "unknown"
- facts: string
- requested_compensation: string[]
- actual_outcome: string
- evidence_used: string[]
- escalation_path: string[]
- reusable_lesson: string
- confidence: "high" | "medium" | "low"
- notes: string
- review_status: "approved" | "needs_review" | "excluded"
- review_notes: string[]

`review_status` controls product retrieval. Only `approved` cases may appear as similar cases. Records marked `needs_review` or `excluded` remain in the consolidated file for provenance and future cleanup, but must not be presented to users.

`synthetic_example` is excluded from similar-case retrieval even when approved. An empty result is valid.

`issue_type` describes the incident itself. Legal regimes such as EU261 must not be stored as a case issue type.

provider 与 carrier 独立匹配；同一组合匹配优先。旧记录不能因为 booking_channel=direct 就认定出票与承运为同一航司。迁移仅使用已有事实中的明确出票信息，其余为 null。政策及话术对象中的 provider 仍是政策发布方/适用服务商，不采用案例出票方语义。

DP v0.3 使用 `event.provider` 与 `event.carrier`。`scripts/export-dp-cases.mjs` 将完整且 ready_for_review 的候选导出为 Case 格式预览，保持 needs_review，不写生产库。证据与分阶段回应保存在原始 DP，通过 provenance 关联；论坛证据不能自动变成旅客的 evidence_used。

## Script

沟通话术模板。

字段：

- script_id: string
- incident_types: ("hotel_walk" | "airline_delay" | "airline_cancellation" | "denied_boarding")[]
- applicable_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other" | "global")[]
- applicability_rule: same deterministic route rule vocabulary as `Policy`
- required_controllability: "controllable" | "uncontrollable" | "unknown" | "any"
- provider: string
- channel: "front_desk" | "airport_counter" | "phone" | "chat" | "email" | "corporate_escalation" | "regulator_complaint"
- tone: "polite" | "polite_firm" | "firm"
- language: "en" | "zh"
- template: string
- when_to_use: string
- required_denied_boarding_kind?: "voluntary" | "involuntary"
- remedy?: RemedyDecision id; requests unsupported by the current facts are filtered out.

## RemedyDecision

`id`, `title`, `status` (`needs_verification | not_supported`), `explanation`, `sourceIds`, `request`.
This first implementation identifies candidate requests and exclusions, not confirmed entitlement.
AnalysisResult includes `remedies`; suggested requests and script filtering use those decisions.

## Outcome

未来用户回填结果。

字段：

- outcome_id: string
- user_case_summary: string
- incident_type: string
- policy_regions: ("EU_EEA_CH" | "UK" | "US" | "CA" | "AU" | "CN" | "other")[]
- provider: string
- suggested_ask: string[]
- actual_result: string
- communication_rounds: number
- successful_script_id: string
- user_rating: "useful" | "not_useful" | "unclear"
- notes: string

## DP 人工审核与发布

采集 DP v0.3 与产品检索用 Case 分开保存。审核记录保存 original、current、version、history 及 publication，状态为 pending / needs_evidence / approved / excluded。只有通过证据门槛并由人工确认的版本才生成 Case 发布快照；修改、撤回或排除立即移除快照。provider 与 carrier 分别保留，不相互回填。

本地持久化位于 `.local/dp-review/store.json`，产品通过 `loadCaseLibrary` 合并种子案例与已发布快照。具体契约、远程数据库边界和恢复流程见 [DP 审核工作台](docs/dp-review.md)。
