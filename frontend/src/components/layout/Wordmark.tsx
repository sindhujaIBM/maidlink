const teal = '#1F6E64';
const gold = '#D4A93A';
const serif = "'Fraunces', Georgia, serif";
const sans  = "'Inter', system-ui, sans-serif";

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size * 56 / 48} viewBox="0 0 48 56" fill="none">
        <path d="M4 22L24 6L44 22L44 50L4 50Z" stroke={teal} strokeWidth="3.2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        <path d="M14 24L24 14L34 24Z" fill={gold}/>
        <path d="M14 44L14 28L18 28L24 36L30 28L34 28L34 44" stroke={teal} strokeWidth="3.2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontFamily: serif, fontWeight: 700, fontSize: size * 0.78, letterSpacing: 0.5, color: teal }}>MAIDLINK</span>
        <span style={{ fontFamily: sans, fontWeight: 500, fontSize: size * 0.28, letterSpacing: 2, color: teal, opacity: 0.65, marginTop: 2 }}>FOR A CLEANER SPACE</span>
      </div>
    </div>
  );
}
