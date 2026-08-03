'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { rankAttentionSignals, hasAnthropicKey, type AttentionSignal } from '@bravotools/ai';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

export async function refreshAttentionAction() {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) {
    redirect('/attention?error=not_allowed');
  }
  if (!hasAnthropicKey()) redirect('/attention?error=no_api_key');

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;

  // 1) faktai iš DB (be AI) — vienintelis tiesos šaltinis
  const { data: signals, error: signalError } = await supabase.rpc('collect_attention_signals', {
    target_org: orgId,
  });
  if (signalError) {
    redirect(`/attention?error=${signalError.message.includes('not_allowed') ? 'not_allowed' : 'save_failed'}`);
  }

  const list = (signals ?? []) as AttentionSignal[];
  if (list.length === 0) {
    // nėra išimčių — nemokamai išvalom lentą, modelio nekviečiam
    await supabase.rpc('save_attention_cards', {
      args: { org_id: orgId, model: 'none', cards: [], input_tokens: 0, output_tokens: 0 },
    });
    redirect('/attention?notice=empty');
  }

  // 2) AI reitinguoja ir paaiškina
  const locale = await getLocale();
  let ranked;
  try {
    ranked = await rankAttentionSignals(list, locale);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ai_failed';
    await supabase.rpc('save_attention_cards', {
      args: {
        org_id: orgId,
        model: 'unknown',
        status: 'error',
        error: message.slice(0, 500),
        cards: [],
      },
    });
    redirect('/attention?error=ai_failed');
  }

  // 3) rezultatas + token'ai į įrodymų žurnalą
  const { error: saveError } = await supabase.rpc('save_attention_cards', {
    args: {
      org_id: orgId,
      endpoint: ranked.promptVersion,
      model: ranked.usage.model,
      input_tokens: String(ranked.usage.inputTokens),
      output_tokens: String(ranked.usage.outputTokens),
      latency_ms: String(ranked.usage.latencyMs),
      cards: ranked.cards,
    },
  });
  if (saveError) redirect('/attention?error=save_failed');

  redirect('/attention?notice=refreshed');
}

export async function dismissAttentionCardAction(formData: FormData) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('dismiss_attention_card', {
    args: {
      card_id: String(formData.get('cardId') ?? ''),
      reason: String(formData.get('reason') ?? '').trim(),
    },
  });
  if (error) {
    redirect(`/attention?error=${error.message.includes('not_allowed') ? 'not_allowed' : 'save_failed'}`);
  }
  redirect('/attention?notice=dismissed');
}
