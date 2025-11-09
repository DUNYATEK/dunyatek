import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Loom { id: number; name: string; epi: number; ppi: number; width_cm?: number; height_cm?: number; report_w?: number; report_h?: number; }

export default function Looms() {
  const [items, setItems] = useState<Loom[]>([]);
  const [name, setName] = useState('Preset120');
  const [epi, setEpi] = useState<number>(120);
  const [ppi, setPpi] = useState<number>(120);
  const [reportW, setReportW] = useState<number>(256);
  const [reportH, setReportH] = useState<number>(256);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  const load = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/looms', { headers: auth });
      setItems(res.data);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Loom listesi çekilemedi');
    }
  };

  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    try {
      await axios.post('http://127.0.0.1:5000/api/looms', { name, epi, ppi, report_w: reportW, report_h: reportH }, { headers: auth });
      setMsg('Eklendi');
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Ekleme hatası');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    if (editingId == null) return;
    try {
      await axios.put(`http://127.0.0.1:5000/api/looms/${editingId}`, { name, epi, ppi, report_w: reportW, report_h: reportH }, { headers: auth });
      setMsg('Güncellendi');
      setEditingId(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Güncelleme hatası');
    }
  };

  const startEdit = (x: Loom) => {
    setEditingId(x.id);
    setName(x.name);
    setEpi(x.epi);
    setPpi(x.ppi);
    setReportW(x.report_w || 0);
    setReportH(x.report_h || 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('Preset120');
    setEpi(120);
    setPpi(120);
    setReportW(256);
    setReportH(256);
  };

  const delItem = async (id: number) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/api/looms/${id}`, { headers: auth });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Silme hatası');
    }
  };

  return (
    <div className="container">
      <div className="card card-elevated" style={{ maxWidth: 820, marginBottom: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Tezgah Profili (Loom)</h2>
        <form onSubmit={editingId==null ? add : saveEdit} className="grid" style={{ gap: 12 }}>
          <div className="field field-narrow">
            <label>Tezgah adı</label>
            <input className="input input-sm" placeholder="Ör: Standart 120×120" value={name} onChange={e=>setName(e.target.value)} required />
            <small className="field-help">Üretim hattında ayırt etmek için isim. Preset veya makine adı olabilir.</small>
          </div>

          <div className="grid-2">
            <div className="field field-narrow">
              <label>EPI (inç başına çözgü)</label>
              <input className="input input-sm" placeholder="Ör: 120" type="number" value={epi} onChange={e=>setEpi(parseInt(e.target.value||'0'))} required />
              <small className="field-help">En yönünde, inç başına çözgü tel sayısı. Yaygın: 80 / 120 / 150.</small>
            </div>
            <div className="field field-narrow">
              <label>PPI (inç başına atkı)</label>
              <input className="input input-sm" placeholder="Ör: 120" type="number" value={ppi} onChange={e=>setPpi(parseInt(e.target.value||'0'))} required />
              <small className="field-help">Boy yönünde, inç başına atkı sayısı. Genelde EPI ile eşit kullanılır.</small>
            </div>
          </div>

          <div className="grid-2">
            <div className="field field-narrow">
              <label>Rapor genişliği (px) — opsiyonel</label>
              <input className="input input-sm" placeholder="Ör: 256" type="number" value={reportW} onChange={e=>setReportW(parseInt(e.target.value||'0'))} />
              <small className="field-help">Desenin yatayda tekrar eden modül genişliği. Sabit raporlu tezgahlarda.</small>
            </div>
            <div className="field field-narrow">
              <label>Rapor yüksekliği (px) — opsiyonel</label>
              <input className="input input-sm" placeholder="Ör: 256" type="number" value={reportH} onChange={e=>setReportH(parseInt(e.target.value||'0'))} />
              <small className="field-help">Desenin dikeyde tekrar eden modül yüksekliği. Opsiyonel.</small>
            </div>
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            {editingId==null ? (
              <button className="btn btn-3d" type="submit">Ekle</button>
            ) : (
              <>
                <button className="btn btn-3d" type="submit">Kaydet</button>
                <button className="btn btn-3d btn-ghost" type="button" onClick={cancelEdit}>İptal</button>
              </>
            )}
          </div>
        </form>
      </div>
      {msg && (
        <div className="card" style={{ borderColor: '#fecaca', background: '#fff1f2', color: '#7f1d1d', marginBottom: 12 }}>
          {msg}
        </div>
      )}
      <div className="card card-elevated">
        <h2 style={{ marginBottom: 8 }}>Tezgah Listesi</h2>
        <table border={1} cellPadding={6} style={{ marginTop: 8 }}>
          <thead><tr><th>ID</th><th>Tezgah adı</th><th>EPI</th><th>PPI</th><th>Rapor (W×H)</th><th>Aksiyon</th></tr></thead>
          <tbody>
            {items.map(x=> (
              <tr key={x.id}>
                <td>{x.id}</td><td>{x.name}</td><td>{x.epi}</td><td>{x.ppi}</td><td>{x.report_w}×{x.report_h}</td>
                <td>
                  <div className="row">
                    <button className="btn btn-3d btn-ghost" onClick={()=>startEdit(x)} type="button">Düzenle</button>
                    <button className="btn btn-3d btn-danger" onClick={()=>delItem(x.id)} type="button">Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
