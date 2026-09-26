// Drives a real Chrome on the live site over the DevTools protocol and records one continuous take:
// screencast frames (with timestamps), the page's real audio (agent + caller), and a marker timeline.
// Usage: node record.mjs <outDir> [--only-call]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'take');
const ONLY_CALL = process.argv.includes('--only-call');
const GRAB = process.argv.includes('--grab');
const NO_CAST = GRAB || process.argv.includes('--no-cast');
const CAST_NTH = Number((process.argv.find((a) => a.startsWith('--nth=')) || '--nth=1').slice(6));
const SITE = 'https://tryhangon.xyz';
const INBOX = 'danacole';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const CALLER_DIR = path.join(HERE, '..', 'raw', 'caller');
const PORT = 9334;

fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const markers = [];
const mark = (name, extra = {}) => { markers.push({ t: Date.now(), name, ...extra }); console.log(new Date().toISOString().slice(11, 19), name, extra.text ? `: ${extra.text}` : ''); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Chrome + CDP -------------------------------------------------------------------
const profile = path.join(OUT, 'profile');
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1920,1080', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', '--window-position=0,0', ...(GRAB ? ['--kiosk'] : []), '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', 'about:blank'
], { stdio: 'ignore' });
await sleep(2500);
const cleanup = () => { try { chrome.kill(); } catch {} spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); };
process.on('uncaughtException', (e) => { console.error(e); cleanup(); setTimeout(() => process.exit(1), 500); });
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); setTimeout(() => process.exit(1), 500); });

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  else if (m.method) listeners.forEach((fn) => fn(m));
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
if (!GRAB) await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(HERE, 'inject.js'), 'utf8') });

