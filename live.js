const conversation = document.querySelector('#conversation');
const emptyState = document.querySelector('#conversationEmpty');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const status = document.querySelector('#callStatus');
const title = document.querySelector('#conversationTitle');
const hint = document.querySelector('#callHint');
const changeList = document.querySelector('#changeList');
const changeStatus = document.querySelector('#changeStatus');
const voice = window.HangOnVoice?.mount(document.querySelector('#voicePlacement'));
let csrfToken = '';
let session = null;

function addMessage(who, text) {
  emptyState?.remove();
  const item = document.createElement('div'); item.className = `message message-${who}`;
  const speaker = document.createElement('span'); speaker.textContent = who === 'caller' ? 'You' : 'HangON';
  const content = document.createElement('p'); content.textContent = text; item.append(speaker, content); conversation.append(item); conversation.scrollTop = conversation.scrollHeight;
}

function showChange(label, detail, tone = 'neutral') {
  const item = document.createElement('div'); item.className = `change-item change-${tone}`; const caption = document.createElement('span'); caption.textContent = label; const value = document.createElement('strong'); value.textContent = detail; item.append(caption, value); changeList.replaceChildren(item);
  changeStatus.textContent = tone === 'safe' ? 'Prepared' : tone === 'warn' ? 'Review' : 'Waiting'; changeStatus.className = `status-chip ${tone === 'safe' ? 'status-safe' : tone === 'warn' ? 'status-warn' : 'status-neutral'}`;
}

function setReady() { voice?.setDisabled(false); session = null; start.disabled = false; stop.disabled = true; status.textContent = 'Ready'; status.className = 'status-chip status-safe'; title.textContent = 'Ready to listen'; hint.textContent = 'Nothing is being recorded now.'; }
function finish() { if (!session) return; const current = session; session = null; if (current.ws && ![WebSocket.CLOSED, WebSocket.CLOSING].includes(current.ws.readyState)) current.ws.close(1000, 'HangON ended the session'); current.stream?.getTracks().forEach((track) => track.stop()); current.capture?.close(); current.playback?.close(); setReady(); }

function resample(samples, sourceRate, targetRate) {
  if (sourceRate === targetRate) return Float32Array.from(samples, (sample) => sample / 32768);
  const output = new Float32Array(Math.max(1, Math.round(samples.length * targetRate / sourceRate)));
  for (let index = 0; index < output.length; index += 1) { const position = index * sourceRate / targetRate; const left = Math.floor(position); const fraction = position - left; const a = samples[left] || 0; const b = samples[left + 1] || a; output[index] = (a + (b - a) * fraction) / 32768; }
  return output;
}

