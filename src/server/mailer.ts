import nodemailer from 'nodemailer';

export function checkMailerConfiguration() {
  const smtpUrl = process.env.SMTP_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailerServiceUrl = process.env.MAILER_SERVICE_URL;
  const isProd = process.env.NODE_ENV === 'production';

  if (!smtpUrl && !resendApiKey && !mailerServiceUrl) {
    if (isProd) {
      throw new Error('[MAILER FATAL] No email provider configured in production (SMTP_URL, RESEND_API_KEY, or MAILER_SERVICE_URL required).');
    } else {
      console.info('[MAILER NOTICE] No email provider configured in development. Links will be printed to server console.');
    }
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<boolean> {
  const smtpUrl = process.env.SMTP_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailerServiceUrl = process.env.MAILER_SERVICE_URL;
  const mailerServiceToken = process.env.MAILER_SERVICE_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (!smtpUrl && !resendApiKey && !mailerServiceUrl) {
    if (isProd) {
      console.error('[MAILER ERROR] No email provider configured in production (SMTP_URL, RESEND_API_KEY, or MAILER_SERVICE_URL required).');
      return false;
    } else {
      // Development fallback: log link to console
      console.info(`[MAILER DEV FALLBACK] Email to [REDACTED] | Subject: ${subject}`);
      if (text) {
        console.info(`[MAILER DEV CONTENT] ${text}`);
      }
      return true;
    }
  }

  // Send asynchronously
  (async () => {
    try {
      if (smtpUrl) {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@thapar.edu',
          to,
          subject,
          text,
          html,
        });
        return;
      }

      if (resendApiKey) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'noreply@thapar.edu',
            to: [to],
            subject,
            html: html || text,
            text,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[MAILER RESEND ERROR] Failed to send email:', errText);
        }
        return;
      }

      if (mailerServiceUrl) {
        const res = await fetch(mailerServiceUrl, {
          method: 'POST',
          headers: {
            'Authorization': mailerServiceToken ? `Bearer ${mailerServiceToken}` : '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ to, subject, html, text }),
        });
        if (!res.ok) {
          console.error('[MAILER SERVICE ERROR] Failed to send email via service URL.');
        }
        return;
      }
    } catch (err: any) {
      console.error('[MAILER ERROR] Exception while sending email:', err?.message || err);
    }
  })().catch(err => {
    console.error('[MAILER ERROR] Background email dispatch error:', err);
  });

  return true;
}
