# 数据收集报告

## 来源
- 论坛：uscardforum.com（旅行版 + 航空版）
- 搜索词：19 组中文旅行相关查询（酒店怎么撕、航司怎么撕、延误怎么撕等）
- 读取：23 个话题完整内容
- 工具：Nitan MCP v2.1.1 (browser fallback 绕过 Cloudflare)

## 1. Collected Cases — 23 个社区案例

文件保存在：`data/cases.collected.json`

### issue_type 分布

| issue_type | count |
| --- | ---: |
| controllable_airline_delay | 4 |
| controllable_airline_cancellation | 3 |
| hotel_service_issue | 5 |
| hotel_room_feature_mismatch | 3 |
| hotel_elite_benefit_closure | 2 |
| hotel_walk | 1 |
| hotel_relocation_before_opening | 1 |
| hotel_billing_dispute | 0 |
| baggage_delay | 3 |
| airline_baggage_not_checked | 1 |
| airline_rebooking_mixed_carrier_delay | 1 |
| airline_delay_trip_insurance | 1 |
| denied_boarding | 1 |

### 完整案例列表

| case_id | provider | issue_type | confidence |
| --- | --- | --- | ---: |
| uscf_aa127_mechanical_delay_overnight_2026_07 | American Airlines | controllable_airline_delay | high |
| uscf_marriott_renaissance_nyc_breakfast_denied_2026_03 | Marriott | hotel_elite_benefit_closure | medium |
| uscf_hilton_home2_amenities_missing_diamond_2026_07 | Hilton | hotel_walk | high |
| uscf_as16_diverted_alb_equipment_2026_07 | Alaska Airlines | controllable_airline_delay | medium |
| uscf_hyatt_rome_central_relocation_hgi_2026_04 | Hyatt | hotel_relocation_before_opening | high |
| uscf_conrad_borabora_paid_upgrade_denied_2026_07 | Hilton (Conrad) | hotel_room_feature_mismatch | high |
| uscf_aa_buf_dca_cancel_weather_dispute_2026_06 | American Airlines | controllable_airline_cancellation | medium |
| uscf_delta_six_hours_cancel_sfo_lax_2026_02 | Delta | controllable_airline_cancellation | medium |
| uscf_aa_bag_not_checked_visa_system_2026_05 | American Airlines | airline_baggage_not_checked | high |
| uscf_southwest_baggage_delay_misconnect_2025_01 | Southwest | baggage_delay | medium |
| uscf_aa_damaged_luggage_missing_items_2026_03 | American Airlines | baggage_delay | high |
| uscf_hotel_water_outage_hampton_fn_2026_06 | Hilton (Hampton Inn) | hotel_service_issue | high |
| uscf_fairmont_banff_springs_fhr_room_misrepresentation_2026_06 | Fairmont (Accor) | hotel_room_feature_mismatch | high |
| uscf_ua_hawaii_cancel_rebook_aa_2026_01 | United | controllable_airline_cancellation | medium |
| uscf_ac_syd_yvr_delay_missed_connection_2026_02 | Air Canada | controllable_airline_delay | medium |
| uscf_hyatt_naked_intruder_unauthorized_entry_2026_06 | Hyatt | hotel_service_issue | medium |
| uscf_lxr_honolulu_power_outage_2026_03 | Hilton (LXR) | hotel_service_issue | medium |
| uscf_marriott_nanjing_mouse_pest_issue_2026_06 | Marriott (Autograph) | hotel_service_issue | medium |
| uscf_hotel_false_fire_alarm_ascott_penang_2026_03 | Ascott | hotel_service_issue | medium |
| uscf_hyatt_regency_maui_club_closed_2026_02 | Hyatt | hotel_elite_benefit_closure | high |
| uscf_hyatt_andaz_5th_suite_amenity_mismatch_2026_05 | Hyatt | hotel_room_feature_mismatch | medium |
| uscf_cx_cancel_rebook_ua_delay_mixed_carrier_2026_05 | Cathay/United | airline_rebooking_mixed_carrier_delay | medium |
| uscf_aa_delay_trip_insurance_amex_plat_2024_06 | American Airlines | airline_delay_trip_insurance | high |
| uscf_aa128_denied_boarding_cbp_evus_2026_04 | American Airlines | denied_boarding | medium |

