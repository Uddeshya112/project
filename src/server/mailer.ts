export interface PasswordResetMail {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetMail(message: PasswordResetMail): Promise<void> {
  const url = String(process.env.MAILER_SERVICE_URL || '').trim();
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MAILER_SERVICE_URL is required in production for password reset delivery.');
    }
    return;
  }

  const token = String(process.env.MAILER_SERVICE_TOKEN || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'password_reset',
      to: message.to,
      resetUrl: message.resetUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Password reset mailer returned HTTP ${response.status}.`);
  }
}
