import { useEffect, useRef, useState } from 'react';

// Topbar: latar ink, sticky. Navigasi nyata (pindah view), chip pengguna
// dengan dropdown Pengaturan/Keluar. Keyboard: Enter/Space buka, Escape
// tutup + fokus kembali ke pemicu, klik di luar menutup.
const NAV = [
  ['app', 'Dokumen Saya'],
  ['ruang', 'Ruang Perencanaan'],
  ['paket', 'Generator Paket'],
];

function namaDepan(user) {
  const meta = user?.user_metadata || {};
  const nama = meta.full_name || meta.name || '';
  if (nama) return String(nama).split(' ')[0];
  const email = user?.email || '';
  return email ? email.split('@')[0] : 'Guru';
}

function inisial(user) {
  const n = namaDepan(user);
  return (n[0] || 'G').toUpperCase();
}

export default function Topbar({ view, onNav, user, onOpenSettings, onSignOut }) {
  const [open, setOpen] = useState(false); // menu pengguna
  const [mobileOpen, setMobileOpen] = useState(false); // panel navigasi mobile
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const firstItemRef = useRef(null);

  // klik di luar menutup menu pengguna
  useEffect(() => {
    if (!open) return;
    function diLuar(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', diLuar);
    return () => document.removeEventListener('mousedown', diLuar);
  }, [open ]);

  // saat menu terbuka, fokus ke item pertama
  useEffect(() => {
    if (open && firstItemRef.current) firstItemRef.current.focus();
  }, [open ]);

  function tutupKembali() {
    setOpen(false);
    if (triggerRef.current) triggerRef.current.focus();
  }

  function onMenuKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); tutupKembali(); }
  }

  function menuItem(ref) {
    return {
      ref,
      role: 'menuitem',
      className: 'menu-item',
      onKeyDown: onMenuKey,
      tabIndex: 0,
    };
  }

  const navButtons = (mobile) => NAV.map(([v, label]) => (
    <button
      key={v}
      type="button"
      className={'nav-item' + (view === v ? ' active' : '')}
      aria-current={view === v ? 'page' : undefined}
      onClick={() => { onNav(v); if (mobile) setMobileOpen(false); }}
    >
      {label}
    </button>
  ));

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button type="button" className="logo" onClick={() => { onNav('landing'); setMobileOpen(false); }} aria-label="ModulAjar, ke halaman depan">
          <span className="logo-mark" aria-hidden="true">M</span>
          <span><b>ModulAjar</b><small>Perangkat Ajar AI</small></span>
        </button>
        <div className="spacer" />

        <nav className="topnav-desktop" aria-label="Navigasi utama">
          {navButtons(false)}
        </nav>
        {view === 'landing' && (
          <button type="button" className="btn btn-primary btn-sm topbar-cta" onClick={() => onNav('app')}>
            Buka Aplikasi
          </button>
        )}

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMobileOpen((o) => !o)}
        >
          Menu
        </button>

        <div className="user-menu-wrap">
          <button
            type="button"
            ref={triggerRef}
            className="user-chip"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => { if (e.key === 'Escape' && open) tutupKembali(); }}
          >
            <span className="avatar" aria-hidden="true">{inisial(user)}</span>
            <span>{namaDepan(user)}</span>
          </button>
          {open && (
            <div ref={menuRef} className="user-menu" role="menu" aria-label="Menu akun">
              <div className="menu-head">{user?.email || ''}</div>
              <button type="button" {...menuItem(firstItemRef)} onClick={() => { setOpen(false); onOpenSettings(); }}>
                Pengaturan
              </button>
              <hr className="menu-sep" />
              <button type="button" {...menuItem(null)} className="menu-item danger" onClick={() => { setOpen(false); onSignOut(); }}>
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>

      <nav
        id="mobile-nav-panel"
        className={'mobile-panel' + (mobileOpen ? ' open' : '')}
        aria-label="Navigasi seluler"
      >
        {mobileOpen && (
          <>
            {navButtons(true)}
            <button type="button" className="nav-item" onClick={() => { setMobileOpen(false); onOpenSettings(); }}>
              Pengaturan
            </button>
            <button type="button" className="nav-item" onClick={() => { setMobileOpen(false); onSignOut(); }}>
              Keluar
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
