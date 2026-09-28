import type { DP } from "../../lib/dp-review/types";

export function TextField({
  label,
  value,
  onChange,
  multiline = false
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="dp-field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="dp-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
export const fulfillment = {
  offered: "提出方案",
  promised: "航司承诺",
  accepted: "旅客已接受",
  received: "作者报告已收到",
  rejected: "明确拒绝",
  withdrawn: "已撤回",
  unknown: "履行未知"
};
const kinds = {
  rebooking: "改签",
  refund: "退款",
  expense_reimbursement: "费用报销",
  cash_compensation: "现金补偿",
  voucher: "代金券",
  miles: "里程",
  points: "积分",
  care: "食宿 / 照料",
  other: "其他"
};
export function Responses({ dp, update }: { dp: DP; update: (edit: (d: DP) => void) => void }) {
  return (
    <>
      {dp.airline_handling.responses.map((r, i) => (
        <div className="response-block" key={r.response_id}>
          <div className="response-heading">
            <span className="timeline-dot" />
            <strong>回应 {i + 1}</strong>
            <span className="mono">{r.response_id}</span>
          </div>
          <div className="dp-grid">
            <Choice
              label="处理阶段"
              value={r.phase}
              options={{
                initial: "初始",
                intermediate: "后续",
                final: "最终",
                unknown: "未披露"
              }}
              onChange={(v) =>
                update((draft) => {
                  draft.airline_handling.responses[i].phase = v;
                })
              }
            />
            <TextField
              label="发生时间（未披露留空）"
              value={r.time_text}
              onChange={(v) =>
                update((draft) => {
                  draft.airline_handling.responses[i].time_text = v || null;
                })
              }
            />
          </div>
          <TextField
            label="航司说了什么、做了什么"
            multiline
            value={r.description}
            onChange={(v) =>
              update((draft) => {
                draft.airline_handling.responses[i].description = v;
              })
            }
          />
          <TextField
            label="支持证据 ID（逗号分隔）"
            value={r.evidence_ids.join(", ")}
            onChange={(v) =>
              update((draft) => {
                draft.airline_handling.responses[i].evidence_ids = v
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
              })
            }
          />
          {r.measures.map((m, j) => (
            <div className="measure-block" key={j}>
              <div className="dp-grid">
                <Choice
                  label="处置种类"
                  value={m.kind}
                  options={kinds}
                  onChange={(v) =>
                    update((draft) => {
                      draft.airline_handling.responses[i].measures[j].kind = v;
                    })
                  }
                />
                <Choice
                  label="实际履行状态"
                  value={m.fulfillment}
                  options={fulfillment}
                  onChange={(v) =>
                    update((draft) => {
                      draft.airline_handling.responses[i].measures[j].fulfillment = v;
                    })
                  }
                />
              </div>
              <TextField
                label="具体内容"
                value={m.description}
                onChange={(v) =>
                  update((draft) => {
                    draft.airline_handling.responses[i].measures[j].description = v;
                  })
                }
              />
              <div className="dp-grid thirds">
                <label className="dp-field">
                  <span>金额（未知留空）</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={m.amount ?? ""}
                    onChange={(e) =>
                      update((draft) => {
                        draft.airline_handling.responses[i].measures[j].amount =
                          e.target.value === "" ? null : Number(e.target.value);
                      })
                    }
                  />
                </label>
                <TextField
                  label="币种 / 计划"
                  value={m.currency_or_program}
                  onChange={(v) =>
                    update((draft) => {
                      draft.airline_handling.responses[i].measures[j].currency_or_program =
                        v || null;
                    })
                  }
                />
                <TextField
                  label="单位"
                  value={m.unit}
                  onChange={(v) =>
                    update((draft) => {
                      draft.airline_handling.responses[i].measures[j].unit = v || null;
                    })
                  }
                />
              </div>
              <TextField
                label="本项证据 ID"
                value={m.evidence_ids.join(", ")}
                onChange={(v) =>
                  update((draft) => {
                    draft.airline_handling.responses[i].measures[j].evidence_ids = v
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean);
                  })
                }
              />
              <button
                className="text-button danger"
                onClick={() =>
                  update((draft) => {
                    draft.airline_handling.responses[i].measures.splice(j, 1);
                  })
                }
              >
                移除此处置
              </button>
            </div>
          ))}
          <div className="response-actions">
            <button
              className="text-button"
              onClick={() =>
                update((draft) => {
                  draft.airline_handling.responses[i].measures.push({
                    kind: "other",
                    description: "",
                    amount: null,
                    currency_or_program: null,
                    unit: null,
                    fulfillment: "unknown",
                    evidence_ids: []
                  });
                })
              }
            >
              ＋ 添加处置
            </button>
            <button
              className="text-button danger"
              onClick={() =>
                update((draft) => {
                  draft.airline_handling.responses.splice(i, 1);
                })
              }
            >
              移除此回应
            </button>
          </div>
        </div>
      ))}
      <button
        className="outline-button"
        onClick={() =>
          update((draft) => {
            draft.airline_handling.responses.push({
              response_id: `r-${crypto.randomUUID().slice(0, 8)}`,
              order: draft.airline_handling.responses.length + 1,
              time_text: null,
              phase: "unknown",
              description: "",
              after_action_id: null,
              measures: [],
              evidence_ids: []
            });
          })
        }
      >
        ＋ 添加航司回应
      </button>
    </>
  );
}
