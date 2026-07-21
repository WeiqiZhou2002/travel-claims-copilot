import path from "node:path";

import { describe, expect, it } from "vitest";

import { runLiveEval, validateLiveEvalInvocation } from "../../evals/run-live-eval";

const releaseSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const validArgs = ["--release-sha", releaseSha, "--output", ".release/eval/live-eval.json"];

describe("live GPT evaluation gate", () => {
  it("requires an explicit live flag and OpenAI key", () => {
    const base = {
      args: validArgs,
      cwd: process.cwd(),
      readHead: () => releaseSha,
      readTrackedStatus: () => ""
    };

    expect(() => validateLiveEvalInvocation({ ...base, env: {} })).toThrow(
      "live_openai_evals_not_approved"
    );
    expect(() =>
      validateLiveEvalInvocation({ ...base, env: { RUN_LIVE_OPENAI_EVALS: "1" } })
    ).toThrow("openai_api_key_missing");
  });

  it("cannot bypass the live gate through the exported runner", async () => {
    await expect(
      runLiveEval({
        releaseSha,
        outputPath: path.resolve(process.cwd(), ".release/eval/live-eval.json"),
        env: {}
      })
    ).rejects.toThrow("live_openai_evals_not_approved");
  });

  it("accepts only the fixed output, matching clean HEAD, and exact arguments", () => {
    const base = {
      args: validArgs,
      cwd: process.cwd(),
      env: { RUN_LIVE_OPENAI_EVALS: "1", OPENAI_API_KEY: "test-key" },
      readHead: () => releaseSha,
      readTrackedStatus: () => ""
    };
    const validated = validateLiveEvalInvocation(base);

    expect(validated).toEqual({
      releaseSha,
      outputPath: path.resolve(process.cwd(), ".release/eval/live-eval.json")
    });
    expect(JSON.stringify(validated)).not.toContain("test-key");
    expect(() =>
      validateLiveEvalInvocation({
        ...base,
        args: ["--release-sha", releaseSha, "--output", "other.json"]
      })
    ).toThrow("live_eval_output_path_invalid");
    expect(() =>
      validateLiveEvalInvocation({ ...base, readTrackedStatus: () => " M file" })
    ).toThrow("tracked_files_must_be_clean");
    expect(() => validateLiveEvalInvocation({ ...base, readHead: () => "0".repeat(40) })).toThrow(
      "release_sha_does_not_match_head"
    );
    expect(() => validateLiveEvalInvocation({ ...base, args: [...validArgs, "extra"] })).toThrow(
      "live_eval_arguments_invalid"
    );
  });
});
