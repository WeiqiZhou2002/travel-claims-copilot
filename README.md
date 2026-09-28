# Travel Claims Copilot

旅行异常事实整理、依据检索与沟通助手。当前支持酒店到店无房、航班延误、取消、拒载 / 自愿让座；事件类型与法律适用分开。

应用不提供法律意见，不保证赔付，不发送投诉或提交索赔。官方法规、企业承诺、社区案例分别展示。伤害、诉讼、重大财产损失和复杂保险争议转专业帮助提示。

## 运行

建议使用 Node.js 22 LTS 或 24 LTS。

```bash
npm ci
cp .env.example .env.local
# 在 .env.local 配置一个服务端 LLM provider 和 API key
npm run dev -- --hostname 127.0.0.1
```

打开 `http://127.0.0.1:3000`。可使用现有 OpenAI 或 DeepSeek 适配器，环境变量见 [.env.example](.env.example)。密钥不得使用 `NEXT_PUBLIC_` 前缀或提交进仓库。

**自然语言事实抽取完全依赖 LLM。** 未配置、超时、限流或输出校验失败时返回明确错误，页面恢复输入供重试，不使用正则回退，也不以规则覆盖模型事实。已确认的结构化事实仍可直接重新分析。检索、适用条件检查、范围保护和模板生成保留确定性逻辑。

## DP 审核与发布

开发环境打开 `http://127.0.0.1:3000/review`。支持候选 JSON 导入、provider / carrier 分开编辑、来源核对、补证、审核通过、排除和撤回。生产环境不开放审核页面和接口。

审核文件存于 `.local/dp-review/store.json`，不会提交。页面审核后，显式生成发布快照：

```bash
npm run publish:cases
npm run validate:data
# 检查 data/reviewed-cases.json 的 diff，再提交、推送和部署
```

线上只读取版本管理中的 `data/cases.json` 和 `data/reviewed-cases.json`，不访问本地审核文件、不扫描 research。**审核通过不等于已经上线；修改或撤回后也必须重新导出并部署，旧部署才会更新。** 导出失败不覆盖上一份发布快照。

`scripts/export-dp-cases.mjs` 仍然只生成未审核预览，不能代替 `publish:cases`。

详情见 [审核操作与恢复](docs/dp-review.md)。推送分支不是部署，也不自动合并到 main。

## 验证与格式

```bash
npm test
npm run validate:data
npm run lint
npm run format:check
npm run build
```

`npm run format` 统一格式。单元测试使用模型返回值 fixture 检查处理契约，不证明真实模型的语义准确率。运行 `npm run eval:intake` 会调用配置的外部模型并产生 API 用量；默认测试跳过这些在线评测。

## 文档导航

- [架构、边界和后续扩展](docs/ARCHITECTURE.md)
- [当前状态与待办](docs/STATUS.md)
- [数据契约](DATA_SCHEMA.md)
- [领域词汇](CONTEXT.md)
- [DP 审核工作台](docs/dp-review.md)

历史审查位于 `docs/archive/`，不作为当前实现说明。产品范围见简短的 [PROJECT_BRIEF.md](PROJECT_BRIEF.md)，开发约束见 [AGENTS.md](AGENTS.md)。
