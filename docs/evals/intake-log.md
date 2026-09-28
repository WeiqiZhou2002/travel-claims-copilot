# Intake 评测日志

每次线上评测一行。字段为日期、对应代码 commit、provider、model、用例数、通过数、失败用例 ID。记录只包含配置名称和结果，不记录 API key、base URL 凭证或旅客原文。mock 单元测试不作为模型准确率评测。

| 日期 | Commit / 代码状态 | Provider | Model | 用例数 | 通过数 | 失败用例 ID |
| --- | --- | --- | --- | ---: | ---: | --- |
| 2026-09-28 | `10e2378`（f4bd6f3 修复前，工作树格式化期间） | deepseek | deepseek-v4-flash | 24 | 23 | `tests/review-regressions.test.ts::live model review regression accuracy::does not invent oversales for a document-related denial` |
| 2026-09-28 | `f4bd6f3`（对应提示词在提交前的定向重跑） | deepseek | deepseek-v4-flash | 1 | 1 | 无 |

这两条是 f4bd6f3 对应轮次的历史补录，计数来自当时工具输出。provider/model 按要求从本机 `.env.local` 的非敏感配置读取：deepseek / deepseek-v4-flash；未保存独立的历史环境快照。24 项是 Vitest 用例总数（含同文件中的确定性检查），不是 24 次模型调用；第二行是单条定向回归，不表示修改后整套在线评测通过。

当时该 live 用例期望 unknown；本次已改为 passenger_side。这是语义更新，旧日志不代表新枚举已经接受过线上模型验证。本次验收全部使用确定性测试，没有新增真实 LLM 调用。后续真实评测应在运行时记录配置与准确的失败用例 ID，不能以 mock 通过代替。
