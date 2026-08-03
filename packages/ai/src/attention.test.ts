import { describe, expect, it } from 'vitest';
import { sanitizeCards, type AttentionSignal } from './attention';

// sanitizeCards yra sargas tarp modelio ir DB. Šie testai fiksuoja
// pažadą: modelis gali klysti ar meluoti, bet į bazę patenka tik tai,
// ką patvirtina SQL surinkti signalai.

const signals: AttentionSignal[] = [
  {
    signal_key: 'unsent_order',
    entity_type: 'order',
    entity_id: '11111111-1111-1111-1111-111111111111',
    facts: { order_number: 'BT-2026-0011', vendor: 'Krizic Betonas UAB', days_waiting: 15 },
  },
  {
    signal_key: 'hot_request_open',
    entity_type: 'request',
    entity_id: '22222222-2222-2222-2222-222222222222',
    facts: { site: 'Ukmergės g. 220', hours_open: 30 },
  },
];

function card(over: Partial<Parameters<typeof sanitizeCards>[0][number]> = {}) {
  return {
    signal_key: 'unsent_order',
    entity_id: '11111111-1111-1111-1111-111111111111',
    rank: 1,
    severity: 'critical' as const,
    reason: 'BT-2026-0011 guli neišsiųstas 15 dienų.',
    actions: ['send_order_email' as const],
    ...over,
  };
}

describe('sanitizeCards', () => {
  it('keeps a card that matches a real signal and carries SQL facts, not model facts', () => {
    const [result] = sanitizeCards([card()], signals);
    expect(result.entity_type).toBe('order');
    expect(result.facts).toEqual(signals[0].facts);
    expect(result.actions).toEqual(['send_order_email']);
  });

  it('drops a card the SQL signals never reported (hallucinated entity)', () => {
    const invented = card({ entity_id: '99999999-9999-9999-9999-999999999999' });
    expect(sanitizeCards([invented], signals)).toEqual([]);
  });

  it('drops a card whose signal_key does not match the entity', () => {
    const mismatched = card({ signal_key: 'vendor_silent' });
    expect(sanitizeCards([mismatched], signals)).toEqual([]);
  });

  it('strips actions that are not allowed for that signal type', () => {
    // poreikiui negalima siūlyti "siųsti tiekėjui" — nėra ką siųsti
    const overreaching = card({
      signal_key: 'hot_request_open',
      entity_id: '22222222-2222-2222-2222-222222222222',
      actions: ['open_request', 'send_order_email', 'reorder_shortfall'],
    });
    const [result] = sanitizeCards([overreaching], signals);
    expect(result.actions).toEqual(['open_request']);
  });

  it('caps actions at three and removes duplicates', () => {
    const noisy = card({
      actions: ['send_order_email', 'send_order_email', 'open_order', 'contact_vendor'],
    });
    const [result] = sanitizeCards([noisy], signals);
    expect(result.actions).toEqual(['send_order_email', 'open_order', 'contact_vendor']);
  });

  it('truncates an over-long reason so one card cannot flood the board', () => {
    const [result] = sanitizeCards([card({ reason: 'x'.repeat(1000) })], signals);
    expect(result.reason).toHaveLength(300);
  });

  it('keeps only the first card when the model repeats the same entity', () => {
    const first = card({ reason: 'pirmas' });
    const duplicate = card({ reason: 'antras', rank: 2 });
    const result = sanitizeCards([first, duplicate], signals);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('pirmas');
  });

  it('sorts by rank regardless of the order the model returned', () => {
    const second = card({ rank: 5 });
    const first = card({
      signal_key: 'hot_request_open',
      entity_id: '22222222-2222-2222-2222-222222222222',
      rank: 1,
      actions: ['open_request'],
    });
    const result = sanitizeCards([second, first], signals);
    expect(result.map((c) => c.rank)).toEqual([1, 5]);
  });
});
