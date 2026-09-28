"use client";
import { useClaimConversation } from "./hooks/use-claim-conversation";
import { FactEditor, RemedySection, OutcomeSection } from "./claim-tools";
import { EmptyState, ClaimSnapshot } from "./components/claim-snapshot";
import { SummaryPanel, SuggestedAsks } from "./components/summary";
import { HandlingPlaybookSection } from "./components/handling-playbook";
import { PolicySection, CaseSection } from "./components/sources";
import { ScriptSection } from "./components/scripts";
import { Checklist } from "./components/shared";
export default function Home() {
 const {requestVersion,draft,setDraft,messages,facts,setFacts,extractionMode,safetyNotice,result,setResult,error,isLoading,copiedScriptId,transcript,remember,setRemember,reanalyzeFacts,submitIntake,resetClaim,copyScript} = useClaimConversation();
  return (
    <main className="min-h-screen">
      <section className="border-b border-ink/10 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-mint">
                Travel Claims Copilot · Guided intake
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-5xl">
                Build the case file before making the ask.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-ink/65 md:text-base">
                Describe the disruption naturally. The intake will identify missing facts before
                selecting who to contact, then searching official sources, reviewed cases, and
                reusable scripts.
              </p>
            </div>
            <button
              className="w-fit rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/65 transition hover:border-coral hover:text-coral"
              type="button"
              onClick={resetClaim}
            >
              New claim
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-ink/10 bg-ink px-5 py-3 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Intake transcript</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                {isLoading ? "Reviewing details" : result ? "Analysis ready" : "Collecting facts"}
              </span>
            </div>

            <div ref={transcript} className="max-h-96 space-y-4 overflow-y-auto px-5 py-5 md:px-7" aria-live="polite">
              {messages.map((item, index) => (
                <article
                  className="grid gap-2 md:grid-cols-[92px_1fr]"
                  key={item.id}
                >
                  <p className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                    {index + 1}. {item.role === "assistant" ? "Copilot" : "You"}
                  </p>
                  <p
                    className={`rounded-lg border px-4 py-3 text-sm leading-6 md:text-base ${
                      item.role === "assistant"
                        ? "border-mint/20 bg-mint/5 text-ink/75"
                        : "border-ink/10 bg-paper text-ink"
                    }`}
                  >
                    {item.content}
                  </p>
                </article>
              ))}
            </div>

            <form
              className="grid gap-3 border-t border-ink/10 bg-paper/70 p-4 md:grid-cols-[1fr_auto] md:items-end md:p-5"
              onSubmit={submitIntake}
            >
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                  Your answer
                </span>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-ink/15 bg-white p-4 text-base leading-7 text-ink shadow-sm outline-none transition focus:border-mint focus:ring-4 focus:ring-mint/15"
                  maxLength={4000}
                  disabled={isLoading}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Describe what happened, or answer the follow-up question."
                />
              </label>
              <button
                className="h-12 rounded-lg bg-ink px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/40 md:w-36"
                type="submit"
                disabled={isLoading || !draft.trim()}
              >
                {isLoading ? "Reviewing" : facts ? "Continue" : "Start intake"}
              </button>
            </form>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink/65"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Keep this case and the last 20 messages on this device</label>
          {error ? (
            <div className="rounded-lg border border-coral/30 bg-white px-4 py-3 text-sm font-medium text-coral">
              {error}
            </div>
          ) : null}
          {safetyNotice ? (
            <div
              className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-3 text-sm leading-6 text-ink"
              role="alert"
            >
              <p className="font-semibold text-coral">Professional-help boundary</p>
              <p className="mt-1">{safetyNotice.message}</p>
              <p className="mt-1 text-xs text-ink/55">This is not legal advice.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4">
          <ClaimSnapshot
            facts={facts}
            extractionMode={extractionMode}
          />
          {facts && <FactEditor facts={facts} disabled={isLoading} onChange={next => { setFacts(next); setResult(null); }} onAnalyze={reanalyzeFacts} />}
          <SummaryPanel result={result} />
          {result ? <SuggestedAsks asks={result.suggestedAsks} /> : null}
        </aside>

        <div className="flex flex-col gap-5">
          {!result ? (
            <EmptyState />
          ) : (
            <>
              {result.handlingPlaybook ? (
                <HandlingPlaybookSection playbook={result.handlingPlaybook} />
              ) : null}
              <RemedySection result={result} />
              <PolicySection
                policies={result.officialBasis}
                assessments={result.policyAssessments}
              />
              <CaseSection cases={result.similarCases} />
              <Checklist title="Evidence checklist" items={result.evidenceChecklist} />
              <ScriptSection
                scripts={result.scripts}
                copiedScriptId={copiedScriptId}
                onCopy={copyScript}
              />
              <Checklist title="Cautions" items={result.cautions} />
              {facts && <OutcomeSection key={requestVersion.current} facts={facts} result={result} />}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
