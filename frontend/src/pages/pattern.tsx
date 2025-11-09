import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Design { id: number; name: string }

export default function Pattern() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [designId, setDesignId] = useState<number|''>('');
  const [reportW, setReportW] = useState<number>(256);
  const [reportH, setReportH] = useState<number>(256);
  const [presetEpiPpi, setPresetEpiPpi] = useState<number>(120);
  const [sizePreset, setSizePreset] = useState<string>('300x200');
  const [widthCm, setWidthCm] = useState<number>(300);
  const [heightCm, setHeightCm] = useState<number>(200);
  const [maxArea, setMaxArea] = useState<number>(100000); // cm^2 (10 m^2)
  const [pvId, setPvId] = useState<number|undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [exportJobId, setExportJobId] = useState<number|undefined>(undefined);
  const [exportUrl, setExportUrl] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [maxColors, setMaxColors] = useState<number>(16);

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:5000/api/designs', { headers: auth });
        setDesigns(res.data);
      } catch (e: any) {
        setMsg(e?.response?.data?.error || 'Design listesi alınamadı');
      }
    };
    load();
    // apply suggested max colors from AI preset
    try {
      const s = localStorage.getItem('suggested_max_colors');
      if (s) {
        const n = parseInt(s);
        if (n===8 || n===12 || n===16) setMaxColors(n);
      }
    } catch {}
  }, []);

  // Derived: enforce max area and compute pixels
  const cmArea = widthCm * heightCm;
  const scale = cmArea > maxArea ? Math.sqrt(maxArea / cmArea) : 1;
  const effWcm = +(widthCm * scale).toFixed(1);
  const effHcm = +(heightCm * scale).toFixed(1);
  const widthPx = Math.round((effWcm / 2.54) * presetEpiPpi);
  const heightPx = Math.round((effHcm / 2.54) * presetEpiPpi);

  const applyPresetSize = (val: string) => {
    setSizePreset(val);
    const [w, h] = val.split('x').map(x => parseInt(x, 10));
    if (!isNaN(w) && !isNaN(h)) { setWidthCm(w); setHeightCm(h); }
  };

  const roundReportTo = (base: number) => {
    if (widthPx && heightPx) {
      const rw = Math.max(base, Math.round(widthPx / base) * base);
      const rh = Math.max(base, Math.round(heightPx / base) * base);
      setReportW(rw); setReportH(rh);
    }
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setPvId(undefined); setPreviewUrl(''); setExportJobId(undefined); setExportUrl('');
    if (designId === '') { setMsg('Design seçiniz'); return; }
    try {
      const res = await axios.post('http://127.0.0.1:5000/api/generate-pattern', {
        design_id: designId,
        report_w: reportW,
        report_h: reportH,
        max_colors: maxColors,
      }, { headers: auth });
      const id = res.data.pattern_version_id as number;
      setPvId(id);
      setPreviewUrl(`http://127.0.0.1:5000/api/preview/${id}`);
      setMsg('Önizleme hazır');
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Pattern üretilemedi');
    }
  };

  const doExport = async () => {
    if (!pvId) { setMsg('Önce pattern üretiniz'); return; }
    try {
      const res = await axios.post('http://127.0.0.1:5000/api/export', {
        pattern_version_id: pvId,
        format: 'bmp8'
      }, { headers: auth });
      const jid = res.data.export_job_id as number;
      setExportJobId(jid);
      setExportUrl(`http://127.0.0.1:5000/api/export-file/${jid}`);
      setMsg('Export tamamlandı');
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Export başarısız');
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 12 }}>Pattern → Export</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8, maxWidth: 700, padding: 12, border: '1px solid #e5e5e5', borderRadius: 8 }}>
            <strong>Ölçü ve EPI/PPI presetleri</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label>
                EPI/PPI:
                <select value={presetEpiPpi} onChange={e=>setPresetEpiPpi(parseInt(e.target.value||'120'))} style={{ marginLeft: 6 }}>
                  <option value={80}>80×80</option>
                  <option value={120}>120×120</option>
                  <option value={150}>150×150</option>
                </select>
              </label>
              <label>
                Ebat:
                <select value={sizePreset} onChange={e=>applyPresetSize(e.target.value)} style={{ marginLeft: 6 }}>
                  <option value="300x200">300×200 cm</option>
                  <option value="150x300">150×300 cm</option>
                  <option value="custom">Özel</option>
                </select>
              </label>
              {sizePreset === 'custom' && (
                <>
                  <input type="number" value={widthCm} onChange={e=>setWidthCm(parseFloat(e.target.value||'0'))} placeholder="Genişlik (cm)" />
                  <input type="number" value={heightCm} onChange={e=>setHeightCm(parseFloat(e.target.value||'0'))} placeholder="Yükseklik (cm)" />
                </>
              )}
              <label>
                Maks Alan (cm²):
                <input type="number" value={maxArea} onChange={e=>setMaxArea(parseInt(e.target.value||'100000'))} style={{ marginLeft: 6, width: 140 }} />
              </label>
            </div>
            <div style={{ fontSize: 14, color: '#444' }}>
              Efektif ölçü: {effWcm}×{effHcm} cm | Piksel: {widthPx}×{heightPx} px (EPI/PPI={presetEpiPpi})
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Report ayarla:</span>
                <button type="button" onClick={()=>roundReportTo(128)}>≈ 128 çoklu</button>
                <button type="button" onClick={()=>roundReportTo(256)}>≈ 256 çoklu</button>
                <button type="button" onClick={()=>roundReportTo(512)}>≈ 512 çoklu</button>
                <span>Seçili: {reportW}×{reportH}</span>
              </div>
            </div>
          </div>
          <form onSubmit={generate} style={{ display: 'grid', gap: 8, maxWidth: 700 }}>
            <select value={designId} onChange={e=>setDesignId(e.target.value ? parseInt(e.target.value) : '')}>
              <option value="">Design seçiniz</option>
              {designs.map(d => <option key={d.id} value={d.id}>{d.name} (#{d.id})</option>)}
            </select>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <span>Maks. Renk:</span>
              <label><input type="radio" name="mc" checked={maxColors===8} onChange={()=>setMaxColors(8)} /> 8</label>
              <label><input type="radio" name="mc" checked={maxColors===12} onChange={()=>setMaxColors(12)} /> 12</label>
              <label><input type="radio" name="mc" checked={maxColors===16} onChange={()=>setMaxColors(16)} /> 16</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" placeholder="Report W" value={reportW} onChange={e=>setReportW(parseInt(e.target.value||'0'))} />
              <input type="number" placeholder="Report H" value={reportH} onChange={e=>setReportH(parseInt(e.target.value||'0'))} />
            </div>
            <button type="submit">Pattern Üret</button>
          </form>
          {msg && <p>{msg}</p>}
        </div>

        <div style={{ position: 'sticky', top: 16, alignSelf: 'start', border: '1px solid #e5e5e5', borderRadius: 8, padding: 12, background: '#fff' }}>
          <h3 style={{ marginTop: 0 }}>Önizleme</h3>
          {pvId ? (
            <>
              <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button onClick={doExport}>BMP (8-bit) Export</button>
                {exportUrl && (
                  <a href={exportUrl}>İndir (BMP)</a>
                )}
              </div>
            </>
          ) : (
            <div style={{ width: '100%', aspectRatio: '4/3', border: '1px dashed #ddd', borderRadius: 6, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Üretildikten sonra önizleme burada görünecek
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
