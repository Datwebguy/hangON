import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCalendarStore } from '../domain/calendar-store.mjs';
import { extractJobFromTranscript } from '../domain/dictation.mjs';
import { generateCallDossier } from '../domain/lemur.mjs';

function gatewayStub(content, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const body = status === 200
      ? { request_id: 'req-test', model: 'claude-haiku-4-5-20251001', choices: [{ message: { content: JSON.stringify(content) } }] }
      : { error: { message: 'bad key' } };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

async function withKey(value, fn) {
  const previous = process.env.ASSEMBLYAI_API_KEY;
  if (value === undefined) delete process.env.ASSEMBLYAI_API_KEY;
  else process.env.ASSEMBLYAI_API_KEY = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = previous;
  }
}

test('calendar store books a confirmed job and prepares (not sends) the pro SMS', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hangon-cal-'));
  const store = createCalendarStore(path.join(directory, 'calendar.json'));

  const result = await store.book({
    customer_name: 'Sarah Miller',
    service_type: 'Water Heater Leak Repair',
    urgency: 'urgent',
    scheduled_time: 'Friday at 10:30 AM',
    address: '742 Evergreen Terrace',
    phone: '(555) 301-4492'
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.booking.customer_name, 'Sarah Miller');
  assert.equal(result.booking.service_type, 'Water Heater Leak Repair');
  assert.equal(result.booking.status, 'confirmed');
  assert.equal(result.booking.sms_dispatch.status, 'prepared');
  assert.ok(result.booking.sms_dispatch.message.includes('742 Evergreen Terrace'));
  assert.equal(result.booking.workspace_id, 'workspace-local');

  const duplicateResult = await store.book({
    customer_name: 'Sarah Miller',
    service_type: 'Water Heater Leak Repair',
    scheduled_time: 'Friday at 10:30 AM'
  });
  assert.equal(duplicateResult.duplicate, true);

  await fsp.rm(directory, { recursive: true, force: true });
});

test('calendar store refuses to invent missing booking details', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hangon-cal-'));
  const store = createCalendarStore(path.join(directory, 'calendar.json'));

  await assert.rejects(store.book({ service_type: 'Leak' }), (e) => e.statusCode === 422 && /customer_name/.test(e.message) && /scheduled_time/.test(e.message));

  const { booking } = await store.book({ customer_name: 'Dana Cole', service_type: 'Leak', scheduled_time: 'Tomorrow at 9 AM' });
  assert.equal(booking.address, null);
  assert.equal(booking.phone, null);
  assert.equal(booking.urgency, null);

  await fsp.rm(directory, { recursive: true, force: true });
});

test('dictation extraction calls AssemblyAI LLM Gateway with a strict schema and keeps only what was said', async () => {
  const { calls, fetchImpl } = gatewayStub({
    customer_name: 'Dana Cole', phone: null, service_type: 'Leak under kitchen sink', urgency: 'urgent',
    scheduled_time: 'Tomorrow at 9:00 AM', address: '14 Main St', job_notes: null,
    self_corrections: ['address 12 Main St -> 14 Main St']
  });
  const transcript = 'uh leak under the sink at 12 Main St, no wait 14 Main St, tomorrow 9am, name is Dana Cole';

  const result = await withKey('test-key', () => extractJobFromTranscript(transcript, { fetchImpl }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://llm-gateway.assemblyai.com/v1/chat/completions');
  assert.equal(calls[0].options.headers.authorization, 'test-key');
  assert.equal(calls[0].body.response_format.type, 'json_schema');
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.ok(calls[0].body.messages[1].content.includes('14 Main St'));

  assert.equal(result.structured.address, '14 Main St');
  assert.equal(result.structured.phone, null);
  assert.deepEqual(result.structured.self_corrections, ['address 12 Main St -> 14 Main St']);
  assert.equal(result.final_text, 'Leak under kitchen sink for Dana Cole at 14 Main St on Tomorrow at 9:00 AM');
  assert.match(result.model, /AssemblyAI LLM Gateway/);
});

test('dictation extraction fails loudly instead of simulating', async () => {
  await withKey(undefined, () => assert.rejects(extractJobFromTranscript('my sink is leaking'), (e) => e.statusCode === 503 && e.code === 'llm_not_configured'));

  const { fetchImpl } = gatewayStub(null, { status: 401 });
  await withKey('bad-key', () => assert.rejects(extractJobFromTranscript('my sink is leaking', { fetchImpl }), (e) => e.statusCode === 502 && /bad key/.test(e.message)));

  await withKey('test-key', () => assert.rejects(extractJobFromTranscript('   '), (e) => e.statusCode === 422));
});

test('call dossier comes from the gateway and never carries invented prices or scores', async () => {
  const { calls, fetchImpl } = gatewayStub({
    pro_brief: 'Water heater leaking from the bottom valve; booked Friday 10:30 AM.',
    safety_guidance: null,
    parts_checklist: ['Drain valve', 'Teflon tape'],
    caller_mood_start: 'stressed',
    caller_mood_end: 'calm'
  });

  const dossier = await withKey('test-key', () => generateCallDossier('Caller: my water heater is leaking', {
    customer_name: 'Sarah Miller', service_type: 'Water Heater Leak', scheduled_time: 'Friday at 10:30 AM', address: '742 Evergreen Terrace'
  }, { fetchImpl }));

  assert.ok(calls[0].body.messages[1].content.includes('customer_name: Sarah Miller'));
  assert.equal(dossier.safety_guidance, null);
  assert.deepEqual(dossier.parts_checklist, ['Drain valve', 'Teflon tape']);
  assert.equal(dossier.caller_mood.summary, 'stressed → calm');
  assert.equal('pricing' in dossier, false);
  assert.ok(dossier.pro_sms.includes('742 Evergreen Terrace'));

  await withKey(undefined, () => assert.rejects(generateCallDossier('Caller: hi'), (e) => e.statusCode === 503));
});

test('gateway client moves past models the account cannot use and reports when none work', async () => {
  const { resetModelCache } = await import('../domain/assemblyai-llm.mjs');
  resetModelCache();
  const tried = [];
  const denyFirst = async (url, options) => {
    const { model } = JSON.parse(options.body);
    tried.push(model);
    if (tried.length === 1) {
      return new Response(JSON.stringify({ metadata: { errors: ['Your account does not have access to this LLM Gateway model'] }, message: 'invalid request body', code: 400 }), { status: 400 });
    }
    return new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify({ customer_name: 'Dana', phone: '', service_type: 'Leak', urgency: 'unknown', scheduled_time: '', address: '', job_notes: '', self_corrections: [] }) } }] }), { status: 200 });
  };
  const result = await withKey('test-key', () => extractJobFromTranscript('leak, this is Dana', { fetchImpl: denyFirst }));
  assert.equal(tried.length, 2);
  assert.ok(result.model.includes(tried[1]));
  assert.equal(result.structured.urgency, null);
  assert.equal(result.structured.address, null);

  resetModelCache();
  const denyAll = async () => new Response(JSON.stringify({ metadata: { errors: ['Your account does not have access to this LLM Gateway model'] } }), { status: 400 });
  await withKey('test-key', () => assert.rejects(extractJobFromTranscript('leak', { fetchImpl: denyAll }), (e) => e.code === 'llm_no_model_access'));
  resetModelCache();
});
