import { inject } from 'vitest';

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Waits for the newest email to `to` in Mailpit and returns the 6-digit code in its subject. */
export async function lastEmailCode(to: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${inject('mailpitUrl')}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const code = messages[0]?.Subject.match(/^(\d{6}) /)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No email received by ${to}`);
}
