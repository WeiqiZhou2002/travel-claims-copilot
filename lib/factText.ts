// Text helpers return candidates, never entitlement decisions.
const numbers: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

export function affirmativeDisruptionText(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /\b(?:not|never|wasn't|was not|isn't|is not)\s+(?:actually\s+)?(?:cancelled|canceled|delayed|oversold|overbooked)\b/g,
      " "
    )
    .replace(/(?:没有|并未|没|未)(?:被)?(?:取消|延误|超售)/g, " ");
}

export function arrivalDelayFromText(text: string, allowBareAnswer = false): number | null {
  const normalized = text.toLowerCase();
  const duration =
    /(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(hours?|hrs?|小时|minutes?|mins?|分钟)/g;
  const candidates = [...normalized.matchAll(duration)].flatMap((match) => {
    const start = match.index!;
    const before =
      normalized
        .slice(0, start)
        .split(/[.!?;,，。；]/)
        .pop() ?? "";
    const after = normalized.slice(start + match[0].length).split(/[.!?;,，。；]/)[0];
    if (/^\s*(?:early|before|提前)/.test(after) || /提前\s*$/.test(before)) return [];
    const explicitArrival =
      /(?:arrived|reached).*(?:destination|late)?|最终.*(?:晚到|到达|抵达)|晚到/.test(before) ||
      /^\s*late\b/.test(after);
    const delay = /(?:delayed|delay(?: of)?|延误|晚点)\s*(?:by |for )?$/.test(before);
    const bare = allowBareAnswer && normalized.trim() === match[0];
    if (!explicitArrival && !delay && !bare) return [];
    const value = numbers[match[1]] ?? Number(match[1]);
    return [
      {
        minutes: Math.round(value * (/^(?:hour|hr|小时)/.test(match[2]) ? 60 : 1)),
        explicitArrival
      }
    ];
  });
  const preferred = candidates.filter((candidate) => candidate.explicitArrival);
  const values = [
    ...new Set((preferred.length ? preferred : candidates).map((candidate) => candidate.minutes))
  ];
  return values.length === 1 ? values[0] : null;
}
