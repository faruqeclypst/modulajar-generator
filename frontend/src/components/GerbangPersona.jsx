import { useEffect, useState } from 'react';
import WawancaraGuru, { kompilasiPersona, ringkasanPersona } from './WawancaraGuru';
import { SkelForm } from './Kerangka';
import { getProfile, saveProfile } from '../lib/api';

// GerbangPersona: tampilkan sesi tanya-jawab persona guru sebelum alur generate,
// TAPI hanya bila persona belum pernah diisi/dilewati. Persona disimpan per akun
// (profil_guru, ikut perangkat) sehingga cukup isi sekali.
export default function GerbangPersona({ konteks, children }) {
  const [status, setStatus] = useState('cek'); // cek | tanya | lolos

  useEffect(() => {
    try {
      const p = getProfile();
      setStatus(p.persona || p.personaDilewati ? 'lolos' : 'tanya');
    } catch {
      setStatus('lolos');
    }
  }, []);

  function selesai({ jawaban, catatan, daftarTanya }) {
    try {
      saveProfile({
        persona: kompilasiPersona(jawaban, catatan, daftarTanya),
        personaRingkasan: ringkasanPersona(jawaban, catatan),
      });
    } catch { /* abaikan */ }
    setStatus('lolos');
  }

  function lewati() {
    try {
      saveProfile({ personaDilewati: true });
    } catch { /* abaikan */ }
    setStatus('lolos');
  }

  if (status === 'cek') return <SkelForm baris={6} />;
  if (status === 'tanya') {
    return (
      <WawancaraGuru
        konteks={konteks}
        onSelesai={selesai}
        onLewati={lewati}
      />
    );
  }
  return children;
}
