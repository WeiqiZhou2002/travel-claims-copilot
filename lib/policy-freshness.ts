// Editorial review cadence only; being due for review is not a legal expiry date.
export function policyFreshness(lastChecked: string, now = new Date(), intervalDays = 90) {
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(lastChecked) ? new Date(`${lastChecked}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(checked.getTime()) || checked.toISOString().slice(0,10) !== lastChecked || checked > now) {
    return {status:"unknown" as const, dueOn:null};
  }
  const due = new Date(checked.getTime() + intervalDays * 86400000);
  return {status:now >= due ? "due" as const : "current" as const,dueOn:due.toISOString().slice(0,10)};
}
