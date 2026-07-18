import {
  CANONICAL_INCIDENTS,
  RAW_FACT_PATHS,
  type AssistanceFacts,
  type ClaimState,
  type RawClaimFacts,
  type RawFactPatch,
  type RawFactPath,
  type RawFactValue,
  type RawLocation
} from "./claim-contract";

export {
  RAW_FACT_PATHS,
  type AssistanceFacts,
  type ClaimState,
  type FactConflict,
  type FactProvenance,
  type FactSource,
  type RawClaimFacts,
  type RawFactPatch,
  type RawFactPath,
  type RawFactValue,
  type RawLocation
} from "./claim-contract";

export type RawClaimFactsParseResult =
  | { success: true; data: RawClaimFacts }
  | { success: false; errors: string[] };

const providerTypes = ["hotel", "airline"] as const;
const reasonCategories = [
  "crew",
  "mechanical",
  "oversales",
  "weather",
  "late_inbound_aircraft",
  "other_controllable",
  "other_uncontrollable"
] as const;
const deniedBoardingKinds = ["voluntary", "involuntary"] as const;
const bookingChannels = ["direct", "ota", "portal"] as const;
const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);

const enumSchemas: Partial<Record<RawFactPath, readonly string[]>> = {
  incidentType: CANONICAL_INCIDENTS,
  providerType: providerTypes,
  reasonCategory: reasonCategories,
  deniedBoardingKind: deniedBoardingKinds,
  bookingChannel: bookingChannels
};

const integerPaths: ReadonlySet<RawFactPath> = new Set([
  "finalArrivalDelayMinutes",
  "cancellationNoticeHours",
  "replacementArrivalDelayMinutes"
]);

const arrayPaths: ReadonlySet<RawFactPath> = new Set(["expenses", "evidence"]);

const booleanPaths: ReadonlySet<RawFactPath> = new Set([
  "userInitiatedChange",
  "isOvernight",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant",
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided"
]);

function schemaForRawFactPath(path: RawFactPath): Record<string, unknown> {
  const enumValues = enumSchemas[path];
  if (enumValues) {
    return { anyOf: [{ type: "string", enum: enumValues }, { type: "null" }] };
  }
  if (integerPaths.has(path)) {
    return { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] };
  }
  if (booleanPaths.has(path)) {
    return { anyOf: [{ type: "boolean" }, { type: "null" }] };
  }
  if (arrayPaths.has(path)) {
    return {
      anyOf: [
        {
          type: "array",
          maxItems: 20,
          items: { type: "string", maxLength: 256 }
        },
        { type: "null" }
      ]
    };
  }
  return {
    anyOf: [{ type: "string", maxLength: path === "userGoal" ? 500 : 256 }, { type: "null" }]
  };
}

const rawFactPatchProperties = Object.fromEntries(
  RAW_FACT_PATHS.map((path) => [path, schemaForRawFactPath(path)])
) as Record<RawFactPath, Record<string, unknown>>;

export const rawFactPatchJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    set: {
      type: "object",
      additionalProperties: false,
      properties: rawFactPatchProperties
    }
  },
  required: ["set"]
} as const;