// ---- screencast ------------------------------------------------------------------------
let frameCount = 0;
const frameIndex = [];
listeners.push(async (m) => {
  if (m.method !== 'Page.screencastFrame') return;
  const { data, metadata, sessionId } = m.params;
  const name = `f${String(++frameCount).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(OUT, 'frames', name), Buffer.from(data, 'base64'));
  frameIndex.push({ name, t: Math.round(metadata.timestamp * 1000) });
  send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const startCast = () => send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: CAST_NTH });

// ---- human-like interaction ---------------------------------------------------------------
async function box(selector) {
  for (let i = 0; i < 60; i += 1) {
    const b = await boxOnce(selector);
    if (b) return b;
    await sleep(250);
  }
  return null;
}
async function boxOnce(selector) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, h: r.height }; })()`);
}
async function moveTo(x, y) {
  const from = await evaluate('[window.__rig.cx ?? 640, window.__rig.cy ?? 470]');
  const dist = Math.hypot(x - from[0], y - from[1]);
  const ms = Math.round(Math.min(1100, Math.max(380, dist * 0.9)));
  await evaluate(`window.__rig.moveCursor(${x}, ${y}, ${ms})`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
async function hover(selector) {
  const b = await box(selector);
  if (!b) throw new Error(`not found: ${selector}`);
  await moveTo(Math.round(b.x + (Math.random() * 6 - 3)), Math.round(b.y + (Math.random() * 4 - 2)));
  return b;
}
async function click(selector, label) {
  const b = await hover(selector);
  const x = Math.round(b.x), y = Math.round(b.y);
  await sleep(160);
  await evaluate(`window.__rig.ripple(${x}, ${y})`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(70);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  mark(`click:${label || selector}`);
}
// Click the smallest visible element whose text contains the given phrase.
async function clickText(text, label) {
  const id = await evaluate(`(() => { const all = [...document.querySelectorAll('body *')].filter((el) => el.offsetParent && el.textContent.includes(${JSON.stringify(text)})); const el = all.sort((a, b) => a.textContent.length - b.textContent.length)[0]; if (!el) return null; el.setAttribute('data-rig-target', '1'); return true; })()`);
  if (!id) throw new Error(`text not found: ${text}`);
  await click('[data-rig-target="1"]', label || text);
  await evaluate(`document.querySelector('[data-rig-target]')?.removeAttribute('data-rig-target')`);
}
async function scrollToEl(selector, offset = 120, ms = 1400) {
  const y = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.getBoundingClientRect().top + window.scrollY - ${offset} : null; })()`);
  if (y == null) throw new Error(`not found: ${selector}`);
  await evaluate(`window.__rig.smoothScrollTo(${Math.max(0, y)}, ${ms})`);
}
async function goto(url, label) {
  mark(`goto:${label || url}`);
  await send('Page.navigate', { url });
  await sleep(2600);
}

// ---- the call --------------------------------------------------------------------------
const clip = (name) => fs.readFileSync(path.join(CALLER_DIR, `${name}.wav`)).toString('base64');
// The agent is done when its last reply has finished, a transcript arrived, and its audio has
// actually gone quiet (replies can be streamed faster than they are played).
async function agentFinished(sinceIdx, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await evaluate(`(() => { const ev = window.__rig.events.slice(${sinceIdx}); const lastReply = [...ev].reverse().find((e) => e.type === 'reply.started' || e.type === 'reply.done'); return { done: lastReply?.type === 'reply.done', spoke: ev.some((e) => e.type === 'transcript.agent'), quietFor: Date.now() - (window.__rig.agentLastLoud || 0) }; })()`);
    if (s.done && s.spoke && s.quietFor > 1800) return true;
    await sleep(150);
  }
  return false;
}
async function say(name) {
  mark(`caller:${name}`);
  const idx = await evaluate('window.__rig.events.length');
  await evaluate(`window.__rig.say(${JSON.stringify(clip(name))})`);
  return idx;
}
async function runCall() {
  await click('#start', 'Start call');
  // Each line is said once, in response to what the agent actually asked.
  const said = new Set();
  const repeatOf = { bookyes: 'bookyes2', time: 'time2', nameaddr: 'nameaddr2', emailaddr: 'emailaddr2' };
  const once = (name) => (!said.has(name) ? name : repeatOf[name] && !said.has(repeatOf[name]) ? repeatOf[name] : null);
  let since = 0;
  let waits = 0;
  for (let turn = 0; turn < 16; turn += 1) {
    const finished = await agentFinished(since);
    const ev = await evaluate('window.__rig.events');
    const t = ev.slice(since).filter((e) => e.type === 'transcript.agent').map((e) => e.text).join(' ').toLowerCase();
    const tools = ev.filter((e) => e.type === 'tool.call').map((e) => e.name || '');
    const booked = tools.includes('book_service_appointment');
    const emailed = tools.includes('send_confirmation_email');
    mark('agent', { text: t.slice(0, 240), finished });
    let line = null;
    if (turn > 0 && !t.trim()) {
      // The transcript can arrive after the audio ends; wait for it rather than guess.
      if (++waits > 3) { mark('rig:stuck'); break; }
      const more = await agentFinished(since, 12000);
      if (!more && !said.has('hello')) { said.add('hello'); since = await say('hello'); }
      turn -= 1;
      continue;
    }
    if (turn === 0) line = 'problem';
    else if (/e-?mail address/.test(t) && (t.includes("?") || /tell me|what is/.test(t)) && !said.has('emailaddr2')) line = once('emailaddr');
    else if (emailed && /(anything else|help with|all set|anything more)/.test(t)) line = once('nothing');
    else if (emailed && !/(spell|is that right|correct)/.test(t)) line = once('nothing');
    else if (said.has('emailaddr') && /(spell|is that right|correct|confirm|d-a-n|d, a, n)/.test(t)) line = once('emailright');
    else if (/e-?mail/.test(t) && /(address|what is|what's|spell)/.test(t) && said.has('emailyes')) line = once('emailaddr');
    else if (/e-?mail/.test(t)) line = said.has('emailyes') ? once('emailaddr') : once('emailyes');
    else if (!booked && /(already booked|instead|not available|either|any of th|openings|available times)/.test(t)) line = once('pickslot');
    else if (/(your name|name and|what is the (service )?address|what's the address|where is the (leak|job|home)|service address)/.test(t)) line = once('nameaddr');
    else if (!booked && /(shall i|should i|book (it|that|this|you)|lock|go ahead|want me to|is that (right|correct)|just to (be|make) sure|to confirm)/.test(t)) line = once('bookyes');
    else if (/(what day|what time|when would|when works|day and time|works best|work better|which day|come out)/.test(t)) line = said.has('time') ? once('time2') : once('time');
    else if (t.includes('?') || /(still|how long|drip|running|valve|turn(ed)? off|shut)/.test(t)) line = once('followup');
    if (!line && /(correct|right|sound good|does that|is that|okay?)/.test(t)) {
      const n = [...said].filter((x) => x.startsWith('yesright')).length;
      if (n < 2) { line = 'emailright'; said.add(`yesright${n}`); said.delete('emailright'); }
    }
    if (!line && /(bye|take care|have a (great|good))/.test(t)) break;
    if (!line) {
      // A statement, not a question: let the agent carry on instead of filling the silence.
      if (++waits > 2) { mark('rig:stuck'); break; }
      const more = await agentFinished(ev.length, 9000);
      if (!more) { mark('rig:stuck'); break; }
      turn -= 1;
      continue;
    }
    waits = 0;
    await sleep(450 + Math.random() * 350);
    const restarted = await evaluate(`window.__rig.events.slice(${ev.length}).some((e) => e.type === 'reply.started')`);
    if (restarted) { turn -= 1; continue; }
    said.add(line);
    since = await say(line);
    if (line === 'nothing') break;
  }
  await agentFinished(since, 25000);
  await sleep(1800);
}

// ---- the take -----------------------------------------------------------------------------
let grab = null;
if (GRAB) {
  // Screen capture from outside Chrome (like OBS), so the call audio keeps real time.
  grab = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', path.join(OUT, 'screen.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
  await sleep(1500);
  mark('grab:start');
}
if (!NO_CAST) await startCast();
mark('take:start');

if (!ONLY_CALL) {
  await goto(SITE + '/', 'home');
  await evaluate('window.__rig.moveCursor(760, 430, 10)');
  await sleep(2500);
  mark('home:hero');
  await hover('.example-card');
  await sleep(2600);
  await scrollToEl('#how', 90, 1800);
  mark('home:how');
  await hover('.steps .step:nth-child(2)');
  await sleep(2400);
  await scrollToEl('#schedule', 90, 1800);
  mark('home:schedule');
  await hover('#appointmentsFeed .appointment-row');
  await sleep(2600);
  await click('.theme-toggle-btn', 'theme dark');
  await sleep(1600);
  await click('.theme-toggle-btn', 'theme light');
  await sleep(1200);
  await evaluate('window.__rig.smoothScrollTo(0, 1600)');
  await sleep(1800);
  await click('.hero .button-primary', 'Try a live call');
  await sleep(2800);
} else {
  await goto(SITE + '/live.html', 'live');
}

mark('live:page');
await hover('#voiceChoice');
await sleep(1600);
await hover('#scenarioWaterHeater');
await sleep(700);
await hover('#scenarioDrain');
await sleep(1000);
mark('call:start');
await runCall();
mark('call:end');
await click('#stop', 'End');
await sleep(2500);
await scrollToEl('.results-grid', 100, 1600);
mark('results');
await hover('#actionReceipt .receipt-row-email, #receiptDetails');
await sleep(3000);
await hover('#lemurDossier');
await sleep(3500);

const audio = await evaluate('window.__rig.stopRecordings()');
audio.forEach((a, i) => { a.file = `${a.label}-${i}.webm`; fs.writeFileSync(path.join(OUT, a.file), Buffer.from(a.b64, 'base64')); });
const events = await evaluate('window.__rig.events');

if (!ONLY_CALL) {
  // The confirmation email: wait until it really lands in the public inbox, then film opening it.
  mark('inbox:wait');
  let arrived = false;
  for (let i = 0; i < 40 && !arrived; i += 1) {
    const r = await (await fetch(`https://www.mailinator.com/api/v2/domains/public/inboxes/${INBOX}`)).json().catch(() => ({}));
    const callStart = markers.find((m) => m.name === 'call:start')?.t || 0;
    arrived = (r.msgs || []).some((m) => /tryhangon/.test(m.fromfull || '') && m.time > callStart - 60000);
    if (!arrived) await sleep(10000);
  }
  mark('inbox:arrived', { text: String(arrived) });
  await goto(`https://www.mailinator.com/v4/public/inboxes.jsp?to=${INBOX}`, 'inbox');
  await sleep(3500);
  fs.writeFileSync(path.join(OUT, 'inbox-dom.html'), await evaluate('document.documentElement.outerHTML'));
  try { await clickText('your visit is booked', 'open email'); mark('inbox:open'); await sleep(6000); } catch (e) { mark('inbox:click-failed', { text: e.message }); await sleep(3000); }
  await goto(SITE + '/#schedule', 'schedule');
  await sleep(1500);
  await hover('#appointmentsFeed .appointment-row');
  mark('schedule:new-job');
  await sleep(3500);
}

mark('take:end');
if (!NO_CAST) await send('Page.stopScreencast');
if (grab) { grab.stdin.write('q'); await new Promise((r2) => grab.on('exit', r2)); }
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ markers, events, frames: frameIndex, audio: audio.map((a) => ({ label: a.label, file: a.file, startedAt: a.startedAt })) }, null, 2));
console.log(`frames: ${frameCount}, audio: ${audio.map((a) => a.label).join(', ')}`);
ws.close();
cleanup();
process.exit(0);
