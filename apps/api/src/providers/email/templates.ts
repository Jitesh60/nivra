import type { EmailMessage } from './email.provider.js';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Email-verification code. Keep it short: most people read it in a notification. */
export function emailOtpMessage(to: string, code: string, ttlMinutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Sajha verification code`,
    text: `Your Sajha verification code is ${code}. It expires in ${ttlMinutes} minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1F2430">
  <p style="color:#11846A;font-weight:600;margin:0 0 16px">Sajha</p>
  <p style="margin:0 0 8px">Your verification code is</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${escape(code)}</p>
  <p style="color:#667691;margin:0">It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>
</div>`,
  };
}
