const conversation = document.querySelector('#conversation');
const emptyState = document.querySelector('#conversationEmpty');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const status = document.querySelector('#callStatus');
const title = document.querySelector('#conversationTitle');
const hint = document.querySelector('#callHint');
const voiceOrb = document.querySelector('#voiceOrb');
const voiceWave = document.querySelector('#voiceWave');

const changeStatus = document.querySelector('#changeStatus');
const rawSpeechText = document.querySelector('#rawSpeechText');
const cleanedSpeechText = document.querySelector('#cleanedSpeechText');
const slotAvailabilityBadge = document.querySelector('#slotAvailabilityBadge');
const targetSlot = document.querySelector('#targetSlot');
const actionReceipt = document.querySelector('#actionReceipt');
const receiptDetails = document.querySelector('#receiptDetails');
const smsMessage = document.querySelector('#smsMessage');

// Job fields filled from the AssemblyAI extraction
const jobFields = {
  customer_name: document.querySelector('#jobCustomer'),
  service_type: document.querySelector('#jobService'),
  scheduled_time: document.querySelector('#jobWhen'),
  address: document.querySelector('#jobWhere'),
  urgency: document.querySelector('#jobUrgency')
};

// Post Call Dossier Elements
const lemurDossier = document.querySelector('#lemurDossier');
const lemurSummary = document.querySelector('#lemurSummary');
const lemurSentimentScore = document.querySelector('#lemurSentimentScore');
const lemurPartsList = document.querySelector('#lemurPartsList');

const scenarioWaterHeater = document.querySelector('#scenarioWaterHeater');
const scenarioElectrical = document.querySelector('#scenarioElectrical');
const scenarioHvac = document.querySelector('#scenarioHvac');
const scenarioDrain = document.querySelector('#scenarioDrain');

const voice = window.HangOnVoice?.mount(document.querySelector('#voicePlacement'));

let csrfToken = '';
let session = null;
let simulatedCallRunning = false;
let bookedJob = null;
let lastExtraction = null;

function pcm(encoded) {
  const raw = atob(encoded);
  const output = new Int16Array(raw.length / 2);
  for (let i = 0; i < output.length; i += 1) {
    output[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
  }
  return output;
}

function resample(samples, sourceRate, targetRate) {
  if (sourceRate === targetRate) {
    return Float32Array.from(samples, (sample) => sample / 32768);
  }
  const ratio = sourceRate / targetRate;
  const targetCount = Math.floor(samples.length / ratio);
  const output = new Float32Array(targetCount);
  for (let i = 0; i < targetCount; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const a = (samples[left] || 0) / 32768;
    const b = (samples[left + 1] || samples[left] || 0) / 32768;
    output[i] = a + (b - a) * fraction;
  }
  return output;
}

function addMessage(who, text) {
  emptyState?.remove();
  const item = document.createElement('div');
  item.className = `message message-${who}`;
  const speaker = document.createElement('span');
  speaker.textContent = who === 'caller' ? 'Caller' : 'HangON';
  const content = document.createElement('p');
  content.textContent = text;
  item.append(speaker, content);
  conversation.append(item);
  conversation.scrollTop = conversation.scrollHeight;
}

function updateVisualizer(state) {
  if (state === 'speaking') {
    voiceOrb?.classList.add('orb-speaking');
    voiceWave?.classList.add('wave-active');
  } else if (state === 'listening') {
    voiceOrb?.classList.add('orb-listening');
    voiceOrb?.classList.remove('orb-speaking');
    voiceWave?.classList.add('wave-active');
  } else {
    voiceOrb?.classList.remove('orb-speaking', 'orb-listening');
    voiceWave?.classList.remove('wave-active');
  }
}

function updateDictationHUD(raw, cleaned) {
  if (rawSpeechText) rawSpeechText.textContent = raw || 'Listening to the caller…';
  if (cleanedSpeechText) cleanedSpeechText.textContent = cleaned || 'Building the booking summary…';
}

function renderJobFields(structured = {}) {
  Object.entries(jobFields).forEach(([key, el]) => {
    if (!el) return;
    const value = structured[key];
    el.textContent = value ? (key === 'urgency' ? value[0].toUpperCase() + value.slice(1) : value) : 'Not given';
    el.classList.toggle('is-empty', !value);
  });
}

function resetJobFields() {
  Object.values(jobFields).forEach((el) => {
    if (!el) return;
    el.textContent = 'Waiting';
    el.classList.add('is-empty');
  });
}

async function ensureDemoSession() {
  if (csrfToken) return csrfToken;
  const sessionRes = await fetch('/api/demo/session', { credentials: 'same-origin' }).catch(() => null);
  if (sessionRes && sessionRes.ok) {
    const sBody = await sessionRes.json().catch(() => ({}));
    csrfToken = sBody.data?.csrf || '';
  }
  return csrfToken;
}

function apiHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    'x-hangon-csrf': csrfToken,
    ...extra
  };
}

