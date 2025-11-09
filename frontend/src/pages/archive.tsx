import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface PreviewItem { id: number; design_id: number; design_name?: string | null; preview_path?: string | null; created_at: string }
interface ExportItem { id: number; pattern_version_id: number; file_path?: string | null; format: string; status: string; created_at: string; has_meta?: boolean }

export default function Archive() {
  const [tab, setTab] = useState<'previews' | 'exports'>('previews');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [exportsList, setExportsList] = useState<ExportItem[]>([]);
  const [msg, setMsg] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imgSize, setImgSize] = useState<{w:number; h:number}>({w:0,h:0});

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  const load = async () => {
    setMsg('');
    try {
      const [pvRes, exRes] = await Promise.all([
        axios.get('http://127.0.0.1:5000/api/archive/previews', { headers: auth }),
        axios.get('http://127.0.0.1:5000/api/archive/exports', { headers: auth }),
      ]);
      setPreviews(pvRes.data);
      setExportsList(exRes.data);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Arşiv verileri alınamadı');
    }
  };

  useEffect(() => { load(); }, []);

  const delPreview = async (id: number) => {
    if (!confirm('Önizlemeyi ve ilişkili exportları silmek istiyor musunuz?')) return;
    try {
      await axios.delete(`http://127.0.0.1:5000/api/archive/preview/${id}`, { headers: auth });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Silme hatası');
    }
  };

  const delExport = async (id: number) => {
    if (!confirm('Export dosyasını silmek istiyor musunuz?')) return;
    try {
      await axios.delete(`http://127.0.0.1:5000/api/archive/export/${id}`, { headers: auth });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Silme hatası');
    }
  };

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Arşiv</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn ${tab==='previews'?'btn-3d':''}`} onClick={()=>setTab('previews')} type="button">Önizlemeler</button>
        <button className={`btn ${tab==='exports'?'btn-3d':''}`} onClick={()=>setTab('exports')} type="button">Exportlar</button>
        <button className="btn btn-ghost" onClick={load} type="button">Yenile</button>
      </div>
      {msg && (<div className="card" style={{ borderColor: '#fecaca', background: '#fff1f2', color: '#7f1d1d', marginBottom: 12 }}>{msg}</div>)}

      {tab==='previews' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {previews.map(p => (
            <div key={p.id} className="card" style={{ display: 'grid', gap: 8 }}>
              <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', borderRadius: 8, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={`http://127.0.0.1:5000/api/preview/${p.id}`}
                  alt={p.design_name || `pv_${p.id}`}
                  title="Tıkla: Orijinali aç"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
                  onClick={()=>setViewer(`http://127.0.0.1:5000/api/archive/original/${p.id}`)}
                />
              </div>
              <div style={{ fontWeight: 600 }}>{p.design_name || `Pattern #${p.id}`}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(p.created_at).toLocaleString()}</div>
              <div className="row">
                <button className="btn" type="button" onClick={()=>{ setZoom(1); setViewer(`http://127.0.0.1:5000/api/archive/original/${p.id}`); }}>Orijinali Aç</button>
                <button className="btn btn-ghost" type="button" onClick={()=>{ setZoom(1); setViewer(`http://127.0.0.1:5000/api/preview/${p.id}`); }}>Önizlemeyi Aç</button>
                <button className="btn btn-danger" onClick={()=>delPreview(p.id)} type="button">Sil</button>
              </div>
            </div>
          ))}
          {previews.length===0 && <div style={{ color: 'var(--muted)' }}>Önizleme yok.</div>}
        </div>
      )}

      {tab==='exports' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {exportsList.map(x => (
            <div key={x.id} className="card" style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Export #{x.id}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(x.created_at).toLocaleString()}</div>
              <div style={{ fontSize: 12 }}>Durum: {x.status} • Format: {x.format}</div>
              <div className="row">
                {x.file_path ? (
                  <a className="btn btn-ghost" href={`http://127.0.0.1:5000/api/export-file/${x.id}`}>İndir (BMP)</a>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Dosya yok</span>
                )}
                {x.has_meta ? (
                  <a className="btn btn-ghost" href={`http://127.0.0.1:5000/api/export-meta/${x.id}`}>Meta (JSON)</a>
                ) : null}
                <button className="btn btn-danger" onClick={()=>delExport(x.id)} type="button">Sil</button>
              </div>
            </div>
          ))}
          {exportsList.length===0 && <div style={{ color: 'var(--muted)' }}>Export yok.</div>}
        </div>
      )}
      {viewer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'grid', gridTemplateRows:'auto 1fr', zIndex: 1000 }}>
          <div style={{ padding: 8, display:'flex', gap:8, alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn" onClick={()=>setZoom(z=>Math.min(8, +(z+0.25).toFixed(2)))} type="button">Yakınlaştır +</button>
              <button className="btn" onClick={()=>setZoom(z=>Math.max(0.25, +(z-0.25).toFixed(2)))} type="button">Uzaklaştır −</button>
              <button className="btn btn-ghost" onClick={()=>setZoom(1)} type="button">Sıfırla</button>
              <a className="btn btn-ghost" href={viewer} target="_blank" rel="noreferrer">Yeni Sekmede Aç</a>
            </div>
            <button className="btn btn-ghost" onClick={()=>setViewer(null)} type="button">Kapat</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', overflow:'auto' }}>
            <img
              src={viewer}
              alt="preview"
              onLoad={(e)=>{
                const el = e.currentTarget as HTMLImageElement;
                const vw = Math.floor(window.innerWidth*0.95);
                const vh = Math.floor(window.innerHeight*0.85);
                const fit = Math.min(vw/el.naturalWidth, vh/el.naturalHeight);
                setImgSize({w: el.naturalWidth, h: el.naturalHeight});
                setZoom(Math.max(1, +fit.toFixed(2))); // küçük img ise otomatik büyüt
              }}
              style={{
                transform:`scale(${zoom})`,
                transformOrigin:'center',
                maxWidth:'95vw',
                maxHeight:'85vh',
                objectFit:'contain',
                imageRendering: 'pixelated',
                boxShadow:'0 10px 30px rgba(0,0,0,0.5)',
                borderRadius:8
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