async function begin() {
  voice?.setDisabled(true); start.disabled = true; status.textContent = 'Connecting'; status.className = 'status-chip status-neutral'; title.textContent = 'Connecting'; hint.textContent = 'HangON is preparing a private voice session.';
  try {
    const sessionBody = await window.HangOnAuth.ensureSession(); csrfToken = sessionBody.data?.csrf || '';
    const configResponse = await fetch('/api/voice-session', { credentials: 'same-origin' }); const configBody = await configResponse.json().catch(() => ({})); if (!configResponse.ok || !configBody.data?.token) throw new Error(configBody.error?.message || 'HangON could not connect to the voice service.'); const config = configBody.data; voice?.setVoices(config.voice?.voices, config.voice?.defaultVoice);
    const capture = new AudioContext(); let playback; try { playback = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' }); } catch { playback = new AudioContext({ latencyHint: 'interactive' }); }
    await capture.resume(); await playback.resume(); await capture.audioWorklet.addModule('./pcm-processor.js'); await playback.audioWorklet.addModule('./pcm-processor.js');
    const playbackNode = new AudioWorkletNode(playback, 'hangon-playback'); playbackNode.connect(playback.destination);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (error) { if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') throw new Error('Microphone access is needed to start the call.'); throw new Error('HangON could not access the microphone.'); }
    const source = capture.createMediaStreamSource(stream); const worklet = new AudioWorkletNode(capture, 'hangon-pcm', { processorOptions: { inputSampleRate: capture.sampleRate, targetSampleRate: 24000 } }); const mute = capture.createGain(); mute.gain.value = 0; source.connect(worklet).connect(mute).connect(capture.destination);
    const url = new URL('wss://agents.assemblyai.com/v1/ws'); url.searchParams.set('token', config.token); const ws = new WebSocket(url); let ready = false; let confirmationRequested = false; let confirmationAccepted = false; let lastEvent = null; let flushingTools = false; const pending = []; const audioQueue = [];
    const b64 = (buffer) => { const bytes = new Uint8Array(buffer); let output = ''; for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length))); return btoa(output); };
    const pcm = (encoded) => { const raw = atob(encoded); const output = new Int16Array(raw.length / 2); for (let index = 0; index < output.length; index += 1) output[index] = raw.charCodeAt(index * 2) | (raw.charCodeAt(index * 2 + 1) << 8); return output; };
    const sendAudio = (buffer) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input.audio', audio: b64(buffer) })); };
    const flushPlayback = () => playbackNode.port.postMessage({ type: 'flush' });
    worklet.port.onmessage = (event) => { if (ws.readyState !== WebSocket.OPEN) return; if (!ready) { if (audioQueue.length < 40) audioQueue.push(event.data); return; } sendAudio(event.data); };
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'session.update', session: { system_prompt: config.system_prompt, input: { format: { encoding: 'audio/pcm' }, transcription_mode: 'max_accuracy', keyterms: [], turn_detection: { interrupt_response: true } }, output: { voice: voice?.getVoice() || config.voice.defaultVoice, format: { encoding: 'audio/pcm' } }, tools: config.tools } })));
    const sendToolResult = (call, result) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'tool.result', call_id: call.call_id, result: JSON.stringify(result) })); };
    const runToolCall = async (call) => {
      const args = call.arguments || {};
      const confirmed = args.confirmed === true && confirmationAccepted;
      confirmationAccepted = false;
      confirmationRequested = false;
      const payload = { request_summary: args.request_summary, details: args.details, confirmed, source: 'voice', idempotency_key: typeof call.call_id === 'string' && call.call_id.length >= 8 ? call.call_id : crypto.randomUUID() };
      let prepared = false; let delivery = null; let failure = 'The request needs a clear summary and explicit confirmation.';
      if (confirmed) {
        try {
          const proposalResponse = await fetch('/api/requests/confirmation', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hangon-csrf': csrfToken }, body: JSON.stringify(payload) });
          const proposalBody = await proposalResponse.json().catch(() => ({}));
          if (!proposalResponse.ok || typeof proposalBody.data?.confirmation_token !== 'string') throw new Error(proposalBody.error?.message || 'The request confirmation could not be created.');
          const response = await fetch('/api/requests', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hangon-csrf': csrfToken }, body: JSON.stringify({ ...payload, confirmation_token: proposalBody.data.confirmation_token }) });
          const body = await response.json().catch(() => ({})); prepared = response.ok; delivery = body.data?.delivery || null; if (!prepared) failure = body.error?.message || 'The request could not be prepared.';
        } catch (error) { failure = error.message || 'The request service is unavailable. Nothing was saved.'; }
      }
      const delivered = delivery?.status === 'delivered';
      const result = prepared ? { status: delivered ? 'delivered' : 'prepared', record_changed: false, delivery_status: delivery?.status || 'not_configured', message: delivered ? 'Request prepared and delivered to the configured follow-up destination; no organization record was changed.' : 'Request prepared for authorized follow-up, but external delivery is not confirmed; no organization record was changed.' } : { status: 'blocked', record_changed: false, reason: failure };
      showChange(prepared ? (delivered ? 'Request delivered' : 'Request prepared') : 'Request held', prepared ? (delivered ? 'Sent to the configured follow-up destination' : 'Saved for authorized follow-up') : failure, prepared ? 'safe' : 'warn');
      return result;
    };
    const flushTools = async () => {
      if (flushingTools || lastEvent !== 'reply.done') return;
      flushingTools = true;
      try {
        while (pending.length && lastEvent === 'reply.done') {
          const call = pending[0];
          if (!call.result) {
            if (call.processing) return;
            call.processing = true;
            call.result = await runToolCall(call);
          }
          if (lastEvent !== 'reply.done') return;
          sendToolResult(call, call.result);
          pending.shift();
        }
      } finally { flushingTools = false; if (pending.length && lastEvent === 'reply.done') void flushTools(); }
    };
    ws.addEventListener('message', async (event) => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'session.ready') { lastEvent = 'session.ready'; ready = true; while (audioQueue.length && ws.readyState === WebSocket.OPEN) sendAudio(audioQueue.shift()); status.textContent = 'Live'; status.className = 'status-chip status-safe'; title.textContent = 'Listening'; stop.disabled = false; hint.textContent = 'Speak naturally. End the call when you are finished.'; }
      if (message.type === 'input.speech.started' || message.type === 'reply.started') lastEvent = message.type;
      if (message.type === 'transcript.user') { const text = message.text || ''; addMessage('caller', text); lastEvent = 'transcript.user'; if (confirmationRequested && /\b(yes|correct|confirm|that is right|that’s right|thats right)\b/i.test(text)) { confirmationAccepted = true; confirmationRequested = false; } }
      if (message.type === 'transcript.agent') { const text = message.text || ''; addMessage('agent', text); lastEvent = 'transcript.agent'; confirmationRequested = /\b(is that correct|shall i|would you like me to|please confirm|say yes|okay to save)\b/i.test(text); if (confirmationRequested) confirmationAccepted = false; }
      if (message.type === 'tool.call') { pending.push(message); showChange('Request to review', 'Waiting for a clear summary and confirmation', 'warn'); void flushTools(); }
      if (message.type === 'reply.audio') { const samples = pcm(message.data); const output = resample(samples, 24000, playback.sampleRate); playbackNode.port.postMessage({ type: 'audio', samples: output.buffer }, [output.buffer]); }
      if (message.type === 'reply.done') { lastEvent = 'reply.done'; if (message.status === 'interrupted') { pending.length = 0; confirmationRequested = false; confirmationAccepted = false; flushPlayback(); } else void flushTools(); }
      if (message.type === 'session.error' || message.type === 'error') { status.textContent = 'Call error'; status.className = 'status-chip status-warn'; hint.textContent = 'HangON could not continue this call. Nothing was saved automatically.'; }
      if (message.type === 'session.ended') finish();
    });
    ws.addEventListener('error', () => { status.textContent = 'Call error'; status.className = 'status-chip status-warn'; hint.textContent = 'The voice connection was interrupted. Try again.'; }); ws.addEventListener('close', () => { if (session) finish(); }); session = { ws, stream, capture, playback };
  } catch (error) { status.textContent = 'Could not start'; status.className = 'status-chip status-warn'; hint.textContent = error.message || 'HangON could not start the call.'; start.disabled = false; voice?.setDisabled(false); title.textContent = 'Ready to listen'; }
}

function end() { if (!session) return; if (session.ws.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify({ type: 'session.end' })); else finish(); }
start.addEventListener('click', begin); stop.addEventListener('click', end);
