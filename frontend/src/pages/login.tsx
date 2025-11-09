import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const res = await axios.post(
        'http://127.0.0.1:5000/api/login',
        { email, password },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );

      // Backend'ten dönen token
      const token = res.data.access_token;
      if (token) {
        localStorage.setItem('token', token); // Token'i sakla
        window.dispatchEvent(new Event('auth-changed'));
        setMessage('Giriş başarılı! Yönlendiriliyorsunuz...');
        setTimeout(() => navigate('/ai'), 800);
      } else {
        setMessage('Token alınamadı. Backend yanıtını kontrol edin.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const serverMsg = err.response?.data?.error || err.message;
      setMessage('Giriş başarısız: ' + serverMsg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'linear-gradient(180deg, #f8fafc, #eef2ff)' }}>
      <div className="card" style={{ width: 420, padding: 24, borderRadius: 16, boxShadow: '0 10px 30px rgba(2,6,23,0.08)' }}>
        <div style={{ display:'grid', gap: 6, marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Giriş Yap</h2>
          <div style={{ color: 'var(--muted)' }}>Hesabınızla oturum açın.</div>
        </div>
        <form onSubmit={handleLogin} className="grid" style={{ gap: 12, marginTop: 6, width:'100%' }}>
          <label style={{ display:'grid', gap:6 }}>
            <span style={{ fontWeight: 600 }}>E-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ornek@firma.com"
              style={{ width:'100%', boxSizing:'border-box' }}
            />
          </label>
          <label style={{ display:'grid', gap:6 }}>
            <span style={{ fontWeight: 600 }}>Şifre</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width:'100%', boxSizing:'border-box' }}
            />
          </label>
          <button type="submit" className="btn btn-3d" style={{ width:'100%' }} disabled={loading}>{loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
        </form>
        {message && (
          <div className="card" style={{ marginTop: 10, padding: '8px 10px', borderColor: message.includes('başarısız') ? '#fecaca' : '#bbf7d0', background: message.includes('başarısız') ? '#fff1f2' : '#f0fdf4', color: message.includes('başarısız') ? '#7f1d1d' : '#14532d' }}>
            {message}
          </div>
        )}
        <div style={{ marginTop: 10, color: 'var(--muted)' }}>
          Hesabın yok mu? <Link to="/signup">Kayıt Ol</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
