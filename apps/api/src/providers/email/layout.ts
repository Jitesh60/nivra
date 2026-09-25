/**
 * One look for every Nivra email: brand header, a heading, short paragraphs,
 * an optional table of amounts, and a footer saying why it was
 * sent. Inline styles and tables only, so it survives Gmail and Outlook.
 * Colours are the design tokens (brand 600, ink 900/500/100).
 */
const BRAND = '#11846A';
const INK = '#1F2430';
const MUTED = '#667691';
const LINE = '#ECEEF2';

const OPT_OUT = 'To stop these emails, open the Nivra app: Settings → Notifications.';

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface EmailContent {
  /** Shown in the inbox list next to the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Label/value lines, e.g. a receipt. The last one with `strong` is the total. */
  rows?: { label: string; value: string; strong?: boolean }[];
  /** Why they got it, e.g. "You're getting this because you booked on Nivra." */
  reason: string;
  /** Say how to turn these emails off (omitted for must-send emails). */
  optOut?: boolean;
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const e = escapeHtml;
  const rows = c.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 20px">${c.rows
        .map(
          (r) =>
            `<tr><td style="padding:8px 0;border-top:1px solid ${LINE};color:${r.strong ? INK : MUTED};${r.strong ? 'font-weight:700;' : ''}">${e(r.label)}</td><td align="right" style="padding:8px 0;border-top:1px solid ${LINE};color:${INK};${r.strong ? 'font-weight:700;' : ''}">${e(r.value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const manage = c.optOut ? ` ${e(OPT_OUT)}` : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#F6F7F9">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${e(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:${INK};font-size:15px;line-height:1.55">
<tr><td style="padding:24px 28px 0"><p style="margin:0;color:${BRAND};font-weight:700;font-size:18px">Nivra</p></td></tr>
<tr><td style="padding:16px 28px 8px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${e(c.heading)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 14px">${e(p)}</p>`).join('\n')}
${rows}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px">${e(c.reason)}${manage}<br>Nivra · Rent from people near you · Pune, India</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    c.heading,
    '',
    ...c.paragraphs.flatMap((p) => [p, '']),
    ...(c.rows?.length ? [...c.rows.map((r) => `${r.label}: ${r.value}`), ''] : []),
    '—',
    c.reason,
    ...(c.optOut ? [OPT_OUT] : []),
  ].join('\n');
  return { html, text };
}
