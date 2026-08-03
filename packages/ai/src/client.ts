import Anthropic from '@anthropic-ai/sdk';

// CLAUDE.md 5 taisyklė: Anthropic API kviečiamas TIK serverio pusėje.
// Šis modulis niekada neimportuojamas į mobile/klientinį kodą.
let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('missing_api_key');
  }
  cached ??= new Anthropic();
  return cached;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};
