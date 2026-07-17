# 数据结构设计

## Policy

官方政策、法规、航司/酒店公开承诺。

字段：

- policy_id: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota" | "government"
- provider: string
- policy_name: string
- issue_type: string
- source_url: string
- source_type: "official_policy" | "government_regulation" | "official_dashboard" | "terms"
- authority_level: "high" | "medium" | "low"
- applicable_conditions: string[]
- compensation_or_rights: string[]
- summary: string
- last_checked: string

## Case

社区案例、用户 DP、历史反馈案例。

字段：

- case_id: string
- source_type: "community_dp" | "user_submitted" | "synthetic_example"
- source_name: string
- source_url: string
- provider_type: "hotel" | "airline" | "credit_card" | "ota"
- provider: string
- brand_or_airline: string
- issue_type: string
- location_country: string
- booking_channel: "direct" | "ota" | "portal" | "unknown"
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

## Script

沟通话术模板。

字段：

- script_id: string
- issue_type: string
- provider: string
- channel: "front_desk" | "airport_counter" | "phone" | "chat" | "email" | "corporate_escalation" | "regulator_complaint"
- tone: "polite" | "polite_firm" | "firm"
- language: "en" | "zh"
- template: string
- when_to_use: string

## Outcome

未来用户回填结果。

字段：

- outcome_id: string
- user_case_summary: string
- issue_type: string
- provider: string
- suggested_ask: string[]
- actual_result: string
- communication_rounds: number
- successful_script_id: string
- user_rating: "useful" | "not_useful" | "unclear"
- notes: string
