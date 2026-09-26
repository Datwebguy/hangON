// Injected into every page before load. Adds a visible cursor, observes the voice agent
// WebSocket, feeds pre-recorded caller lines in as the microphone, and records the page's
// real audio output (the AssemblyAI agent voice) so the edit uses the actual call audio.
(() => {
  if (window.__rig) return;
  const rig = (window.__rig = { events: [], recorders: [], agentLevel: 0, agentLastLoud: 0 });

  // ---- cursor overlay -------------------------------------------------------------
  const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M5 3l16 9.5-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  function mountCursor() {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = `position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;background:url("${svg}") no-repeat;transform:translate(${rig.cx || 640}px,${rig.cy || 470}px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))`;
    document.documentElement.appendChild(c);
  }
  document.addEventListener('DOMContentLoaded', mountCursor);
  rig.moveCursor = (x, y, ms) => new Promise((resolve) => {
    mountCursor();
    const c = document.getElementById('__cursor');
    const sx = rig.cx ?? 640, sy = rig.cy ?? 470, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      rig.cx = sx + (x - sx) * e; rig.cy = sy + (y - sy) * e;
      c.style.transform = `translate(${rig.cx}px,${rig.cy}px)`;
      t < 1 ? setTimeout(() => step(performance.now()), 16) : resolve();
    };
    setTimeout(() => step(performance.now()), 16);
  });
  rig.ripple = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;border:2px solid rgba(16,185,129,.8);z-index:2147483646;pointer-events:none;transform:scale(.3);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out`;
    document.documentElement.appendChild(r);
    setTimeout(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; }, 16);
    setTimeout(() => r.remove(), 600);
  };
  rig.smoothScrollTo = (y, ms) => new Promise((resolve) => {
    const sy = window.scrollY, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, sy + (y - sy) * ease(t));
      t < 1 ? setTimeout(() => step(performance.now()), 16) : resolve();
    };
    setTimeout(() => step(performance.now()), 16);
  });

  // ---- observe the voice agent socket ----------------------------------------------
  const NativeWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
    if (String(url).includes('assemblyai')) {
      rig.events.push({ t: Date.now(), type: 'ws.open' });
      ws.addEventListener('message', (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === 'reply.audio') return;
          rig.events.push({ t: Date.now(), type: m.type, status: m.status || m.reason || m.error?.message || '', text: m.text || '', name: m.name || m.tool_name || m.function?.name || '' });
        } catch {}
      });
    }
    return ws;
  };
  window.WebSocket.prototype = NativeWS.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

  // ---- recording helpers -------------------------------------------------------------
  function record(stream, label) {
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
    rig.recorders.push({ label, rec, chunks, startedAt: Date.now() });
  }

  // ---- microphone = caller lines we control ------------------------------------------
  let callerCtx, callerDest;
  function callerStream() {
    if (!callerDest) {
      callerCtx = new AudioContext({ sampleRate: 48000 });
      callerDest = callerCtx.createMediaStreamDestination();
      const keep = callerCtx.createConstantSource();
      const g = callerCtx.createGain(); g.gain.value = 0;
      keep.connect(g).connect(callerDest); keep.start();
      record(callerDest.stream, 'caller');
    }
    return callerDest.stream;
  }
  navigator.mediaDevices.getUserMedia = async () => callerStream();
  rig.say = async (b64) => {
    callerStream();
    await callerCtx.resume();
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const buf = await callerCtx.decodeAudioData(bytes.buffer);
    const src = callerCtx.createBufferSource();
    src.buffer = buf; src.connect(callerDest);
    rig.events.push({ t: Date.now(), type: 'caller.start', duration: buf.duration });
    return new Promise((resolve) => { src.onended = () => { rig.events.push({ t: Date.now(), type: 'caller.end' }); resolve(buf.duration); }; src.start(); });
  };

  // ---- tap the agent's playback output -------------------------------------------------
  const tapped = new WeakMap();
  const nativeConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    const out = nativeConnect.call(this, target, ...rest);
    if (target instanceof AudioDestinationNode && this.context !== callerCtx) {
      let tap = tapped.get(this.context);
      if (!tap) {
        const dest = this.context.createMediaStreamDestination();
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        tap = { dest, analyser };
        tapped.set(this.context, tap);
        record(dest.stream, 'agent');
        const data = new Float32Array(analyser.fftSize);
        setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0; for (const v of data) sum += v * v;
          rig.agentLevel = Math.sqrt(sum / data.length);
          if (rig.agentLevel > 0.01) rig.agentLastLoud = Date.now();
        }, 50);
      }
      nativeConnect.call(this, tap.dest);
      nativeConnect.call(this, tap.analyser);
    }
    return out;
  };

  rig.stopRecordings = async () => {
    const results = [];
    for (const r of rig.recorders) {
      await new Promise((resolve) => { r.rec.onstop = resolve; r.rec.state === 'inactive' ? resolve() : r.rec.stop(); });
      const blob = new Blob(r.chunks, { type: 'audio/webm' });
      const b64 = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      results.push({ label: r.label, startedAt: r.startedAt, b64 });
    }
    return results;
  };
})();
