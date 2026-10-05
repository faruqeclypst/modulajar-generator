// StempelSelesai: penanda visual bahwa generate selesai, gaya stempel karet
// di atas kertas. Satu kali tayang, singkat, tanpa confetti. Menghormati
// prefers-reduced-motion (CSS menonaktifkan animasi bila diminta).
export default function StempelSelesai({ teks = 'Selesai', subteks }) {
  return (
    <div className="stempel-wrap" role="status" aria-label={teks}>
      <div className="stempel" aria-hidden="true">
        <svg viewBox="0 0 64 64" className="stempel-cap">
          <path d="M20 33.5l9 9 15-17" fill="none" stroke="currentColor"
            strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="stempel-teks">
        <b>{teks}</b>
        {subteks && <span className="hint">{subteks}</span>}
      </div>
    </div>
  );
}
