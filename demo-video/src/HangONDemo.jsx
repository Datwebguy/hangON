import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const COLORS = {
  ink: '#17211f',
  muted: '#66736f',
  paper: '#f6f8f6',
  panel: '#ffffff',
  line: '#d9e2de',
  accent: '#176b55',
  accentSoft: '#e2f1eb',
  warn: '#9a5b18',
  warnSoft: '#fff0d8',
  danger: '#a7453c',
  dangerSoft: '#fce9e5',
};

const scenes = [
  {from: 0, to: 8, kicker: 'THE FRONT DOOR FOR BETTER REQUESTS', title: 'Meet HangON.', body: 'A voice-first front desk that turns messy conversations into clear, reviewable requests.', kind: 'title'},
  {from: 8, to: 17, kicker: 'THE PROBLEM', title: 'The front door is often a maze.', body: 'People bounce between forms, phone trees, and disconnected inboxes. Teams receive partial context, duplicate work, and requests nobody can confidently act on.', kind: 'problem'},
  {from: 17, to: 27, kicker: 'THE IDEA', title: 'Let people explain what they need.', body: 'HangON gives every workspace a calm, conversational starting point—without guessing what the organization has not configured.', kind: 'home'},
  {from: 27, to: 37, kicker: 'STEP ONE', title: 'Start with the caller.', body: 'The experience begins with a simple “Start a call” button. No maze. No jargon. Just a natural way to explain the situation.', kind: 'call'},
  {from: 37, to: 47, kicker: 'STEP TWO', title: 'Ask only what is needed.', body: 'The voice agent asks focused follow-up questions, keeps the conversation moving, and stays inside the workspace’s rules.', kind: 'questions'},
  {from: 47, to: 57, kicker: 'STEP THREE', title: 'Make the request legible.', body: 'HangON turns the conversation into a structured summary your team can scan, understand, and follow up on.', kind: 'summary'},
  {from: 57, to: 67, kicker: 'STEP FOUR', title: 'Confirm before anything changes.', body: 'The caller hears the summary back and explicitly confirms it. That confirmation is tied to the exact request—not a stale button or a vague yes.', kind: 'confirm'},
  {from: 67, to: 77, kicker: 'BUILT FOR REAL WORKSPACES', title: 'Route with context, not assumptions.', body: 'A workspace can define its capabilities, required fields, and delivery route. If it has not configured an action, HangON does not pretend it happened.', kind: 'route'},
  {from: 77, to: 87, kicker: 'WHO IT IS FOR', title: 'For teams that cannot afford ambiguity.', body: 'Operations desks. Service teams. Community programs. Any organization where the quality of the first request shapes everything that follows.', kind: 'people'},
  {from: 87, to: 97, kicker: 'THE TRUST BOUNDARY', title: 'Prepared is not completed.', body: 'A prepared request is clearly marked for follow-up. HangON never claims a record changed or a message was sent when it did not.', kind: 'boundary'},
  {from: 97, to: 108, kicker: 'UNDER THE HOOD', title: 'Security belongs in the flow.', body: 'Temporary browser voice tokens. Server-owned prompts. Signed confirmation tokens. Idempotent request creation. Sensitive-field filtering.', kind: 'security'},
  {from: 108, to: 116, kicker: 'THE TAKEAWAY', title: 'Natural in. Trustworthy out.', body: 'HangON makes voice intake feel human while keeping system actions deliberate, visible, and accountable.', kind: 'takeaway'},
  {from: 116, to: 120, kicker: 'HANGON', title: 'Give every request a clear next step.', body: 'Start with the caller. Confirm the truth. Then let the workspace decide what happens next.', kind: 'end'},
];

const sceneFor = (seconds) => scenes.find((scene, index) => seconds >= scene.from && (seconds < scene.to || index === scenes.length - 1)) || scenes[0];

const ease = (value) => value * value * (3 - 2 * value);
const progressInScene = (seconds, scene) => Math.min(1, Math.max(0, (seconds - scene.from) / Math.max(1, Math.min(3, scene.to - scene.from))));
const fade = (seconds, scene) => {
  const local = seconds - scene.from;
  const remaining = scene.to - seconds;
  return Math.min(1, Math.max(0, Math.min(local / 1.2, remaining / 1.2)));
};

