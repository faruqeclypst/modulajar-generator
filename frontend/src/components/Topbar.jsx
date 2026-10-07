import { useCallback, useEffect, useRef, useState } from 'react';
import ModalReferal from './ModalReferal';

// Topbar: latar ink, sticky. Navigasi nyata (pindah view), chip pengguna
// dengan dropdown Pengaturan/Keluar. Keyboard: Enter/Space buka, Escape
// tutup + fokus kembali ke pemicu, klik di luar menutup.
const NAV = [
  ['app', 'Proyek Saya'],
  ['ruang', 'Ruang Perencanaan'],
  ['paket', 'Generator Paket'],
];

// View yang ikut menyalakan item nav (konteks orientasi, bukan sekadar URL).
const NAV_AKTIF = { app: ['app', 'proyek'], ruang: ['ruang'], paket: ['paket'] };

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

// Foto profil Google dari user_metadata; null bila tidak ada (fallback inisial)
function avatarUrl(user) {
  const meta = user?.user_metadata || {};
  return meta.avatar_url || meta.picture || null;
}

export default function Topbar({ view, onNav, user, kuota, onOpenSettings, onOpenDocs, isAdmin, onSignOut, onLogin, onKuotaChanged }) {
  const [open, setOpen] = useState(false); // menu pengguna
  const [mobileOpen, setMobileOpen] = useState(false); // panel navigasi mobile
  const [refModal, setRefModal] = useState(false); // modal Free Credit (referal)
  const tutupRefModal = useCallback(() => setRefModal(false), []); // stabil: cegah re-subscribe Escape tiap render
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

  const navButtons = (mobile) => NAV.map(([v, label]) => {
    const aktif = (NAV_AKTIF[v] || [v]).includes(view);
    return (
      <button
        key={v}
        type="button"
        className={'nav-item' + (aktif ? ' active' : '')}
        aria-current={aktif ? 'page' : undefined}
        onClick={() => { onNav(v); if (mobile) setMobileOpen(false); }}
      >
        {label}
      </button>
    );
  });

  const foto = avatarUrl(user);
  const diLanding = view === 'landing';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const cek = () => { raf = 0; setScrolled(window.scrollY > 24); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(cek); };
    cek();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={'topbar' + (diLanding ? ' topbar-land' : '') + (scrolled ? ' scrolled' : '')}>
      <div className="topbar-inner">
        <button type="button" className="logo" onClick={() => { onNav('landing'); setMobileOpen(false); }} aria-label="ModulAjar, ke halaman depan">
          <img src="/logo.svg" alt="" aria-hidden="true" className="logo-mark logo-img" width="42" height="42" />
          <span className="logo-teks"><b>ModulAjar</b><small>Perangkat Ajar AI</small></span>
        </button>
        <div className="spacer" />

        {!diLanding && (
          <nav className="topnav-desktop" aria-label="Navigasi utama">
            {navButtons(false)}
          </nav>
        )}
        {user && diLanding && (
          <button type="button" className="btn btn-primary btn-sm topbar-cta" onClick={() => onNav('app')}>
            Buka Aplikasi
          </button>
        )}
        {!user && (
          <nav className="landnav" aria-label="Navigasi landing">
            {[['#alur', 'Alur'], ['#cara-kerja', 'Cara Kerja'], ['#harga', 'Harga'], ['#faq', 'FAQ']].map(([href, label]) => (
              <a key={href} className="nav-item" href={href}>{label}</a>
            ))}
          </nav>
        )}
        {!user && (
          <button type="button" className="btn btn-primary btn-sm topbar-cta" onClick={onLogin}>
            Masuk
          </button>
        )}

        {user && !diLanding && (
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? 'Tutup' : 'Menu'}
          </button>
        )}

        {user && (
        <div className="topbar-acts">
        {kuota && (
          <button
            type="button"
            className={'kuota-pil' + (kuota.admin ? ' admin' : '')}
            onClick={onOpenSettings}
            title={kuota.admin ? 'Akun admin: tanpa batas kredit' : `Sisa ${kuota.sisa} dari ${kuota.batas} kredit minggu ini. Klik untuk buka Pengaturan.`}
            aria-label={kuota.admin ? 'Akun admin, tanpa batas kredit. Buka pengaturan.' : `Sisa kredit ${kuota.sisa} dari ${kuota.batas}. Buka pengaturan.`}
          >
            <span className="kuota-dot" aria-hidden="true" />
            {kuota.admin ? 'Admin' : `${kuota.sisa} Kredit`}
          </button>
        )}

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
            {foto ? (
              <img className="avatar avatar-img" src={foto} alt="" referrerPolicy="no-referrer" aria-hidden="true" />
            ) : (
              <span className="avatar" aria-hidden="true">{inisial(user)}</span>
            )}
            <span className="chip-nama">{namaDepan(user)}</span>
          </button>
          {open && (
            <div ref={menuRef} className="user-menu" role="menu" aria-label="Menu akun">
              <div className="menu-head">{user?.email || ''}</div>
              <button type="button" {...menuItem(firstItemRef)} onClick={() => { setOpen(false); onOpenSettings(); }}>
                Pengaturan
              </button>
              <button type="button" {...menuItem(null)} onClick={() => { setOpen(false); setRefModal(true); }}>
                Free Credit
              </button>
              {onOpenDocs && (
                <button type="button" {...menuItem(null)} onClick={() => { setOpen(false); onOpenDocs(); }}>
                  Panduan
                </button>
              )}
              <button type="button" {...menuItem(null)} onClick={() => { setOpen(false); onNav('masukan'); }}>
                Kirim Masukan
              </button>
              {isAdmin && (
                <button type="button" {...menuItem(null)} onClick={() => { setOpen(false); onNav('admin'); }}>
                  Dashboard Admin
                </button>
              )}
              <hr className="menu-sep" />
              <button type="button" {...menuItem(null)} className="menu-item danger" onClick={() => { setOpen(false); onSignOut(); }}>
                Keluar
              </button>
            </div>
          )}
        </div>
        </div>
        )}
      </div>

      <nav
        id="mobile-nav-panel"
        className={'mobile-panel' + (mobileOpen ? ' open' : '')}
        aria-label="Navigasi seluler"
      >
        {mobileOpen && (
          <>
            {navButtons(true)}
          </>
        )}
      </nav>
      {refModal && <ModalReferal onClose={tutupRefModal} onKuotaChanged={onKuotaChanged} />}
    </header>
  );
}
