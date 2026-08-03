// Vienintelė vieta, kur gyvena modelių pasirinkimas. Nori pigiau ar
// protingiau — keiti čia, ne iškvietimo vietose. ID tikslūs, be datų
// priesagų (žr. Anthropic modelių sąrašą).
export const MODELS = {
  // sprendimų kokybė svarbi (reitingavimas, sutikrinimas)
  reasoning: 'claude-opus-5',
  // pigus klasifikavimas / trumpi ištraukimai
  cheap: 'claude-haiku-4-5',
} as const;

export type ModelTier = keyof typeof MODELS;

// ENV override'as be kodo keitimo: BRAVOTOOLS_AI_MODEL=claude-haiku-4-5
export function modelFor(tier: ModelTier): string {
  return process.env.BRAVOTOOLS_AI_MODEL ?? MODELS[tier];
}
