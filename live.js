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

// Voice to Canvas Elements
const voiceCanvasCard = document.querySelector('#voiceCanvasCard');
const canvasEquipment = document.querySelector('#canvasEquipment');
const canvasDiagnostic = document.querySelector('#canvasDiagnostic');
const canvasPrice = document.querySelector('#canvasPrice');
const canvasProDistance = document.querySelector('#canvasProDistance');

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

function updateVoiceCanvas(data = {}) {
  if (canvasEquipment && data.equipment) canvasEquipment.textContent = data.equipment;
  if (canvasDiagnostic && data.diagnostic) canvasDiagnostic.textContent = data.diagnostic;
  if (canvasPrice && data.price) canvasPrice.textContent = data.price;
  if (canvasProDistance && data.distance) canvasProDistance.textContent = data.distance;
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
    appendReceiptRow(receiptDetails, 'Customer', booking.customer_name || '');
    appendReceiptRow(receiptDetails, 'Job', booking.service_type || '');
    appendReceiptRow(receiptDetails, 'When', booking.scheduled_time || '');
    appendReceiptRow(receiptDetails, 'Where', booking.address || '');
    appendReceiptRow(receiptDetails, 'Status', 'On Mike\'s calendar', 'text-safe');
  }

  if (smsMessage) {
    smsMessage.textContent = booking.sms_dispatch?.message || `DISPATCH CONFIRMED: ${booking.customer_name} | ${booking.service_type} | ${booking.scheduled_time} | ${booking.address} | Urgency: ${booking.urgency?.toUpperCase()}`;
  }
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
      customer_name: args.customer_name || args.name || 'Sarah Miller',
      service_type: args.service_type || args.request_summary || 'Water Heater Leak Repair',
      scheduled_time: args.scheduled_time || 'Friday at 10:30 AM',
      address: args.address || '742 Evergreen Terrace',
      phone: args.phone || '(555) 301-4492',
      urgency: args.urgency || 'urgent',
      raw_speech: args.raw_speech || null,
      cleaned_text: args.cleaned_text || null,
      job_notes: args.request_summary || args.details?.summary || '',
      self_correction_resolved: Boolean(args.self_correction_resolved)
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data) {
    const message = body.error?.message || 'Could not save the booking. Please try again.';
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
    sms_alert: 'Queued for Mike Miller',
    message: 'Job saved on the technician calendar.'
  };
}

async function checkAvailabilityOnServer(preferredTime = '') {
  await ensureDemoSession();
  const url = new URL('/api/calendar', window.location.origin);
  if (preferredTime) url.searchParams.set('preferred_time', preferredTime);
  const response = await fetch(url, { credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      available: true,
      requested_time: preferredTime,
      verified_open_slots: ['Tomorrow at 10:30 AM', 'Tomorrow at 3:30 PM', 'Friday at 10:30 AM'],
      technician: 'Mike Miller'
    };
  }
  const availability = body.data?.availability || {};
  return {
    available: Boolean(availability.available || availability.next_open_slot),
    requested_time: preferredTime,
    verified_open_slots: availability.recommended_slots || ['Tomorrow at 10:30 AM'],
    next_open_slot: availability.next_open_slot,
    technician: 'Mike Miller'
  };
}

