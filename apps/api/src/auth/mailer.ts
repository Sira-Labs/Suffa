/**
 * Sends the sign-in emails. SMTP in every real environment (Gmail with an app password during
 * development, a transactional provider later); outside prod the link may instead be written
 * to the log, so a developer can sign in without a mail account.
 */
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mailer {
  sendMagicLink(email: string, url: string): Promise<void>;
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** Subject and bodies of the sign-in mail (German, like the app). */
export function magicLinkMail(url: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Dein Anmeldelink für Suffa';
  const text = [
    'Assalamu alaikum,',
    '',
    'mit diesem Link meldest du dich bei Suffa an:',
    url,
    '',
    'Der Link ist 15 Minuten gültig und funktioniert nur einmal.',
    'Wenn du dich nicht anmelden wolltest, kannst du diese Mail ignorieren.',
  ].join('\n');
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<p>Assalamu alaikum,</p>
<p>mit diesem Link meldest du dich bei Suffa an:</p>
<p><a href="${safe}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none">Bei Suffa anmelden</a></p>
<p style="color:#555">Der Link ist 15 Minuten gültig und funktioniert nur einmal. Wenn du dich nicht anmelden wolltest, kannst du diese Mail ignorieren.</p>`;
  return { subject, text, html };
}

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      // 465 is implicit TLS (Gmail); other ports upgrade with STARTTLS.
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.password },
    });
  }

  async sendMagicLink(email: string, url: string): Promise<void> {
    await this.transport.sendMail({
      from: this.settings.from,
      to: email,
      ...magicLinkMail(url),
    });
  }
}

/** Development only: the link goes to the log instead of a mailbox. */
export class LogMailer implements Mailer {
  constructor(private readonly log: { warn(obj: object, msg: string): void }) {}

  async sendMagicLink(email: string, url: string): Promise<void> {
    this.log.warn({ email, url }, 'auth.magic_link_logged');
  }
}
