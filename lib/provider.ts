import {
  canonicalHotelGroupValue,
  findCanonicalProviderMatch,
  findExactCanonicalProviderMatch,
  findMentionedAirlines,
  providerComparisonKey,
  type CanonicalProviderMatch
} from "./domain/context-resolver";
import type { ProviderType } from "./types";

type KnownProviderType = Extract<ProviderType, "hotel" | "airline">;

export type ProviderMatch = CanonicalProviderMatch;

export function findProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown"
): ProviderMatch | undefined {
  return findCanonicalProviderMatch(value, providerType);
}

const airlineCodes: Record<string, string> = {
  AS: "Alaska Airlines",
  AA: "American Airlines",
  UA: "United",
  DL: "Delta",
  NH: "ANA",
  ANA: "ANA",
  CA: "Air China",
  AC: "Air Canada",
  AF: "Air France",
  LH: "Lufthansa",
  CX: "Cathay Pacific",
  JL: "Japan Airlines"
};

// Normalization of a structured provider field is exact alias lookup, never free-text extraction.
export function findExactProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown"
): ProviderMatch | undefined {
  return findExactCanonicalProviderMatch(
    airlineCodes[value.trim().toUpperCase()] ?? value,
    providerType
  );
}

/**
 * Canonicalizes a structured provider field. Unlike free-text matching, a value such as
 * "United Kingdom" is kept as written instead of being read as United Airlines.
 */
export function canonicalizeProviderName(
  value: string | null | undefined,
  providerType?: KnownProviderType | "unknown"
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return (
    airlineCodes[trimmed.toUpperCase()] ??
    findExactProviderMatch(trimmed, providerType)?.provider ??
    trimmed
  );
}

export function findTicketingProvider(text: string): string | undefined {
  // Short airline codes are matched only inside an explicit ticketing phrase;
  // English "as" elsewhere must never identify Alaska Airlines.
  const code =
    text.match(/\b(AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)\s*(?:里程)?\s*出(?:票|的)?/i) ??
    text.match(/\b(AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)[ -]issued\b/i);
  if (code) return airlineCodes[code[1].toUpperCase()];
  const explicit =
    text.match(/(?:ticket (?:was )?issued by|ticketed by|booked (?:through|via))\s+([^.;,]+)/i) ??
    text.match(/(?:通过|用)\s*([^，。；]{1,40}?)\s*(?:里程)?出票/);
  return explicit ? (canonicalizeProviderName(explicit[1], "airline") ?? undefined) : undefined;
}

export function findOperatingCarrierMatch(text: string): ProviderMatch | undefined {
  const partner =
    text.match(
      /\b(?:AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)\s*(?:里程)?出(?:票的|的)?\s*(AA|UA|DL|AS|NH|ANA|CA|AC|AF|LH|CX|JL)\b/i
    ) ??
    text.match(
      /\b(?:AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)[ -]issued\s+(AA|UA|DL|AS|NH|ANA|CA|AC|AF|LH|CX|JL)\b/i
    );
  if (partner) return findProviderMatch(airlineCodes[partner[1].toUpperCase()], "airline");
  const explicit =
    text.match(
      /(?:operated by|operating carrier\s*(?:is|:)?|实际(?:由|承运(?:航司)?[是为：:]?))\s*([^.!?;，。；]+)/i
    ) ?? text.match(/由\s*([^，。；]+?)\s*(?:实际)?承运/);
  if (explicit) {
    return findProviderMatch(
      canonicalizeProviderName(explicit[1], "airline") ?? explicit[1],
      "airline"
    );
  }
  const matches = findMentionedAirlines(text);
  // Multiple airline names cannot establish their ticketing/operating roles.
  return matches.length === 1 && !findTicketingProvider(text) ? matches[0] : undefined;
}

export function providerMatchKey(value: string | null | undefined): string {
  return providerComparisonKey(airlineCodes[value?.trim().toUpperCase() ?? ""] ?? value);
}

export function providersMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftKey = providerMatchKey(left);
  return Boolean(leftKey && leftKey === providerMatchKey(right));
}

export function canonicalHotelGroup(value: string | null | undefined): string | undefined {
  return canonicalHotelGroupValue(value);
}