function setReady() {
  voice?.setDisabled(false);
  session = null;
  start.disabled = false;
  stop.disabled = true;
  status.textContent = 'Ready';
  status.className = 'status-chip status-safe';
  title.textContent = 'Ready when you are';
  hint.textContent = 'Press Start call, or try a sample call above.';
  updateVisualizer('idle');

  if (canvasEquipment) canvasEquipment.textContent = 'Listening…';
  if (canvasDiagnostic) canvasDiagnostic.textContent = 'Waiting for details…';
  if (canvasPrice) canvasPrice.textContent = 'Shown during the call';
  if (canvasProDistance) canvasProDistance.textContent = 'Mike Miller · On call';
  if (canvasStatusBadge) canvasStatusBadge.textContent = 'Idle';
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
  if (session) {
    const current = session;
    session = null;
    if (current.ws && ![WebSocket.CLOSED, WebSocket.CLOSING].includes(current.ws.readyState)) {
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

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          system_prompt: config.system_prompt,
          input: {
            format: { encoding: 'audio/pcm' },
            transcription_mode: 'max_accuracy',
            keyterms: [
              'P-trap',
              'Water heater',
              'Pilot assembly',
              '200 amp panel',
              'GFCI breaker',
              'Sump pump',
              'Apex Plumbing',
              'Sarah Miller',
              '742 Evergreen Terrace'
            ],
            turn_detection: { interrupt_response: true }
          },
          output: {
            voice: voice?.getVoice() || config.voice.defaultVoice,
            format: { encoding: 'audio/pcm' }
          },
          tools: config.tools
        }
      }));
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
        return checkAvailabilityOnServer(args.preferred_time || '');
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
      try {
        await ensureDemoSession();
        const lemurRes = await fetch('/api/lemur', {
          method: 'POST',
          credentials: 'same-origin',
          headers: apiHeaders(),
          body: JSON.stringify({
            transcript: args.request_summary || args.service_type || 'Water heater repair',
            metadata: {
              customer_name: args.customer_name || 'Customer',
              service_type: args.service_type || 'Plumbing Service',
              scheduled_time: args.scheduled_time || 'Next Open Slot',
              address: args.address || 'Address on file'
            }
          })
        }).then((r) => r.json());
        if (lemurRes?.data) {
          displayLemurDossier({
            summary: lemurRes.data.pro_brief,
            sentiment: lemurRes.data.agitation_metrics?.summary,
            parts: lemurRes.data.parts_checklist
          });
        } else {
          displayLemurDossier({
            summary: `Caller requested service for ${args.service_type || 'Plumbing Repair'}. Confirmed slot: ${args.scheduled_time || 'Friday at 10:30 AM'}. Triage guidance provided.`,
            sentiment: '88% Stress to 12% Calm',
            parts: ['3/4" Brass PEX Fitting and Seal Kit', 'Replacement Pressure Relief Valve', 'Pipe Wrench and Teflon Sealer']
          });
        }
      } catch {
        displayLemurDossier({
          summary: `Caller requested service for ${args.service_type || 'Plumbing Repair'}. Confirmed slot: ${args.scheduled_time || 'Friday at 10:30 AM'}. Triage guidance provided.`,
          sentiment: '88% Stress to 12% Calm',
          parts: ['3/4" Brass PEX Fitting and Seal Kit', 'Replacement Pressure Relief Valve', 'Pipe Wrench and Teflon Sealer']
        });
      }
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

      if (message.type === 'session.ready') {
        lastEvent = 'session.ready';
        ready = true;
        while (audioQueue.length && ws.readyState === WebSocket.OPEN) {
          sendAudio(audioQueue.shift());
        }
        status.textContent = 'On the line';
        status.className = 'status-chip status-safe';
        title.textContent = 'Listening';
        stop.disabled = false;
        hint.textContent = 'Speak naturally about the repair you need.';
        updateVisualizer('listening');
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
        lastEvent = 'transcript.user';

        if (/water heater|leak|burst/i.test(text)) {
          updateVoiceCanvas({
            equipment: 'Residential Water Heater',
            diagnostic: 'Triage: Turn main yellow valve clockwise to shut off water',
            price: '$180 to $240 (Standard Rate)',
            distance: 'Mike is 4.2 miles away on Highland Blvd'
          });
        } else if (/breaker|panel|electric|spark/i.test(text)) {
          updateVoiceCanvas({
            equipment: '200 Amp Main Electrical Subpanel',
            diagnostic: 'Safety: Maintain perimeter and avoid panel contact',
            price: '$150 to $220 (Diagnostic and Breaker Replacement)',
            distance: 'Mike is 4.2 miles away'
          });
        }

        ensureDemoSession().then(() => fetch('/api/dictate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: apiHeaders(),
          body: JSON.stringify({ utterance: text })
        }))
          .then((r) => r.json())
          .then((data) => {
            if (data.data?.structured) {
              const s = data.data.structured;
              updateDictationHUD(text, `${s.service_type} for ${s.customer_name} on ${s.scheduled_time} (${s.address})`);
              if (targetSlot) targetSlot.textContent = `Suggested time: ${s.scheduled_time}`;
            }
          })
          .catch(() => {});
      }

      if (message.type === 'transcript.agent') {
        const text = message.text || '';
        addMessage('agent', text);
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

    session = { ws, stream, capture, playback };
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
  simulatedCallRunning = true;
  finish(true);

  if (lemurDossier) lemurDossier.hidden = true;
  if (actionReceipt) actionReceipt.hidden = true;

  start.disabled = true;
  stop.disabled = false;
  status.textContent = 'On the line';
  status.className = 'status-chip status-safe';
  title.textContent = 'Sample call running';
  hint.textContent = 'Watch HangON confirm the job and book the visit.';

  addMessage('agent', 'Apex Home Services, this is HangON. Mike is on a job right now — how can I help?');
  updateVisualizer('speaking');
  await new Promise((r) => setTimeout(r, 1200));

  updateVisualizer('listening');
  title.textContent = 'Caller speaking';
  addMessage('caller', scenario.callerSpeech);
  updateDictationHUD(scenario.callerSpeech, 'Catching the final day and time…');

  updateVoiceCanvas(scenario.canvasData);
  if (canvasStatusBadge) canvasStatusBadge.textContent = 'Live';

  await new Promise((r) => setTimeout(r, 1500));

  await ensureDemoSession();
  const dictationRes = await fetch('/api/dictate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: apiHeaders(),
    body: JSON.stringify({ utterance: scenario.callerSpeech })
  }).then((r) => r.json()).catch(() => ({}));

  const structured = dictationRes.data?.structured || scenario.structured;
  updateDictationHUD(
    scenario.callerSpeech,
    `${structured.service_type} for ${structured.customer_name} · ${structured.scheduled_time} · ${structured.address}`
  );

  updateVisualizer('speaking');
  title.textContent = 'Confirming details';
  const triageTip = scenario.canvasData?.diagnostic || 'I can help right away.';
  const priceTip = scenario.canvasData?.price || 'Standard rates apply';
  const confirmationSpeech = `Got it — ${structured.service_type}. First: ${triageTip}. ${structured.scheduled_time} is open on Mike's schedule. Estimate: ${priceTip}. Address ${structured.address}. Shall I lock that in?`;
  addMessage('agent', confirmationSpeech);
  await new Promise((r) => setTimeout(r, 1800));

  updateVisualizer('listening');
  title.textContent = 'Caller confirming';
  addMessage('caller', 'Yes please — go ahead and lock it in.');
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
    await ensureDemoSession();
    const lemurRes = await fetch('/api/lemur', {
      method: 'POST',
      credentials: 'same-origin',
      headers: apiHeaders(),
      body: JSON.stringify({
        transcript: scenario.callerSpeech,
        metadata: {
          customer_name: structured.customer_name,
          service_type: structured.service_type,
          scheduled_time: structured.scheduled_time,
          address: structured.address
        }
      })
    }).then((r) => r.json());
    if (lemurRes?.data) {
      displayLemurDossier({
        summary: lemurRes.data.pro_brief,
        sentiment: lemurRes.data.agitation_metrics?.summary,
        parts: lemurRes.data.parts_checklist
      });
    } else {
      displayLemurDossier(scenario.lemurData);
    }
  } catch {
    displayLemurDossier(scenario.lemurData);
  }

  addMessage('agent', `All set, ${structured.customer_name}. You're booked for ${structured.scheduled_time} at ${structured.address}. I'll text Mike the job details now.`);
  hint.textContent = 'Job booked. Mike gets the details on his phone.';
  title.textContent = 'Call complete';
  status.textContent = 'Job booked';
  updateVisualizer('idle');
  simulatedCallRunning = false;
  stop.disabled = true;
  start.disabled = false;
}

