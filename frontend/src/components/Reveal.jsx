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
