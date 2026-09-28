export type SafetyCategory =
  | "personal_injury"
  | "litigation"
  | "major_property_loss"
  | "complex_insurance";

export type SafetyAssessment = {
  category: SafetyCategory;
  message: string;
};

type SafetyRule = {
  category: SafetyCategory;
  patterns: RegExp[];
  message: string;
};

const safetyRules: SafetyRule[] = [
  {
    category: "personal_injury",
    patterns: [
      /\b(?:injur(?:y|ed)|hospitali[sz](?:ed|ation)|medical emergency|wrongful death|(?:broke|broken) (?:my |a |the )?(?:arm|leg|neck)|emergency surgery|badly hurt)\b/i,
      /(?:人身伤害|受伤|住院|医疗事故|死亡|骨折|急诊手术)/,
    ],
    message:
      "This demo does not assess personal-injury or medical claims. Preserve medical and incident records and consider qualified medical and legal help.",
  },
  {
    category: "litigation",
    patterns: [
      /\b(?:lawsuit|litigation|sue|suing|sued|take\s+.+\s+to court)\b/i,
      /(?:起诉|诉讼|律师函|打官司)/,
    ],
    message:
      "This demo does not provide litigation strategy or legal advice. Preserve the record and consider advice from a qualified lawyer in the relevant jurisdiction.",
  },
  {
    category: "major_property_loss",
    patterns: [
      /\b(?:major|large|high-value) property (?:loss|damage)\b/i,
      /\b(?:stolen|theft|missing)\b.{0,40}\b(?:laptop|jewelry|watch|passport|camera)\b/i,
      /\b(?:laptop|jewelry|watch|passport|camera)\b.{0,40}\b(?:stolen|theft|missing)\b/i,
      /(?:重大财产损失|贵重物品.{0,20}(?:被盗|失窃|丢失)|(?:电脑|珠宝|手表|护照).{0,20}(?:被盗|失窃))/,
    ],
    message:
      "This demo does not assess significant property-loss claims. Preserve receipts, photos, incident reports, and provider correspondence, and consider police, insurer, or professional help as appropriate.",
  },
  {
    category: "complex_insurance",
    patterns: [
      /\b(?:insurance|insurer)\b.{0,40}\b(?:denied|denial|dispute|bad faith|subrogation|coverage litigation)\b/i,
      /(?:保险|保险公司).{0,30}(?:拒赔|争议|代位|诉讼)/,
    ],
    message:
      "This demo does not assess complex insurance coverage disputes. Keep the policy, denial letter, claim file, and deadlines, and consider qualified insurance or legal help.",
  },
];

export function assessHighRiskClaim(
  text: string,
): SafetyAssessment | undefined {
  const normalized = text
    .trim()
    .replace(
      /\b(?:not|never|wasn't|isn't)\s+(?:injured|hospitali[sz]ed)\b/gi,
      " ",
    )
    .replace(
      /\b(?:no|without)\s+(?:injury|injuries|litigation|lawsuit)\b/gi,
      " ",
    )
    .replace(
      /\b(?:do not|don't|did not|didn't)\s+(?:want to |intend to |plan to )?(?:sue|file a lawsuit)\b/gi,
      " ",
    )
    .replace(
      /(?:没有|未|没)(?:受伤|住院)|(?:不想|不打算|不会)(?:起诉|打官司)/g,
      " ",
    );
  if (!normalized) {
    return undefined;
  }

  const rule = safetyRules.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(normalized)),
  );
  return rule ? { category: rule.category, message: rule.message } : undefined;
}

export function assessClaimSafety(
  description: string,
  facts: object,
): SafetyAssessment | undefined {
  const values = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(values)
        : value && typeof value === "object"
          ? Object.values(value).flatMap(values)
          : [];
  return [description, ...values(facts)].map(assessHighRiskClaim).find(Boolean);
}
