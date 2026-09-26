import React, {useEffect, useState} from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, continueRender, delayRender,
  interpolate, staticFile, useCurrentFrame, useVideoConfig
} from 'remotion';
import edl from '../public/take/edl.json';

const INK = '#0f1b17';
const MUTED = '#5a6a65';
const ACCENT = '#0b9468';
const FONT = '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
const XFADE = 6; // frames of cross-dissolve between clips

function useFont() {
  const [handle] = useState(() => delayRender('font'));
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=block';
    document.head.appendChild(link);
    link.onload = () => document.fonts.ready.then(() => continueRender(handle));
    link.onerror = () => continueRender(handle);
  }, [handle]);
}

// Camera: eased interpolation between keyframes, clamped so the frame edge never shows.
function cameraAt(t) {
  const k = edl.cam;
  let i = k.findIndex((c) => c.t > t);
  if (i === -1) return k[k.length - 1];
  if (i === 0) return k[0];
  const a = k[i - 1], b = k[i];
  const p = Easing.inOut(Easing.cubic)(Math.min(1, Math.max(0, (t - a.t) / Math.max(0.001, b.t - a.t))));
  return {x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s: a.s + (b.s - a.s) * p};
}

const Screen = ({clip, fadeIn}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = clip.at + frame / fps;
  const cam = cameraAt(t);
  const limX = 960 * (1 - 1 / cam.s), limY = 540 * (1 - 1 / cam.s);
  const tx = Math.max(-limX, Math.min(limX, 960 - cam.x));
  const ty = Math.max(-limY, Math.min(limY, 540 - cam.y));
  const opacity = fadeIn ? interpolate(frame, [0, XFADE], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  return (
    <AbsoluteFill style={{opacity}}>
      <AbsoluteFill style={{transform: `scale(${cam.s}) translate(${tx}px, ${ty}px)`, transformOrigin: '960px 540px'}}>
        <OffthreadVideo src={staticFile('take/screen.mp4')} startFrom={Math.round(clip.src * fps)} muted style={{width: 1920, height: 1080}} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Window = ({children}) => (
  <AbsoluteFill style={{background: 'radial-gradient(120% 90% at 50% 35%, #f7f5f0 0%, #e7ebe7 60%, #dde3df 100%)'}}>
    <div style={{position: 'absolute', left: 96, top: 44, width: 1728, height: 972, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(15,27,23,.22), 0 4px 14px rgba(15,27,23,.08)', background: '#fff'}}>
      <div style={{width: 1920, height: 1080, transform: 'scale(0.9)', transformOrigin: '0 0', position: 'relative'}}>{children}</div>
    </div>
  </AbsoluteFill>
);

const Caption = ({c}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 4], [0, 1], {extrapolateRight: 'clamp'});
  const label = c.who === 'agent' ? 'HangON' : c.who === 'caller' ? 'Caller' : null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 70, opacity}}>
      <div style={{maxWidth: 1380, background: 'rgba(10,14,12,.84)', color: '#fff', borderRadius: 12, padding: '12px 22px', fontFamily: FONT, fontSize: 32, lineHeight: 1.35, fontWeight: 500, textAlign: 'center'}}>
        {label && <span style={{color: c.who === 'agent' ? '#6ee7b7' : '#cbd5e1', fontWeight: 700, marginRight: 12, fontSize: 24, letterSpacing: '.06em', textTransform: 'uppercase'}}>{label}</span>}
        {c.text}
      </div>
    </AbsoluteFill>
  );
};

const Chip = ({text}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const opacity = interpolate(frame, [0, 8, 150, 170], [0, 1, 1, 0], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 130, top: 70, opacity, background: 'rgba(15,27,23,.86)', color: '#fff', fontFamily: FONT, fontSize: 24, fontWeight: 600, padding: '10px 18px', borderRadius: 999}}>{text}</div>
  );
};