function Brand() {
  return <div style={{display: 'flex', alignItems: 'center', gap: 12, color: COLORS.ink, fontSize: 25, fontWeight: 700, letterSpacing: '-.04em'}}>
    <Img src={staticFile('hangon-logo.png')} style={{width: 42, height: 42, objectFit: 'contain', borderRadius: 11, background: '#fff'}} />
    <span>HangON</span>
  </div>;
}

function Badge({children, tone = 'safe'}) {
  const colors = tone === 'safe' ? [COLORS.accentSoft, COLORS.accent] : tone === 'warn' ? [COLORS.warnSoft, COLORS.warn] : [COLORS.dangerSoft, COLORS.danger];
  return <span style={{display: 'inline-flex', padding: '8px 13px', borderRadius: 999, background: colors[0], color: colors[1], fontSize: 14, fontWeight: 700}}>{children}</span>;
}

function AppHeader() {
  return <div style={{height: 82, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 66px', background: COLORS.panel, borderBottom: `1px solid ${COLORS.line}`}}>
    <Brand />
    <div style={{display: 'flex', gap: 38, alignItems: 'center', color: COLORS.muted, fontSize: 16}}><span style={{color: COLORS.ink, fontWeight: 700, borderBottom: `3px solid ${COLORS.accent}`, padding: '29px 0 25px'}}>Requests</span><span>Start a call</span></div>
    <div style={{display: 'flex', alignItems: 'center', gap: 10, color: COLORS.muted, fontSize: 15}}><span style={{width: 10, height: 10, borderRadius: 10, background: '#3e9b75'}} />Workspace</div>
  </div>;
}

function FakeWindow({children, style = {}}) {
  return <div style={{width: 1110, minHeight: 520, padding: 28, borderRadius: 18, background: COLORS.paper, border: `1px solid ${COLORS.line}`, boxShadow: '0 28px 70px rgba(23,33,31,.12)', ...style}}>{children}</div>;
}

function HomeScene() {
  return <FakeWindow>
    <AppHeader />
    <div style={{padding: '55px 66px'}}>
      <div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>REQUESTS</div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 14}}>
        <div><div style={{fontSize: 48, lineHeight: 1.05, letterSpacing: '-.055em', fontWeight: 700}}>Keep every request clear.</div><div style={{marginTop: 16, fontSize: 18, color: COLORS.muted}}>Let people explain what they need, confirm the summary, and give your team a request they can trust.</div></div>
        <button style={{border: 0, borderRadius: 10, padding: '15px 22px', background: COLORS.ink, color: '#fff', fontSize: 16, fontWeight: 700}}>Start a call</button>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 18, marginTop: 48}}>
        <div style={{display: 'flex', gap: 18, padding: 24, background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 15}}><div style={{display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: 12, background: COLORS.accentSoft, color: COLORS.accent, fontSize: 28}}>+</div><div><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.12em'}}>VOICE INTAKE</div><div style={{fontSize: 22, fontWeight: 700, marginTop: 7}}>Start with the caller</div><div style={{marginTop: 9, color: COLORS.muted, lineHeight: 1.5}}>Capture the request in the caller's own words. HangON asks only what is needed.</div></div></div>
        <div style={{padding: 24, background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 15}}><div style={{display: 'flex', justifyContent: 'space-between', color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.1em'}}>PROTECTION <Badge>Confirmation first</Badge></div><div style={{fontSize: 22, fontWeight: 700, marginTop: 22}}>Nothing changes silently</div><div style={{marginTop: 9, color: COLORS.muted, lineHeight: 1.5}}>Prepared requests are clearly marked for follow-up.</div></div>
      </div>
    </div>
  </FakeWindow>;
}

function CallScene({phase = 'call'}) {
  const bubbles = phase === 'call' ? [{who: 'CALLER', text: 'We need help getting a new community event set up.'}] : phase === 'questions' ? [{who: 'CALLER', text: 'We need help getting a new community event set up.'}, {who: 'HANGON', text: 'What would you like the team to help with first?'}, {who: 'CALLER', text: 'A venue request and a simple volunteer schedule.'}] : [{who: 'CALLER', text: 'A venue request and a simple volunteer schedule.'}, {who: 'HANGON', text: 'Got it. I’ll prepare a request for event operations to review.'}];
  return <FakeWindow style={{background: '#f6f8f6'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start'}}><div><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>START A CALL</div><div style={{fontSize: 36, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10}}>Tell us what you need.</div></div><Badge>Listening</Badge></div>
    <div style={{display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 20, marginTop: 34}}>
      <div style={{background: '#fbfcfb', border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 22, minHeight: 330}}><div style={{display: 'flex', flexDirection: 'column', gap: 13}}>{bubbles.map((bubble, i) => <div key={i} style={{alignSelf: bubble.who === 'CALLER' ? 'end' : 'start', maxWidth: '78%', padding: '14px 16px', borderRadius: 13, background: bubble.who === 'CALLER' ? '#e5f0eb' : '#fff', border: bubble.who === 'CALLER' ? '0' : `1px solid ${COLORS.line}`, fontSize: 16, lineHeight: 1.45}}><div style={{fontSize: 11, color: bubble.who === 'CALLER' ? COLORS.accent : COLORS.muted, fontWeight: 700, letterSpacing: '.1em', marginBottom: 5}}>{bubble.who}</div>{bubble.text}</div>)}</div></div>
      <div style={{background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 22}}><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.1em'}}>PROGRESS</div><div style={{display: 'grid', gap: 13, marginTop: 22}}>{['Understand the request', 'Ask what is needed', 'Read it back', 'Prepare only after confirmation'].map((item, i) => <div key={item} style={{display: 'flex', gap: 11, alignItems: 'center', color: i < (phase === 'questions' ? 2 : phase === 'summary' ? 3 : 1) ? COLORS.accent : COLORS.muted, fontWeight: i < 2 ? 700 : 500, fontSize: 14}}><span style={{display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 20, background: i < (phase === 'questions' ? 2 : phase === 'summary' ? 3 : 1) ? COLORS.accentSoft : COLORS.paper}}>{i < (phase === 'questions' ? 2 : phase === 'summary' ? 3 : 1) ? '✓' : i + 1}</span>{item}</div>)}</div></div>
    </div>
  </FakeWindow>;
}

function SummaryScene() {
  return <FakeWindow><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>REVIEW THE REQUEST</div><div style={{fontSize: 38, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10}}>Here’s what I heard.</div></div><Badge tone="warn">Waiting for confirmation</Badge></div><div style={{marginTop: 30, padding: 24, background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 13}}><div style={{fontSize: 20, lineHeight: 1.5, color: '#40504b'}}>“You need help preparing a community event request, including a venue request and a volunteer schedule, for event operations to review.”</div><div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, marginTop: 26, background: COLORS.line, border: `1px solid ${COLORS.line}`, borderRadius: 10, overflow: 'hidden'}}>{[['ROUTE', 'Event operations'], ['REQUEST TYPE', 'Community event'], ['STATUS', 'Prepared after confirmation']].map(([label, value]) => <div key={label} style={{padding: 18, background: '#fff'}}><div style={{color: COLORS.muted, fontSize: 12}}>{label}</div><div style={{fontSize: 16, fontWeight: 700, marginTop: 8}}>{value}</div></div>)}</div></div><div style={{display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24}}><button style={{border: `1px solid ${COLORS.line}`, background: '#fff', borderRadius: 9, padding: '14px 21px', color: COLORS.ink, fontWeight: 700}}>Change something</button><button style={{border: 0, background: COLORS.ink, color: '#fff', borderRadius: 9, padding: '14px 24px', fontWeight: 700}}>Yes, that’s right</button></div></FakeWindow>;
}

function RouteScene() {
  return <FakeWindow><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>WORKSPACE ROUTING</div><div style={{fontSize: 38, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10}}>The workspace decides what happens next.</div><div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 34}}>{[['01', 'Capabilities', 'What can this workspace actually do?', 'safe'], ['02', 'Required fields', 'What must be present before preparation?', 'safe'], ['03', 'Delivery route', 'Where should a prepared request go?', 'warn']].map(([number, title, text, tone]) => <div key={number} style={{padding: 22, background: '#fff', border: `1px solid ${COLORS.line}`, borderTop: `4px solid ${tone === 'safe' ? COLORS.accent : COLORS.warn}`, borderRadius: 13}}><div style={{color: tone === 'safe' ? COLORS.accent : COLORS.warn, fontWeight: 700}}>{number}</div><div style={{fontSize: 21, fontWeight: 700, marginTop: 35}}>{title}</div><div style={{color: COLORS.muted, lineHeight: 1.5, marginTop: 10}}>{text}</div></div>)}</div><div style={{marginTop: 22, padding: 17, borderRadius: 10, background: COLORS.accentSoft, color: COLORS.accent, fontWeight: 700}}>No configuration, no silent action.</div></FakeWindow>;
}

