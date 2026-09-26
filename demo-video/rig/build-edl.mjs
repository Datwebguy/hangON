// Builds the edit decision list for the demo from take 7: clips of the real screen recording,
// the real call audio, narration placements, captions (real transcript text) and camera moves.
// Rule: every word of the call is kept; only silent waits are shortened.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const TAKE = path.join(ROOT, 'raw', 'take7');
const OFFSET = 1.47; // screen.mp4 time = log time + OFFSET (measured from two on-screen events)
const AUDIO_START = 53.28 + OFFSET; // recorder start in screen.mp4 time
const tl = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'));
const g = tl.markers.find((m) => m.name === 'grab:start').t;
const T = (ms) => (ms - g) / 1000 + OFFSET; // log timestamp -> screen.mp4 seconds
const mark = (name) => T(tl.markers.find((m) => m.name === name).t);

const vo = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'raw', 'vo-durations.txt'), 'utf8').trim().split(/\r?\n/).map((l) => l.split(' ')).map(([id, d]) => [id, Number(d)]));
vo.v06 = 4.51;
vo.v07 = Number(process.env.V07 || 5.5);
const voText = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'raw', 'vo-lines.txt'), 'utf8').trim().split(/\r?\n/).map((l) => l.split('|')));
voText.v06 = 'As she talks, the LLM Gateway turns her words into a job.';
voText.v07 = 'The LLM Gateway turns her words into a job. Her final answer: Wednesday.';
// Seconds to wait inside a pause before the line starts, so the screen has caught up with what it says.
const LEAD = { v07: 0.4 };

function speech(file) {
  const out = execSync(`ffmpeg -hide_banner -i "${path.join(TAKE, file)}" -af silencedetect=noise=-38dB:d=0.35 -f null - 2>&1`).toString();
  const marks = [...out.matchAll(/silence_(start|end): ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]);
  const segs = [];
  let lastEnd = 0;
  for (const [kind, t] of marks) {
    if (kind === 'start' && t > lastEnd + 0.05) segs.push([lastEnd + AUDIO_START, t + AUDIO_START]);
    if (kind === 'end') lastEnd = t;
  }
  return segs;
}
const agentSegs = speech('agent-0.wav').map(([a, b]) => ({ who: 'agent', a, b }));
const callerSegs = speech('caller-1.wav').map(([a, b]) => ({ who: 'caller', a, b }));

// ---- call: keep all speech, shorten silent waits ---------------------------------------------
const callStart = mark('click:Start call') + 5.8; // "Listening", just before the greeting
const callEnd = T(tl.events.filter((e) => e.type === 'transcript.agent').at(-1).t) + 0.6;
const PAD = 0.22;
const allSpeech = [...agentSegs, ...callerSegs].filter((s) => s.b > callStart && s.a < callEnd).sort((x, y) => x.a - y.a);
const merged = [];
for (const s of allSpeech) {
  const last = merged.at(-1);
  if (last && s.a - PAD <= last.b + PAD + 0.3) last.b = Math.max(last.b, s.b);
  else merged.push({ a: s.a, b: s.b });
}
// Narration goes into real waits while the agent works: [voId, log-time the wait begins after].
const gapVO = [['v07', 'caller:pickslot'], ['v08', 'caller:bookyes'], ['v09', 'caller:emailaddr']];
const keep = [];
for (let i = 0; i < merged.length; i += 1) {
  const cur = merged[i];
  const next = merged[i + 1];
  const a = Math.max(callStart, cur.a - PAD);
  let b = cur.b + PAD;
  let voId = null;
  if (next) {
    const gap = next.a - PAD - b;
    const hit = gapVO.find(([id, m]) => { const t = mark(m); return cur.b > t && cur.b < t + 12 && !keep.some((k) => k.vo === id); });
    if (hit && gap > vo[hit[0]] + (LEAD[hit[0]] || 0) + 0.5) { voId = hit[0]; b += (LEAD[voId] || 0) + vo[voId] + 0.7; }
    else b += Math.min(gap, 0.45);
  }
  keep.push({ a, b: next ? Math.min(b, next.a - PAD) : Math.min(b, callEnd), vo: voId });
}
// merge contiguous keep ranges
const callClips = [];
for (const k of keep) {
  const last = callClips.at(-1);
  if (last && k.a - last.b < 0.05 && !last.vo) { last.b = k.b; last.vo = k.vo; last.voAt = k.vo ? (k.b - vo[k.vo] - 0.7) : null; }
  else callClips.push({ ...k, voAt: k.vo ? k.b - vo[k.vo] - 0.7 : null });
}

