import type { PolicyRouteRegion, ProviderType } from "./types";

type KnownProviderType = Extract<ProviderType, "hotel" | "airline">;

type ProviderDefinition = {
  provider: string;
  providerType: KnownProviderType;
  operatingCarrierRegion?: PolicyRouteRegion;
  terms: string[];
};

export type ProviderMatch = Pick<
  ProviderDefinition,
  "provider" | "providerType" | "operatingCarrierRegion"
>;

const providerDefinitions: ProviderDefinition[] = [
  {
    provider: "ANA",
    providerType: "airline",
    terms: ["ana", "all nippon airways", "全日空"],
  },
  {
    provider: "Cathay Pacific",
    providerType: "airline",
    terms: ["cathay pacific", "国泰"],
  },
  {
    provider: "Japan Airlines",
    providerType: "airline",
    terms: ["japan airlines", "jal", "日航"],
  },
  {
    provider: "American Airlines",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: [
      "american airlines",
      "american flight",
      "aa flight",
      "aa",
      "美国航空",
      "美航",
    ],
  },
  {
    provider: "United",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["united airlines", "united flight", "united", "ua", "美联航"],
  },
  {
    provider: "Delta",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["delta air lines", "delta flight", "delta", "dl", "达美"],
  },
  {
    provider: "Alaska Airlines",
    providerType: "airline",
    operatingCarrierRegion: "US",
    terms: ["alaska airlines", "alaska flight", "阿拉斯加航空"],
  },
  {
    provider: "Air France",
    providerType: "airline",
    operatingCarrierRegion: "EU_EEA_CH",
    terms: ["air france", "af flight", "法航"],
  },
  {
    provider: "Lufthansa",
    providerType: "airline",
    operatingCarrierRegion: "EU_EEA_CH",
    terms: ["lufthansa", "lh flight", "汉莎"],
  },
  {
    provider: "British Airways",
    providerType: "airline",
    operatingCarrierRegion: "UK",
    terms: ["british airways", "ba flight", "英国航空", "英航"],
  },
  {
    provider: "Virgin Atlantic",
    providerType: "airline",
    operatingCarrierRegion: "UK",
    terms: ["virgin atlantic", "维珍航空"],
  },
  {
    provider: "Air Canada",
    providerType: "airline",
    operatingCarrierRegion: "CA",
    terms: ["air canada", "加拿大航空", "加航"],
  },
  {
    provider: "Qantas",
    providerType: "airline",
    operatingCarrierRegion: "AU",
    terms: ["qantas", "澳洲航空"],
  },
  {
    provider: "Air China",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["air china", "中国国际航空", "国航"],
  },
  {
    provider: "China Eastern Airlines",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["china eastern", "东航"],
  },
  {
    provider: "China Southern Airlines",
    providerType: "airline",
    operatingCarrierRegion: "CN",
    terms: ["china southern", "南航"],
  },
  {
    provider: "Hilton Grand Vacations",
    providerType: "hotel",
    terms: ["hilton grand vacations", "hgv"],
  },
  {
    provider: "Marriott",
    providerType: "hotel",
    terms: [
      "marriott bonvoy",
      "autograph collection",
      "renaissance",
      "marriott",
      "sheraton",
      "westin",
      "bonvoy",
      "万豪旅享家",
      "万豪",
      "万豪酒店",
      "喜来登",
      "威斯汀",
    ],
  },
  {
    provider: "Hyatt",
    providerType: "hotel",
    terms: [
      "destination by hyatt",
      "unbound collection",
      "hyatt",
      "andaz",
      "凯悦",
      "安达仕",
    ],
  },
  {
    provider: "Hilton",
    providerType: "hotel",
    terms: [
      "home2 suites",
      "hilton",
      "hampton",
      "conrad",
      "waldorf astoria",
      "lxr",
      "希尔顿",
      "欢朋",
      "康莱德",
      "华尔道夫",
    ],
  },
  {
    provider: "IHG",
    providerType: "hotel",
    terms: [
      "intercontinental hotels group",
      "intercontinental",
      "holiday inn",
      "crowne plaza",
      "ihg",
      "洲际酒店集团",
      "皇冠假日",
      "假日酒店",
      "洲际",
    ],
  },
  {
    provider: "Accor",
    providerType: "hotel",
    terms: ["accor", "fairmont", "sofitel", "雅高", "费尔蒙", "索菲特"],
  },
];

function normalizeProviderText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function termIndex(text: string, term: string): number {
  if (/^[a-z0-9]+$/i.test(term) && term.length <= 3) {
    return text.search(new RegExp(`\\b${term}\\b`, "i"));
  }

  return text.indexOf(term);
}

