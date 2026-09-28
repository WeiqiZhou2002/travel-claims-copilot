import { policyFreshness } from "../../lib/policy-freshness";
import type {
  Case,
  Policy,
  PolicyApplicabilityAssessment,
} from "../../lib/types";
import { FallbackText, Section, TagList } from "./shared";
const policySourceLabels: Record<Policy["source_type"], string> = {
  official_policy: "Official policy",
  government_regulation: "Government regulation",
  regulator_guidance: "Regulator guidance",
  official_dashboard: "Official dashboard",
  terms: "Official terms",
};

const caseSourceLabels: Record<Case["source_type"], string> = {
  community_dp: "Community report",
  user_submitted: "User submitted",
  synthetic_example: "Synthetic example",
};

const applicabilityStyles: Record<
  PolicyApplicabilityAssessment["status"],
  string
> = {
  met: "border-mint/25 bg-mint/10 text-mint",
  unknown: "border-coral/25 bg-coral/10 text-coral",
  not_met: "border-ink/15 bg-paper text-ink/55",
};

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-ink/10 bg-paper px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/60 ${className}`}
    >
      {children}
    </span>
  );
}

function PolicyAssessment({
  assessment,
}: {
  assessment: PolicyApplicabilityAssessment | undefined;
}) {
  if (!assessment) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-paper/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/55">
          Applicability checks
        </h4>
        <Badge className={applicabilityStyles[assessment.status]}>
          {assessment.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <ul className="mt-3 grid gap-2">
        {assessment.conditions.map((item) => (
          <li
            className="grid gap-1 text-sm md:grid-cols-[128px_1fr]"
            key={item.code}
          >
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  item.status === "met"
                    ? "bg-mint"
                    : item.status === "unknown"
                      ? "bg-coral"
                      : "bg-ink/30"
                }`}
              />
              {item.status.replaceAll("_", " ")}
            </span>
            <span className="leading-6 text-ink/70">
              <span className="font-medium text-ink/85">{item.label}:</span>{" "}
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PolicySection({
  policies,
  assessments,
}: {
  policies: Policy[];
  assessments: PolicyApplicabilityAssessment[];
}) {
  const assessmentsByPolicy = new Map(
    assessments.map((assessment) => [assessment.policyId, assessment]),
  );

  return (
    <Section title="Official basis">
      {policies.length === 0 ? (
        <FallbackText>
          No matching official policy found in local demo data.
        </FallbackText>
      ) : (
        <div className="grid gap-3">
          {policies.map((policy) => (
            <article
              className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm"
              key={policy.policy_id}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-ink">
                    {policy.policy_name}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {policy.provider} ·{" "}
                    {policy.legal_regime.replaceAll("_", " ")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{policySourceLabels[policy.source_type]}</Badge>
                    <Badge>{policy.authority_level} authority</Badge>
                    <Badge>Checked {policy.last_checked}</Badge>
                    {policyFreshness(policy.last_checked).status !==
                      "current" && (
                      <Badge className="bg-coral/10 text-coral">
                        Review due — verify official source
                      </Badge>
                    )}
                  </div>
                </div>
                <a
                  className="text-sm font-semibold text-mint hover:text-coral"
                  href={policy.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open official source ↗
                </a>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink/75">
                {policy.summary}
              </p>
              {policyFreshness(policy.last_checked).status !== "current" && (
                <p className="mt-2 text-xs text-coral">
                  The editorial review is overdue or undated. This does not
                  establish whether the policy has changed or expired.
                </p>
              )}
              <PolicyAssessment
                assessment={assessmentsByPolicy.get(policy.policy_id)}
              />
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink/55">
                  Source conditions to verify
                </h4>
                <ul className="mt-2 grid gap-1 text-sm leading-6 text-ink/70">
                  {policy.applicable_conditions.map((item) => (
                    <li className="border-l-2 border-ink/10 pl-3" key={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <TagList items={policy.compensation_or_rights} />
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

export function CaseSection({ cases }: { cases: Case[] }) {
  return (
    <Section title="Similar cases">
      {cases.length === 0 ? (
        <FallbackText>No similar local case found yet.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {cases.map((item) => (
            <article
              className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm"
              key={item.case_id}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-ink">
                    {item.brand_or_airline}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {item.provider_type === "airline"
                      ? `Ticketing provider: ${item.provider ?? "Unknown"} · Operating carrier: ${item.carrier ?? "Unknown"}`
                      : item.provider}{" "}
                    · {item.booking_channel} · {item.confidence} record
                    confidence
                  </p>
                  {item.provider_type === "airline" &&
                    item.location_country === "unknown" && (
                      <p className="text-xs text-ink/60">
                        Route scope is unverified; compare the original
                        itinerary before relying on this case.
                      </p>
                    )}
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={
                        item.source_type === "synthetic_example"
                          ? "border-coral/25 bg-coral/10 text-coral"
                          : ""
                      }
                    >
                      {caseSourceLabels[item.source_type]}
                    </Badge>
                    <Badge>{item.source_name}</Badge>
                  </div>
                </div>
                {item.source_url ? (
                  <a
                    className="text-sm font-semibold text-mint hover:text-coral"
                    href={item.source_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open case source ↗
                  </a>
                ) : null}
              </div>
              {item.source_type === "synthetic_example" ? (
                <p className="mt-3 rounded-lg border border-coral/20 bg-coral/5 px-3 py-2 text-xs leading-5 text-ink/65">
                  Illustrative demo record—not a reported traveler outcome or
                  official policy.
                </p>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-ink/75">{item.facts}</p>
              <p className="mt-3 text-sm leading-6 text-ink">
                <span className="font-semibold">
                  {item.source_type === "synthetic_example"
                    ? "Illustrative outcome:"
                    : /outcome (?:was )?not|not fully reported/i.test(
                          item.actual_outcome,
                        )
                      ? "Reported status:"
                      : "Reported outcome:"}
                </span>{" "}
                {item.actual_outcome}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/75">
                {item.reusable_lesson}
              </p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
