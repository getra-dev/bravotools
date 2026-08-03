'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';
import { renderOrderPdf, type OrderPdfData } from './orders/pdf';
import { sendMail } from './mailer';

const CURRENCY = 'EUR';

export async function sendOrderToVendorAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  if (!['owner', 'admin', 'supply_manager'].includes(ctx.activeOrg.role)) {
    redirect('/orders?error=not_allowed');
  }
  const orderId = String(formData.get('orderId') ?? '');
  const supabase = await getSupabaseServer();

  const { data: order } = await supabase
    .from('orders')
    .select(
      `id, org_id, order_number, status, is_hot, needed_by, notes,
       site:locations(name),
       vendor:vendors!orders_vendor_id_fkey(id, name, email),
       buyer:profiles!orders_requested_by_fkey(full_name),
       org:organizations(name),
       items:order_items(description, quantity, unit, unit_price)`,
    )
    .eq('id', orderId)
    .maybeSingle();

  if (!order) redirect('/orders?error=save_failed');
  if (order.status === 'delivered' || order.status === 'cancelled') {
    redirect('/orders?error=order_closed');
  }
  // SPEC 3.6: route the PO to the contact who covers this order's material
  // categories; fall back to the primary contact, then to vendors.email
  const { data: routed } = await supabase.rpc('pick_order_contact', { order_id: order.id });
  const route = (routed ?? null) as {
    to_address: string | null;
    contact_id: string | null;
    contact_name: string | null;
    match: string;
  } | null;

  const toAddress = route?.to_address?.trim() || order.vendor?.email?.trim();
  if (!order.vendor || !toAddress) redirect('/orders?error=no_vendor_email');

  const tp = await getTranslations('orders.pdf');

  const labels: OrderPdfData['labels'] = {
    title: tp('title'),
    orderNo: tp('orderNo'),
    date: tp('date'),
    neededBy: tp('neededBy'),
    vendor: tp('vendor'),
    shipTo: tp('shipTo'),
    buyer: tp('buyer'),
    lineNo: tp('lineNo'),
    description: tp('description'),
    qty: tp('qty'),
    unit: tp('unit'),
    unitPrice: tp('unitPrice'),
    lineTotal: tp('lineTotal'),
    total: tp('total'),
    notes: tp('notes'),
    generated: tp('generated'),
    hot: tp('hot'),
  };

  const pdf = await renderOrderPdf({
    labels,
    orgName: order.org?.name ?? '',
    orderNumber: order.order_number,
    date: new Date().toLocaleDateString('lt-LT'),
    neededBy: order.needed_by ?? '',
    isHot: order.is_hot,
    vendorName: order.vendor.name,
    shipTo: order.site?.name ?? '',
    buyerName: order.buyer?.full_name ?? '',
    notes: order.notes ?? '',
    currency: CURRENCY,
    lines: order.items.map((i) => ({
      description: i.description,
      qty: i.quantity,
      unit: i.unit ?? '',
      unitPrice: i.unit_price,
    })),
  });

  const pdfPath = `${order.org_id}/${order.order_number}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('order-docs')
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
  if (uploadError) redirect('/orders?error=save_failed');

  const subject = tp('emailSubject', { number: order.order_number });
  const body = tp('emailBody', {
    vendor: order.vendor.name,
    number: order.order_number,
    org: order.org?.name ?? '',
  });

  let messageId = '';
  try {
    const sent = await sendMail({
      to: toAddress,
      subject,
      text: body,
      attachments: [
        { filename: `${order.order_number}.pdf`, content: pdf, contentType: 'application/pdf' },
      ],
    });
    messageId = sent.messageId;
  } catch {
    redirect('/orders?error=send_failed');
  }

  const { error: rpcError } = await supabase.rpc('record_order_sent', {
    args: {
      order_id: order.id,
      to_address: toAddress,
      subject,
      provider_message_id: messageId,
      body_storage_path: pdfPath,
      vendor_id: order.vendor.id,
      contact_id: route?.contact_id ?? '',
    },
  });
  if (rpcError) {
    const code = rpcError.message.includes('not_allowed')
      ? 'not_allowed'
      : rpcError.message.includes('order_closed')
        ? 'order_closed'
        : 'save_failed';
    redirect(`/orders?error=${code}`);
  }

  redirect('/orders?notice=sent');
}