export function findProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown",
): ProviderMatch | undefined {
  const normalized = normalizeProviderText(value).replaceAll(
    "united states",
    "",
  );
  const match = providerDefinitions
    .filter(
      (definition) =>
        !providerType ||
        providerType === "unknown" ||
        definition.providerType === providerType,
    )
    .flatMap((definition) =>
      definition.terms.map((term) => ({
        definition,
        index: termIndex(normalized, normalizeProviderText(term)),
        termLength: term.length,
      })),
    )
    .filter(({ index }) => index >= 0)
    .sort(
      (left, right) =>
        left.index - right.index || right.termLength - left.termLength,
    )[0]?.definition;

  return match
    ? {
        provider: match.provider,
        providerType: match.providerType,
        operatingCarrierRegion: match.operatingCarrierRegion,
      }
    : undefined;
}

export function canonicalizeProviderName(
  value: string | null | undefined,
  providerType?: KnownProviderType | "unknown",
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return (
    airlineCodes[trimmed.toUpperCase()] ??
    findExactProviderMatch(trimmed, providerType)?.provider ??
    trimmed
  );
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
  JL: "Japan Airlines",
};

export function findTicketingProvider(text: string): string | undefined {
  // Short airline codes are matched only inside an explicit ticketing phrase;
  // English "as" elsewhere must never identify Alaska Airlines.
  const code =
    text.match(
      /\b(AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)\s*(?:里程)?\s*出(?:票|的)?/i,
    ) ?? text.match(/\b(AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)[ -]issued\b/i);
  if (code) return airlineCodes[code[1].toUpperCase()];
  const explicit =
    text.match(
      /(?:ticket (?:was )?issued by|ticketed by|booked (?:through|via))\s+([^.;,]+)/i,
    ) ?? text.match(/(?:通过|用)\s*([^，。；]{1,40}?)\s*(?:里程)?出票/);
  return explicit
    ? (canonicalizeProviderName(explicit[1], "airline") ?? undefined)
    : undefined;
}

export function findOperatingCarrierMatch(
  text: string,
): ProviderMatch | undefined {
  const partner =
    text.match(
      /\b(?:AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)\s*(?:里程)?出(?:票的|的)?\s*(AA|UA|DL|AS|NH|ANA|CA|AC|AF|LH|CX|JL)\b/i,
    ) ??
    text.match(
      /\b(?:AS|AA|UA|DL|NH|ANA|CA|AC|AF|LH|CX|JL)[ -]issued\s+(AA|UA|DL|AS|NH|ANA|CA|AC|AF|LH|CX|JL)\b/i,
    );
  if (partner)
    return findProviderMatch(airlineCodes[partner[1].toUpperCase()], "airline");
  const explicit =
    text.match(
      /(?:operated by|operating carrier\s*(?:is|:)?|实际(?:由|承运(?:航司)?[是为：:]?))\s*([^.!?;，。；]+)/i,
    ) ?? text.match(/由\s*([^，。；]+?)\s*(?:实际)?承运/);
  if (explicit)
    return findProviderMatch(
      canonicalizeProviderName(explicit[1], "airline") ?? explicit[1],
      "airline",
    );
  const matches = providerDefinitions.filter(
    (provider) =>
      provider.providerType === "airline" &&
      provider.terms.some(
        (term) =>
          termIndex(
            normalizeProviderText(text).replaceAll("united states", ""),
            normalizeProviderText(term),
          ) >= 0,
      ),
  );
  // Multiple airline names cannot establish their ticketing/operating roles.
  return matches.length === 1 && !findTicketingProvider(text)
    ? findProviderMatch(matches[0].provider, "airline")
    : undefined;
}

export function providerMatchKey(value: string | null | undefined): string {
  const canonical = canonicalizeProviderName(value);
  if (!canonical) {
    return "";
  }

  return normalizeProviderText(canonical)
    .replace(
      /\b(airline|airlines|air lines|hotel|hotels|resort|resorts)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function providersMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftKey = providerMatchKey(left);
  return Boolean(leftKey && leftKey === providerMatchKey(right));
}

export function canonicalHotelGroup(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  return findProviderMatch(value, "hotel")?.provider;
}

// Normalization of a structured provider field is exact alias lookup, never free-text extraction.
export function findExactProviderMatch(
  value: string,
  providerType?: KnownProviderType | "unknown",
): ProviderMatch | undefined {
  const normalized = normalizeProviderText(
    airlineCodes[value.trim().toUpperCase()] ?? value,
  );
  const definition = providerDefinitions.find(
    (d) =>
      (!providerType ||
        providerType === "unknown" ||
        d.providerType === providerType) &&
      [d.provider, ...d.terms].some(
        (term) => normalizeProviderText(term) === normalized,
      ),
  );
  return definition
    ? {
        provider: definition.provider,
        providerType: definition.providerType,
        operatingCarrierRegion: definition.operatingCarrierRegion,
      }
    : undefined;
}