function PeopleScene() {
  return <FakeWindow style={{background: COLORS.ink, color: '#fff'}}><div style={{color: '#a9d3c4', fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>WHO IT IS FOR</div><div style={{fontSize: 42, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10, maxWidth: 700}}>Every team has a front door.</div><div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 40}}>{[['Operations', 'Turn an unclear ask into a clean handoff.'], ['Service teams', 'Give people a natural first step before escalation.'], ['Community programs', 'Make access easier without making promises.']].map(([title, text]) => <div key={title} style={{padding: 22, minHeight: 170, border: '1px solid #385049', borderRadius: 13, background: '#22332f'}}><div style={{fontSize: 22, fontWeight: 700}}>{title}</div><div style={{color: '#bbccc7', lineHeight: 1.5, marginTop: 12}}>{text}</div></div>)}</div></FakeWindow>;
}

function SecurityScene() {
  return <FakeWindow><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>TRUST BY DESIGN</div><div style={{fontSize: 38, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10}}>Security belongs in the flow.</div><div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 34}}>{[['Server-minted voice tokens', 'Permanent API credentials stay on the server.'], ['Signed confirmation', 'The final request is bound to the exact summary.'], ['Sensitive-field filtering', 'The request surface only keeps what the workspace needs.'], ['Idempotent creation', 'Retries do not create duplicate prepared requests.']].map(([title, text]) => <div key={title} style={{display: 'flex', gap: 15, padding: 22, background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 13}}><div style={{display: 'grid', placeItems: 'center', flex: '0 0 36px', height: 36, borderRadius: 20, background: COLORS.accentSoft, color: COLORS.accent, fontWeight: 700}}>✓</div><div><div style={{fontSize: 18, fontWeight: 700}}>{title}</div><div style={{color: COLORS.muted, marginTop: 7, lineHeight: 1.45}}>{text}</div></div></div>)}</div></FakeWindow>;
}

