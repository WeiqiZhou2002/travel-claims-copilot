import { describe, expect, it } from "vitest";

import { verifyDemoAccess } from "../../lib/access/demo-access";

describe("demo access", () => {
  it("requires consent and an exact configured code", () => {
    expect(verifyDemoAccess({ consent: false, suppliedCode: "demo", configuredCode: "demo" })).toBe(
      false
    );
    expect(verifyDemoAccess({ consent: true, suppliedCode: "demo", configuredCode: "demo" })).toBe(
      true
    );
    expect(verifyDemoAccess({ consent: true, suppliedCode: " demo", configuredCode: "demo" })).toBe(
      false
    );
    expect(
      verifyDemoAccess({ consent: true, suppliedCode: "demo", configuredCode: undefined })
    ).toBe(false);
    expect(
      verifyDemoAccess({ consent: true, suppliedCode: "Ｄｅｍｏ", configuredCode: "Demo" })
    ).toBe(false);
    expect(verifyDemoAccess({ consent: true, suppliedCode: "demo", configuredCode: "Demo" })).toBe(
      false
    );
    expect(verifyDemoAccess({ consent: true, suppliedCode: "", configuredCode: "" })).toBe(false);
  });
});
