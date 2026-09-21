const RESEND_API = 'https://api.resend.com/emails';

function configuredFrom() {
  return String(process.env.HANGON_EMAIL_FROM || '').trim();
}

export function isEmailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || '').trim() && configuredFrom());
}

export function buildBookingEmail(booking = {}, options = {}) {
  const customer = booking.customer_name || 'there';
  const service = booking.service_type || 'your service request';
  const when = booking.scheduled_time || 'the confirmed time';
  const address = booking.address || 'the address on file';
  const phone = booking.phone || '';
  const business = options.businessName || 'Apex Home Services';
  const tech = options.technicianName || 'Mike';
  const subject = `${business}: your visit is booked for ${when}`;

  const text = [
    `Hi ${customer},`,
    '',
    `Thanks for calling ${business}. Your appointment is confirmed.`,
    '',
    `Job: ${service}`,
    `When: ${when}`,
    `Where: ${address}`,
    phone ? `Phone on file: ${phone}` : null,
    '',
    `${tech} will arrive in that window. If anything changes, call us back and HangON will update the schedule.`,
    '',
    `— ${business} (booked by HangON)`
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <p>Hi ${escapeHtml(customer)},</p>
      <p>Thanks for calling <strong>${escapeHtml(business)}</strong>. Your appointment is confirmed.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Job</strong></td><td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(service)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>When</strong></td><td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(when)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Where</strong></td><td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(address)}</td></tr>
        ${phone ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Phone</strong></td><td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(phone)}</td></tr>` : ''}
      </table>
      <p>${escapeHtml(tech)} will arrive in that window. If anything changes, call us back and HangON will update the schedule.</p>
      <p style="color:#64748b">— ${escapeHtml(business)} (booked by HangON)</p>
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
    return { ok: false, queued: false, error: 'A valid email address is required.' };
  }

  const content = buildBookingEmail(booking, { businessName, technicianName });
  if (!isEmailConfigured()) {
    return {
      ok: true,
      queued: true,
      provider: 'preview',
      to: email,
      subject: content.subject,
      preview: content.text,
      message: 'Email drafted. Add RESEND_API_KEY and HANGON_EMAIL_FROM to send live.'
    };
  }

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
    return {
      ok: false,
      queued: false,
      provider: 'resend',
      error: body?.message || 'Email provider rejected the message.'
    };
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
