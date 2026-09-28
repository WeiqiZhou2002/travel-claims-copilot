import type { HandlingPlaybook } from "../../lib/types";
import { Section } from "./shared";
const handlingSourceLabels: Record<
  HandlingPlaybook["sources"][number]["sourceType"],
  string
> = {
  industry_guidance: "Industry guidance",
  community_guide: "Community guide",
  official_policy_required: "Official policy check required",
};

export function HandlingPlaybookSection({
  playbook,
}: {
  playbook: HandlingPlaybook;
}) {
  return (
    <Section title="What to do now">
      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-ink/10 bg-ink p-5 text-white md:grid-cols-[180px_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
              Contact first
            </p>
            <p className="mt-2 text-lg font-semibold">
              {playbook.contactFirst.name ??
                playbook.contactFirst.role.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-xs capitalize text-white/60">
              {playbook.contactFirst.role.replaceAll("_", " ")}
            </p>
          </div>
          <p className="text-sm leading-6 text-white/75">
            {playbook.contactFirst.reason}
          </p>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Ask in this order
            </h3>
            {playbook.askLadder.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {playbook.askLadder.map((item, index) => (
                  <li
                    className="flex gap-3 text-sm leading-6 text-ink/75"
                    key={item}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint/10 text-xs font-semibold text-mint">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink/60">
                More trip context is needed before suggesting a request order.
              </p>
            )}
          </div>

          <div className="space-y-5">
            {playbook.ticketingChecks.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  After any rebooking
                </h3>
                <ul className="mt-3 space-y-2">
                  {playbook.ticketingChecks.map((item) => (
                    <li
                      className="flex gap-3 text-sm leading-6 text-ink/70"
                      key={item}
                    >
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-mint" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {playbook.fallback.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  If the first request fails
                </h3>
                <ul className="mt-3 space-y-2">
                  {playbook.fallback.map((item) => (
                    <li
                      className="border-l-2 border-coral/40 pl-3 text-sm leading-6 text-ink/70"
                      key={item}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {playbook.uncertainties.length > 0 ? (
          <div className="border-t border-coral/15 bg-coral/5 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-coral">
              Still uncertain
            </p>
            <ul className="mt-2 grid gap-1 text-sm leading-6 text-ink/70">
              {playbook.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 bg-paper/70 px-5 py-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink/45">
            Guidance basis
          </span>
          {playbook.sources.map((source) =>
            source.url ? (
              <a
                className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-ink/65 transition hover:border-mint hover:text-mint"
                href={source.url}
                key={`${source.sourceType}-${source.title}`}
                rel="noreferrer"
                target="_blank"
                title={source.title}
              >
                {handlingSourceLabels[source.sourceType]} ↗
              </a>
            ) : (
              <span
                className="rounded-full border border-coral/20 bg-coral/5 px-3 py-1 text-xs font-medium text-coral"
                key={`${source.sourceType}-${source.title}`}
                title={source.title}
              >
                {handlingSourceLabels[source.sourceType]}
              </span>
            ),
          )}
          <span className="w-full text-xs leading-5 text-ink/50">
            Procedural guidance is not a guarantee of rebooking, reimbursement,
            or compensation.
          </span>
        </div>
      </div>
    </Section>
  );
}
