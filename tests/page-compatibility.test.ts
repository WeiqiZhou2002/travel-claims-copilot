import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("home page composition", () => {
  it("keeps the established guided-intake UI as the public page", () => {
    const pagePath = join(process.cwd(), "app/page.tsx");
    const pageSource = readFileSync(pagePath, "utf8");
    const compiled = ts.transpileModule(pageSource, {
      fileName: pagePath,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }
    });
    const errors = (compiled.diagnostics ?? [])
      .filter(({ category }) => category === ts.DiagnosticCategory.Error)
      .map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"));

    expect(errors).toEqual([]);
    expect(compiled.outputText).toContain("Build the case file before making the ask.");
    expect(pageSource).toContain('"use client"');
    expect(pageSource).toContain('const [draft, setDraft] = useState("")');
    expect(pageSource).not.toContain("ClaimWorkspace");
  });
});
