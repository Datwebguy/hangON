import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCalendarStore } from '../domain/calendar-store.mjs';
import { extractStructuredJob, resolveSelfCorrections, transcribeWithDictation } from '../domain/dictation.mjs';
import { generateLeMURDossier } from '../domain/lemur.mjs';

test('calendar store creates confirmed booking and triggers pro SMS dispatch', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hangon-cal-'));
  const store = createCalendarStore(path.join(directory, 'calendar.json'));

  const result = await store.book({
    customer_name: 'Sarah Miller',
    service_type: 'Water Heater Leak Repair',
    urgency: 'high',
    scheduled_time: 'Friday at 10:30 AM',
    address: '742 Evergreen Terrace',
    phone: '(555) 301-4492',
    raw_speech: 'Thursday wait no Friday at 10:30am',
    cleaned_text: 'Water Heater Leak Repair for Sarah Miller on Friday at 10:30 AM'
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.booking.customer_name, 'Sarah Miller');
  assert.equal(result.booking.service_type, 'Water Heater Leak Repair');
  assert.equal(result.booking.scheduled_time, 'Friday at 10:30 AM');
  assert.equal(result.booking.status, 'confirmed');
  assert.equal(result.booking.record_changed, true);
  assert.equal(result.booking.sms_dispatch.status, 'sent');
  assert.ok(result.booking.sms_dispatch.message.includes('742 Evergreen Terrace'));

  const list = await store.list();
  assert.ok(list.some((job) => job.customer_name === 'Sarah Miller'));

  // Idempotent repeated booking returns existing without duplication
  const duplicateResult = await store.book({
    customer_name: 'Sarah Miller',
    service_type: 'Water Heater Leak Repair',
    scheduled_time: 'Friday at 10:30 AM'
  });
  assert.equal(duplicateResult.duplicate, true);

  await fsp.rm(directory, { recursive: true, force: true });
});

test('AssemblyAI Dictation extraction resolves messy speech and self-corrections into clean fields', async () => {
  const messyUtterance = "Hey uh Mike, yeah my water heater is leaking from the bottom valve... can you come by Thursday? Wait no, make it Friday at 10:30am. It's Sarah Miller over on 742 Evergreen.";
  const result = await transcribeWithDictation(null, { sampleText: messyUtterance });

  assert.ok(result.structured);
  assert.equal(result.structured.customer_name, 'Sarah Miller');
  assert.equal(result.structured.service_type, 'Water Heater Leak & Diagnostic');
  assert.equal(result.structured.scheduled_time, 'Friday at 10:30 AM');
  assert.ok(result.structured.address.includes('Evergreen'));
  assert.equal(result.structured.urgency, 'urgent');
  assert.ok(result.final_text.includes('Sarah Miller'));
});

test('AssemblyAI LeMUR call intelligence generates pro brief, agitation score, and parts checklist', () => {
  const dossier = generateLeMURDossier('Water heater is making a banging noise and leaking from valve', {
    customer_name: 'Sarah Miller',
    service_type: 'Water Heater Leak Repair',
    scheduled_time: 'Friday at 10:30 AM',
    address: '742 Evergreen Terrace'
  });

  assert.ok(dossier.pro_brief.includes('Sarah Miller'));
  assert.ok(dossier.pro_brief.includes('water heater'));
  assert.ok(dossier.safety_guidance.includes('valve'));
  assert.ok(dossier.agitation_metrics.initial_stress_percent > 70);
  assert.ok(dossier.agitation_metrics.resolved_stress_percent < 30);
  assert.ok(Array.isArray(dossier.parts_checklist));
  assert.ok(dossier.parts_checklist.length > 0);
  assert.ok(dossier.pro_sms.includes('DISPATCH ALERT'));
  assert.ok(dossier.customer_sms.includes('Mike Miller'));
});
