// شبیه‌سازهای سبک SVG (جایگزین Three.js سنگین نسخه قبل) — برای Hero و جلساتی که هنوز ویدیو ندارند
import React, { useState } from 'react';
import { toFa } from '../lib.js';

const Grid = () => (
  <g stroke="#8FD0FF" strokeOpacity=".09">{Array.from({ length: 13 }, (_, i) => <React.Fragment key={i}><line x1={i * 25} y1="0" x2={i * 25} y2="300" /><line x1="0" y1={i * 25} x2="300" y2={i * 25} /></React.Fragment>)}</g>
);

export function SlopeLab({ compact }) {
  const [m, setM] = useState(1);
  const [b, setB] = useState(0);
  const y = (x) => 150 - (m * (x - 150) + b * 25);
  return (
    <div className="w-full">
      <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="نمودار خط y = mx + b">
        <Grid />
        <line x1="0" y1="150" x2="300" y2="150" stroke="#C9D3EA" strokeOpacity=".5" />
        <line x1="150" y1="0" x2="150" y2="300" stroke="#C9D3EA" strokeOpacity=".5" />
        <line x1="0" y1={y(0)} x2="300" y2={y(300)} stroke="#0A84FF" strokeWidth="3" strokeLinecap="round" />
        <circle cx="150" cy={150 - b * 25} r="5" fill="#A99BFF" />
        <text x="290" y="24" textAnchor="end" className="math" fill="#EEF2FA" fontSize="15">y = {m}x {b >= 0 ? '+' : '−'} {Math.abs(b)}</text>
      </svg>
      {!compact && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <label className="grid gap-1"><span className="text-ink-mute">شیب (m): <b className="text-ink">{toFa(m)}</b></span><input type="range" min="-3" max="3" step="0.5" value={m} onChange={(e) => setM(Number(e.target.value))} className="accent-[#0A84FF]" /></label>
          <label className="grid gap-1"><span className="text-ink-mute">عرض از مبدأ (b): <b className="text-ink">{toFa(b)}</b></span><input type="range" min="-4" max="4" step="1" value={b} onChange={(e) => setB(Number(e.target.value))} className="accent-[#A99BFF]" /></label>
        </div>
      )}
    </div>
  );
}

