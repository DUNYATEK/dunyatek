import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  role?: 'user'|'admin'|null;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user'|'admin'>('user');
  const [msg, setMsg] = useState<string>('');

  const token = localStorage.getItem('token');

  // Kullanıcı listesi çek
  const fetchUsers = async () => {
    if (!token) return;
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Protected endpointten email al
  const fetchCurrentUser = async () => {
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserEmail(res.data.current_user);
    } catch (err) {
      console.error(err);
      navigate('/login');
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  // Yeni kullanıcı ekleme
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await axios.post(
        'http://127.0.0.1:5000/api/users',
        { name, email, password, role },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
      setMsg('Kullanıcı eklendi');
      fetchUsers(); // listeyi yenile
    } catch (err) {
      console.error(err);
      setMsg('Kullanıcı eklenirken hata oluştu');
    }
  };

  // Kullanıcı silme
  const handleDeleteUser = async (id: number, emailVal: string) => {
    if (!token) return;
    if (userEmail && emailVal === userEmail) {
      setMsg('Kendi hesabınızı silemezsiniz');
      return;
    }
    try {
      await axios.delete(`http://127.0.0.1:5000/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Kullanıcı silindi');
      fetchUsers();
    } catch (err) {
      console.error(err);
      setMsg('Kullanıcı silinirken hata oluştu');
    }
  };

  const handleUpdateUser = async (u: User) => {
    if (!token) return;
    try {
      await axios.put(`http://127.0.0.1:5000/api/users/${u.id}`, { name: u.name, email: u.email, role: u.role }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Kullanıcı güncellendi');
      fetchUsers();
    } catch (err) {
      console.error(err);
      setMsg('Kullanıcı güncellenemedi');
    }
  };

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Kullanıcılar</h2>
        {userEmail && <div style={{ color: 'var(--muted)', marginTop: 6 }}>Oturum: {userEmail}</div>}
      </div>

      {msg && (
        <div className="card" style={{ marginBottom: 12, color: msg.includes('hata')? 'crimson':'green' }}>{msg}</div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Yeni Kullanıcı Ekle</strong>
        <form onSubmit={handleAddUser} className="grid" style={{ gap: 8, marginTop: 8, maxWidth: 720 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input type="text" placeholder="Ad" value={name} onChange={(e)=>setName(e.target.value)} required style={{ flex:1, minWidth: 180 }} />
            <input type="email" placeholder="E-posta" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ flex:1, minWidth: 220 }} />
            <input type="password" placeholder="Şifre" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ flex:1, minWidth: 180 }} />
            <select value={role} onChange={e=>setRole(e.target.value as 'user'|'admin')} title="Rol (şimdilik görsel)">
              <option value="user">Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </select>
            <button type="submit" className="btn btn-3d">Ekle</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Not: Rol alanı şimdilik görseldir; backend şema güncellemesi ile kalıcı yapılacaktır.</div>
        </form>
      </div>

      <div className="card">
        <strong>Kullanıcı Listesi</strong>
        <table border={1} cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Ad</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Oluşturulma</th>
              <th>Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>
                  <input value={u.name} onChange={(e)=>{
                    const v = e.target.value; const copy=[...users]; copy[idx] = { ...u, name: v }; setUsers(copy);
                  }} />
                </td>
                <td>
                  <input value={u.email} onChange={(e)=>{
                    const v = e.target.value; const copy=[...users]; copy[idx] = { ...u, email: v }; setUsers(copy);
                  }} />
                </td>
                <td>
                  <select value={u.role || 'user'} onChange={(e)=>{
                    const v = e.target.value as 'user'|'admin'; const copy=[...users]; copy[idx] = { ...u, role: v }; setUsers(copy);
                  }}>
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Yönetici</option>
                  </select>
                </td>
                <td>{u.created_at}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn" onClick={() => handleUpdateUser(users[idx])}>Kaydet</button>
                    <button className="btn btn-danger" onClick={() => handleDeleteUser(u.id, u.email)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length===0 && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Kullanıcı yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