function appendReceiptRow(container, label, value, valueClass = '') {
  const row = document.createElement('div');
  row.className = 'receipt-row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  if (valueClass) valueEl.className = valueClass;
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  container.append(row);
}

function displayBookingReceipt(booking) {
  bookedJob = booking;
  renderJobFields(booking);
  if (cleanedSpeechText) cleanedSpeechText.textContent = `Booked: ${[booking.service_type, booking.customer_name, booking.scheduled_time, booking.address].filter(Boolean).join(' · ')}`;
  if (!actionReceipt) return;
  actionReceipt.hidden = false;
  if (changeStatus) {
    changeStatus.textContent = 'Job booked';
    changeStatus.className = 'status-chip status-safe';
  }
  if (slotAvailabilityBadge) {
    slotAvailabilityBadge.textContent = 'Confirmed';
    slotAvailabilityBadge.className = 'badge-tech badge-safe';
  }
  if (targetSlot) {
    targetSlot.textContent = `Booked: ${booking.scheduled_time}`;
  }

  if (receiptDetails) {
    receiptDetails.replaceChildren();
    appendReceiptRow(receiptDetails, 'Customer', booking.customer_name || 'Not given');
    appendReceiptRow(receiptDetails, 'Job', booking.service_type || 'Not given');
    appendReceiptRow(receiptDetails, 'When', booking.scheduled_time || 'Not given');
    appendReceiptRow(receiptDetails, 'Where', booking.address || 'Not given');
  }

  if (smsMessage) {
    smsMessage.textContent = booking.sms_dispatch?.message || '';
  }
}

function showEmailStatus(text, ok) {
  if (!receiptDetails) return;
  receiptDetails.querySelector('.receipt-row-email')?.remove();
  appendReceiptRow(receiptDetails, 'Email', text, ok ? 'text-accent' : 'text-warn');
  receiptDetails.lastElementChild?.classList.add('receipt-row-email');
}

function dossierView(data = {}) {
  return {
    summary: data.pro_brief,
    sentiment: data.caller_mood?.summary || null,
    parts: data.parts_checklist
  };
}

