import { SERVICE_KEYTERMS } from './dictation.mjs';

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

export function buildSystemPrompt(workspace) {
  const isSoloService = Boolean(workspace?.business_type || workspace?.capabilities?.actions?.enabled);
  const orgName = workspace?.name || 'Apex Plumbing & Electrical Dispatch';
  const ownerName = workspace?.owner || 'Mike';

  if (isSoloService) {
    return [
      `You are HangON, the intelligent voice front desk for ${orgName}.`,
      `The owner and lead technician, ${ownerName}, is currently on a job and cannot pick up the phone.`,
      'You handle incoming calls for home service contractors, including plumbing, electrical, HVAC, and field trade repairs.',
      'Keep your responses brief, fast, and conversational — 1 to 2 short sentences maximum per turn to minimize speaking latency.',
      'Listen carefully. If there is an emergency or leak, reassure the caller and give one clear triage safety step.',
      'If the caller corrects themselves (e.g., saying "Thursday... no wait, Friday at 10:30am"), instantly resolve to their final choice.',
      'Offer or confirm an open slot (e.g., Tomorrow at 10:30 AM or Friday at 10:00 AM).',
      'Once date and service are known, read back a quick 1-sentence confirmation and ask: "Shall I lock that into the calendar for you?"',
      'When the caller confirms, immediately call the book_service_appointment tool.',
      `Once booked, say the appointment is locked and ${ownerName} has the details. Then ask if they would like a confirmation by email.`,
      'If the caller gives an email address, call send_confirmation_email with that address after booking.',
      'Do not invent an email address. Only send email when the caller provides one.'
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
  description: 'Book a confirmed service job on the technician dispatch calendar and trigger an immediate SMS alert after explicit caller confirmation.',
  parameters: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: 'Customer or caller name.' },
      service_type: { type: 'string', description: 'Specific repair or service requested (e.g. Water Heater Leak Repair, Main Drain Clog, Panel Inspection).' },
      scheduled_time: { type: 'string', description: 'The confirmed date and time slot (e.g. Friday at 10:30 AM).' },
      address: { type: 'string', description: 'Service address where technician will arrive.' },
      phone: { type: 'string', description: 'Contact phone number.' },
      urgency: { type: 'string', enum: ['emergency', 'urgent', 'standard'], description: 'Urgency level of the service request.' },
      confirmed: { type: 'boolean', description: 'Must be true after explicit caller confirmation.' }
    },
    required: ['customer_name', 'service_type', 'scheduled_time', 'confirmed']
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
  description: 'Check available appointment slots on the technician dispatch calendar.',
  parameters: {
    type: 'object',
    properties: {
      preferred_time: { type: 'string', description: 'Preferred time mentioned by caller.' }
    }
  }
};

export const sendConfirmationEmailTool = {
  type: 'function',
  name: 'send_confirmation_email',
  description: 'Email the caller a clear booking confirmation after the appointment is locked. Only use an email address the caller provided.',
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
