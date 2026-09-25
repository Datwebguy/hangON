import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookingEmail, sendBookingEmail } from '../domain/email.mjs';

test('booking email lists only details the caller gave', () => {
  const { subject, text, html } = buildBookingEmail({ customer_name: 'Dana', service_type: 'Sink leak', scheduled_time: 'Tomorrow 9 AM' });
  assert.equal(subject, 'Apex Home Services: your visit is booked for Tomorrow 9 AM');
  assert.ok(text.includes('Job: Sink leak'));
  assert.ok(!text.includes('Where:'));
  assert.ok(!html.includes('Where'));
  assert.ok(!/[—–]/.test(text));
});

test('email is never reported as sent when Resend is not configured', async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.HANGON_EMAIL_FROM };
  delete process.env.RESEND_API_KEY;
  delete process.env.HANGON_EMAIL_FROM;
  try {
    const result = await sendBookingEmail({ to: 'dana@example.com', booking: { customer_name: 'Dana' } });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 503);
    const invalid = await sendBookingEmail({ to: 'not-an-email', booking: {} });
    assert.equal(invalid.statusCode, 422);
  } finally {
    if (saved.key !== undefined) process.env.RESEND_API_KEY = saved.key;
    if (saved.from !== undefined) process.env.HANGON_EMAIL_FROM = saved.from;
  }
});
