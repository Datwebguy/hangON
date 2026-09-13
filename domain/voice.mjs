
const DEFAULT_VOICES = [
  { id: 'anna', label: 'Anna — British' },
  { id: 'michael', label: 'Michael — US' },
  { id: 'jane', label: 'Jane — US' },
  { id: 'alba', label: 'Alba — US' }
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
  const capabilities = workspace?.capabilities || {};
  const enabled = Object.values(capabilities).filter((item) => item?.enabled).map((item) => item.label);
  const unavailable = Object.values(capabilities).filter((item) => !item?.enabled).map((item) => item.label);
  return [
    'You are HangON, a neutral voice front desk for this configured workspace.',
    `Workspace: ${workspace?.name || 'the organization'}.`,
    `Available capabilities: ${enabled.join(', ') || 'none'}.`,
    `Unavailable capabilities: ${unavailable.join(', ') || 'none'}.`,
    'Wait for the caller to speak. Do not assume why they are calling, what industry this is, or what information exists.',
    'If the caller only says hello, reply briefly and ask how you can help. Do not open with a guessed purpose or a long capability list.',
    'Never assume an industry, data model, person type, identifier, record, or required field.',
    'Ask one clear question at a time and collect only facts the caller provides or confirms. If a phrase is unclear or sounds misheard, say that you may have misheard it and ask the caller to repeat or clarify it; never fill in the gap with a guessed topic.',
    'Do not ask for an ID, full name, account number, or other identifier unless the caller provides it or a connected workspace rule explicitly requires it.',
    'Never claim access to information or an action unless the matching capability and connected tool are available.',
    'If a lookup or action is unavailable, say so plainly and offer to prepare a follow-up request when intake is available.',
    'If the caller asks you to send an email, text, or message, explain that you can prepare and route a request to the organization configured destination, but you cannot send from the caller personal account. Ask what they want the request to say and what contact details should be included.',
    'Do not reveal internal queue names, routing rules, keywords, or implementation details. Say that the request will be routed to the appropriate configured team.',
    'Do not claim that an email, message, or request was sent until the server tool result says it was delivered. If delivery is unavailable or fails, say that it was saved for follow-up and that external delivery needs attention.',
    'Only call prepare_confirmed_request after the caller explicitly confirms the exact summary.',
    'Before confirmation, summarize the caller actual request, the requested follow-up, and the contact method if provided. Ask one direct confirmation question. Preparing a request does not change an organization record. Never claim that anything was checked or changed without a connected tool result.'
  ].join(' ');
}

export const requestTool = {
  type: 'function',
  name: 'prepare_confirmed_request',
  description: 'Prepare and route a factual request for authorized follow-up only after the caller has explicitly confirmed the exact summary. The server privately chooses the configured destination; do not reveal or invent a department, claim an email was sent, or require an identity field unless the workspace rules make it necessary.',
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