function BoundaryScene() {
  return <FakeWindow><div style={{color: COLORS.muted, fontSize: 13, fontWeight: 700, letterSpacing: '.14em'}}>A CLEAR OUTCOME</div><div style={{fontSize: 38, fontWeight: 700, letterSpacing: '-.05em', marginTop: 10}}>Prepared is not completed.</div><div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 34}}><div style={{padding: 23, borderRadius: 13, border: `1px solid ${COLORS.line}`, borderTop: `4px solid ${COLORS.danger}`, background: '#fff'}}><div style={{color: COLORS.danger, fontSize: 13, fontWeight: 700}}>WHAT HANGON WILL NOT SAY</div><div style={{fontSize: 22, fontWeight: 700, marginTop: 22}}>“The record was updated.”</div><div style={{marginTop: 12, color: COLORS.muted, lineHeight: 1.5}}>Not unless a configured integration actually confirms that action.</div></div><div style={{padding: 23, borderRadius: 13, border: `1px solid ${COLORS.line}`, borderTop: `4px solid ${COLORS.accent}`, background: '#fff'}}><div style={{color: COLORS.accent, fontSize: 13, fontWeight: 700}}>WHAT HANGON CAN SAY</div><div style={{fontSize: 22, fontWeight: 700, marginTop: 22}}>“Your request is prepared.”</div><div style={{marginTop: 12, color: COLORS.muted, lineHeight: 1.5}}>Clear status. Clear next step. No invented success.</div></div></div></FakeWindow>;
}

