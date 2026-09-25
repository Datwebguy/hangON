/**
 * AssemblyAI LLM Gateway client (https://www.assemblyai.com/docs/llm-gateway/overview).
 * The only place HangON sends caller transcripts to an LLM. Fails loudly: there is no
 * local fallback, so every structured field shown in the UI came from a real model call.
 */

const GATEWAY_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions';

// Tried in order. Gateway access differs per AssemblyAI account, so when the account is not
// allowed a model we move to the next one and remember whichever answered.
const CANDIDATE_MODELS = ['gemini-2.5-flash-lite', 'qwen3.5-4b-32k-fast', 'gpt-5-nano', 'claude-haiku-4-5-20251001'];
let workingModel = null;
// Models that reject response_format get the schema in the prompt instead; replies are still parsed and checked.
const promptSchemaModels = new Set();

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function candidateModels() {
  const configured = process.env.HANGON_LLM_MODEL;
  if (configured) return [configured];
  return workingModel ? [workingModel, ...CANDIDATE_MODELS.filter((m) => m !== workingModel)] : CANDIDATE_MODELS;
}

export function resetModelCache() {
  workingModel = null;
  promptSchemaModels.clear();
}

export function isLLMConfigured() {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

function errorDetail(body, status) {
  const specific = Array.isArray(body.metadata?.errors) ? body.metadata.errors.join('; ') : '';
  return specific || body.error?.message || (typeof body.error === 'string' ? body.error : '') || body.message || `HTTP ${status}`;
}

function isResponseFormatError(body) {
  return /does not support response_format/i.test(errorDetail(body, 0));
}

function isModelAccessError(body) {
  return /access to this LLM Gateway model|model.*not (available|supported|found)/i.test(errorDetail(body, 0));
}

async function requestOnce(model, { apiKey, system, user, schemaName, schema, maxTokens, timeoutMs, fetchImpl }) {
  const schemaInPrompt = promptSchemaModels.has(model);
  const systemContent = schemaInPrompt
    ? `${system}

Reply with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:
${JSON.stringify(schema)}`
    : system;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: user }
        ],
        ...(schemaInPrompt ? {} : { response_format: { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } } })
      }),
      signal: controller.signal
    });
    return { response, body: await response.json().catch(() => ({})) };
  } catch (e) {
    throw fail(504, 'llm_unreachable', e.name === 'AbortError' ? 'AssemblyAI LLM Gateway timed out.' : 'Could not reach AssemblyAI LLM Gateway.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one structured-output completion and returns the parsed JSON object.
 * @param {{ system: string, user: string, schemaName: string, schema: object, maxTokens?: number, timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
export async function structuredCompletion({ system, user, schemaName, schema, maxTokens = 800, timeoutMs = 15000, fetchImpl = fetch }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw fail(503, 'llm_not_configured', 'ASSEMBLYAI_API_KEY is not set, so HangON cannot run AssemblyAI LLM Gateway extraction.');

  const denied = [];
  for (const model of candidateModels()) {
    const args = { apiKey, system, user, schemaName, schema, maxTokens, timeoutMs, fetchImpl };
    let { response, body } = await requestOnce(model, args);
    if (!response.ok && isResponseFormatError(body) && !promptSchemaModels.has(model)) {
      promptSchemaModels.add(model);
      ({ response, body } = await requestOnce(model, args));
    }
    if (!response.ok) {
      console.error(`[hangon] LLM Gateway ${response.status} (${model}): ${JSON.stringify(body).slice(0, 1000)}`);
      if (isModelAccessError(body)) {
        denied.push(model);
        continue;
      }
      throw fail(502, 'llm_failed', `AssemblyAI LLM Gateway rejected the request: ${errorDetail(body, response.status)}`);
    }
    const content = body.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content.replace(/^s*```(?:json)?s*|s*```s*$/g, '')) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') throw fail(502, 'llm_bad_output', 'AssemblyAI LLM Gateway returned output that is not the expected JSON.');
    workingModel = model;
    return { data: parsed, model: body.model || model, requestId: body.request_id || null };
  }
  throw fail(502, 'llm_no_model_access', `This AssemblyAI account has no access to the LLM Gateway models HangON tried (${denied.join(', ')}). Enable LLM Gateway on the account or set HANGON_LLM_MODEL to a model it can use.`);
}
