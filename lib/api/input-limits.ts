export const INPUT_LIMITS = {
  bodyBytes: 32 * 1_024,
  messageCodePoints: 4_000,
  ordinaryStringCodePoints: 256,
  userGoalCodePoints: 500,
  collectionItems: 20,
  collectionItemCodePoints: 256,
  modelOutputTokens: 1_200,
  modelOutputBytes: 64 * 1_024
} as const;
