// SEAM PEMBAYARAN: ganti fungsi ini dengan pemanggilan gateway (mis. Midtrans/Xendit)
// saat sudah siap. Alur yang diharapkan:
//   1. Frontend memanggil mulaiUpgrade() → buka halaman/Snap pembayaran gateway.
//   2. Gateway memanggil webhook backend setelah pembayaran sukses.
//   3. Backend perlu endpoint verifikasi pembayaran → naikkan batas kuota user
//      (atau tandai user sebagai pelanggan tanpa batas).
// Sampai saat itu, fungsi ini mengembalikan { segera: true } dan Paywall
// menampilkan pesan "Pembayaran segera hadir" + opsi hubungi admin via WhatsApp.
export async function mulaiUpgrade() {
  return { segera: true };
}
