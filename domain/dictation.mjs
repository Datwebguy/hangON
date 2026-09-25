import { structuredCompletion } from './assemblyai-llm.mjs';

export const SERVICE_KEYTERMS = [
  'P-trap',
  'Main shutoff valve',
  'Water heater',
  'Pilot assembly',
  'Thermocouple',
  '200-amp panel',
  'GFCI breaker',
  'HVAC condenser',
  'Freon leak',
  'Sump pump',
  'Backflow preventer',
  'Drain snaking',
  'Apex Plumbing',
  'Sarah Miller',
  '742 Evergreen Terrace',
  'Oakridge Lane'
];

export const MAX_TRANSCRIPT_CHARS = 8000;

const EXTRACTION_SYSTEM = [
  'You extract a service appointment from a caller transcript for a solo plumbing, electrical, or HVAC business.',
  'The transcript comes from live speech recognition and may contain filler words and self-corrections ("Thursday, no wait, Friday").',
  'Always keep only the FINAL intended value after a self-correction, and list each correction you resolved in self_corrections.',
  'Use only what the caller actually said. If a field was not said, return an empty string for it. Never guess names, times, addresses, or phone numbers.',
  'service_type: a short 2 to 5 word description of the problem in plain words, such as "Kitchen sink leak" or "Sparking breaker panel", never a generic word like "repair".',
  'urgency: "emergency" for active danger or damage (sparking, flooding, burst pipe, no heat in freezing weather), "urgent" for active leaks or loss of service, otherwise "standard"; "unknown" if the transcript says nothing about the problem.'
].join(' ');

// Plain string types only: empty string means "not said" and is normalized to null below.
const optionalString = { type: 'string' };

export const JOB_SCHEMA = {
  type: 'object',
  properties: {
    customer_name: optionalString,
    phone: optionalString,
    service_type: optionalString,
    urgency: { type: 'string', enum: ['emergency', 'urgent', 'standard', 'unknown'] },
    scheduled_time: optionalString,
    address: optionalString,
    job_notes: optionalString,
    self_corrections: { type: 'array', items: { type: 'string' } }
  },
  required: ['customer_name', 'phone', 'service_type', 'urgency', 'scheduled_time', 'address', 'job_notes', 'self_corrections'],
  additionalProperties: false
};

export function cleanSummary(job) {
  const parts = [job.service_type || 'Service request'];
  if (job.customer_name) parts.push(`for ${job.customer_name}`);
  if (job.address) parts.push(`at ${job.address}`);
  if (job.scheduled_time) parts.push(`on ${job.scheduled_time}`);
  return parts.join(' ');
}

/**
 * Turns a caller transcript (already produced by AssemblyAI speech recognition in the
 * Voice Agent session) into structured job fields via AssemblyAI LLM Gateway.
 * Throws with a statusCode when the gateway is unconfigured or fails.
 */
export async function extractJobFromTranscript(transcript, options = {}) {
  const text = String(transcript || '').trim();
  if (!text) throw Object.assign(new Error('Transcript text is required.'), { statusCode: 422, code: 'transcript_required' });
  if (text.length > MAX_TRANSCRIPT_CHARS) throw Object.assign(new Error(`Transcript is longer than ${MAX_TRANSCRIPT_CHARS} characters.`), { statusCode: 413, code: 'transcript_too_long' });

  const { data, model, requestId } = await structuredCompletion({
    system: EXTRACTION_SYSTEM,
    user: `Caller transcript:\n"""\n${text}\n"""`,
    schemaName: 'service_appointment',
    schema: JOB_SCHEMA,
    maxTokens: 600,
    fetchImpl: options.fetchImpl
  });

  const structured = {};
  for (const key of Object.keys(JOB_SCHEMA.properties)) {
    if (key === 'self_corrections') continue;
    const value = data[key];
    structured[key] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  if (!['emergency', 'urgent', 'standard'].includes(structured.urgency)) structured.urgency = null;
  structured.self_corrections = Array.isArray(data.self_corrections) ? data.self_corrections.map(String) : [];
  structured.clean_summary = cleanSummary(structured);

  return {
    text,
    structured,
    final_text: structured.clean_summary,
    model: `AssemblyAI LLM Gateway (${model})`,
    request_id: requestId
  };
}
