import type { AnalysisResult, Case, IssueType, Policy, Script, SuggestedAsks } from "./types";

const issueAliases: Record<IssueType, IssueType[]> = {
  hotel_walk: ["hotel_walk"],
  controllable_airline_cancellation: [
    "controllable_airline_cancellation",
    "controllable_airline_delay"
  ],
  controllable_airline_delay: [
    "controllable_airline_delay",
    "controllable_airline_cancellation"
  ],
  eu261_delay_or_cancellation: ["eu261_delay_or_cancellation"],
  unknown: []
};

const suggestedAsksByIssue: Record<IssueType, SuggestedAsks> = {
  hotel_walk: {
    conservative: [
      "Comparable nearby hotel for the night",
      "Transportation to the alternate hotel"
    ],
    standard: [
      "Comparable nearby hotel",
      "Transportation reimbursement",
      "Applicable cash or points under the hotel guarantee"
    ],
    aggressive: [
      "Full alternate lodging reimbursement",
      "Transportation and incidental expenses",
      "Highest applicable guarantee compensation for brand and status"
    ]
  },
  controllable_airline_cancellation: {
    conservative: ["Rebooking on the next available flight", "Meal voucher if waiting"],
    standard: [
      "Rebooking",
      "Hotel accommodation for overnight disruption",
      "Meals and ground transportation"
    ],
    aggressive: [
      "Reimbursement for reasonable hotel, meal, and transport costs",
      "Travel credit or miles for the service failure",
      "DOT complaint review if commitments were denied"
    ]
  },
  controllable_airline_delay: {
    conservative: ["Rebooking help", "Meal voucher during the delay"],
    standard: [
      "Meal voucher",
      "Hotel accommodation if overnight",
      "Ground transportation to and from the hotel"
    ],
    aggressive: [
      "Reimbursement for out-of-pocket hotel, meal, and transport costs",
      "Travel credit or miles for the disruption",
      "Written explanation of controllability"
    ]
  },
  eu261_delay_or_cancellation: {
    conservative: ["Care expenses such as meals and hotel if applicable"],
    standard: [
      "Refund or rerouting if applicable",
      "Care expenses",
      "Written delay or cancellation reason"
    ],
    aggressive: [
      "Fixed EU261 compensation if eligibility is met",
      "Care expense reimbursement",
      "Escalation to the relevant national enforcement body"
    ]
  },
  unknown: {
    conservative: ["Ask the provider to explain the applicable policy in writing"],
    standard: [
      "Request reimbursement for documented reasonable expenses",
      "Ask for the provider's written basis for denial or approval"
    ],
    aggressive: [
      "Escalate with a concise timeline and receipts",
      "File with the relevant regulator only after confirming jurisdiction"
    ]
  }
};

const evidenceByIssue: Record<IssueType, string[]> = {
  hotel_walk: [
    "Reservation confirmation number",
    "Screenshot showing the active confirmed booking",
    "Loyalty account number and status",
    "Property notes confirming no room was available",
    "Alternate hotel, transportation, and incidental receipts"
  ],
  controllable_airline_cancellation: [
    "Cancellation notice",
    "Boarding pass or ticket receipt",
    "Written reason for cancellation if available",
    "Hotel, meal, and ground transportation receipts",
    "Screenshots of airline chat or airport desk response"
  ],
  controllable_airline_delay: [
    "Delay notification",
    "Boarding pass or ticket receipt",
    "Actual departure and arrival times",
    "Hotel, meal, and ground transportation receipts",
    "Screenshots of any airline voucher denial"
  ],
  eu261_delay_or_cancellation: [
    "Full itinerary and ticket receipt",
    "Scheduled and actual arrival times",
    "Departure and arrival airport details",
    "Airline's written delay or cancellation reason",
    "Receipts for care expenses"
  ],
  unknown: [
    "Booking confirmation",
    "Provider messages",
    "Timeline of what happened",
    "Receipts for out-of-pocket costs",
    "Names or screenshots from support interactions"
  ]
};

const cautionsByIssue: Record<IssueType, string[]> = {
  hotel_walk: [
    "Brand guarantees often depend on membership, brand, status, and whether the reservation was booked through an eligible channel.",
    "Ask for written confirmation before leaving the property if possible."
  ],
  controllable_airline_cancellation: [
    "DOT dashboard commitments generally turn on whether the airline treats the disruption as controllable.",
    "Keep receipts if the airline cannot issue vouchers immediately."
  ],
  controllable_airline_delay: [
    "Delay rights vary by airline commitment, cause, and length of delay.",
    "A weather or air traffic control delay may weaken a controllable-disruption claim."
  ],
  eu261_delay_or_cancellation: [
    "EU261 eligibility depends on route, carrier, delay length at arrival, and extraordinary-circumstance defenses.",
    "Fixed compensation is separate from care, refund, or rerouting rights."
  ],
  unknown: [
    "This demo could not confidently classify the issue from the current keywords.",
    "Add the provider name, disruption reason, route or property, timing, and expenses to improve the analysis."
  ]
};

export function classifyIssue(input: string): IssueType {
  const text = input.toLowerCase();

  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term));

  const euSignal = hasAny(["eu261", "europe", "european union", " eu "]) || /\beu\b/.test(text);
  const longDelaySignal = hasAny(["delayed 3 hours", "delay 3 hours", "3 hour delay", "three hour delay"]);
  if ((euSignal && hasAny(["delay", "delayed", "cancellation", "cancelled", "canceled"])) || longDelaySignal) {
    return "eu261_delay_or_cancellation";
  }

  if (hasAny(["united", "airline", "crew", "cancellation", "cancelled", "canceled", "delay", "overnight"])) {
    if (hasAny(["cancellation", "cancelled", "canceled"])) {
      return "controllable_airline_cancellation";
    }

    return "controllable_airline_delay";
  }

  if (hasAny(["marriott", "sheraton", "hotel", "walk", "no room", "oversold"])) {
    return "hotel_walk";
  }

  return "unknown";
}

export function buildAnalysisResult(
  description: string,
  policies: Policy[],
  cases: Case[],
  scripts: Script[]
): AnalysisResult {
  const issueType = classifyIssue(description);
  const aliases = issueAliases[issueType];
  const officialBasis = policies.filter((policy) =>
    aliases.includes(policy.issue_type as IssueType)
  );
  const similarCases = cases.filter((item) => aliases.includes(item.issue_type as IssueType));
  const matchedScripts = scripts.filter((script) =>
    aliases.includes(script.issue_type as IssueType)
  );
  const strength = issueType === "unknown" ? "low" : officialBasis.length > 0 ? "high" : "medium";

  return {
    issueType,
    strength,
    officialBasis,
    similarCases,
    suggestedAsks: suggestedAsksByIssue[issueType],
    evidenceChecklist: evidenceByIssue[issueType],
    scripts: matchedScripts,
    cautions: cautionsByIssue[issueType]
  };
}
