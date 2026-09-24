export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends transactional email. Swap implementations with EMAIL_PROVIDER. */
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}