async function fetchDossier(transcript, metadata) {
  await ensureDemoSession();
  const res = await fetch('/api/lemur', {
    method: 'POST',
    credentials: 'same-origin',
    headers: apiHeaders(),
    body: JSON.stringify({ transcript, metadata })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.data) throw new Error(body.error?.message || 'Could not generate the technician brief.');
  return body.data;
}

function displayLemurError(message) {
  if (!lemurDossier) return;
  lemurDossier.hidden = false;
  if (lemurSummary) lemurSummary.textContent = `Brief unavailable: ${message}`;
  if (lemurSentimentScore) lemurSentimentScore.textContent = 'Unknown';
  lemurPartsList?.replaceChildren();
}

function displayLemurDossier(data = {}) {
  if (!lemurDossier) return;
  lemurDossier.hidden = false;
  if (lemurSummary && data.summary) lemurSummary.textContent = data.summary;
  if (lemurSentimentScore && data.sentiment) lemurSentimentScore.textContent = data.sentiment;
  if (lemurPartsList && Array.isArray(data.parts)) {
    lemurPartsList.replaceChildren();
    data.parts.forEach((part) => {
      const item = document.createElement('li');
      item.textContent = String(part);
      lemurPartsList.append(item);
    });
  }
}

async function executeBookingOnServer(args) {
  await ensureDemoSession();
  const response = await fetch('/api/calendar/book', {
    method: 'POST',
    credentials: 'same-origin',
    headers: apiHeaders(),
    body: JSON.stringify({
      customer_name: args.customer_name || args.name || null,
      service_type: args.service_type || args.request_summary || null,
      scheduled_time: args.scheduled_time || null,
      scheduled_at: args.scheduled_at || null,
      address: args.address || null,
      phone: args.phone || null,
      urgency: args.urgency || null,
      extraction_model: args.extraction_model || null,
      raw_speech: args.raw_speech || null,
      cleaned_text: args.cleaned_text || null,
      job_notes: args.request_summary || args.details?.summary || '',
      self_correction_resolved: Boolean(args.self_correction_resolved)
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data) {
    const message = body.error?.message || 'Could not save the booking. Please try again.';
    const openSlots = body.error?.details?.open_slots;
    if (response.status === 409) return { status: 'slot_unavailable', message, open_slots: openSlots || [] };
    if (changeStatus) {
      changeStatus.textContent = 'Booking failed';
      changeStatus.className = 'status-chip status-warn';
    }
    throw new Error(message);
  }

  displayBookingReceipt(body.data);
  return {
    status: 'booked',
    record_changed: true,
    appointment_id: body.data.id,
    scheduled_slot: body.data.scheduled_time,
    message: 'Job saved on the technician calendar. Offer the caller an email confirmation.'
  };
}

async function checkAvailabilityOnServer(preferredStart = '') {
  await ensureDemoSession();
  const url = new URL('/api/calendar', window.location.origin);
  url.searchParams.set('preferred_start', preferredStart);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data?.availability) {
    return { status: 'error', message: body.error?.message || 'The calendar could not be checked. Tell the caller and ask them to try again.' };
  }
  return body.data.availability;
}

function setReady() {
  voice?.setDisabled(false);
  session = null;
  start.disabled = false;
  stop.disabled = true;
  status.textContent = 'Ready';
  status.className = 'status-chip status-safe';
  title.textContent = 'Ready when you are';
  hint.textContent = 'Press Start call, or try a sample call.';
  updateVisualizer('idle');

  resetJobFields();
  if (rawSpeechText) rawSpeechText.textContent = 'Waiting for the caller…';
  if (cleanedSpeechText) cleanedSpeechText.textContent = 'Waiting…';
  if (targetSlot) targetSlot.textContent = 'No time chosen yet';
  if (slotAvailabilityBadge) slotAvailabilityBadge.textContent = 'Idle';
  if (actionReceipt) actionReceipt.hidden = true;
  if (lemurDossier) lemurDossier.hidden = true;
  if (changeStatus) {
    changeStatus.textContent = 'Waiting';
    changeStatus.className = 'status-chip status-neutral';
  }
}

function finish(resetUi = true) {
  clearTimeout(window.__hangonDictateTimer);
  if (session) {
    const current = session;
    session = null;
    if (current.readyTimer) clearTimeout(current.readyTimer);
    if (current.ws && ![WebSocket.CLOSED, WebSocket.CLOSING].includes(current.ws.readyState)) {
      try { current.ws.send(JSON.stringify({ type: 'session.end' })); } catch {}
      current.ws.close(1000, 'HangON ended the session');
    }
    current.stream?.getTracks().forEach((track) => track.stop());
    current.capture?.close();
    current.playback?.close();
  }
  simulatedCallRunning = false;
  if (resetUi) setReady();
  else {
    voice?.setDisabled(false);
    start.disabled = false;
    stop.disabled = true;
    updateVisualizer('idle');
  }
}

async function begin() {
  setReady();
  bookedJob = null;
  lastExtraction = null;
  conversation?.querySelectorAll('.message').forEach((m) => m.remove());
  voice?.setDisabled(true);
  start.disabled = true;
  status.textContent = 'Connecting';
  status.className = 'status-chip status-neutral';
  title.textContent = 'Connecting…';
  hint.textContent = 'Getting the line ready…';
  updateVisualizer('listening');

  try {
    const sessionRes = await fetch('/api/demo/session', { credentials: 'same-origin' }).catch(() => null);
    if (sessionRes && sessionRes.ok) {
      const sBody = await sessionRes.json().catch(() => ({}));
      csrfToken = sBody.data?.csrf || '';
    }

    const configResponse = await fetch('/api/voice-session', { credentials: 'same-origin' });
    const configBody = await configResponse.json().catch(() => ({}));
    if (!configResponse.ok || !configBody.data?.token) {
      throw new Error(configBody.error?.message || 'Could not start the voice call. Check that HangON is configured, then try again.');
    }
    const config = configBody.data;
    voice?.setVoices(config.voice?.voices, config.voice?.defaultVoice);

    const capture = new AudioContext();
    let playback;
    try {
      playback = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
    } catch {
      playback = new AudioContext({ latencyHint: 'interactive' });
    }

    await capture.resume();
    await playback.resume();
    await capture.audioWorklet.addModule('./pcm-processor.js');
    await playback.audioWorklet.addModule('./pcm-processor.js');

    const playbackNode = new AudioWorkletNode(playback, 'hangon-playback');
    playbackNode.connect(playback.destination);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (err) {
      throw new Error('Please allow the microphone, or try a sample call instead.');
    }

    const source = capture.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(capture, 'hangon-pcm', {
      processorOptions: { inputSampleRate: capture.sampleRate, targetSampleRate: 24000 }
    });
    const mute = capture.createGain();
    mute.gain.value = 0;
    source.connect(worklet).connect(mute).connect(capture.destination);

    const url = new URL('wss://agents.assemblyai.com/v1/ws');
    url.searchParams.set('token', config.token);
    const ws = new WebSocket(url);
    let ready = false;
    let confirmationRequested = false;
    let lastEvent = null;
    let flushingTools = false;
    const pending = [];
    const callLog = [];
    const callerLines = () => callLog.filter((line) => line.startsWith('Caller: ')).map((line) => line.slice(8)).join(' ');
    const audioQueue = [];

    const b64 = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let output = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        output += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
      }
      return btoa(output);
    };

    const sendAudio = (buf) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input.audio', audio: b64(buf) }));
      }
    };

    const flushPlayback = () => playbackNode.port.postMessage({ type: 'flush' });

    worklet.port.onmessage = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!ready) {
        if (audioQueue.length < 40) audioQueue.push(event.data);
        return;
      }
      sendAudio(event.data);
    };

    let sessionReadyTimer = null;
    const markReady = () => {
      if (ready) return;
      ready = true;
      if (sessionReadyTimer) clearTimeout(sessionReadyTimer);
      while (audioQueue.length && ws.readyState === WebSocket.OPEN) {
        sendAudio(audioQueue.shift());
      }
      status.textContent = 'On the line';
      status.className = 'status-chip status-safe';
      title.textContent = 'Listening';
      stop.disabled = false;
      hint.textContent = 'Speak naturally about the repair you need.';
      updateVisualizer('listening');
    };

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          system_prompt: config.system_prompt,
          greeting: 'Apex Home Services, this is HangON. Mike is on a job. How can I help?',
          input: {
            format: { encoding: 'audio/pcm' },
            // Adaptive pacing: gives callers who pause mid-thought ("Tuesday... actually, no") room to finish.
            transcription_mode: 'balanced',
            keyterms: [
              'P-trap',
              'Water heater',
              'GFCI breaker',
              'Sump pump',
              'Apex Plumbing'
            ],
            turn_detection: {
              interrupt_response: true
            }
          },
          output: {
            voice: voice?.getVoice() || config.voice.defaultVoice,
            format: { encoding: 'audio/pcm' }
          },
          tools: config.tools
        }
      }));
      // If session.ready is delayed, still open the mic path so the call doesn't stall.
      sessionReadyTimer = setTimeout(() => {
        if (!ready && ws.readyState === WebSocket.OPEN) markReady();
      }, 2500);
    });

    const sendToolResult = (call, result) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'tool.result',
          call_id: call.call_id,
          result: JSON.stringify(result)
        }));
      }
    };

    const runToolCall = async (call) => {
      const args = call.arguments || {};
      const toolName = call.name;

      if (toolName === 'check_calendar_availability') {
        return checkAvailabilityOnServer(args.preferred_start || '');
      }

      if (toolName === 'send_confirmation_email') {
        try {
          await ensureDemoSession();
          const emailRes = await fetch('/api/email/confirmation', {
            method: 'POST',
            credentials: 'same-origin',
            headers: apiHeaders(),
            body: JSON.stringify({
              email: args.email,
              // Prefer the job that was actually booked over the agent's paraphrase.
              customer_name: bookedJob?.customer_name || args.customer_name,
              service_type: bookedJob?.service_type || args.service_type,
              scheduled_time: bookedJob?.scheduled_time || args.scheduled_time,
              address: bookedJob?.address || args.address,
              phone: bookedJob?.phone || args.phone
            })
          });
          const emailBody = await emailRes.json().catch(() => ({}));
          if (!emailRes.ok) {
            const reason = emailBody.error?.message || 'Could not send the confirmation email.';
            showEmailStatus(`Not sent: ${reason}`, false);
            return { status: 'failed', message: reason };
          }
          showEmailStatus(`Sent to ${emailBody.data?.to || args.email}`, true);
          return {
            status: 'sent',
            message: emailBody.data?.message || 'Confirmation email sent.',
            subject: emailBody.data?.subject || null
          };
        } catch (emailError) {
          showEmailStatus('Not sent: the email request failed.', false);
          return { status: 'failed', message: emailError.message || 'Email request failed.' };
        }
      }

      if (args.confirmed !== true) {
        return { status: 'not_booked', message: 'Nothing was booked. Read the job, time, name and address back to the caller and wait for a clear yes before booking.' };
      }
      let result;
      try {
        result = await executeBookingOnServer(args);
      } catch (bookingError) {
        return {
          status: 'failed',
          record_changed: false,
          message: bookingError.message || 'Booking could not be saved.'
        };
      }
      if (result?.status !== 'booked') return result;
      // Never block the spoken reply on dossier generation.
      void (async () => {
        try {
          const dossier = await fetchDossier(callLog.join('\n'), {
            customer_name: args.customer_name,
            service_type: args.service_type,
            scheduled_time: args.scheduled_time,
            address: args.address
          });
          displayLemurDossier(dossierView(dossier));
        } catch (dossierError) {
          displayLemurError(dossierError.message);
        }
      })();
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
      } finally {
        flushingTools = false;
        if (pending.length && lastEvent === 'reply.done') void flushTools();
      }
    };

    ws.addEventListener('message', async (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }

      if (message.type === 'session.ready' || message.type === 'session.updated') {
        lastEvent = message.type;
        markReady();
      }

      if (message.type === 'error' || message.type === 'session.error') {
        status.textContent = 'Needs attention';
        status.className = 'status-chip status-warn';
        hint.textContent = message.error || message.message || 'The voice line hit an error. Try starting the call again.';
        updateVisualizer('idle');
      }

      if (message.type === 'input.speech.started') {
        flushPlayback();
        lastEvent = message.type;
        updateVisualizer('listening');
        title.textContent = 'Caller speaking';
      }

      if (message.type === 'reply.started') {
        lastEvent = message.type;
        updateVisualizer('speaking');
        title.textContent = 'HangON speaking';
      }

      if (message.type === 'transcript.user') {
        const text = message.text || '';
        addMessage('caller', text);
        if (text) callLog.push(`Caller: ${text}`);
        lastEvent = 'transcript.user';

        // Debounce HUD extraction so every partial transcript doesn't hit the server.
        clearTimeout(window.__hangonDictateTimer);
        window.__hangonDictateTimer = setTimeout(() => {
          ensureDemoSession().then(() => fetch('/api/dictate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: apiHeaders(),
            // Send everything the caller has said so far so corrections across turns resolve.
            body: JSON.stringify({ utterance: callerLines() })
          }))
            .then((r) => r.json())
            .then((data) => {
              // Once a job is booked, the panel shows the booking, not the caller's earlier wording.
              if (bookedJob) return;
              if (data.data?.structured) {
                const s = data.data.structured;
                lastExtraction = s;
                updateDictationHUD(text, s.clean_summary);
                renderJobFields(s);
                if (targetSlot && s.scheduled_time) targetSlot.textContent = `Caller asked for: ${s.scheduled_time}`;
              } else if (data.error && !lastExtraction) {
                updateDictationHUD(text, `Extraction unavailable: ${data.error.message}`);
              }
            })
            .catch((e) => { if (!lastExtraction && !bookedJob) updateDictationHUD(text, `Extraction unavailable: ${e.message}`); });
        }, 1200);
      }

      if (message.type === 'transcript.agent') {
        const text = message.text || '';
        addMessage('agent', text);
        if (text) callLog.push(`HangON: ${text}`);
        lastEvent = 'transcript.agent';
      }

      if (message.type === 'tool.call') {
        pending.push(message);
        if (changeStatus) {
          changeStatus.textContent = 'Booking the job…';
          changeStatus.className = 'status-chip status-warn';
        }
        void flushTools();
      }

      if (message.type === 'reply.audio') {
        const samples = pcm(message.data);
        const output = resample(samples, 24000, playback.sampleRate);
        playbackNode.port.postMessage({ type: 'audio', samples: output.buffer }, [output.buffer]);
      }

      if (message.type === 'reply.done') {
        lastEvent = message.type;
        if (message.status === 'interrupted') {
          pending.length = 0;
          flushPlayback();
        } else {
          void flushTools();
        }
        updateVisualizer('listening');
        title.textContent = 'Listening';
      }
    });

    ws.addEventListener('close', () => finish(false));
    ws.addEventListener('error', () => finish(false));

    session = { ws, stream, capture, playback, readyTimer: sessionReadyTimer };
  } catch (err) {
    status.textContent = 'Needs attention';
    status.className = 'status-chip status-warn';
    hint.textContent = err.message || 'Microphone issue. Try a sample call instead.';
    start.disabled = false;
    updateVisualizer('idle');
  }
}