function SceneVisual({kind}) {
  if (kind === 'home') return <HomeScene />;
  if (kind === 'call') return <CallScene phase="call" />;
  if (kind === 'questions') return <CallScene phase="questions" />;
  if (kind === 'summary' || kind === 'confirm') return <SummaryScene />;
  if (kind === 'route') return <RouteScene />;
  if (kind === 'people') return <PeopleScene />;
  if (kind === 'security') return <SecurityScene />;
  if (kind === 'boundary') return <BoundaryScene />;
  if (kind === 'problem') return <div style={{display: 'flex', gap: 20, alignItems: 'stretch'}}>{[['PHONE TREE', 'Press 1… then start over.'], ['FORM', 'Required field: unclear.'], ['INBOX', 'Which thread is the latest?']].map(([title, text], index) => <div key={title} style={{width: 300, height: 230, padding: 24, background: '#fff', borderRadius: 16, border: `1px solid ${COLORS.line}`, transform: `rotate(${index - 1}deg)`, boxShadow: '0 18px 40px rgba(23,33,31,.1)'}}><div style={{color: COLORS.muted, fontSize: 12, fontWeight: 700, letterSpacing: '.12em'}}>{title}</div><div style={{marginTop: 46, fontSize: 22, lineHeight: 1.3, fontWeight: 700}}>{text}</div><div style={{width: '65%', height: 9, marginTop: 30, borderRadius: 9, background: index === 2 ? COLORS.warnSoft : COLORS.soft}} /></div>)}</div>;
  if (kind === 'title' || kind === 'takeaway' || kind === 'end') return <div style={{maxWidth: 1070, textAlign: 'center'}}><div style={{display: 'inline-flex', padding: 18, borderRadius: 18, background: '#fff', boxShadow: '0 16px 50px rgba(23,33,31,.12)'}}><Brand /></div><div style={{marginTop: 38, fontSize: 44, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-.05em', color: COLORS.accent}}>{kind === 'title' ? 'A clearer way to be heard.' : kind === 'takeaway' ? 'Natural in. Trustworthy out.' : 'Give every request a clear next step.'}</div></div>;
  return <div style={{fontSize: 48, color: COLORS.accent}}>✓</div>;
}

export const HangONDemo = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seconds = frame / fps;
  const scene = sceneFor(seconds);
  const opacity = fade(seconds, scene);
  const slide = interpolate(ease(progressInScene(seconds, scene)), [0, 1], [22, 0]);
  const isDark = scene.kind === 'people';
  return <AbsoluteFill style={{background: isDark ? '#dfe9e5' : COLORS.paper, color: COLORS.ink, fontFamily: 'Arial, Helvetica, sans-serif'}}>
    <div style={{position: 'absolute', inset: 0, opacity, display: 'flex', flexDirection: 'column'}}>
      <div style={{height: 95, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 90px', background: '#fff', borderBottom: `1px solid ${COLORS.line}`}}><Brand /><div style={{color: COLORS.muted, fontSize: 15}}>voice intake • confirmation first</div></div>
      <div style={{flex: 1, display: 'grid', gridTemplateColumns: 'minmax(520px, .78fr) minmax(840px, 1.22fr)', gap: 42, alignItems: 'center', padding: '50px 90px 62px'}}>
        <div style={{transform: `translateY(${slide}px)`}}><div style={{fontSize: 14, color: isDark ? COLORS.accent : COLORS.muted, fontWeight: 700, letterSpacing: '.15em'}}>{scene.kicker}</div><div style={{fontSize: 57, lineHeight: 1.03, letterSpacing: '-.06em', marginTop: 17, fontWeight: 700}}>{scene.title}</div><div style={{fontSize: 21, lineHeight: 1.5, color: COLORS.muted, maxWidth: 570, marginTop: 23}}>{scene.body}</div><div style={{display: 'flex', alignItems: 'center', gap: 13, marginTop: 30}}><span style={{width: 50, height: 3, background: COLORS.accent}} /><span style={{fontSize: 14, color: COLORS.muted}}>HangON product story</span></div></div>
        <div style={{transform: `translateY(${slide}px)`, display: 'flex', justifyContent: 'center'}}><SceneVisual kind={scene.kind} /></div>
      </div>
      <div style={{height: 22, padding: '0 90px 23px', display: 'flex', alignItems: 'end', justifyContent: 'space-between', color: COLORS.muted, fontSize: 12}}><span>HangON • a voice-first front desk</span><span>{String(Math.max(0, Math.floor(seconds))).padStart(2, '0')} / 120</span></div>
    </div>
    <Audio src={staticFile('narration.wav')} volume={0.92} />
  </AbsoluteFill>;
};
