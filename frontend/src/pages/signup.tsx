import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Signup: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    try {
      const res = await axios.post('http://127.0.0.1:5000/api/signup', {
        name,
        email,
        password,
      });

      if (res.data.message) {
        setMessage(res.data.message); // backend'den gelen mesaj (Kullanıcı kaydedildi)
        // kayıt başarılı olduğunda login sayfasına yönlendirebilirsin
        setTimeout(() => navigate('/login'), 1500);
      }
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      setMessage(serverMsg || 'Kayıt başarısız. Bilgileri kontrol edin.');
      console.error('Signup error:', err);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc' }}>
      <h2>Kayıt Ol</h2>
      <form onSubmit={handleSignup}>
        <div style={{ marginBottom: '10px' }}>
          <label>Ad Soyad</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px 20px' }}>Kayıt Ol</button>
      </form>
      {message && (
        <p style={{ marginTop: '10px', color: message.includes('başarısız') ? 'red' : 'green' }}>
          {message}
        </p>
      )}
    </div>
  );
};

export default Signup;
