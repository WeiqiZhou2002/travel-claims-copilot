# 出票方与承运方升级

采集 DP v0.3 和产品 Case 使用 provider（原出票/办理方）、carrier（发生异常的航段实际承运人）。政策发布者仍使用政策对象自己的 provider，不能混用。

## 已完成

- 55 条既有 Case 增加 carrier；航司记录的出票方依据既有事实迁移，未明确则 null。保留 legacy_provider 和 role_notes。本轮没有重新浏览所有旧原帖。
- 示范的两条 DP 改为独立角色字段；增加可重复运行的预览导出器，导出为产品 Case 格式，保持 needs_review。
- 案例检索分别匹配出票方与承运人，同组合优先；禁止跨角色匹配。地理未归一的案例只在双方均匹配时作为带提示的参考，降权排序。
- 页面展示/编辑独立角色；intake 识别 AS出AA、AS-issued AA 等显式角色。API 的旧 ClaimFacts.provider 保留兼容，通过 bookingProvider/validatingCarrier 和 operatingCarrier 适配到检索，不需强制重写已保存草稿。
- 未知实际承运人不再自动从旧 provider 回填到适用范围判断。

## 示范命令

在项目根目录运行：

```sh
node scripts/export-dp-cases.mjs research/airline-dp/uscardforum-demo-001/candidates.json research/airline-dp/uscardforum-demo-001/cases.preview-v2.json
```

已生成的首版见该批次 cases.preview.json。导出器拒绝覆盖原始候选、生产库和已有文件。它校验版本、角色字段、R 信息及来源引用；语义准确性仍需审核。导出不会赋予 approved，也不会自动追加到 data/cases.json。

## 下一步顺序

1. 对待审核 DP 提供 approve/hold/exclude 的集中审核，再实现按稳定 dp_id 合并和更新生产库，保留审计记录。
2. 补齐受影响航段、发生/通知/计划出行日期的独立字段；目前原文与说明仍保留在 DP，不强行压平。
3. 逐步把原因、当事人行动、回应阶段和履行状态加入结构化匹配；当前角色精确匹配已实现，其余仍部分依赖文本。
4. 补地理归一和旧记录角色的原帖复核，再评估语义检索是否改善召回。

无需修改用户定义的 R/O：原因和当事人做法继续可选，角色未知明确记录，未知角色不获得匹配加分。
