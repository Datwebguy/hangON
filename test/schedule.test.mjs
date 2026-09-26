import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSlot, labelFor, nowLocal, scheduleConfig, upcomingDays } from '../domain/schedule.mjs';
import { buildJob } from '../domain/calendar-store.mjs';

const config = scheduleConfig({ timezone: 'America/New_York' });
// Saturday 26 September 2026, 09:00 in New York.
const now = new Date('2026-09-26T13:00:00Z');

test('knows the local date and lists upcoming days with Sundays closed', () => {
  assert.equal(nowLocal(config, now), '2026-09-26T09:00');
  const days = upcomingDays(config, now);
  assert.equal(days[0].label, 'Saturday, September 26');
  assert.equal(days[1].open, false);
  assert.equal(days[6].date, '2026-10-02');
  assert.equal(labelFor('2026-10-02T10:30'), 'Friday, October 2 at 10:30 AM');
});

test('a free slot within hours is available', () => {
  const result = checkSlot([], '2026-09-30T14:00', config, now);
  assert.equal(result.available, true);
  assert.equal(result.requested_label, 'Wednesday, September 30 at 2:00 PM');
});

test('a booked slot is refused and real alternatives come from the calendar', () => {
  const jobs = [{ scheduled_at: '2026-09-30T14:00', status: 'confirmed' }];
  const result = checkSlot(jobs, '2026-09-30T14:30', config, now);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'already_booked');
  assert.equal(result.open_slots[0].start, '2026-09-30T15:30');
  assert.ok(result.open_slots.every((slot) => slot.start !== '2026-09-30T14:00'));
});

test('closed days, out of hours and past times are refused', () => {
  assert.equal(checkSlot([], '2026-09-27T10:00', config, now).reason, 'closed_that_day');
  assert.equal(checkSlot([], '2026-09-28T17:30', config, now).reason, 'outside_hours');
  assert.equal(checkSlot([], '2026-09-26T08:00', config, now).reason, 'in_the_past');
  assert.equal(checkSlot([], 'next friday', config, now).reason, 'invalid_time');
});

test('bookings keep the exact time and derive the spoken label from it', () => {
  const job = buildJob({ customer_name: 'Dana Cole', service_type: 'Sink leak', scheduled_at: '2026-09-30T14:00' }, 'workspace-local');
  assert.equal(job.scheduled_at, '2026-09-30T14:00');
  assert.equal(job.scheduled_time, 'Wednesday, September 30 at 2:00 PM');
});
