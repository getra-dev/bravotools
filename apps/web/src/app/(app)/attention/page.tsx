import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { refreshAttentionAction, dismissAttentionCardAction } from '@/lib/attention-actions';

const STAMP =
  'inline-block rounded-stamp border px-1.5 py-px font-mono text-[10px] uppercase tracking-[1px]';
const H2 = 'font-mono text-[10px] uppercase tracking-[1.5px] text-dim';
const ERROR_KEYS = new Set(['not_allowed', 'no_api_key', 'ai_failed', 'save_failed']);
const NOTICE_KEYS = new Set(['refreshed', 'empty', 'dismissed']);

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-hot/50 text-hot',
  warning: 'border-amber/50 text-amber',
  info: 'border-line text-dim',
};

type Facts = Record<string, string | number | boolean | null>;

// Nuorodas sudeda serveris pagal veiksmo raktą — modelis jų negamina.
function actionHref(key: string, entityId: string, facts: Facts): string | null {
  const orderId = typeof facts.order_id === 'string' ? facts.order_id : null;
  const vendorId = typeof facts.vendor_id === 'string' ? facts.vendor_id : null;
  switch (key) {
    case 'open_order':
    case 'send_order_email':
    case 'reorder_shortfall':
      return `/orders/${orderId ?? entityId}`;
    case 'set_line_eta':
      return '/awaiting';
    case 'plan_delivery':
      return '/deliveries';
    case 'open_request':
      return '/requests';
    case 'contact_vendor':
      return vendorId ? `/vendors/${vendorId}` : null;
    default:
      return null;
  }
}

function factLine(signalKey: string, facts: Facts): string {
  const bits: (string | null)[] = [];
  if (facts.order_number) bits.push(String(facts.order_number));
  if (facts.description) bits.push(String(facts.description));
  if (facts.site) bits.push(String(facts.site));
  if (facts.vendor) bits.push(String(facts.vendor));
  if (signalKey === 'vendor_silent' && facts.hours_silent) bits.push(`${facts.hours_silent} h`);
  if (signalKey === 'eta_overdue' && facts.days_late) bits.push(`+${facts.days_late} d`);
  if (signalKey === 'unsent_order' && facts.days_waiting) bits.push(`${facts.days_waiting} d`);
  if (facts.qty_affected) bits.push(`${facts.qty_affected}`);
  return bits.filter(Boolean).join(' · ');
}

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const { notice, error } = await searchParams;
  const t = await getTranslations('attention');
  const isSupply = ['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role);

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;

  const [{ data: cards }, { data: runs }] = await Promise.all([
    supabase
      .from('attention_cards')
      .select('id, signal_key, entity_type, entity_id, rank, severity, reason, actions, facts')
      .eq('org_id', orgId)
      .eq('status', 'open')
      .order('rank'),
    supabase
      .from('ai_runs')
      .select('model, status, input_tokens, output_tokens, latency_ms, created_at')
      .eq('org_id', orgId)
      .eq('status', 'ok')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const lastRun = (runs ?? [])[0];

  return (
    <main>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        {isSupply ? (
          <form action={refreshAttentionAction} className="ml-auto">
            <button className="h-9 rounded-button bg-ink px-3 text-sm font-bold text-paper">
              {t('refresh')}
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-1 max-w-2xl text-xs text-dim">{t('hint')}</p>

      {notice ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-ok/40 bg-ok/10 px-3 py-2 text-sm">
          {t(`notices.${NOTICE_KEYS.has(notice) ? notice : 'refreshed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 max-w-2xl rounded-button-sm border border-hot/40 bg-hot/10 px-3 py-2 text-sm">
          {t(`errors.${ERROR_KEYS.has(error) ? error : 'save_failed'}` as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {(cards ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-dim">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {(cards ?? []).map((card) => {
            const facts = (card.facts ?? {}) as Facts;
            const actions = (card.actions ?? []) as string[];
            return (
              <li
                key={card.id}
                className="rounded-card border border-line/30 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`${STAMP} ${SEVERITY_STYLE[card.severity] ?? SEVERITY_STYLE.info}`}
                  >
                    {t(`severity.${card.severity}` as Parameters<typeof t>[0])}
                  </span>
                  <span className={`${STAMP} border-line text-dim`}>
                    {t(`signals.${card.signal_key}` as Parameters<typeof t>[0])}
                  </span>
                  <span className="font-mono text-[11px] text-dim">{factLine(card.signal_key, facts)}</span>
                </div>

                <p className="mt-2 text-sm">{card.reason}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {actions.map((key) => {
                    const href = actionHref(key, card.entity_id, facts);
                    if (!href) return null;
                    return (
                      <Link
                        key={key}
                        href={href}
                        className="h-8 rounded-button-sm border border-line/40 px-3 text-xs font-bold leading-8 hover:bg-paper"
                      >
                        {t(`actions.${key}` as Parameters<typeof t>[0])}
                      </Link>
                    );
                  })}
                  {isSupply ? (
                    <form action={dismissAttentionCardAction} className="ml-auto">
                      <input type="hidden" name="cardId" value={card.id} />
                      <button className="text-xs text-dim hover:text-hot">{t('dismiss')}</button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lastRun ? (
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[1px] text-dim">
          {t('lastRun', {
            model: lastRun.model,
            date: new Date(lastRun.created_at).toLocaleString('lt-LT'),
            tokens: (lastRun.input_tokens ?? 0) + (lastRun.output_tokens ?? 0),
            seconds: Math.round((lastRun.latency_ms ?? 0) / 100) / 10,
          })}
        </p>
      ) : (
        <p className={`mt-8 ${H2}`}>{t('neverRun')}</p>
      )}
    </main>
  );
}