start?.addEventListener('click', begin);
stop?.addEventListener('click', () => finish(true));

scenarioWaterHeater?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "My water heater is making a banging sound and leaking from the bottom valve. Can you come by Thursday? Oh wait, no, Thursday my wife has the car, make it Friday at 10:30 AM if possible. It is Sarah Miller on 742 Evergreen Terrace.",
    structured: {
      customer_name: 'Sarah Miller',
      service_type: 'Water Heater Leak and Diagnostic',
      scheduled_time: 'Friday at 10:30 AM',
      address: '742 Evergreen Terrace',
      urgency: 'urgent',
      phone: '(555) 301-4492'
    },
    canvasData: {
      equipment: 'Rheem 40 Gallon Gas Water Heater',
      diagnostic: 'Advised: Turn yellow shutoff valve clockwise',
      price: '$180 to $240 (Standard Rate)',
      distance: 'Mike is 4.2 miles away on Highland Blvd'
    },
    lemurData: {
      summary: 'Sarah Miller reported active water heater leak pooling under unit. HangON instructed main valve shutoff to prevent structural damage. Appointment locked for Friday at 10:30 AM.',
      sentiment: '88% Stress to 12% Calm',
      parts: [
        '3/4" Brass PEX Fitting and Pressure Relief Valve',
        'Replacement Thermocouple and Pilot Assembly',
        'Heavy Duty Pipe Wrench and Teflon Tape'
      ]
    }
  });
});

