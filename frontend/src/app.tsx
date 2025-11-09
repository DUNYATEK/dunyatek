import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import SettingsPage from './pages/settings';
import Login from './pages/login';
import Signup from './pages/signup';
import Dashboard from './pages/dashboard';
import Looms from './pages/looms';
import Palettes from './pages/palettes';
import Designs from './pages/designs';
import Pattern from './pages/pattern';
import Archive from './pages/archive';
import AIPage from './pages/ai';

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!(typeof window !== 'undefined' && localStorage.getItem('token')));
  useEffect(()=>{
    const sync = () => setAuthed(!!localStorage.getItem('token'));
    window.addEventListener('storage', sync);
    window.addEventListener('auth-changed', sync as any);
    return ()=>{
      window.removeEventListener('storage', sync);
      window.removeEventListener('auth-changed', sync as any);
    };
  },[]);
  return (
    <Router>
      <div className="navbar">
        <div className="navbar-inner">
          <div className="nav-brand" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img src="/dunyatek-logo.png" alt="Dunyatek" style={{ width:30, height:30, objectFit:'contain' }} />
            <span style={{ fontWeight:700 }}>Desen Üretim Yazılımı</span>
          </div>
          <div className="nav-links">
            {authed ? (
              <>
                <Link className="nav-link" to="/ai">Kontrol Paneli</Link>
                <Link className="nav-link" to="/looms">Tezgahlar</Link>
                <Link className="nav-link" to="/palettes">Paletler</Link>
                <Link className="nav-link" to="/archive">Arşiv</Link>
                <Link className="nav-link" to="/references">Referanslar</Link>
                <Link className="nav-link" to="/users">Kullanıcılar</Link>
                <Link className="nav-link" to="/settings">Ayarlar</Link>
                <button className="btn btn-ghost" onClick={()=>{ localStorage.removeItem('token'); window.dispatchEvent(new Event('auth-changed')); window.location.href='/login'; }}>Çıkış</button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<RequireAuth><AIPage /></RequireAuth>} />
        <Route path="/looms" element={<RequireAuth><Looms /></RequireAuth>} />
        <Route path="/palettes" element={<RequireAuth><Palettes /></RequireAuth>} />
        <Route path="/references" element={<RequireAuth><Designs /></RequireAuth>} />
        <Route path="/designs" element={<Navigate to="/references" replace />} />
        <Route path="/pattern" element={<RequireAuth><Pattern /></RequireAuth>} />
        <Route path="/ai" element={<RequireAuth><AIPage /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/archive" element={<RequireAuth><Archive /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/" element={<Navigate to="/ai" replace />} />
      </Routes>
    </Router>
  );
}
