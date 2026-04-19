import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../api/auth';
import { calcHours } from '../lib/estimatorCalc';
import type { CleaningType, HouseCondition } from '../lib/estimatorCalc';
import { Wordmark } from '../components/layout/Wordmark';

// ── Brand tokens ──────────────────────────────────────────────
const C = {
  teal:      '#1F6E64',
  tealDark:  '#17524B',
  tealDeep:  '#0F3833',
  gold:      '#D4A93A',
  cream:     '#FBF7EE',
  creamDeep: '#F3EDDD',
  ink:       '#1A1F1E',
  ink70:     '#4A5452',
  ink50:     '#6F7A78',
  line:      '#E6E1D3',
};

const serif = "'Fraunces', Georgia, serif";
const sans  = "'Inter', system-ui, sans-serif";

// ── SVG icon set ──────────────────────────────────────────────
function IconArrow({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12H19M13 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCheck({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5L10 18L20 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconStar({ size = 16, color = '#D4A93A' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l3 9h9l-7.5 5.5L19 24l-7-4.5L5 24l2.5-7.5L0 11h9z" stroke={color} strokeWidth="0.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconSparkle({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 3l1.5 7.5L21 12l-7.5 1.5L12 21l-1.5-7.5L3 12l7.5-1.5z"/>
    </svg>
  );
}
function IconShield({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L20 6V12C20 17 16 20.5 12 22C8 20.5 4 17 4 12V6Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8.5 12.5L11 15L16 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconClock({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8"/>
      <path d="M12 7V12L15.5 14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconHome({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 11L12 3L21 11V21H3Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  );
}
function IconHeart({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 20C-2 12 4 3 12 8C20 3 26 12 12 20Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCalendar({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.8"/>
      <path d="M3 10H21M8 3V7M16 3V7" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconBroom({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 3L21 9M8 13L11 16M5 20L11 16L8 13L4 17C3 18 3 19 5 20ZM8 13L17 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconQuote({ size = 28, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M7 7h3v4c0 3-2 5-5 5v-2c1.5 0 2.5-1 2.5-2.5H6V7zm8 0h3v4c0 3-2 5-5 5v-2c1.5 0 2.5-1 2.5-2.5H14V7z"/>
    </svg>
  );
}

// ── Nav ───────────────────────────────────────────────────────
function NavBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.line}`, background: C.cream, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link to="/" style={{ textDecoration: 'none' }}><Wordmark size={28} /></Link>
        <nav style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 500, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="#how"      style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>How it works</a>
          <a href="#services" style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Services</a>
          <a href="#areas"    style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Areas</a>
          <a href="#reviews"  style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Reviews</a>
          <Link to="/become-a-maid" style={{ color: C.teal, textDecoration: 'none', fontWeight: 600 }}>Become a maid →</Link>
        </nav>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isAuthenticated ? (
            <Link to="/dashboard" style={{ fontSize: 14, color: C.ink, textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
          ) : (
            <a href={buildGoogleAuthUrl()} style={{ fontSize: 14, color: C.ink, textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
          )}
          <Link to="/estimate" style={{
            background: C.teal, color: '#fff', padding: '10px 18px', borderRadius: 999,
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Get a free estimate <IconArrow size={13} color="#fff" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Estimate form ─────────────────────────────────────────────
const CLEAN_TYPE_MAP: Record<string, CleaningType> = {
  standard: 'Standard Cleaning',
  deep:     'Deep Cleaning',
  moveout:  'Move-Out/Move-In Cleaning',
};
const CONDITION_MAP: Record<string, HouseCondition> = {
  pristine: 'Pristine',
  normal:   'Normal',
  dirty:    'Moderately Dirty',
  heavy:    'Heavily Soiled',
};

function EstimateForm() {
  const navigate = useNavigate();
  const [beds,      setBeds]      = useState(2);
  const [baths,     setBaths]     = useState(1);
  const [sqft,      setSqft]      = useState(1000);
  const [cleanType, setCleanType] = useState('standard');
  const [condition, setCondition] = useState('normal');

  const result    = calcHours(beds, baths, sqft, CLEAN_TYPE_MAP[cleanType], CONDITION_MAP[condition], false, 'Occasionally', 'Moderate', []);
  const hrs       = result.one;
  const cleaners  = hrs > 5 ? 2 : 1;
  const onSite    = cleaners === 2 ? result.two : hrs;
  const rate      = cleanType === 'moveout' ? 45 : 40;
  const basePrice = Math.round(onSite * rate * cleaners);
  const gstAmt    = Math.round(basePrice * 0.05);
  const totalPrice = basePrice + gstAmt;

  const Stepper = ({ value, setValue, step = 1, min }: { value: number; setValue: (v: number) => void; step?: number; min: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${C.line}`, background: '#fff' }}>
      <button onClick={() => setValue(Math.max(min, value - step))} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: C.creamDeep, color: C.ink, cursor: 'pointer', fontSize: 18, fontWeight: 500, lineHeight: 1 }}>−</button>
      <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, color: C.ink }}>{value}</div>
      <button onClick={() => setValue(value + step)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: C.teal, color: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 500, lineHeight: 1 }}>+</button>
    </div>
  );

  const SegBtn = ({ active, onClick, children, sub }: { active: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) => (
    <button onClick={onClick} style={{
      padding: '11px 8px', borderRadius: 10,
      border: `1.5px solid ${active ? C.teal : C.line}`,
      background: active ? `${C.teal}12` : '#fff',
      color: active ? C.teal : C.ink,
      cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: sans,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <span>{children}</span>
      {sub && <span style={{ fontSize: 10, fontWeight: 500, color: active ? C.teal : C.ink50, opacity: 0.8 }}>{sub}</span>}
    </button>
  );

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8, color: C.ink50 }}>{children}</div>
  );

  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(15,56,51,0.12), 0 1px 3px rgba(0,0,0,0.05)', border: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, color: C.ink }}>Free estimate</div>
        <div style={{ fontSize: 11, padding: '4px 10px', background: `${C.gold}22`, color: C.teal, borderRadius: 999, fontWeight: 700, letterSpacing: 0.4 }}>~60 SEC</div>
      </div>
      <div style={{ fontSize: 13, color: C.ink70, marginBottom: 22 }}>All fields required · no sign-up.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div><FieldLabel>Bedrooms</FieldLabel><Stepper value={beds}  setValue={setBeds}  min={0} /></div>
        <div><FieldLabel>Bathrooms</FieldLabel><Stepper value={baths} setValue={setBaths} min={1} /></div>
        <div><FieldLabel>Sq ft</FieldLabel><Stepper value={sqft}  setValue={setSqft}  step={100} min={400} /></div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Cleaning type</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <SegBtn active={cleanType === 'standard'} onClick={() => setCleanType('standard')} sub="recurring">Standard</SegBtn>
          <SegBtn active={cleanType === 'deep'}     onClick={() => setCleanType('deep')}     sub="top to bottom">Deep</SegBtn>
          <SegBtn active={cleanType === 'moveout'}  onClick={() => setCleanType('moveout')}  sub="empty home">Move-out</SegBtn>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <FieldLabel>House condition</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <SegBtn active={condition === 'pristine'} onClick={() => setCondition('pristine')}>Pristine</SegBtn>
          <SegBtn active={condition === 'normal'}   onClick={() => setCondition('normal')}>Normal</SegBtn>
          <SegBtn active={condition === 'dirty'}    onClick={() => setCondition('dirty')}>Dirty</SegBtn>
          <SegBtn active={condition === 'heavy'}    onClick={() => setCondition('heavy')}>Heavy</SegBtn>
        </div>
      </div>

      <div style={{ padding: '16px 18px', background: `linear-gradient(135deg, ${C.teal}18, ${C.gold}18)`, border: `1px solid ${C.teal}33`, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 700, color: C.teal, marginBottom: 2 }}>Estimated time</div>
          <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 600, color: C.teal, lineHeight: 1 }}>
            {onSite}<span style={{ fontSize: 15, fontWeight: 500 }}> hrs</span>
          </div>
          <div style={{ fontSize: 11, color: C.ink70, marginTop: 3 }}>{cleaners} cleaner{cleaners > 1 ? 's' : ''} on site</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 700, color: C.ink50, marginBottom: 2 }}>Estimated total</div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>${totalPrice}</div>
          <div style={{ fontSize: 10, color: C.ink70, marginTop: 3 }}>${basePrice} + ${gstAmt} GST · ${rate}/hr</div>
        </div>
      </div>

      <button
        onClick={() => navigate('/estimate', { state: {
          bedrooms:       beds,
          bathrooms:      baths,
          sqft,
          cleaningType:   CLEAN_TYPE_MAP[cleanType],
          houseCondition: CONDITION_MAP[condition],
        }})}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '15px 20px', borderRadius: 12, background: C.teal,
          color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
          width: '100%', fontFamily: sans,
        }}
      >
        Continue &amp; refine with photos <IconArrow size={15} color="#fff" />
      </button>
      <div style={{ fontSize: 11, color: C.ink70, textAlign: 'center' as const, marginTop: 10 }}>
        No card required · free cancellation up to 24h
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ background: C.cream, maxWidth: 1280, margin: '0 auto', padding: '64px 24px 80px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: C.creamDeep, borderRadius: 999, fontSize: 13, fontWeight: 500, color: C.teal, marginBottom: 24 }}>
            <IconSparkle size={13} color={C.gold} /> Calgary's trusted home cleaning
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 'clamp(42px, 5vw, 68px)', lineHeight: 1.03, letterSpacing: -1.5, fontWeight: 500, margin: 0, marginBottom: 20, color: C.ink }}>
            Come home to a <em style={{ fontStyle: 'italic', color: C.teal }}>sparkling</em><br/>clean space.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: C.ink70, margin: 0, marginBottom: 32, maxWidth: 500 }}>
            Busy Calgary professionals book trusted, admin-verified maids in 2 minutes — no sign-up, no surprises, no double-bookings. Ever.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: C.ink70, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconCheck size={15} color={C.teal} /> No sign-up needed</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconClock size={15} color={C.teal} /> 2-minute quote</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconShield size={15} color={C.teal} /> Admin-verified maids</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 36 }}>
            <div style={{ display: 'flex' }}>
              {[C.gold, C.teal, '#8B5A3C', C.gold, '#4E8B82'].map((bg, i) => (
                <div key={i} style={{ width: 36, height: 36, borderRadius: '50%', background: bg, border: `2.5px solid ${C.cream}`, marginLeft: i === 0 ? 0 : -10, fontFamily: serif, fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {['MJ','SK','AR','DL','NP'][i]}
                </div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {[0,1,2,3,4].map(i => <IconStar key={i} size={13} color={C.gold} />)}
                <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 5, color: C.ink }}>4.9</span>
              </div>
              <div style={{ fontSize: 13, color: C.ink70 }}>2,100+ Calgary homes cleaned this year</div>
            </div>
          </div>
        </div>
        <EstimateForm />
      </div>
    </section>
  );
}

// ── Trust strip ───────────────────────────────────────────────
function TrustStrip() {
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, background: C.creamDeep }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: C.teal }}>Trusted by Calgary families</span>
        {[
          { value: '2,100+', label: 'homes cleaned' },
          { value: '4.9 ★', label: 'average rating' },
          { value: '140+',   label: 'verified maids' },
        ].map(m => (
          <div key={m.label} style={{ textAlign: 'center' as const }}>
            <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, color: C.teal, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 12, color: C.ink70, marginTop: 3 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── How it works ──────────────────────────────────────────────
const HOW_STEPS = [
  { n: '01', t: 'Get your estimate', d: 'Answer 5 quick questions about your home. See a live price range — no account, no credit card.', icon: <IconSparkle size={20} color="#fff" /> },
  { n: '02', t: 'Pick your maid',    d: 'Browse admin-verified Calgary maids with reviews, photos, and real-time availability.', icon: <IconHeart size={20} color="#fff" /> },
  { n: '03', t: 'Book in seconds',   d: 'Lock in your slot with database-level guarantees — no double-bookings, ever.', icon: <IconCalendar size={20} color="#fff" /> },
  { n: '04', t: 'Relax & rate',      d: 'Come home to a spotless space. Rate your maid to help the community.', icon: <IconHome size={20} color="#fff" /> },
];

function HowItWorks() {
  return (
    <section id="how" style={{ maxWidth: 1280, margin: '0 auto', padding: '88px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)', gap: 72, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.teal, fontWeight: 600, marginBottom: 14 }}>How it works</div>
          <h2 style={{ fontFamily: serif, fontSize: 'clamp(32px,4vw,48px)', lineHeight: 1.06, letterSpacing: -1, fontWeight: 500, margin: 0, marginBottom: 18, color: C.ink }}>
            From overwhelmed<br/>to <em style={{ color: C.teal }}>at peace</em> in four steps.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: C.ink70, marginBottom: 28 }}>
            We built MaidLink for busy Calgary professionals who want the cleaning sorted — not a new chore. Book in minutes. Done.
          </p>
          <Link to="/estimate" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.teal, color: '#fff', padding: '13px 22px', borderRadius: 999, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
            Start my estimate <IconArrow size={13} color="#fff" />
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {HOW_STEPS.map((s, i) => (
            <div key={s.n} style={{ background: i % 2 === 0 ? '#fff' : C.creamDeep, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, transform: i === 1 || i === 3 ? 'translateY(24px)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.teal, display: 'grid', placeItems: 'center' }}>{s.icon}</div>
                <div style={{ fontFamily: serif, fontSize: 24, color: C.gold, fontWeight: 500 }}>{s.n}</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, marginBottom: 6, letterSpacing: -0.2, color: C.ink }}>{s.t}</div>
              <div style={{ fontSize: 13, color: C.ink70, lineHeight: 1.55 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Services ──────────────────────────────────────────────────
const SERVICES = [
  { t: 'Standard cleaning',  d: 'Recurring weekly, biweekly, or monthly. Your go-to maintenance clean for a consistently tidy home.', p: 'from $135', badge: 'Most booked', bg: '#E7F0EC', img: '/service-standard.jpg' },
  { t: 'Deep cleaning',      d: 'Baseboards, inside appliances, vents, grout — the whole nine yards when your home needs a reset.', p: 'from $200', bg: C.creamDeep, img: '/service-deep.jpg' },
  { t: 'Move-in / Move-out', d: 'Empty-home deep clean so you get the damage deposit back and hand off a spotless space.', p: 'from $270', bg: '#EFE7D4', img: '/service-moveout.jpg' },
];

function Services() {
  return (
    <section id="services" style={{ background: C.creamDeep, padding: '88px 0' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 44, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.teal, fontWeight: 600, marginBottom: 10 }}>Services</div>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,44px)', lineHeight: 1, fontWeight: 500, letterSpacing: -0.8, margin: 0, color: C.ink }}>
              Cleanings for every<br/>season of life.
            </h2>
          </div>
          <Link to="/estimate" style={{ color: C.teal, fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Price all services <IconArrow size={13} color={C.teal} />
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {SERVICES.map(s => (
            <div key={s.t} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 160, background: s.bg, position: 'relative', overflow: 'hidden' }}>
                <img src={s.img} alt={s.t} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {s.badge && <div style={{ position: 'absolute', top: 12, left: 12, background: C.gold, color: C.ink, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{s.badge}</div>}
              </div>
              <div style={{ padding: 22, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, marginBottom: 6, color: C.ink }}>{s.t}</div>
                <div style={{ fontSize: 13, color: C.ink70, lineHeight: 1.55, marginBottom: 14, flex: 1 }}>{s.d}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.ink70 }}>{s.p}</span>
                  <Link to="/estimate" style={{ fontSize: 13, color: C.teal, fontWeight: 600, textDecoration: 'none' }}>Estimate →</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Reasons ───────────────────────────────────────────────────
const REASONS = [
  { n: '01', t: 'No double-bookings. Ever.', d: 'Database-level constraints guarantee your time slot is yours alone — not a promise, a guarantee.' },
  { n: '02', t: 'Admin-verified maids',      d: 'Every maid is reviewed and approved before appearing in search results. Zero unvetted strangers.' },
  { n: '03', t: 'Calgary locals, only',      d: 'We verify service-area postal codes. Your maid knows Inglewood from Evanston.' },
  { n: '04', t: 'Upfront pricing',           d: 'See your price range before you book. No hidden trip fees, no surprise surcharges at the door.' },
];

function Reasons() {
  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '100px 24px' }}>
      <div style={{ textAlign: 'center' as const, maxWidth: 620, margin: '0 auto 56px' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.teal, fontWeight: 600, marginBottom: 12 }}>Why MaidLink</div>
        <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,46px)', lineHeight: 1.06, fontWeight: 500, letterSpacing: -1, margin: 0, color: C.ink }}>
          The home-cleaning platform<br/>Calgary actually deserves.
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${C.line}`, borderRadius: 20, overflow: 'hidden' }}>
        {REASONS.map((r, i) => (
          <div key={r.n} style={{
            padding: 36, background: i % 2 === 0 ? C.cream : '#fff',
            borderRight:  i % 2 === 0 ? `1px solid ${C.line}` : 'none',
            borderBottom: i < 2       ? `1px solid ${C.line}` : 'none',
          }}>
            <div style={{ fontFamily: serif, fontSize: 14, color: C.gold, fontWeight: 500, marginBottom: 10 }}>{r.n}</div>
            <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, marginBottom: 8, letterSpacing: -0.4, color: C.ink }}>{r.t}</div>
            <div style={{ fontSize: 14, color: C.ink70, lineHeight: 1.65 }}>{r.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Reviews ───────────────────────────────────────────────────
const REVIEWS = [
  { name: 'Priya M.',   hood: 'Beltline',    body: 'Came home after a 12-hour shift and nearly cried. Maya was punctual, kind, and left the place smelling like a lemon grove. Biweekly now.' },
  { name: 'Daniel K.',  hood: 'Bridgeland',  body: 'As a dad of two under five, MaidLink saved my marriage. Seriously. The estimate took me 90 seconds on my phone between meetings.' },
  { name: 'Rashida A.', hood: 'Inglewood',   body: 'Move-out clean was spotless. Landlord gave us the full deposit back and asked who we used. I happily recommended.' },
];

function Reviews() {
  return (
    <section id="reviews" style={{ background: C.teal, color: '#fff', padding: '88px 0' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 48, flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.gold, fontWeight: 600, marginBottom: 10 }}>What Calgary says</div>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,4vw,42px)', lineHeight: 1.06, fontWeight: 500, letterSpacing: -0.8, margin: 0 }}>
              2,100+ homes cleaned.<br/>4.9 stars average.
            </h2>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', marginBottom: 5 }}>
              {[0,1,2,3,4].map(i => <IconStar key={i} size={20} color={C.gold} />)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Based on 1,847 verified reviews</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
          {REVIEWS.map(r => (
            <div key={r.name} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: 26 }}>
              <IconQuote size={28} color={C.gold} />
              <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.55, margin: '12px 0 22px', fontWeight: 400 }}>"{r.body}"</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{r.hood}</div>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[0,1,2,3,4].map(i => <IconStar key={i} size={12} color={C.gold} />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Areas ─────────────────────────────────────────────────────
const HOODS = ['Beltline', 'Inglewood', 'Bridgeland', 'Kensington', 'Mission', 'Hillhurst', 'Altadore', 'Marda Loop', 'Evanston', 'Tuscany', 'Aspen Woods', 'McKenzie Lake', 'Auburn Bay', 'Mahogany', 'Seton', 'Cranston', 'Panorama Hills', 'Nolan Hill', 'Sage Hill', 'Royal Oak', '+ 40 more areas'];

function Areas() {
  return (
    <section id="areas" style={{ maxWidth: 1280, margin: '0 auto', padding: '88px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 72, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.teal, fontWeight: 600, marginBottom: 12 }}>Calgary-only service area</div>
          <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,4vw,42px)', lineHeight: 1.06, fontWeight: 500, letterSpacing: -0.8, margin: 0, marginBottom: 18, color: C.ink }}>
            We clean every<br/>corner of YYC.
          </h2>
          <p style={{ fontSize: 15, color: C.ink70, lineHeight: 1.65, marginBottom: 22 }}>
            From Beltline condos to Mahogany family homes. If your postal code starts with T, we're there.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {HOODS.map(h => (
              <span key={h} style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                background: h.startsWith('+') ? C.teal : C.creamDeep,
                color:      h.startsWith('+') ? '#fff'  : C.ink,
                border:     h.startsWith('+') ? 'none'  : `1px solid ${C.line}`,
              }}>{h}</span>
            ))}
          </div>
        </div>
        <div style={{ height: 400, borderRadius: 20, overflow: 'hidden', border: `1px solid ${C.line}` }}>
          <iframe
            src="https://www.google.com/maps/d/u/0/embed?mid=1P24AEoh-xHRLPYONVb5vRql8CW5gp0o&ehbc=2E312F&noprof=1&ll=51.0447,-114.0719&z=11"
            width="100%" height="100%"
            style={{ border: 0, display: 'block' }}
            allowFullScreen
            loading="lazy"
            title="MaidLink Calgary service areas"
          />
        </div>
      </div>
    </section>
  );
}

// ── Become a Maid ─────────────────────────────────────────────
const MAID_BENEFITS = [
  { t: 'Weekly direct deposit', d: 'No waiting, no invoicing' },
  { t: 'You pick your jobs',    d: 'See details before accepting' },
  { t: 'Transparent 15% fee',  d: 'No hidden cuts' },
  { t: 'Real human support',   d: 'Calgary team, texts back' },
];

function BecomeAMaid() {
  return (
    <section style={{ background: C.creamDeep, padding: '88px 0' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 72, alignItems: 'center' }}>
        <div style={{ position: 'relative' as const }}>
          <div style={{ height: 460, borderRadius: 20, overflow: 'hidden', border: `1px solid ${C.line}` }}>
            <img src="/maid-portrait.jpg" alt="MaidLink cleaner at work" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%', display: 'block' }} />
          </div>
          <div style={{ position: 'absolute' as const, bottom: 24, right: -20, background: '#fff', padding: '16px 20px', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxWidth: 200 }}>
            <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, color: C.teal }}>$28–$38<span style={{ fontSize: 12, color: C.ink70, fontWeight: 400 }}>/hr</span></div>
            <div style={{ fontSize: 11, color: C.ink70, marginTop: 2 }}>Average maid earnings on MaidLink</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.gold, fontWeight: 600, marginBottom: 12 }}>Become a maid</div>
          <h2 style={{ fontFamily: serif, fontSize: 'clamp(28px,4vw,46px)', lineHeight: 1.06, fontWeight: 500, letterSpacing: -1, margin: 0, marginBottom: 18, color: C.ink }}>
            Set your own hours.<br/>Keep <em style={{ color: C.teal }}>what you earn</em>.
          </h2>
          <p style={{ fontSize: 16, color: C.ink70, lineHeight: 1.65, marginBottom: 26 }}>
            Join 140+ Calgary maids earning on their terms. We handle bookings, payments, and no-shows — you handle the cleaning.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
            {MAID_BENEFITS.map(x => (
              <div key={x.t} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: C.teal, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <IconCheck size={14} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{x.t}</div>
                  <div style={{ fontSize: 12, color: C.ink70 }}>{x.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <Link to="/become-a-maid" style={{ background: C.teal, color: '#fff', padding: '13px 22px', borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Apply to become a maid <IconArrow size={13} color="#fff" />
            </Link>
            <span style={{ fontSize: 13, color: C.ink70 }}>Approval in 2–3 days</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────
const FAQS = [
  { q: 'How is MaidLink different from booking directly?',
    a: 'Every maid is admin-verified, reviewed, and locked-in with database-level booking guarantees. You get the flexibility of choosing your cleaner with the reliability of a platform — including dispute resolution and payments.' },
  { q: 'What does the estimate include?',
    a: 'The estimate is based on home size, bedrooms, bathrooms, and clean type. It reflects the hourly rate of a single maid and realistic cleaning time. You\'ll see the final price before confirming — no surprise fees.' },
  { q: 'Do I need to be home during the cleaning?',
    a: 'No. Most clients give us a lockbox code or leave a key with the concierge. You can also meet the maid to hand off keys in person the first time.' },
  { q: 'What if I\'m not satisfied?',
    a: 'Tell us within 24 hours and we\'ll send a maid back to re-clean the area — free. We stand behind every booking.' },
  { q: 'What areas do you cover?',
    a: 'All of Calgary proper. If your postal code starts with T2, T3, or T1Y, we\'re there.' },
  { q: 'How do I become a maid on MaidLink?',
    a: 'Apply at /become-a-maid. We\'ll review your application and set up a short onboarding call. Most approvals happen in 2–3 business days.' },
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '100px 24px' }}>
      <div style={{ textAlign: 'center' as const, marginBottom: 52 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.teal, fontWeight: 600, marginBottom: 10 }}>FAQ</div>
        <h2 style={{ fontFamily: serif, fontSize: 'clamp(26px,4vw,42px)', lineHeight: 1.06, fontWeight: 500, letterSpacing: -0.8, margin: 0, color: C.ink }}>
          Everything you wanted to ask.
        </h2>
      </div>
      <div style={{ borderTop: `1px solid ${C.line}` }}>
        {FAQS.map((f, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: '100%', padding: '22px 0', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' as const, cursor: 'pointer', fontFamily: sans, color: C.ink, gap: 16 }}>
              <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>{f.q}</span>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: open === i ? C.teal : C.creamDeep, color: open === i ? '#fff' : C.ink, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i && (
              <div style={{ paddingBottom: 22, fontSize: 15, color: C.ink70, lineHeight: 1.65, maxWidth: 740 }}>{f.a}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────
function FinalCta() {
  return (
    <section style={{ padding: '0 24px 88px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', borderRadius: 24, padding: '72px 48px', background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealDeep} 100%)`, color: '#fff', position: 'relative' as const, overflow: 'hidden' }}>
        <div style={{ position: 'absolute' as const, top: -50, right: -50, width: 240, height: 240, borderRadius: '50%', background: C.gold, opacity: 0.13 }} />
        <div style={{ position: 'absolute' as const, bottom: -70, left: -30, width: 180, height: 180, borderRadius: '50%', background: C.gold, opacity: 0.07 }} />
        <div style={{ position: 'relative' as const, display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 44, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 2, color: C.gold, fontWeight: 600, marginBottom: 14 }}>Ready when you are</div>
            <h2 style={{ fontFamily: serif, fontSize: 'clamp(32px,5vw,58px)', lineHeight: 1.03, fontWeight: 500, letterSpacing: -1.2, margin: 0, marginBottom: 16 }}>
              Your clean home is <em style={{ color: C.gold }}>2 minutes</em> away.
            </h2>
            <p style={{ fontSize: 16, opacity: 0.88, lineHeight: 1.55, maxWidth: 480, margin: 0 }}>
              No sign-up, no credit card, no pressure. Just a real price for a real clean in Calgary.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <Link to="/estimate" style={{ background: C.gold, color: C.ink, padding: '18px 24px', borderRadius: 14, fontSize: 16, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><IconSparkle size={18} color={C.ink} /> Get my free estimate</span>
              <IconArrow size={18} color={C.ink} />
            </Link>
            <Link to="/become-a-maid" style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#fff', padding: '18px 24px', borderRadius: 14, fontSize: 16, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><IconBroom size={18} color="#fff" /> Become a maid</span>
              <IconArrow size={18} color="#fff" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────
const FOOTER_COLS = [
  { t: 'Services',  l: ['Standard cleaning', 'Deep cleaning', 'Move-in / Move-out'] },
  { t: 'Company',   l: ['About us', 'How it works', 'Blog'] },
  { t: 'For maids', l: ['Become a maid', 'Maid login', 'Referral program'] },
  { t: 'Support',   l: ['Contact us', 'FAQ', 'Cancellation policy'] },
];

function Footer() {
  return (
    <footer style={{ background: C.tealDeep, color: '#E6D9BE', padding: '64px 24px 28px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 36, marginBottom: 48 }}>
          <div>
            <Wordmark size={26} />
            <p style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.65, marginTop: 18, maxWidth: 280 }}>
              Calgary's trusted home cleaning marketplace. Book verified local maids in 2 minutes.
            </p>
          </div>
          {FOOTER_COLS.map(col => (
            <div key={col.t}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 14 }}>{col.t}</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 9 }}>
                {col.l.map(l => <a key={l} href="#" style={{ color: '#E6D9BE', opacity: 0.8, fontSize: 13, textDecoration: 'none' }}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, opacity: 0.7, flexWrap: 'wrap' as const, gap: 12 }}>
          <div>© 2026 MaidLink. Made with care in Calgary, AB.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: '#E6D9BE', textDecoration: 'none' }}>Privacy</a>
            <a href="#" style={{ color: '#E6D9BE', textDecoration: 'none' }}>Terms</a>
            <a href="#" style={{ color: '#E6D9BE', textDecoration: 'none' }}>Accessibility</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────
export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Helmet>
        <title>MaidLink — Book Trusted Home Cleaners in Calgary</title>
        <meta name="description" content="Book verified, reliable home cleaners in Calgary. Get a free AI-powered cleaning estimate in 2 minutes. No double-bookings, ever." />
        <meta property="og:title" content="MaidLink — Book Trusted Home Cleaners in Calgary" />
        <meta property="og:description" content="Book verified, reliable home cleaners in Calgary. Get a free AI-powered cleaning estimate in 2 minutes." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://maidlink.ca/" />
        <meta property="og:image" content="https://maidlink.ca/logo-full.png" />
        <link rel="canonical" href="https://maidlink.ca/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HomeAndConstructionBusiness",
          "name": "MaidLink",
          "url": "https://maidlink.ca",
          "logo": "https://maidlink.ca/logo-full.png",
          "description": "Book verified, reliable home cleaners in Calgary.",
          "areaServed": { "@type": "City", "name": "Calgary" },
          "serviceType": ["Standard Cleaning", "Deep Cleaning", "Move-Out Cleaning"],
          "priceRange": "$$",
          "address": { "@type": "PostalAddress", "addressLocality": "Calgary", "addressRegion": "AB", "addressCountry": "CA" },
        })}</script>
      </Helmet>
      <div style={{ background: C.cream, fontFamily: sans, color: C.ink }}>
        <NavBar isAuthenticated={isAuthenticated} />
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Services />
        <Reasons />
        <Reviews />
        <Areas />
        <BecomeAMaid />
        <Faq />
        <FinalCta />
        <Footer />
      </div>
    </>
  );
}
