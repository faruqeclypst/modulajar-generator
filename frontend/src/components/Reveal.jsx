import { useEffect, useRef, useState } from 'react';

// Bungkus elemen agar muncul halus saat masuk viewport.
// delayMs: jeda stagger antar item (mis. 60 * index).
export function Reveal({ children, delayMs = 0, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  const [tampil, setTampil] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTampil(true); return; }
    const io = new IntersectionObserver((entri) => {
      for (const e of entri) {
        if (e.isIntersecting) { setTampil(true); io.disconnect(); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`${className} reveal${tampil ? ' reveal-tampil' : ''}`}
      style={{ ['--reveal-delay']: `${delayMs}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Parallax ringan: geser vertikal mengikuti scroll dengan kecepatan kustom.
// speed 0.12 = bergerak 12% dari jarak scroll (efek dalam/lambat).
export function Parallax({ children, speed = 0.12, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const hitung = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const tengah = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-tengah * speed).toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(hitung); };
    hitung();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed]);
  return <div ref={ref} className={className} {...rest}>{children}</div>;
}

// Angka count-up saat masuk viewport (mis. "10" kredit).
export function CountUp({ sampai = 10, durasi = 1200, className = '' }) {
  const ref = useRef(null);
  const [nilai, setNilai] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setNilai(sampai); return; }
    let raf = 0; let mulai = 0;
    const io = new IntersectionObserver((entri) => {
      if (!entri[0].isIntersecting) return;
      io.disconnect();
      const langkah = (t) => {
        if (!mulai) mulai = t;
        const p = Math.min(1, (t - mulai) / durasi);
        setNilai(Math.round(sampai * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(langkah);
      };
      raf = requestAnimationFrame(langkah);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [sampai, durasi]);
  return <span ref={ref} className={className}>{nilai}</span>;
}

// Teks berputar otomatis: tiap interval ganti frasa dengan animasi slide+blur.
export function TextRotator({ frasa = [], interval = 3200, className = '' }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (frasa.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % frasa.length), interval);
    return () => clearInterval(t);
  }, [frasa.length, interval]);
  return (
    <span className={`rotator ${className}`} aria-live="polite">
      <span key={i} className="rotator-kata">{frasa[i]}</span>
    </span>
  );
}
