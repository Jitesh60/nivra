import type { INestApplication } from '@nestjs/common';
import { inject } from 'vitest';
import { MailWorker } from '../../src/modules/mail/mail-worker.js';
import { Mailer } from '../../src/modules/mail/mailer.service.js';

/** Sends everything waiting on the email queue (tests run without the job worker). */
export async function sendQueuedEmails(app: INestApplication): Promise<number> {
  const jobs = await app.get(Mailer).queue.getJobs(['waiting', 'delayed', 'prioritized']);
  const worker = app.get(MailWorker);
  for (const job of jobs) {
    await worker.process(job.data);
    await job.remove();
  }
  return jobs.length;
}

interface Summary {
  ID: string;
  Subject: string;
}

/** Emails Mailpit has for [to], newest first, with their plain text. */
export async function emailsTo(to: string): Promise<{ subject: string; text: string }[]> {
  const base = inject('mailpitUrl');
  const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const { messages } = (await res.json()) as { messages: Summary[] };
  return Promise.all(
    messages.map(async (m) => {
      const full = (await (await fetch(`${base}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      return { subject: m.Subject, text: full.Text };
    }),
  );
}