async function runSimulatedScenario(scenario) {
  if (simulatedCallRunning) return;
  finish(true);
  simulatedCallRunning = true;

  if (lemurDossier) lemurDossier.hidden = true;
  if (actionReceipt) actionReceipt.hidden = true;

  start.disabled = true;
  stop.disabled = false;
  status.textContent = 'On the line';
  status.className = 'status-chip status-safe';
  title.textContent = 'Sample call running';
  hint.textContent = 'Watch HangON confirm the job and book the visit.';

  addMessage('agent', 'Apex Home Services, this is HangON. Mike is on a job right now. How can I help?');
  updateVisualizer('speaking');
  await new Promise((r) => setTimeout(r, 1200));

  updateVisualizer('listening');
  title.textContent = 'Caller speaking';
  addMessage('caller', scenario.callerSpeech);
  updateDictationHUD(scenario.callerSpeech, 'Catching the final day and time…');


  await new Promise((r) => setTimeout(r, 1500));

  await ensureDemoSession();
  const dictationRes = await fetch('/api/dictate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: apiHeaders(),
    body: JSON.stringify({ utterance: scenario.callerSpeech })
  }).then((r) => r.json()).catch((e) => ({ error: { message: e.message } }));

  const structured = dictationRes.data?.structured;
  if (!structured) {
    const reason = dictationRes.error?.message || 'AssemblyAI extraction failed.';
    updateDictationHUD(scenario.callerSpeech, `Extraction unavailable: ${reason}`);
    status.textContent = 'Needs attention';
    status.className = 'status-chip status-warn';
    hint.textContent = reason;
    title.textContent = 'Could not read the call';
    simulatedCallRunning = false;
    stop.disabled = true;
    start.disabled = false;
    updateVisualizer('idle');
    return;
  }
  structured.extraction_model = dictationRes.data.model;
  updateDictationHUD(scenario.callerSpeech, structured.clean_summary);
  renderJobFields(structured);

  updateVisualizer('speaking');
  title.textContent = 'Confirming details';
  const confirmationSpeech = [
    `Got it: ${structured.service_type || 'your service request'}.`,
    structured.scheduled_time ? `${structured.scheduled_time} is open on Mike's schedule.` : 'What day and time works for you?',
    structured.address ? `Address ${structured.address}.` : 'What is the service address?',
    'Shall I lock that in?'
  ].join(' ');
  addMessage('agent', confirmationSpeech);
  await new Promise((r) => setTimeout(r, 1800));

  updateVisualizer('listening');
  title.textContent = 'Caller confirming';
  addMessage('caller', 'Yes please, go ahead and lock it in.');
  await new Promise((r) => setTimeout(r, 1200));

  updateVisualizer('speaking');
  title.textContent = 'Booking the job';
  if (changeStatus) {
    changeStatus.textContent = 'Saving to calendar…';
    changeStatus.className = 'status-chip status-warn';
  }

  try {
    await executeBookingOnServer(structured);
  } catch (bookingError) {
    status.textContent = 'Needs attention';
    status.className = 'status-chip status-warn';
    hint.textContent = bookingError.message || 'Could not save the booking.';
    title.textContent = 'Booking failed';
    simulatedCallRunning = false;
    stop.disabled = true;
    start.disabled = false;
    updateVisualizer('idle');
    return;
  }

  try {
    const dossier = await fetchDossier(`Caller: ${scenario.callerSpeech}\nHangON: ${confirmationSpeech}\nCaller: Yes please, go ahead and lock it in.`, {
      customer_name: structured.customer_name,
      service_type: structured.service_type,
      scheduled_time: structured.scheduled_time,
      address: structured.address
    });
    displayLemurDossier(dossierView(dossier));
  } catch (dossierError) {
    displayLemurError(dossierError.message);
  }

  addMessage('agent', `All set${structured.customer_name ? `, ${structured.customer_name}` : ''}. You're booked for ${structured.scheduled_time}${structured.address ? ` at ${structured.address}` : ''}. I'll text Mike the job details now.`);
  hint.textContent = 'Job booked. It\'s on Mike\'s schedule.';
  title.textContent = 'Call complete';
  status.textContent = 'Job booked';
  updateVisualizer('idle');
  simulatedCallRunning = false;
  stop.disabled = true;
  start.disabled = false;
}

start?.addEventListener('click', begin);
stop?.addEventListener('click', () => {
  finish(false);
  status.textContent = bookedJob ? 'Call ended · job booked' : 'Call ended';
  status.className = bookedJob ? 'status-chip status-safe' : 'status-chip status-neutral';
  title.textContent = 'Call ended';
  hint.textContent = bookedJob ? 'The booking and brief are below.' : 'Press Start call to try again.';
});

scenarioWaterHeater?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "My water heater is making a banging sound and leaking from the bottom valve. Can you come by Thursday? Oh wait, no, Thursday my wife has the car, make it Friday at 10:30 AM if possible. It is Sarah Miller on 742 Evergreen Terrace."
  });
});

scenarioElectrical?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our main circuit breaker is sparking and half the house has no power. We need someone today. It is Mark Henderson on 14 Oakridge Lane."
  });
});

scenarioHvac?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our central air conditioner stopped cooling and is blowing lukewarm air. It is ninety degrees outside. Can someone come look at the compressor tomorrow morning? This is David Ramirez at 408 Whispering Pines."
  });
});

scenarioDrain?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our kitchen sink is backed up into the dishwasher line. Can someone snake it tomorrow around 1:30 PM? This is Marcus Vance on 19 Elm St."
  });
});
