/**
 * AssemblyAI LLM Gateway client (https://www.assemblyai.com/docs/llm-gateway/overview).
 * The only place HangON sends caller transcripts to an LLM. Fails loudly: there is no
 * local fallback, so every structured field shown in the UI came from a real model call.
 */

const GATEWAY_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function llmModel() {
  return process.env.HANGON_LLM_MODEL || DEFAULT_MODEL;
}

export function isLLMConfigured() {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

/**
 * Runs one structured-output completion and returns the parsed JSON object.
 * @param {{ system: string, user: string, schemaName: string, schema: object, maxTokens?: number, timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
export async function structuredCompletion({ system, user, schemaName, schema, maxTokens = 800, timeoutMs = 15000, fetchImpl = fetch }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw fail(503, 'llm_not_configured', 'ASSEMBLYAI_API_KEY is not set, so HangON cannot run AssemblyAI LLM Gateway extraction.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: llmModel(),
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } }
      }),
      signal: controller.signal
    });
  } catch (e) {
    throw fail(504, 'llm_unreachable', e.name === 'AbortError' ? 'AssemblyAI LLM Gateway timed out.' : 'Could not reach AssemblyAI LLM Gateway.');
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`[hangon] LLM Gateway ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`);
    const detail = body.error?.message || body.error || body.message || `HTTP ${response.status}`;
    throw fail(502, 'llm_failed', `AssemblyAI LLM Gateway rejected the request: ${detail}`);
  }
  const content = body.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') throw fail(502, 'llm_bad_output', 'AssemblyAI LLM Gateway returned output that is not the expected JSON.');
  return { data: parsed, model: body.model || llmModel(), requestId: body.request_id || null };
}
