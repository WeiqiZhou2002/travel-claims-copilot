// A process-local demo guard. Multi-instance deployments need a shared gateway
// quota in addition to this bound; untrusted forwarding headers are not identities.
let minuteStart = Date.now();
let requests = 0;
let active = 0;

export function acquireIntakeCapacity(): (() => void) | undefined {
  const now = Date.now();
  if (now - minuteStart >= 60_000) { minuteStart = now; requests = 0; }
  if (active >= 4 || requests >= 60) return undefined;
  active++;
  requests++;
  let released = false;
  return () => { if (!released) { released = true; active--; } };
}