const ColdOpen = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ringing = (t % 3) < 1.6 && t < 4.7;
  const pulse = ringing ? 1 + 0.06 * Math.sin(t * 40) : 1;
  const fade = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#0a0d0c', alignItems: 'center', justifyContent: 'center', opacity: fade}}>
      <div style={{textAlign: 'center', fontFamily: FONT, color: '#e9f0ed', transform: 'translateY(-60px)'}}>
        <div style={{width: 120, height: 120, margin: '0 auto 28px', borderRadius: '50%', border: `3px solid ${ringing ? '#34d399' : '#2b3a35'}`, display: 'grid', placeItems: 'center', transform: `scale(${pulse})`}}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={ringing ? '#34d399' : '#5b6b66'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
        </div>
        <div style={{fontSize: 30, fontWeight: 600, letterSpacing: '.02em'}}>{t < 4.7 ? 'Incoming call' : 'Missed call'}</div>
        <div style={{fontSize: 24, color: '#95a59f', marginTop: 8}}>Apex Plumbing · Mike is under a sink</div>
      </div>
    </AbsoluteFill>
  );
};

const Card = ({title, lines, small}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  const rise = interpolate(frame, [0, 18], [14, 0], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: '#f5f7f6', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: INK, opacity}}>
      <div style={{textAlign: 'center', transform: `translateY(${rise}px)`}}>
        <Img src={staticFile('hangon-logo.png')} style={{width: 96, height: 96, borderRadius: 22, margin: '0 auto 24px', display: 'block'}} />
        <div style={{fontSize: 96, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1}}>{title}</div>
        {lines.map((l, i) => <div key={i} style={{fontSize: i === 0 ? 36 : 30, color: i === 0 ? INK : MUTED, marginTop: i === 0 ? 22 : 12, fontWeight: i === 0 ? 600 : 500}}>{l}</div>)}
        {small && <div style={{fontSize: 22, color: MUTED, marginTop: 34, letterSpacing: '.01em'}}>{small}</div>}
      </div>
    </AbsoluteFill>
  );
};

export const HangONFinal = () => {
  useFont();
  const {fps} = useVideoConfig();
  const f = (s) => Math.round(s * fps);
  const firstCall = edl.clips.find((c) => c.audio);
  return (
    <AbsoluteFill style={{background: '#0a0d0c'}}>
      {edl.clips.map((c, i) => {
        const prev = edl.clips[i - 1];
        const next = edl.clips[i + 1];
        const tail = next && next.kind === 'screen' && c.kind === 'screen' ? XFADE : 0;
        if (c.kind === 'cold') return <Sequence key={i} from={f(c.at)} durationInFrames={f(c.dur)}><ColdOpen /><Audio src={staticFile('take/ring.wav')} volume={0.55} endAt={f(4.7)} /></Sequence>;
        if (c.kind === 'title') return <Sequence key={i} from={f(c.at)} durationInFrames={f(c.dur)}><Card title="HangON" lines={['A voice front desk for trades']} small="Built on AssemblyAI" /></Sequence>;
        if (c.kind === 'end') return <Sequence key={i} from={f(c.at)} durationInFrames={f(c.dur)}><Card title="HangON" lines={['Never miss a job while your hands are full.', 'tryhangon.xyz']} small="AssemblyAI Voice Agent API · AssemblyAI LLM Gateway · Resend · Postgres · Vercel" /></Sequence>;
        return (
          <Sequence key={i} from={f(c.at)} durationInFrames={f(c.dur) + tail}>
            <Window><Screen clip={c} fadeIn={prev?.kind === 'screen'} /></Window>
            {c.label && <Chip text={c.label} />}
          </Sequence>
        );
      })}
      {edl.clips.filter((c) => c.audio).map((c, i) => (
        <Sequence key={`a${i}`} from={f(c.at)} durationInFrames={f(c.dur)}>
          <Audio src={staticFile('take/call.wav')} startFrom={f(c.src)} endAt={f(c.src + c.dur)} />
        </Sequence>
      ))}
      <Sequence from={f(firstCall.at)} durationInFrames={f(6)}>
        <Chip text="Real call on tryhangon.xyz · pauses shortened · caller voice synthesized" />
      </Sequence>
      {edl.clips.flatMap((c, i) => (c.vo || []).map(([id, off]) => (
        <Sequence key={`v${i}${id}`} from={f(c.at + off)} durationInFrames={f(edl.voDur[id] + 0.5)}>
          <Audio src={staticFile(`vo/${id}.mp3`)} volume={1.0} />
        </Sequence>
      )))}
      {edl.captions.map((c, i) => (
        <Sequence key={`c${i}`} from={f(c.at)} durationInFrames={Math.max(8, f(c.dur))}>
          <Caption c={c} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
