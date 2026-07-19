import 'server-only';
import nodemailer from 'nodemailer';

export type OutboundAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  attachments?: OutboundAttachment[];
};

export type SendMailResult = { messageId: string };

// LOCAL-FIRST: deliver to the inbucket SMTP catcher (view at :55324).
// On the ADR-014 promotion gate, set RESEND_API_KEY and the Resend
// branch takes over — no caller changes.
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const from = process.env.ORDER_MAIL_FROM ?? 'uzsakymai@bravotools.local';

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    });
    if (!res.ok) throw new Error(`resend_failed_${res.status}`);
    const body = (await res.json()) as { id: string };
    return { messageId: body.id };
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? '55325'),
    secure: false,
    // inbucket accepts anonymous mail; no auth in local dev
    tls: { rejectUnauthorized: false },
  });
  const info = await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}
