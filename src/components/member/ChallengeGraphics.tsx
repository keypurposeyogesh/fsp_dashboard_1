"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './ChallengeGraphics.module.css';

/* useLayoutEffect warns on the server, so fall back to useEffect there. The
   test harness renders with window undefined and stubs useEffect, which is
   exactly what we want: no animation, final values in the markup. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const stillness = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts up to `value` on mount.
 *
 * The server and the first client render both emit the final number, so there
 * is no hydration mismatch and a reader without JS still sees the real figure.
 * The layout effect rewinds to zero *before* paint, so the final value is never
 * briefly visible first.
 */
function useCountUp(value: number, ms = 700) {
  const [display, setDisplay] = useState(value);
  useIsoLayoutEffect(() => {
    if (stillness() || value === 0) { setDisplay(value); return; }
    let raf = 0;
    const started = performance.now();
    setDisplay(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return display;
}

/** A number that counts up on mount. Locale-formatted, so 3000 reads "3,000". */
export function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value).toLocaleString()}</>;
}

/* ---------------------------------------------------------------- the ring */

const polar = (r: number, deg: number): [number, number] => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
};

const arc = (r: number, from: number, to: number) => {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/**
 * One lit segment per completed task. A bar says "a number"; thirty countable
 * pips say "there are thirty of these and I have done twelve", which is what
 * makes the goal feel earnable.
 *
 * Decorative: the surrounding section carries the progressbar semantics, so
 * this is aria-hidden and the centre figure is repeated in accessible text.
 */
export function TaskRing({ completed, total = 30 }: { completed: number; total?: number }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const step = 360 / total;
  const gap = total > 20 ? 3.4 : 2;
  const shown = useCountUp(completed);

  /* Celebrate only a real increase, so a reload or a refetch stays quiet. */
  const previous = useRef(completed);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (completed > previous.current && !stillness()) setBurst(b => b + 1);
    previous.current = completed;
  }, [completed]);

  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 200 200" className={styles.ring} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`ring-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-yellow)" />
            <stop offset="100%" stopColor="var(--brand-gold)" />
          </linearGradient>
        </defs>
        {Array.from({ length: total }, (_, i) => {
          const lit = i < completed;
          return (
            <path
              key={i}
              d={arc(78, i * step + gap / 2, (i + 1) * step - gap / 2)}
              className={lit ? styles.lit : styles.unlit}
              stroke={lit ? `url(#ring-${gid})` : undefined}
              style={lit ? { animationDelay: `${Math.min(i, 24) * 26}ms` } : undefined}
            />
          );
        })}
      </svg>
      <span className={styles.ringCore} aria-hidden="true">
        <strong>{shown}</strong>
        <small>of {total}</small>
      </span>
      {burst > 0 && (
        <span className={styles.burst} key={burst} aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${(360 / 14) * i}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the trail */

export type Landmark = { at: number; label: string; Icon: LucideIcon };

/* Evenly spaced stops. The journey is ordinal, not a measurement, so the gap
   between "10 tasks" and "20 tasks" reads the same as 1 -> 10; the walker
   interpolates piecewise between them so its position is still truthful. */
const STOPS = [0.12, 0.38, 0.64, 0.9];
const X = (f: number) => 20 + f * 560;
const Y = (f: number) => 62 - 30 * Math.sin(f * 3 * Math.PI);

function walkerAt(completed: number, marks: Landmark[]) {
  const first = marks[0];
  if (completed <= first.at) return first.at ? STOPS[0] * (completed / first.at) : STOPS[0];
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i], b = marks[i + 1];
    if (completed < b.at) return STOPS[i] + (STOPS[i + 1] - STOPS[i]) * ((completed - a.at) / (b.at - a.at));
  }
  return STOPS[marks.length - 1];
}

const line = (from: number, to: number) => {
  const points: string[] = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const f = from + ((to - from) * i) / steps;
    points.push(`${X(f).toFixed(1)} ${Y(f).toFixed(1)}`);
  }
  return `M ${points.join(' L ')}`;
};

/**
 * The milestones as a path you walk rather than a row of medals - the clearest
 * "game, not report" shape available from data already on the page.
 *
 * The drawing is decorative; every landmark keeps a real HTML label beneath it,
 * so the information survives without the SVG.
 */
export function JourneyTrail({ completed, marks }: { completed: number; marks: Landmark[] }) {
  const here = walkerAt(completed, marks);
  const pct = (f: number) => ({ left: `${(X(f) / 600) * 100}%`, top: `${(Y(f) / 124) * 100}%` });
  return (
    <div className={styles.trail}>
      {/* The path is stretched to the container; a stretched stroke would
          thicken unevenly, hence non-scaling-stroke. Everything round is HTML,
          so nothing turns into an ellipse and the dots keep a fixed size. */}
      <svg viewBox="0 0 600 124" className={styles.trailArt} aria-hidden="true" focusable="false" preserveAspectRatio="none">
        <path d={line(0, 1)} className={styles.trailBase} vectorEffect="non-scaling-stroke" />
        {here > 0 && <path d={line(0, here)} className={styles.trailWalked} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className={styles.trailMarks}>
        {marks.map((mark, i) => {
          const reached = completed >= mark.at;
          const { Icon } = mark;
          return (
            <div
              key={mark.at}
              className={reached ? styles.markDone : styles.markTodo}
              style={pct(STOPS[i])}
              title={`${mark.label}: ${mark.at} completed ${mark.at === 1 ? 'task' : 'tasks'}`}
            >
              <span className={styles.markIcon}>
                <Icon size={18} />
                <span>{reached ? <Check size={9} /> : <LockKeyhole size={8} />}</span>
              </span>
              <strong>{mark.label}</strong>
              <small>{reached ? 'Unlocked' : `${mark.at} ${mark.at === 1 ? 'task' : 'tasks'}`}</small>
            </div>
          );
        })}
        <span className={styles.walker} style={pct(here)} aria-hidden="true" />
      </div>
    </div>
  );
}