## 2. Rejected Topics

| URL | Reason |
| --- | --- |
| https://www.uscardforum.com/t/topic/489195 | Spirit delay 12hr — too few details (single line post) |
| https://www.uscardforum.com/t/topic/491624 | UA/ANA baggage NRT — low signal, mostly about credit card insurance eligibility |
| https://www.uscardforum.com/t/topic/491445 | Hilton Lisbon FN cancelled — too few details in captured posts |
| https://www.uscardforum.com/t/topic/478903 | Pigeon at jetbridge — joke topic, not a real travel disruption |
| https://www.uscardforum.com/t/topic/506474 | Vegas noise complaint — low signal, humorous |
| https://www.uscardforum.com/t/topic/497760 | HGV unauthorized booking — OTA dispute, outside MVP scope |
| https://www.uscardforum.com/t/topic/498169 | Hotel burn injury — high_risk (injury) |
| https://www.uscardforum.com/t/topic/514201 | Bloodstain on sheets — too few usable facts |
| https://www.uscardforum.com/t/topic/377465 | Travel insurance comparison thread — informational, not a DP |
| https://www.uscardforum.com/t/topic/502883 | Water bottle fell on leg during takeoff — low signal |
| https://www.uscardforum.com/t/topic/513323 | UA schedule change 90min — passenger still made flight, no real disruption |
| https://www.uscardforum.com/t/topic/503124 | Connecting vs direct flight discussion — not a disruption DP |
| https://www.uscardforum.com/t/topic/515680 | Broken curtain — too minor, would overlap with room feature mismatch |
| https://www.uscardforum.com/t/topic/516811 | Pillow with shoe print — too minor |

## 3. Coverage Summary

| issue_type | count (existing) | count (new) | total |
| --- | ---: | ---: | ---: |
| hotel_walk | 1 | 1 | 2 |
| controllable_airline_cancellation | 0* | 3 | 3 |
| controllable_airline_delay | 0* | 4 | 4 |
| eu261_delay_or_cancellation | 1 | 0 | 1 |
| denied_boarding | 0 | 1 | 1 |
| baggage_delay | 2 | 3 | 5 |
| airline_delay_trip_insurance | 1 | 1 | 2 |
| airline_baggage_not_checked | 1 | 1 | 2 |
| airline_rebooking_mixed_carrier_delay | 1 | 1 | 2 |
| hotel_billing_dispute | 1 | 0 | 1 |
| hotel_service_issue | 1 | 5 | 6 |
| hotel_property_loss | 1 | 0 | 1 |
| hotel_relocation_before_opening | 1 | 1 | 2 |
| hotel_room_feature_mismatch | 1 | 3 | 4 |
| hotel_elite_benefit_closure | 1 | 2 | 3 |
| **Total** | **12** | **24** | **36** |

*existing cases.example.json had these as `synthetic_example` source type, not community_dp.

### 已有文件
- `data/cases.example.json` — 12 个旧案例（含 4 个合成 + 8 个社区 DP）
- `data/cases.collected.json` — 24 个新社区案例
- 合并后可得到 36 个案例，覆盖 14/15 个 issue_type

### P0 issue_area coverage
- hotel_walk: ✅
- hotel_relocation_before_opening: ✅
- hotel_room_feature_mismatch: ✅
- hotel_billing_dispute: ❌ (0 new, 1 existing from earlier collection)
- hotel_elite_benefit_closure: ✅
- controllable_airline_delay: ✅
- controllable_airline_cancellation: ✅
- denied_boarding: ✅
- baggage_delay: ✅
- airline_baggage_not_checked: ✅
- airline_rebooking_mixed_carrier_delay: ✅
- airline_delay_trip_insurance: ✅
