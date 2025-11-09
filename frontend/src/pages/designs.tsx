import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Design { id: number; name: string; original_image?: string; loom_id?: number; palette_id?: number }
interface Loom { id: number; name: string }
interface Palette { id: number; name: string }

export default function Designs() {
  const [items, setItems] = useState<Design[]>([]);
  const [name, setName] = useState('Desen1');
  const [originalImage, setOriginalImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loomId, setLoomId] = useState<number|''>('');
  const [paletteId, setPaletteId] = useState<number|''>('');
  const [looms, setLooms] = useState<Loom[]>([]);
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [msg, setMsg] = useState('');

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  const load = async () => {
    try {
      const [d, l, p] = await Promise.all([
        axios.get('http://127.0.0.1:5000/api/designs', { headers: auth }),
        axios.get('http://127.0.0.1:5000/api/looms', { headers: auth }),
        axios.get('http://127.0.0.1:5000/api/palettes', { headers: auth }),
      ]);
      setItems(d.data); setLooms(l.data); setPalettes(p.data);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Listeleme hatası');
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    try {
      await axios.post('http://127.0.0.1:5000/api/designs', {
        name,
        original_image: originalImage || undefined,
        loom_id: loomId === '' ? undefined : loomId,
        palette_id: paletteId === '' ? undefined : paletteId,
      }, { headers: auth });
      setMsg('Kaydedildi');
      setName('Desen1'); setOriginalImage(''); setLoomId(''); setPaletteId('');
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Kaydetme hatası');
    }
  };

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!auth) { setMsg('Lütfen giriş yapın'); return; }
    setUploading(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Optional auto design create
      if (name) fd.append('name', name);
      if (loomId !== '') fd.append('loom_id', String(loomId));
      if (paletteId !== '') fd.append('palette_id', String(paletteId));
      const res = await axios.post('http://127.0.0.1:5000/api/upload-image', fd, {
        headers: { ...auth, 'Content-Type': 'multipart/form-data' },
      });
      const p = res.data?.path as string;
      setOriginalImage(p || '');
      const did = res.data?.design_id as number | undefined;
      if (did) {
        setMsg(`Görsel yüklendi ve Design oluşturuldu (#${did})`);
        await load();
      } else {
        setMsg('Görsel yüklendi');
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Yükleme hatası');
    } finally {
      setUploading(false);
    }
  };

  const delItem = async (id: number) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/api/designs/${id}`, { headers: auth });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Silme hatası');
    }
  };

  const useInAI = (img?: string) => {
    if (!img) return;
    const url = `/ai?reference=${encodeURIComponent(img)}`;
    window.location.href = url;
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Referanslar</h2>
      <form onSubmit={save} style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
        <input placeholder="Referans adı" value={name} onChange={e=>setName(e.target.value)} required />
        <div style={{ display: 'grid', gap: 6 }}>
          <input type="file" accept="image/*" onChange={onFileSelect} disabled={uploading} />
          <input placeholder="Görsel yolu (opsiyonel)" value={originalImage} onChange={e=>setOriginalImage(e.target.value)} />
        </div>
        <select value={loomId} onChange={e=>setLoomId(e.target.value ? parseInt(e.target.value) : '')}>
          <option value="">Loom (opsiyonel)</option>
          {looms.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={paletteId} onChange={e=>setPaletteId(e.target.value ? parseInt(e.target.value) : '')}>
          <option value="">Palette (opsiyonel)</option>
          {palettes.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit">Referans Kaydet</button>
      </form>
      {msg && <p>{msg}</p>}
      <table border={1} cellPadding={6} style={{ marginTop: 16 }}>
        <thead><tr><th>ID</th><th>Ad</th><th>Görsel</th><th>Loom</th><th>Palette</th><th>Aksiyon</th></tr></thead>
        <tbody>
          {items.map(d => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td>{d.name}</td>
              <td>{d.original_image}</td>
              <td>{d.loom_id}</td>
              <td>{d.palette_id}</td>
              <td>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>useInAI(d.original_image)}>AI'da Referans Kullan</button>
                  <button onClick={()=>delItem(d.id)}>Sil</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
