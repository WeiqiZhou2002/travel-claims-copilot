# Travel Claims Copilot 对话迁移上下文

## 项目定位

这是一个“旅行权益案例搜索与沟通助手”。

用户输入自己遇到的酒店或航司异常经历，系统基于：
- 官方政策
- 政府法规
- 航司 / 酒店公开承诺
- 社区相似案例 DP
- 历史用户反馈结果

帮助用户判断可以合理提出哪些诉求，并生成可复制的沟通话术。

产品不提供法律意见，不承诺赔偿结果，不做代理索赔。核心价值是帮助用户更快找到依据、组织证据、提出请求并记录结果。

---

## 核心方向

原始方向是航班延误 / EU261 索赔 agent。

新方向更广：

> 旅行不正常情况怎么撕 Copilot：帮用户找到相似案例、官方规则、品牌政策、别人成功要到的补偿，并生成合理诉求和沟通话术。

这个方向比单纯做法律赔偿判断更容易冷启动，也更适合社区传播和产品化。

---

## 核心用户场景

### 1. 酒店被 walk / confirmed reservation not honored

示例：

用户是 Marriott Titanium，官网订 Sheraton，到店后酒店说没房，把用户安排到附近更差酒店，没有主动给补偿。

系统应输出：
- 问题类型：hotel_walk
- 官方依据：Marriott Ultimate Reservation Guarantee / Elite Benefit Guarantees
- 相似案例：Marriott walk, Titanium, direct booking
- 建议诉求：附近酒店、交通、cash / points compensation、case number
- 话术：前台现场话术、客服邮件、corporate escalation

### 2. 美国航司可控延误 / 取消

示例：

用户 United 航班因为 crew issue 取消，被改到第二天，机场不给酒店。

系统应输出：
- 问题类型：controllable_cancellation / controllable_delay
- 官方依据：DOT Airline Cancellation and Delay Dashboard、航司 customer commitment
- 建议诉求：rebooking、hotel、meal voucher、transportation
- 话术：机场柜台话术、customer relations 邮件

### 3. 航司超售 / denied boarding / voluntary bump

示例：

用户遇到 AA oversold，航司询问是否有人愿意自愿改签。

系统应输出：
- 区分 voluntary bump 和 involuntary denied boarding
- 法规或官方规则
- 相似 DP 中的谈判区间
- 谈判策略和话术

### 4. EU261 / UK261 航班延误、取消、missed connection

示例：

用户从 EU 出发，最终目的地晚到 4 小时。

系统应输出：
- 是否可能适用 EU261 / UK261
- care / refund / rerouting / compensation 的区别
- 需要补充的证据
- claim letter 草稿

---

## 产品输出结构

每次分析应输出：

1. 问题类型
2. 初步判断强度
3. 可引用依据
   - 官方政策 / 法规
   - 相似社区案例
4. 建议诉求
   - 保守诉求
   - 标准诉求
   - 进取诉求
5. 需要收集的证据
6. 可复制话术
   - 现场 / 电话版
   - 邮件版
   - 被拒后的升级版
7. 风险和注意事项

---

## 产品边界

必须避免：
- 承诺用户一定能获得赔偿
- 编造政策、金额、案例或来源
- 把社区 DP 说成官方规则
- 提供诉讼策略或正式法律意见
- 处理人身伤害、重大财产损失、复杂保险理赔等高风险场景

必须强调：
- 官方政策 / 法规是强依据
- 社区案例 / DP 是参考依据
- goodwill request 不保证成功
- 用户应保留证据

---

## MVP 范围

第一版 demo 只做：
- Marriott / hotel walk
- 美国航司 controllable delay / cancellation
- denied boarding / voluntary bump
- EU261 delay / cancellation

暂时不做：
- 登录
- 支付
- 代索赔
- 自动发邮件
- 自动爬虫
- 复杂保险理赔
- 行李永久丢失
- 人身伤害
- 法律诉讼

---

## 推荐技术路线

你有基础前后端开发经验，但没有 agent 开发经验。因此第一版不要做复杂 autonomous agent，而是做确定性 workflow：

1. 用户输入问题。
2. 系统提取结构化事实。
3. 分类 provider_type、provider、issue_type。
4. 从 policies、cases、scripts 中检索相关内容。
5. 用固定模板生成分析结果。
6. 用户反馈最终拿到什么补偿，沉淀为 outcome 数据。

第一版可以使用：
- Next.js
- TypeScript
- Tailwind
- 本地 JSON seed data
- 后续迁移到 Supabase Postgres + pgvector
- 后续接 OpenAI API 做结构化事实提取和自然语言生成

---

## 数据结构

### Policy

```ts
type Policy = {
  policy_id: string;
  provider_type: "hotel" | "airline" | "credit_card" | "ota" | "government";
  provider: string;
  policy_name: string;
  issue_type: string;
  source_url: string;
  source_type: "official_policy" | "government_regulation" | "official_dashboard" | "terms";
  authority_level: "high" | "medium" | "low";
  applicable_conditions: string[];
  compensation_or_rights: string[];
  summary: string;
  last_checked: string;
};