function Pythagoras() {
  return (
    <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="قضیه فیثاغورس">
      <Grid />
      <polygon points="100,200 220,200 100,110" fill="#0A84FF22" stroke="#8FD0FF" strokeWidth="2.5" />
      <rect x="100" y="200" width="120" height="70" fill="#0A84FF18" stroke="#0A84FF" />
      <rect x="30" y="110" width="70" height="90" fill="#A99BFF18" stroke="#A99BFF" />
      <path d="M100 188 h12 v12" fill="none" stroke="#EEF2FA" />
      <text x="160" y="245" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="18">a²</text>
      <text x="65" y="160" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="18">b²</text>
      <text x="185" y="140" className="math" fill="#8FD0FF" fontSize="18">c</text>
      <text x="150" y="40" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="20">a² + b² = c²</text>
    </svg>
  );
}
function NumberLine() {
  const [n, setN] = useState(-2);
  return (
    <div>
      <svg viewBox="0 0 300 140" className="w-full" role="img" aria-label="محور اعداد صحیح">
        <line x1="10" y1="80" x2="290" y2="80" stroke="#C9D3EA" strokeOpacity=".6" />
        {Array.from({ length: 11 }, (_, i) => i - 5).map((v) => <g key={v}><line x1={150 + v * 26} y1="74" x2={150 + v * 26} y2="86" stroke="#C9D3EA" /><text x={150 + v * 26} y="106" textAnchor="middle" fill="#8E9BBB" fontSize="12">{toFa(v).replace('-', '−')}</text></g>)}
        <path d={`M150 70 Q ${150 + n * 13} ${40} ${150 + n * 26} 70`} fill="none" stroke="#0A84FF" strokeWidth="2.5" markerEnd="url(#ah)" />
        <path d={`M150 90 Q ${150 - n * 13} ${120} ${150 - n * 26} 90`} fill="none" stroke="#A99BFF" strokeWidth="2" strokeDasharray="4 4" />
        <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#0A84FF" /></marker></defs>
        <text x="150" y="26" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="15">{n} ⟷ −({n}) = {-n}</text>
      </svg>
      <input type="range" min="-5" max="5" value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full accent-[#0A84FF]" aria-label="عدد" />
    </div>
  );
}
function Identity() {
  return (
    <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="اتحاد مربع دوجمله‌ای">
      <rect x="60" y="60" width="120" height="120" fill="#0A84FF26" stroke="#0A84FF" />
      <rect x="180" y="60" width="60" height="120" fill="#A99BFF22" stroke="#A99BFF" />
      <rect x="60" y="180" width="120" height="60" fill="#A99BFF22" stroke="#A99BFF" />
      <rect x="180" y="180" width="60" height="60" fill="#8FD0FF22" stroke="#8FD0FF" />
      <text x="120" y="126" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="20">a²</text>
      <text x="210" y="126" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="16">ab</text>
      <text x="120" y="216" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="16">ab</text>
      <text x="210" y="216" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="16">b²</text>
      <text x="150" y="32" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="16">(a + b)² = a² + 2ab + b²</text>
    </svg>
  );
}
function Venn() {
  return (
    <svg viewBox="0 0 300 260" className="w-full" role="img" aria-label="نمودار ون">
      <rect x="10" y="40" width="280" height="200" rx="16" fill="none" stroke="#C9D3EA" strokeOpacity=".3" />
      <circle cx="120" cy="140" r="70" fill="#0A84FF30" stroke="#0A84FF" />
      <circle cx="180" cy="140" r="70" fill="#A99BFF30" stroke="#A99BFF" />
      <text x="85" y="145" className="math" fill="#EEF2FA" fontSize="20">A</text>
      <text x="205" y="145" className="math" fill="#EEF2FA" fontSize="20">B</text>
      <text x="150" y="26" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="14">n(A∪B) = n(A) + n(B) − n(A∩B)</text>
    </svg>
  );
}
function Angles() {
  return (
    <svg viewBox="0 0 300 260" className="w-full" role="img" aria-label="زاویه‌ها">
      <line x1="20" y1="200" x2="280" y2="60" stroke="#8FD0FF" strokeWidth="2.5" />
      <line x1="20" y1="70" x2="280" y2="190" stroke="#A99BFF" strokeWidth="2.5" />
      <circle cx="150" cy="130" r="4" fill="#fff" />
      <path d="M180 116 A32 32 0 0 1 180 144" fill="none" stroke="#0A84FF" strokeWidth="3" />
      <path d="M120 144 A32 32 0 0 1 120 116" fill="none" stroke="#0A84FF" strokeWidth="3" />
      <text x="150" y="30" textAnchor="middle" className="math" fill="#EEF2FA" fontSize="16">∠1 = ∠3  |  ∠1 + ∠2 = 180°</text>
    </svg>
  );
}

export function MathVisual({ topic, formula }) {
  const V = { linear: SlopeLab, pythagoras: Pythagoras, integer: NumberLine, parabola: Identity, identity: Identity, sets: Venn, geometry: Angles }[topic] || SlopeLab;
  return (
    <div className="rounded-3xl border border-white/10 bg-night-950/70 p-4 sm:p-6">
      <div className="mx-auto max-w-md"><V /></div>
      {formula && <p className="math mt-3 text-center text-lg text-accent">{formula}</p>}
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]" aria-hidden="true">
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
        <defs><radialGradient id="hv" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1B3A8A" stopOpacity=".9" /><stop offset="1" stopColor="#071030" stopOpacity="0" /></radialGradient></defs>
        <circle cx="200" cy="200" r="190" fill="url(#hv)" />
        <g className="spin-slow">
          <circle cx="200" cy="200" r="170" fill="none" stroke="#8FD0FF" strokeOpacity=".25" />
          {Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, r1 = i % 6 ? 162 : 152; return <line key={i} x1={200 + Math.cos(a) * r1} y1={200 + Math.sin(a) * r1} x2={200 + Math.cos(a) * 170} y2={200 + Math.sin(a) * 170} stroke="#8FD0FF" strokeOpacity={i % 6 ? 0.3 : 0.8} />; })}
        </g>
        <circle cx="200" cy="200" r="120" fill="none" stroke="#A99BFF" strokeOpacity=".35" strokeDasharray="3 6" />
        <polygon points="200,92 293,254 107,254" fill="#0A84FF14" stroke="#C4E6FF" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="200" cy="200" r="54" fill="none" stroke="#A99BFF" strokeOpacity=".8" />
        <line x1="60" y1="300" x2="340" y2="100" stroke="#0A84FF" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="200" cy="200" r="5" fill="#fff" />
        <text x="318" y="92" className="math" fill="#EEF2FA" fontSize="18">y = ax + b</text>
        <text x="40" y="70" className="math" fill="#8FD0FF" fontSize="16">a² + b² = c²</text>
        <text x="40" y="350" className="math" fill="#A99BFF" fontSize="16">φ = (1 + √5) / 2</text>
        <text x="300" y="350" className="math" fill="#C9D3EA" fontSize="22">π</text>
      </svg>
    </div>
  );
}
