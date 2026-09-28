import type { Script } from "../../lib/types";
import { FallbackText, Section } from "./shared";
export function ScriptSection({
  scripts,
  copiedScriptId,
  onCopy,
}: {
  scripts: Script[];
  copiedScriptId: string | null;
  onCopy: (script: Script) => Promise<void>;
}) {
  return (
    <Section title="Scripts">
      {scripts.length === 0 ? (
        <FallbackText>
          No matching script found in local demo data.
        </FallbackText>
      ) : (
        <div className="grid gap-3">
          {scripts.map((script) => (
            <article
              className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm"
              key={script.script_id}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold capitalize text-ink">
                    {script.channel.replaceAll("_", " ")}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {script.tone.replaceAll("_", " ")} · {script.when_to_use}
                  </p>
                </div>
                <button
                  className="h-10 rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint"
                  type="button"
                  onClick={() => onCopy(script)}
                >
                  {copiedScriptId === script.script_id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-4 rounded-lg bg-paper p-4 text-sm leading-6 text-ink/80">
                {script.template}
              </p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
