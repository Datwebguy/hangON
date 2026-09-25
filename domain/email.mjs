const RESEND_API = 'https://api.resend.com/emails';

function configuredFrom() {
  return String(process.env.HANGON_EMAIL_FROM || '').trim();
}

export function isEmailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || '').trim() && configuredFrom());
}

export function buildBookingEmail(booking = {}, options = {}) {
  const customer = booking.customer_name || 'there';
  const when = booking.scheduled_time || '';
  const business = options.businessName || 'Apex Home Services';
  const tech = options.technicianName || 'Mike';
  const subject = when ? `${business}: your visit is booked for ${when}` : `${business}: your visit is booked`;
  // Only details the caller actually gave; nothing is filled in with placeholder text.
  const rows = [
    ['Job', booking.service_type],
    ['When', when],
    ['Where', booking.address],
    ['Phone', booking.phone]
  ].filter(([, value]) => value);

  const text = [
    `Hi ${customer},`,
    '',
    `Thanks for calling ${business}. Your appointment is confirmed.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `${tech} will see you then. If anything changes, call us back and HangON will update the schedule.`,
    '',
    `${business}, booked by HangON`
  ].join('\n');

  const cell = 'padding:8px;border:1px solid #e2e8f0';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <p>Hi ${escapeHtml(customer)},</p>
      <p>Thanks for calling <strong>${escapeHtml(business)}</strong>. Your appointment is confirmed.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        ${rows.map(([label, value]) => `<tr><td style="${cell};background:#f8fafc;width:30%"><strong>${label}</strong></td><td style="${cell}">${escapeHtml(value)}</td></tr>`).join('')}
      </table>
      <p>${escapeHtml(tech)} will see you then. If anything changes, call us back and HangON will update the schedule.</p>
      <p style="color:#64748b">${escapeHtml(business)}, booked by HangON</p>
    </div>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendBookingEmail({ to, booking, businessName, technicianName }) {
  const email = String(to || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, statusCode: 422, error: 'A valid email address is required.' };
  }
  if (!isEmailConfigured()) {
    // Never report a draft as sent: the caller would be told an email is on its way.
    return { ok: false, statusCode: 503, error: 'Email is not configured on the server (RESEND_API_KEY and HANGON_EMAIL_FROM).' };
  }

  const content = buildBookingEmail(booking, { businessName, technicianName });
  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: configuredFrom(),
      to: [email],
      subject: content.subject,
      text: content.text,
      html: content.html
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`[hangon] Resend ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    return { ok: false, statusCode: 502, provider: 'resend', error: body?.message || 'Email provider rejected the message.' };
  }
  return {
    ok: true,
    queued: false,
    provider: 'resend',
    id: body.id,
    to: email,
    subject: content.subject,
    message: 'Confirmation email sent.'
  };
}
