import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("home page composition", () => {
  it("uses the source-aware workspace without retaining the temporary projection", () => {
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
    expect(compiled.outputText).toContain("ClaimWorkspace");
    expect(pageSource).toContain(
      'import { ClaimWorkspace } from "../src/components/claim-workspace"'
    );
    expect(pageSource).not.toContain("pageResultFromResponse");
    expect(pageSource).not.toContain("AnalyzeClaimResponse");
  });
});
