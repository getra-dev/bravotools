import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic, type AiUsage } from './client';
import { modelFor } from './models';
import { ATTENTION_QUEUE_PROMPT, ATTENTION_QUEUE_VERSION } from './prompts/attention-queue';

// Signalus renka SQL (collect_attention_signals) — modeliui siunčiama
// tik tai. Jokių kitų faktų jis neturi ir negali sugalvoti.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AttentionSignal = {
  signal_key: string;
  entity_type: string;
  entity_id: string;
  facts: Record<string, JsonValue>;
};

// Fiksuotas veiksmų katalogas. Modelis renkasi TIK raktą; nuorodą ir
// šoninį efektą sudeda serveris — todėl modelis negali nei sugalvoti
// URL, nei ką nors išsiųsti pats.
export const ACTION_KEYS = [
  'open_order',
  'send_order_email',
  'set_line_eta',
  'reorder_shortfall',
  'plan_delivery',
  'open_request',
  'contact_vendor',
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

const ALLOWED_ACTIONS: Record<string, ActionKey[]> = {
  vendor_silent: ['contact_vendor', 'open_order', 'send_order_email'],
  eta_overdue: ['open_order', 'set_line_eta', 'contact_vendor', 'reorder_shortfall'],
  open_issue: ['open_order', 'reorder_shortfall', 'contact_vendor'],
  hot_request_open: ['open_request'],
  stale_request: ['open_request'],
  unsent_order: ['send_order_email', 'open_order', 'contact_vendor'],
  possible_duplicate: ['open_request'],
};

const CardSchema = z.object({
  signal_key: z.string(),
  entity_id: z.string(),
  rank: z.number().int(),
  severity: z.enum(['critical', 'warning', 'info']),
  reason: z.string(),
  actions: z.array(z.enum(ACTION_KEYS)),
});

const ResultSchema = z.object({ cards: z.array(CardSchema) });

export type AttentionCard = z.infer<typeof CardSchema> & {
  facts: Record<string, JsonValue>;
  entity_type: string;
};

export type RankResult = { cards: AttentionCard[]; usage: AiUsage; promptVersion: string };

export async function rankAttentionSignals(
  signals: AttentionSignal[],
  locale: string,
): Promise<RankResult> {
  // Reitingavimas — pigus darbas: faktus jau surinko SQL, modeliui lieka
  // surikiuoti ir parašyti sakinį. Brangesnį modelį imk per ENV.
  const model = modelFor('cheap');
  const started = Date.now();

  // Haiku nepriima `effort` (grąžina 400) — siunčiam tik ten, kur veikia.
  const supportsEffort = !model.startsWith('claude-haiku');

  const response = await anthropic().messages.parse({
    model,
    max_tokens: 16000,
    system: ATTENTION_QUEUE_PROMPT,
    output_config: {
      ...(supportsEffort ? { effort: 'medium' as const } : {}),
      format: zodOutputFormat(ResultSchema),
    },
    messages: [
      {
        role: 'user',
        content: [
          `Language for reason: ${locale === 'lt' ? 'Lithuanian' : 'English'}`,
          `Today: ${new Date().toISOString().slice(0, 10)}`,
          '',
          'Allowed actions per signal type:',
          JSON.stringify(ALLOWED_ACTIONS, null, 2),
          '',
          'Signals:',
          JSON.stringify(signals, null, 2),
        ].join('\n'),
      },
    ],
  });

  const usage: AiUsage = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs: Date.now() - started,
  };

  const parsed = response.parsed_output;
  if (!parsed) throw new Error('invalid_ai_output');

  // Modelio išvestis niekada nepatenka į DB neperfiltruota: kortelė
  // priimama tik jei atitinka realų signalą, o veiksmai — tik leistini
  // tam signalo tipui.
  const byEntity = new Map(signals.map((s) => [`${s.signal_key}:${s.entity_id}`, s]));
  const cards: AttentionCard[] = [];
  for (const card of parsed.cards) {
    const signal = byEntity.get(`${card.signal_key}:${card.entity_id}`);
    if (!signal) continue;
    const allowed = ALLOWED_ACTIONS[card.signal_key] ?? [];
    cards.push({
      ...card,
      reason: card.reason.slice(0, 300),
      actions: card.actions.filter((a) => allowed.includes(a)).slice(0, 3),
      entity_type: signal.entity_type,
      facts: signal.facts,
    });
  }

  cards.sort((a, b) => a.rank - b.rank);
  return { cards, usage, promptVersion: ATTENTION_QUEUE_VERSION };
}