export function emptyRawClaimFacts(): RawClaimFacts {
  return {
    incidentType: null,
    providerType: null,
    provider: null,
    brandOrProperty: null,
    operatingCarrier: null,
    origin: { city: null, airport: null, country: null },
    destination: { city: null, airport: null, country: null },
    statedReason: null,
    reasonCategory: null,
    userInitiatedChange: null,
    scheduledFinalArrival: null,
    actualFinalArrival: null,
    finalArrivalDelayMinutes: null,
    isOvernight: null,
    cancellationNoticeHours: null,
    assistance: {
      refundOffered: null,
      refundAccepted: null,
      creditOffered: null,
      creditAccepted: null,
      reroutingOffered: null,
      reroutingAccepted: null,
      replacementTravelOffered: null,
      replacementTravelAccepted: null,
      lodgingOffered: null,
      lodgingAccepted: null,
      mealsOffered: null,
      mealsAccepted: null,
      groundTransportOffered: null,
      groundTransportAccepted: null
    },
    deniedBoardingKind: null,
    oversalesConfirmed: null,
    confirmedReservation: null,
    checkedInOnTime: null,
    atGateOnTime: null,
    documentsCompliant: null,
    replacementArrivalDelayMinutes: null,
    confirmedHotelReservation: null,
    qualifyingHotelReservation: null,
    bookingChannel: null,
    loyaltyStatus: null,
    membershipAttached: null,
    wasWalked: null,
    replacementLodgingProvided: null,
    expenses: [],
    evidence: [],
    userGoal: null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): Record<string, unknown> {
  const value = record[key];
  if (isRecord(value)) return value;
  errors.push(`${key} must be an object`);
  return {};
}

function parseNullableString(
  value: unknown,
  path: string,
  errors: string[],
  maximumCodePoints = 256
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(`${path} must be a string or null`);
    return null;
  }
  const trimmed = value.trim();
  if ([...trimmed].length > maximumCodePoints) {
    errors.push(`${path} must contain at most ${maximumCodePoints} Unicode code points`);
    return null;
  }
  return trimmed || null;
}

function parseNullableEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: string[]
): T | null {
  if (value === null) return null;
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  errors.push(`${path} must be null or one of: ${allowed.join(", ")}`);
  return null;
}

function parseNullableBoolean(value: unknown, path: string, errors: string[]): boolean | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  errors.push(`${path} must be a boolean or null`);
  return null;
}

function parseNullableNonNegativeInteger(
  value: unknown,
  path: string,
  errors: string[]
): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  errors.push(`${path} must be a non-negative integer or null`);
  return null;
}

function parseStringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings`);
    return [];
  }
  const exceedsMaximumItems = value.length > 20;
  if (exceedsMaximumItems) {
    errors.push(`${path} must contain at most 20 items`);
  }
  const hasInvalidItem = value.some(
    (item) => typeof item !== "string" || [...item.trim()].length > 256
  );
  if (hasInvalidItem) {
    errors.push(`${path} items must be strings of at most 256 Unicode code points`);
  }
  if (exceedsMaximumItems || hasInvalidItem) {
    return [];
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function parseLocation(
  value: Record<string, unknown>,
  path: "origin" | "destination",
  errors: string[]
): RawLocation {
  return {
    city: parseNullableString(value.city, `${path}.city`, errors),
    airport: parseNullableString(value.airport, `${path}.airport`, errors),
    country: parseNullableString(value.country, `${path}.country`, errors)
  };
}

function parseAssistance(value: Record<string, unknown>, errors: string[]): AssistanceFacts {
  return {
    refundOffered: parseNullableBoolean(value.refundOffered, "assistance.refundOffered", errors),
    refundAccepted: parseNullableBoolean(value.refundAccepted, "assistance.refundAccepted", errors),
    creditOffered: parseNullableBoolean(value.creditOffered, "assistance.creditOffered", errors),
    creditAccepted: parseNullableBoolean(value.creditAccepted, "assistance.creditAccepted", errors),
    reroutingOffered: parseNullableBoolean(
      value.reroutingOffered,
      "assistance.reroutingOffered",
      errors
    ),
    reroutingAccepted: parseNullableBoolean(
      value.reroutingAccepted,
      "assistance.reroutingAccepted",
      errors
    ),
    replacementTravelOffered: parseNullableBoolean(
      value.replacementTravelOffered,
      "assistance.replacementTravelOffered",
      errors
    ),
    replacementTravelAccepted: parseNullableBoolean(
      value.replacementTravelAccepted,
      "assistance.replacementTravelAccepted",
      errors
    ),
    lodgingOffered: parseNullableBoolean(value.lodgingOffered, "assistance.lodgingOffered", errors),
    lodgingAccepted: parseNullableBoolean(
      value.lodgingAccepted,
      "assistance.lodgingAccepted",
      errors
    ),
    mealsOffered: parseNullableBoolean(value.mealsOffered, "assistance.mealsOffered", errors),
    mealsAccepted: parseNullableBoolean(value.mealsAccepted, "assistance.mealsAccepted", errors),
    groundTransportOffered: parseNullableBoolean(
      value.groundTransportOffered,
      "assistance.groundTransportOffered",
      errors
    ),
    groundTransportAccepted: parseNullableBoolean(
      value.groundTransportAccepted,
      "assistance.groundTransportAccepted",
      errors
    )
  };
}

export function parseRawClaimFacts(value: unknown): RawClaimFactsParseResult {
  if (!isRecord(value)) return { success: false, errors: ["facts must be an object"] };

  const errors: string[] = [];
  const origin = nestedRecord(value, "origin", errors);
  const destination = nestedRecord(value, "destination", errors);
  const assistance = nestedRecord(value, "assistance", errors);
  const facts: RawClaimFacts = {
    incidentType: parseNullableEnum(
      value.incidentType,
      CANONICAL_INCIDENTS,
      "incidentType",
      errors
    ),
    providerType: parseNullableEnum(value.providerType, providerTypes, "providerType", errors),
    provider: parseNullableString(value.provider, "provider", errors),
    brandOrProperty: parseNullableString(value.brandOrProperty, "brandOrProperty", errors),
    operatingCarrier: parseNullableString(value.operatingCarrier, "operatingCarrier", errors),
    origin: parseLocation(origin, "origin", errors),
    destination: parseLocation(destination, "destination", errors),
    statedReason: parseNullableString(value.statedReason, "statedReason", errors),
    reasonCategory: parseNullableEnum(
      value.reasonCategory,
      reasonCategories,
      "reasonCategory",
      errors
    ),
    userInitiatedChange: parseNullableBoolean(
      value.userInitiatedChange,
      "userInitiatedChange",
      errors
    ),
    scheduledFinalArrival: parseNullableString(
      value.scheduledFinalArrival,
      "scheduledFinalArrival",
      errors
    ),
    actualFinalArrival: parseNullableString(value.actualFinalArrival, "actualFinalArrival", errors),
    finalArrivalDelayMinutes: parseNullableNonNegativeInteger(
      value.finalArrivalDelayMinutes,
      "finalArrivalDelayMinutes",
      errors
    ),
    isOvernight: parseNullableBoolean(value.isOvernight, "isOvernight", errors),
    cancellationNoticeHours: parseNullableNonNegativeInteger(
      value.cancellationNoticeHours,
      "cancellationNoticeHours",
      errors
    ),
    assistance: parseAssistance(assistance, errors),
    deniedBoardingKind: parseNullableEnum(
      value.deniedBoardingKind,
      deniedBoardingKinds,
      "deniedBoardingKind",
      errors
    ),
    oversalesConfirmed: parseNullableBoolean(
      value.oversalesConfirmed,
      "oversalesConfirmed",
      errors
    ),
    confirmedReservation: parseNullableBoolean(
      value.confirmedReservation,
      "confirmedReservation",
      errors
    ),
    checkedInOnTime: parseNullableBoolean(value.checkedInOnTime, "checkedInOnTime", errors),
    atGateOnTime: parseNullableBoolean(value.atGateOnTime, "atGateOnTime", errors),
    documentsCompliant: parseNullableBoolean(
      value.documentsCompliant,
      "documentsCompliant",
      errors
    ),
    replacementArrivalDelayMinutes: parseNullableNonNegativeInteger(
      value.replacementArrivalDelayMinutes,
      "replacementArrivalDelayMinutes",
      errors
    ),
    confirmedHotelReservation: parseNullableBoolean(
      value.confirmedHotelReservation,
      "confirmedHotelReservation",
      errors
    ),
    qualifyingHotelReservation: parseNullableBoolean(
      value.qualifyingHotelReservation,
      "qualifyingHotelReservation",
      errors
    ),
    bookingChannel: parseNullableEnum(
      value.bookingChannel,
      bookingChannels,
      "bookingChannel",
      errors
    ),
    loyaltyStatus: parseNullableString(value.loyaltyStatus, "loyaltyStatus", errors),
    membershipAttached: parseNullableBoolean(
      value.membershipAttached,
      "membershipAttached",
      errors
    ),
    wasWalked: parseNullableBoolean(value.wasWalked, "wasWalked", errors),
    replacementLodgingProvided: parseNullableBoolean(
      value.replacementLodgingProvided,
      "replacementLodgingProvided",
      errors
    ),
    expenses: parseStringArray(value.expenses, "expenses", errors),
    evidence: parseStringArray(value.evidence, "evidence", errors),
    userGoal: parseNullableString(value.userGoal, "userGoal", errors, 500)
  };

  return errors.length > 0 ? { success: false, errors } : { success: true, data: facts };
}

export type RawFactPatchParseResult =
  | { success: true; data: RawFactPatch }
  | { success: false; errors: string[] };

function parseRawFactPatchValue(
  path: RawFactPath,
  value: unknown,
  errors: string[]
): RawFactValue | null {
  const label = `set.${path}`;
  const enumValues = enumSchemas[path];
  if (enumValues) return parseNullableEnum(value, enumValues, label, errors);
  if (integerPaths.has(path)) return parseNullableNonNegativeInteger(value, label, errors);
  if (booleanPaths.has(path)) return parseNullableBoolean(value, label, errors);
  if (arrayPaths.has(path)) {
    if (value === null) return null;
    return parseStringArray(value, label, errors);
  }
  return parseNullableString(value, label, errors, path === "userGoal" ? 500 : 256);
}

export function parseRawFactPatch(value: unknown): RawFactPatchParseResult {
  if (!isRecord(value)) {
    return { success: false, errors: ["patch must be an object"] };
  }

  const errors: string[] = [];
  const topLevelKeys = Object.keys(value);
  topLevelKeys.forEach((key) => {
    if (key !== "set") errors.push(`${key} is not allowed in a raw fact patch`);
  });
  if (!Object.prototype.hasOwnProperty.call(value, "set")) {
    errors.push("set is required");
  }
  if (!isRecord(value.set)) {
    errors.push("set must be an object");
    return { success: false, errors };
  }

  const set: Partial<Record<RawFactPath, RawFactValue | null>> = {};
  Object.entries(value.set).forEach(([candidatePath, candidateValue]) => {
    if (!rawFactPathSet.has(candidatePath)) {
      errors.push(`set.${candidatePath} is not an allowed raw fact path`);
      return;
    }
    const path = candidatePath as RawFactPath;
    set[path] = parseRawFactPatchValue(path, candidateValue, errors);
  });

  return errors.length > 0 ? { success: false, errors } : { success: true, data: { set } };
}

export function writeResolutionPath(
  facts: RawClaimFacts,
  path: RawFactPath,
  value: RawFactValue | null
): RawClaimFacts {
  if (!RAW_FACT_PATHS.includes(path)) throw new Error("invalid_raw_fact_path");
  const parts = path.split(".");
  if (parts.length === 1) {
    return { ...facts, [parts[0]]: value } as RawClaimFacts;
  }
  if (parts.length !== 2) throw new Error("invalid_raw_fact_path");
  const [parent, child] = parts;
  if (parent !== "origin" && parent !== "destination" && parent !== "assistance") {
    throw new Error("invalid_raw_fact_path");
  }
  return {
    ...facts,
    [parent]: { ...facts[parent], [child]: value }
  } as RawClaimFacts;
}

export function buildResolutionFacts(state: ClaimState): RawClaimFacts {
  return state.unresolvedFields.reduce(
    (facts, path) =>
      writeResolutionPath(facts, path, path === "expenses" || path === "evidence" ? [] : null),
    structuredClone(state.facts)
  );
}
