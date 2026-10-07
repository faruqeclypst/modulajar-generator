import { Component } from 'react';

// ErrorBoundary: satu view yang crash tidak boleh memutihkan seluruh aplikasi.
// Menampilkan pesan ramah + tombol kembali, bukan layar putih.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() { /* cukup tampilkan UI fallback; log server tidak diperlukan */ }
  render() {
    if (this.state.error) {
      const { onBack, judul } = this.props;
      return (
        <div className="wrap">
          <div className="alert alert-error" role="alert" style={{ marginTop: 32 }}>
            <b>{judul || 'Halaman ini gagal dimuat.'}</b>{' '}
            Coba muat ulang, atau kembali dan buka lagi.

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-ink" onClick={() => window.location.reload()}>
                Muat ulang halaman
              </button>
              {onBack && (
                <button type="button" className="btn btn-sm" onClick={() => { this.setState({ error: null }); onBack(); }}>
                  Kembali
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