// ---- whole programme ----------------------------------------------------------------------------
const clips = [];
let t = 0;
const add = (c) => { clips.push({ ...c, at: t }); t += c.dur; };
const COLD = 8.2, TITLE = 2.6, END = 5.0;
add({ kind: 'cold', dur: COLD, vo: [['v01', 0.9]] });
add({ kind: 'title', dur: TITLE });
const home = mark('home:hero') - 2.2;
add({ kind: 'screen', src: home, dur: 7.0, vo: [['v02', 0.4]] });
add({ kind: 'screen', src: mark('home:how'), dur: mark('click:theme dark') - mark('home:how'), vo: [['v03', 0.2]] });
add({ kind: 'screen', src: mark('click:theme dark') - 0.2, dur: 4.6, vo: [['v04', 0.3]] });
add({ kind: 'screen', src: mark('click:Try a live call') - 1.4, dur: mark('live:page') - mark('click:Try a live call') + 1.4 });
add({ kind: 'screen', src: mark('live:page'), dur: callStart - mark('live:page'), vo: [['v05', 0.5]] });
const callOut = [];
for (const c of callClips) {
  callOut.push({ srcA: c.a, outA: t });
  add({ kind: 'screen', src: c.a, dur: c.b - c.a, audio: true, vo: c.vo ? [[c.vo, c.voAt - c.a]] : [] });
}
add({ kind: 'screen', src: mark('click:End') - 0.6, dur: 3.0 });
add({ kind: 'screen', src: mark('results'), dur: 9.2, vo: [['v10', 0.3]] });
add({ kind: 'screen', src: mark('inbox:open') - 3.0, dur: 9.0, vo: [['v11', 3.4]], label: 'Dana’s inbox (public test inbox)' });
add({ kind: 'screen', src: mark('schedule:new-job') - 1.4, dur: 4.8, vo: [['v12', 0.3]] });
add({ kind: 'end', dur: END, vo: [['v13', 0.4]] });

// map a screen.mp4 time inside the call to output time
const callToOut = (s) => { const c = clips.find((x) => x.audio && s >= x.src - 0.01 && s <= x.src + x.dur + 0.01); return c ? c.at + (s - c.src) : null; };

// ---- captions -----------------------------------------------------------------------------------
const captions = [];
for (const c of clips) for (const [id, off] of c.vo || []) captions.push({ who: 'narrator', at: c.at + off, dur: vo[id], text: voText[id] });
const transcripts = tl.events.filter((e) => e.type === 'transcript.agent' || e.type === 'transcript.user');
// Group each speaker's speech into whole utterances (short pauses stay inside one utterance).
const utter = (segs) => segs.reduce((out, x) => { const last = out.at(-1); if (last && x.a - last.b < 1.3) last.b = x.b; else out.push({ ...x }); return out; }, []);
const agentUtt = utter(agentSegs), callerUtt = utter(callerSegs);
for (const seg of [...agentUtt, ...callerUtt].sort((x, y) => x.a - y.a)) {
  const type = seg.who === 'agent' ? 'transcript.agent' : 'transcript.user';
  const same = (seg.who === 'agent' ? agentUtt : callerUtt);
  const nextSame = same.find((s) => s.a > seg.a);
  const txt = transcripts.filter((e) => e.type === type && T(e.t) >= seg.a - 0.3 && T(e.t) < (nextSame ? nextSame.a : Infinity) - 0.3).map((e) => e.text.trim()).join(' ');
  const outA = callToOut(seg.a), outB = callToOut(seg.b);
  if (!txt || outA == null || outB == null) continue;
  // split long lines into readable chunks timed by word count
  const words = txt.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += 11) chunks.push(words.slice(i, i + 11).join(' '));
  const per = (outB - outA) / words.length;
  let at = outA;
  for (const ch of chunks) { const d = ch.split(' ').length * per; captions.push({ who: seg.who, at, dur: d, text: ch }); at += d; }
}
captions.sort((x, y) => x.at - y.at);

// ---- camera (keyframes in output seconds; x,y in 1920x1080 screen pixels) --------------------------
const cam = [{ t: 0, x: 960, y: 540, s: 1 }];
const push = (tt, x, y, s, hold = 0) => { cam.push({ t: tt, x, y, s }); if (hold) cam.push({ t: tt + hold, x, y, s }); };
const clipAt = (i) => clips.filter((c) => c.kind === 'screen')[i];
const h = clipAt(0); push(h.at + 2.6, 960, 540, 1); push(h.at + 4.0, 1440, 510, 1.32, 2.8);
const how = clipAt(1); push(how.at + 0.8, 960, 540, 1);
for (const c of clips.filter((x) => x.audio && x.vo?.length)) {
  const [id, off] = c.vo[0];
  const spot = { v06: [1450, 640, 1.5], v07: [1450, 700, 1.4], v08: [1450, 560, 1.45], v09: [640, 860, 1.4] }[id];
  push(c.at + off - 0.3, 960, 540, 1);
  push(c.at + off + 0.5, spot[0], spot[1], spot[2], vo[id] - 0.4);
  push(c.at + off + vo[id] + 0.7, 960, 540, 1);
}
const res = clips.find((c) => c.vo?.[0]?.[0] === 'v10');
push(res.at + 1.4, 960, 540, 1); push(res.at + 2.2, 600, 660, 1.4, 2.6); push(res.at + 5.6, 1450, 640, 1.4, 3.2);
const inbox = clips.find((c) => c.vo?.[0]?.[0] === 'v11');
push(inbox.at + 0.2, 960, 540, 1); push(inbox.at + 3.6, 1060, 880, 1.35, 5.0);
const sched = clips.find((c) => c.vo?.[0]?.[0] === 'v12');
push(sched.at, 960, 540, 1); push(sched.at + 1.4, 960, 800, 1.35, 3.0);
cam.sort((x, y) => x.t - y.t);

const edl = { fps: 30, duration: t, clips, captions, cam, voDur: vo };
fs.writeFileSync(path.join(ROOT, 'public', 'take', 'edl.json'), JSON.stringify(edl, null, 1));
const talk = clips.filter((c) => c.audio).reduce((s, c) => s + c.dur, 0);
console.log(`total ${t.toFixed(1)}s | call ${talk.toFixed(1)}s in ${callClips.length} clips (raw ${(callEnd - callStart).toFixed(1)}s) | captions ${captions.length}`);
