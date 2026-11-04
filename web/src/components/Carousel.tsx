import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Auto-advancing slides with dots and swipe. Stops auto-advance for people who prefer reduced motion. */
export default function Carousel({ slides, interval = 6500 }: { slides: ReactNode[]; interval?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const n = slides.length;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paused || reduce || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), interval);
    return () => clearInterval(t);
  }, [paused, reduce, n, interval]);

  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <div
      className="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { startX.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        if (startX.current !== null) {
          const dx = e.changedTouches[0].clientX - startX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }
        startX.current = null;
        setPaused(false);
      }}
    >
      <div className="carousel-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => (
          <div className="carousel-slide" key={k} aria-hidden={k !== i}>{s}</div>
        ))}
      </div>
      {n > 1 && (
        <div className="dots">
          {slides.map((_, k) => (
            <button key={k} className={k === i ? 'on' : ''} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </div>
  );
}