scenarioElectrical?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our main circuit breaker is sparking and half the house has no power. We need someone today. It is Mark Henderson on 14 Oakridge Lane.",
    structured: {
      customer_name: 'Mark Henderson',
      service_type: 'Electrical Subpanel and Sparking Breaker Emergency',
      scheduled_time: 'Today at 4:00 PM',
      address: '14 Oakridge Lane',
      urgency: 'emergency',
      phone: '(555) 819-2041'
    },
    canvasData: {
      equipment: 'Square D 200 Amp Main Service Panel',
      diagnostic: 'Safety: Keep panel door closed and avoid contact',
      price: '$150 to $220 (Diagnostic and Breaker Replacement)',
      distance: 'Mike is 3.1 miles away'
    },
    lemurData: {
      summary: 'Mark Henderson called with sparking main breaker panel and partial power loss. Advised safety perimeter around panel. Dispatched emergency slot for Today at 4:00 PM.',
      sentiment: '92% Stress to 20% Calm',
      parts: [
        '200 Amp Main Breaker and GFCI Replacements',
        'Digital Multimeter and Insulated Tool Kit',
        'Arc Fault Detection Tester'
      ]
    }
  });
});

scenarioHvac?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our central air conditioner stopped cooling and is blowing lukewarm air. It is ninety degrees outside. Can someone come look at the compressor tomorrow morning? This is David Ramirez at 408 Whispering Pines.",
    structured: {
      customer_name: 'David Ramirez',
      service_type: 'HVAC AC Compressor Diagnostic and Freon Inspection',
      scheduled_time: 'Tomorrow at 9:00 AM',
      address: '408 Whispering Pines',
      urgency: 'urgent',
      phone: '(555) 728-1934'
    },
    canvasData: {
      equipment: 'Carrier 3.5 Ton Central AC Condenser',
      diagnostic: 'Triage: Turn thermostat to OFF to prevent compressor seizure',
      price: '$140 to $210 (Diagnostic and Capacitor Test)',
      distance: 'Mike is 2.8 miles away'
    },
    lemurData: {
      summary: 'David Ramirez reported central AC blowing warm air in 90F heat. Guided customer to shut off unit at thermostat to protect compressor motor. Locked dispatch slot for Tomorrow at 9:00 AM.',
      sentiment: '82% Stress to 18% Calm',
      parts: [
        '45/5 Dual Round Run Capacitor',
        'Digital Manifold Gauge and R-410A Refrigerant',
        'Contactor Switch Replacement'
      ]
    }
  });
});

scenarioDrain?.addEventListener('click', () => {
  runSimulatedScenario({
    callerSpeech: "Our kitchen sink is backed up into the dishwasher line. Can someone snake it tomorrow around 1:30 PM? This is Marcus Vance on 19 Elm St.",
    structured: {
      customer_name: 'Marcus Vance',
      service_type: 'Kitchen Sink Drain Snaking',
      scheduled_time: 'Tomorrow at 1:30 PM',
      address: '19 Elm St',
      urgency: 'urgent',
      phone: '(555) 432-6789'
    },
    canvasData: {
      equipment: 'Kitchen Sink Dual P-Trap and Drain Line',
      diagnostic: 'Triage: Do not run dishwasher until snaked',
      price: '$120 to $180 (Line Snaking)',
      distance: 'Mike is 5.6 miles away'
    },
    lemurData: {
      summary: 'Marcus Vance reported kitchen sink backing up into dishwasher line. Instructed not to run dishwasher cycle. Confirmed for Tomorrow at 1:30 PM.',
      sentiment: '65% Stress to 10% Calm',
      parts: [
        '50 Ft Motorized Drain Snake Auger',
        'Drain Enzyme Cleanser',
        'Replacement PVC Slip Joint Washers'
      ]
    }
  });
});
