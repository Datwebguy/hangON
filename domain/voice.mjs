import { SERVICE_KEYTERMS } from './dictation.mjs';
import { hoursSummary, labelFor, nowLocal, scheduleConfig, upcomingDays } from './schedule.mjs';

const DEFAULT_VOICES = [
  { id: 'anna', label: 'Anna (British)' },
  { id: 'michael', label: 'Michael (US)' },
  { id: 'jane', label: 'Jane (US)' },
  { id: 'alba', label: 'Alba (US)' }
];

export const voiceCatalog = DEFAULT_VOICES;

export function voiceOptions(workspace) {
  const allowed = workspace?.voice?.allowed;
  if (!Array.isArray(allowed) || !allowed.length) return DEFAULT_VOICES;
  const options = DEFAULT_VOICES.filter((voice) => allowed.includes(voice.id));
  return options.length ? options : DEFAULT_VOICES;
}

export function voiceConfig(workspace) {
  const voices = voiceOptions(workspace);
  const requested = workspace?.voice?.default;
  return { voices, defaultVoice: voices.some((voice) => voice.id === requested) ? requested : voices[0].id };
}

export function buildSystemPrompt(workspace, now = new Date()) {
  const isSoloService = Boolean(workspace?.business_type || workspace?.capabilities?.actions?.enabled);
  const orgName = workspace?.name || 'Apex Plumbing & Electrical Dispatch';
  const ownerName = String(workspace?.owner || 'Mike').split(' (')[0];

  if (isSoloService) {
    const config = scheduleConfig(workspace);
    const days = upcomingDays(config, now).map((d) => `${d.label} = ${d.date}${d.open ? '' : ' (closed)'}`).join('; ');
    return [
      `You are HangON, the voice front desk for ${orgName}. ${ownerName} is on a job and cannot pick up, so you answer for him.`,
      `Right now it is ${labelFor(nowLocal(config, now))} (${config.timezone}). Upcoming dates: ${days}.`,
      `Working hours: ${hoursSummary(config)}.`,
      'Sound like a calm, friendly receptionist. Speak in short natural sentences and never rush the caller.',
      'Let the caller explain in their own words and wait until they finish. Acknowledge what they said before moving on.',
      'Ask one question at a time. If the problem is unclear, ask a useful follow up, for example where the leak is, whether water is still running, or how long it has been happening.',
      'If there is active danger or damage, give one clear safety step.',
      'Ask the caller what day and time works best for them. Never suggest or assume a day before they tell you their preference.',
      'When they give a time, convert it to YYYY-MM-DDTHH:mm using the dates above and call check_calendar_availability with preferred_start. If it is open, confirm it. If not, explain briefly and offer the open_slots the tool returns. Never invent times or availability.',
      'If the caller corrects themselves, for example "Thursday, no, Friday", use their final choice.',
      'Ask for their name, and the service address if they have not given it.',
      'Never require a phone number.',
      'Before booking, read back the job, the day and time, the name and the address in one sentence, and ask if you should book it.',
      'Only after a clear yes, call book_service_appointment with scheduled_at set to the confirmed YYYY-MM-DDTHH:mm.',
      `After it is booked, tell them it is on ${ownerName}'s schedule, then ask if they would like a confirmation by email.`,
      'If they want one, ask for the address, then spell it back and ask them to confirm it is right. Only call send_confirmation_email after they confirm the spelling.',
      'Only say an email was sent after send_confirmation_email returns status sent. If it fails, say so honestly.',
      'Never invent an email address, a price, or a time.',
      'Before ending, ask if there is anything else, then close warmly.'
    ].join(' ');
  }

  const capabilities = workspace?.capabilities || {};
  const enabled = Object.values(capabilities).filter((item) => item?.enabled).map((item) => item.label);
  const unavailable = Object.values(capabilities).filter((item) => !item?.enabled).map((item) => item.label);
  return [
    `You are HangON, a voice front desk for ${orgName}.`,
    `Available capabilities: ${enabled.join(', ') || 'none'}.`,
    `Unavailable capabilities: ${unavailable.join(', ') || 'none'}.`,
    'Wait for the caller to speak. Ask one clear question at a time and collect only verified facts.',
    'Only call prepare_confirmed_request after the caller explicitly confirms the exact summary.'
  ].join(' ');
}

export const bookServiceTool = {
  type: 'function',
  name: 'book_service_appointment',
  description: 'Book a confirmed service job on the technician calendar after explicit caller confirmation. Only name, service and time are needed. Phone and address are optional; never delay booking to ask for them.',
  parameters: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: 'Customer or caller name.' },
      service_type: { type: 'string', description: 'Specific repair or service requested (e.g. Water Heater Leak Repair, Main Drain Clog, Panel Inspection).' },
      scheduled_at: { type: 'string', description: 'Confirmed local start time as YYYY-MM-DDTHH:mm, checked with check_calendar_availability.' },
      address: { type: 'string', description: 'Service address where technician will arrive.' },
      phone: { type: 'string', description: 'Optional. Only include it if the caller offered it.' },
      urgency: { type: 'string', enum: ['emergency', 'urgent', 'standard'], description: 'Urgency level of the service request.' },
      confirmed: { type: 'boolean', description: 'Must be true after explicit caller confirmation.' }
    },
    required: ['customer_name', 'service_type', 'scheduled_at', 'confirmed']
  }
};

export const requestTool = {
  type: 'function',
  name: 'prepare_confirmed_request',
  description: 'Prepare and route a factual request for authorized follow-up only after the caller has explicitly confirmed the exact summary.',
  parameters: {
    type: 'object',
    properties: {
      request_summary: { type: 'string', description: 'A short, factual summary of what the caller wants.' },
      details: { type: 'object', description: 'Only facts the caller provided or confirmed.', additionalProperties: true },
      confirmed: { type: 'boolean', description: 'True only after explicit confirmation of the exact summary.' }
    },
    required: ['request_summary', 'details', 'confirmed']
  }
};

export const checkAvailabilityTool = {
  type: 'function',
  name: 'check_calendar_availability',
  description: 'Check whether the time the caller asked for is free on the technician calendar. Returns available, or the next real open_slots.',
  parameters: {
    type: 'object',
    properties: {
      preferred_start: { type: 'string', description: 'The time the caller asked for, as local YYYY-MM-DDTHH:mm.' }
    },
    required: ['preferred_start']
  }
};

export const sendConfirmationEmailTool = {
  type: 'function',
  name: 'send_confirmation_email',
  description: 'Email the caller a booking confirmation. Only call this after the caller has said their email address and confirmed its spelling.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Caller email address spoken or confirmed on the call.' },
      customer_name: { type: 'string' },
      service_type: { type: 'string' },
      scheduled_time: { type: 'string' },
      address: { type: 'string' },
      phone: { type: 'string' }
    },
    required: ['email', 'customer_name', 'service_type', 'scheduled_time']
  }
};
