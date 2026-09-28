import { describe, it, expect } from "vitest";
import { policyFreshness } from "../lib/policy-freshness";
describe("policy editorial review reminders", () => {
  it("marks the 90-day boundary without claiming legal expiry", () => {
    expect(
      policyFreshness("2026-07-01", new Date("2026-09-28T00:00:00Z")).status,
    ).toBe("current");
    expect(
      policyFreshness("2026-07-01", new Date("2026-09-29T00:00:00Z")),
    ).toEqual({ status: "due", dueOn: "2026-09-29" });
  });
  it.each(["garbage", "2026-02-30", "2027-01-01"])(
    "does not trust malformed or future dates: %s",
    (date) => {
      expect(
        policyFreshness(date, new Date("2026-09-28T00:00:00Z")).status,
      ).toBe("unknown");
    },
  );
});
