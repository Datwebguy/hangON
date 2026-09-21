import test from 'node:test';
import assert from 'node:assert/strict';
import { createPgCalendarStore } from '../domain/calendar-store.mjs';
import { closeDb, isDatabaseConfigured, migrate } from '../domain/db.mjs';

const hasDb = isDatabaseConfigured();

test('postgres calendar store books and lists by workspace', { skip: !hasDb }, async () => {
  await migrate();
  const store = createPgCalendarStore();
  const stamp = Date.now();
  const booked = await store.book({
    customer_name: `Pg Tester ${stamp}`,
    service_type: 'Leak Check',
    scheduled_time: `Friday at ${stamp % 50}:00 AM`,
    address: '99 Database Ave',
    urgency: 'urgent'
  }, { workspaceId: 'workspace-local' });

  assert.equal(booked.duplicate, false);
  assert.equal(booked.booking.workspace_id, 'workspace-local');
  assert.equal(booked.booking.sms_dispatch.status, 'queued');

  const listed = await store.list({ workspaceId: 'workspace-local', limit: 20 });
  assert.ok(listed.some((job) => job.id === booked.booking.id));

  const again = await store.book({
    customer_name: booked.booking.customer_name,
    service_type: booked.booking.service_type,
    scheduled_time: booked.booking.scheduled_time,
    address: booked.booking.address
  }, { workspaceId: 'workspace-local' });
  assert.equal(again.duplicate, true);

  await closeDb();
});
