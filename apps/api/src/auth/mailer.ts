/**
 * Sends the sign-in emails. SMTP in every real environment: the Google Workspace SMTP relay
 * (smtp-relay.gmail.com, like Tabayyun), which accepts the server by its IP address and/or SMTP
 * credentials; outside prod the link may instead be written to the log, so a developer can
 * sign in without a mail account.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mailer {
  /**
   * The sign-in mail: the link, and the same sign-in as a six-digit code for another browser
   * (a mail app's built-in browser keeps the session to itself).
   */
  sendMagicLink(email: string, url: string, code: string): Promise<void>;
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** Optional: the Workspace relay can allow the server by IP address alone. */
  auth: { user: string; password: string } | undefined;
  from: string;
  /** Name the server greets with (EHLO); Google's relay rejects container names. */
  clientName: string | undefined;
}

/** Subject and bodies of the sign-in mail (German, like the app). */
export function magicLinkMail(
  url: string,
  code: string
): {
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
    `Oder gib diesen Code auf der Anmeldeseite ein: ${code}`,
    '(praktisch, wenn deine Mail-App den Link nicht in deinem Browser öffnet)',
    '',
    'Link und Code sind 15 Minuten gültig und funktionieren nur einmal.',
    'Wenn du dich nicht anmelden wolltest, kannst du diese Mail ignorieren.',
  ].join('\n');
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<p>Assalamu alaikum,</p>
<p>mit diesem Link meldest du dich bei Suffa an:</p>
<p><a href="${safe}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none">Bei Suffa anmelden</a></p>
<p>Oder gib diesen Code auf der Anmeldeseite ein – praktisch, wenn deine Mail-App den Link nicht in deinem Browser öffnet:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code.replace(/\D/g, '')}</p>
<p style="color:#555">Link und Code sind 15 Minuten gültig und funktionieren nur einmal. Wenn du dich nicht anmelden wolltest, kannst du diese Mail ignorieren.</p>`;
  return { subject, text, html };
}

/**
 * Seconds to wait for the SMTP server. The sign-in request waits for the mail, and the proxy in
 * front gives up after 60 s; a blocked port must fail fast and visibly, not as a gateway timeout.
 */
export const SMTP_TIMEOUT_MS = { connection: 10_000, greeting: 10_000, socket: 20_000 };

export interface MailLog {
  error(obj: object, msg: string): void;
}

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    private readonly settings: SmtpSettings,
    private readonly log?: MailLog
  ) {
    const implicitTls = settings.port === 465;
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      // 465 is implicit TLS; other ports must upgrade with STARTTLS, never send in clear.
      secure: implicitTls,
      requireTLS: !implicitTls,
      name: settings.clientName,
      connectionTimeout: SMTP_TIMEOUT_MS.connection,
      greetingTimeout: SMTP_TIMEOUT_MS.greeting,
      socketTimeout: SMTP_TIMEOUT_MS.socket,
      auth: settings.auth
        ? { user: settings.auth.user, pass: settings.auth.password }
        : undefined,
    });
  }

  async sendMagicLink(email: string, url: string, code: string): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.settings.from,
        to: email,
        ...magicLinkMail(url, code),
      });
    } catch (error) {
      // Never log the link or the address: host, port and the SMTP answer are enough to act on.
      const { code, responseCode, message } = error as {
        code?: string;
        responseCode?: number;
        message?: string;
      };
      this.log?.error(
        {
          host: this.settings.host,
          port: this.settings.port,
          code,
          responseCode,
          message,
        },
        'mail.send_failed'
      );
      throw error;
    }
  }
}

/** Development only: the link goes to the log instead of a mailbox. */
export class LogMailer implements Mailer {
  constructor(private readonly log: { warn(obj: object, msg: string): void }) {}

  async sendMagicLink(email: string, url: string, code: string): Promise<void> {
    this.log.warn({ email, url, code }, 'auth.magic_link_logged');
  }
}

/**
 * Browser tests only (never in prod, enforced by the config): the latest link per address is
 * written to `<dir>/<email>.txt` (link on the first line, code on the second), where the
 * end-to-end tests pick it up.
 */
export class FileMailer implements Mailer {
  constructor(private readonly dir: string) {}

  async sendMagicLink(email: string, url: string, code: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const name = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
    // Written aside and renamed, so a reader never sees a half-written (or empty) file.
    const target = join(this.dir, `${name}.txt`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, `${url}\n${code}\n`, 'utf8');
    await rename(temp, target);
  }
}
