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
  componentDidCatch(error, info) {
    try { console.error('[ErrorBoundary]', error, info?.componentStack); } catch {}
    try { sessionStorage.setItem('terakhir-error', String(error?.stack || error)); } catch {}
  }
  render() {
    if (this.state.error) {
      const { onBack, judul } = this.props;
      return (
        <div className="wrap">
          <div className="alert alert-error" role="alert" style={{ marginTop: 32 }}>
            <b>{judul || 'Halaman ini gagal dimuat.'}</b>{' '}
            Coba muat ulang, atau kembali dan buka lagi.
            {this.state.error && (
              <details style={{ marginTop: 12, textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', fontSize: 13 }}>Detail error (untuk developer)</summary>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {String(this.state.error?.stack || this.state.error)}
                </pre>
              </details>
            )}
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
