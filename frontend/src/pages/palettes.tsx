import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Color { id?: number; r: number; g: number; b: number; label?: string; yarn_code?: string; yarn_name?: string }
interface Palette { id: number; name: string; max_colors: number; colors: Color[] }

export default function Palettes() {
  const [items, setItems] = useState<Palette[]>([]);
  const [name, setName] = useState('Projepalet');
  const [maxColors, setMaxColors] = useState<number>(16);
  const [colors, setColors] = useState<Color[]>([{ r: 0, g: 0, b: 0, label: 'Black' }, { r: 255, g: 255, b: 255, label: 'White' }]);
  const [msg, setMsg] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoverHex, setHoverHex] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editRGB, setEditRGB] = useState<{r:number;g:number;b:number}>({r:0,g:0,b:0});
  const [baseRGB, setBaseRGB] = useState<{r:number;g:number;b:number}>({r:0,g:0,b:0});
  const [editHSV, setEditHSV] = useState<{h:number;s:number;v:number}>({h:0,s:0,v:0});
  const [editingId, setEditingId] = useState<number | null>(null);

  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  const rgbToHex = (c: Color) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`.toUpperCase();
  const hexFromRGB = (r:number,g:number,b:number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
  const rgbToHsv = (r:number,g:number,b:number)=>{
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const d=max-min; let h=0; const s=max===0?0:d/max; const v=max;
    if(d!==0){
      switch(max){
        case r: h=((g-b)/d)%6; break;
        case g: h=(b-r)/d+2; break;
        default: h=(r-g)/d+4; break;
      }
      h*=60; if(h<0) h+=360;
    }
    return {h,s,v};
  };

  const segGroupStyle: React.CSSProperties = {
    display: 'inline-flex',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#f1f5f9',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'
  };
  const segBtnStyle = (active:boolean): React.CSSProperties => ({
    borderRadius: 10,
    border: active ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(0,0,0,0.08)',
    background: active ? 'linear-gradient(to bottom, #60a5fa, #3b82f6)' : 'linear-gradient(to bottom, #ffffff, #f8fafc)',
    color: active ? '#ffffff' : '#0f172a',
    boxShadow: active ? 'inset 0 2px 6px rgba(0,0,0,0.15), 0 2px 0 rgba(0,0,0,0.08)' : '0 2px 0 rgba(0,0,0,0.06)',
    padding: '8px 14px',
    minWidth: 48,
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1,
    transform: active ? 'translateY(1px)' : 'translateY(0)',
    transition: 'all 120ms ease',
    cursor: 'pointer',
    userSelect: 'none'
  });
  const hsvToRgb = (h:number,s:number,v:number)=>{
    const c=v*s; const x=c*(1-Math.abs(((h/60)%2)-1)); const m=v-c;
    let r=0,g=0,b=0;
    if(h<60){r=c;g=x;b=0;} else if(h<120){r=x;g=c;b=0;} else if(h<180){r=0;g=c;b=x;} else if(h<240){r=0;g=x;b=c;} else if(h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
    return {r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255)};
  };
  const parseHex = (hex:string)=>{
    const h=hex.trim().replace(/^#/,'');
    if(h.length===3){
      return {r:parseInt(h[0]+h[0],16), g:parseInt(h[1]+h[1],16), b:parseInt(h[2]+h[2],16)};
    }
    if(h.length===6){
      return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)};
    }
    return null;
  };

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  const ensureLength = (n:number, base?: Color[]) => {
    let next = (base ? base.slice() : colors.slice());
    if (next.length < n) {
      const add = n - next.length;
      for (let i = 0; i < add; i++) next.push({ r: 128, g: 128, b: 128, label: '' });
    } else if (next.length > n) {
      next = next.slice(0, n);
    }
    setColors(next);
    return next;
  };

  const load = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/palettes', { headers: auth });
      setItems(res.data);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Palette listesi çekilemedi');
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    ensureLength(maxColors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxColors]);

  const onHexSlotChange = (i:number, hex:string) => {
    const p = parseHex(hex);
    if (!p) return;
    const next = colors.slice();
    next[i] = { ...next[i], ...p };
    setColors(next);
  };
  

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    try {
      if (colors.length !== maxColors) {
        setMsg(`Lütfen tam ${maxColors} renk tanımlayın.`);
        return;
      }
      if (editingId==null) {
        await axios.post('http://127.0.0.1:5000/api/palettes', { name, max_colors: maxColors, colors }, { headers: auth });
        setMsg('Kaydedildi');
      } else {
        await axios.put(`http://127.0.0.1:5000/api/palettes/${editingId}`, { name, max_colors: maxColors, colors }, { headers: auth });
        setMsg('Güncellendi');
        setEditingId(null);
      }
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Kaydetme hatası');
    }
  };

  const delItem = async (id: number) => {
    try {
      await axios.delete(`http://127.0.0.1:5000/api/palettes/${id}`, { headers: auth });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Silme hatası');
    }
  };

  const startEdit = (p: Palette) => {
    setEditingId(p.id);
    setName(p.name);
    setMaxColors(p.max_colors);
    const base = p.colors?.map(c=>({r:c.r,g:c.g,b:c.b,label:c.label,yarn_code:(c as any).yarn_code,yarn_name:(c as any).yarn_name})) || [];
    ensureLength(p.max_colors, base);
    setSelectedIdx(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('Projepalet');
    setMaxColors(16);
    const def = [{ r: 0, g: 0, b: 0, label: 'Black' }, { r: 255, g: 255, b: 255, label: 'White' }];
    ensureLength(16, def as Color[]);
    setSelectedIdx(null);
  };

  const openPicker = (i:number) => {
    setSelectedIdx(i);
    const c = colors[i];
    setBaseRGB({r:c.r,g:c.g,b:c.b});
    setEditRGB({r:c.r,g:c.g,b:c.b});
    const hsv = rgbToHsv(c.r,c.g,c.b);
    setEditHSV(hsv);
    setPickerOpen(true);
  };
  const closePicker = () => setPickerOpen(false);
  const applyPicker = () => {
    if(selectedIdx==null) return;
    const next = colors.slice();
    next[selectedIdx] = { ...next[selectedIdx], ...editRGB };
    setColors(next);
    setPickerOpen(false);
  };
  const onHSVSquare = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    const s = clamp(x / rect.width, 0, 1);
    const v = clamp(1 - y / rect.height, 0, 1);
    const hsv = { h: editHSV.h, s, v };
    setEditHSV(hsv);
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setEditRGB(rgb);
  };
  const onHueBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    const h = clamp((1 - y / rect.height) * 360, 0, 360);
    const hsv = { ...editHSV, h };
    setEditHSV(hsv);
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    setEditRGB(rgb);
  };
  const onHexChange = (v:string) => {
    const p = parseHex(v);
    if(!p) return;
    setEditRGB(p);
    setEditHSV(rgbToHsv(p.r,p.g,p.b));
  };
  const onRGBChange = (field:'r'|'g'|'b', v:string) => {
    const n = clamp(parseInt(v||'0'),0,255);
    const next = { ...editRGB, [field]: n } as {r:number;g:number;b:number};
    setEditRGB(next);
    setEditHSV(rgbToHsv(next.r,next.g,next.b));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Palet</h2>
      <form onSubmit={save} style={{ display: 'grid', gap: 8, maxWidth: 800 }}>
        <input placeholder="Palet adı" value={name} onChange={e=>setName(e.target.value)} required />
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span>Maks. Renk:</span>
          <div className="row" role="group" aria-label="Maksimum renk sayısı" style={segGroupStyle}>
            <button type="button" style={segBtnStyle(maxColors===8)} onClick={()=>setMaxColors(8)} aria-pressed={maxColors===8}>8</button>
            <button type="button" style={segBtnStyle(maxColors===12)} onClick={()=>setMaxColors(12)} aria-pressed={maxColors===12}>12</button>
            <button type="button" style={segBtnStyle(maxColors===16)} onClick={()=>setMaxColors(16)} aria-pressed={maxColors===16}>16</button>
          </div>
        </div>
        <div style={{ position: 'relative', paddingTop: 28 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Renkler</strong>
            <div style={{ fontFamily: 'monospace', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', minWidth: 90, textAlign: 'center' }}>
              {hoverHex || (selectedIdx != null ? rgbToHex(colors[selectedIdx]) : '#------')}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'40px 140px 1fr 130px 160px', alignItems:'center', gap: 8 }}>
            {Array.from({length:maxColors}).map((_,i)=>{
              const c = colors[i] || {r:128,g:128,b:128,label:''};
              const hex = rgbToHex(c);
              return (
                <React.Fragment key={i}>
                  <div style={{ opacity: 0.6 }}>{i+1}</div>
                  <div
                    title={hex}
                    onMouseEnter={()=>setHoverHex(hex)}
                    onMouseLeave={()=>setHoverHex(null)}
                    onClick={()=>openPicker(i)}
                    style={{
                      width: 40,
                      height: 40,
                      background: `rgb(${c.r},${c.g},${c.b})`,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      outline: selectedIdx === i ? '3px solid #4f46e5' : 'none',
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
                    }}
                  />
                  <input value={hex} onChange={e=>onHexSlotChange(i, e.target.value)} placeholder="#RRGGBB" />
                  <input value={c.yarn_code||''} onChange={e=>{
                    const next=colors.slice();
                    next[i] = { ...next[i], yarn_code: e.target.value };
                    setColors(next);
                  }} placeholder="yarnCode" />
                  <input value={c.yarn_name||''} onChange={e=>{
                    const next=colors.slice();
                    next[i] = { ...next[i], yarn_name: e.target.value };
                    setColors(next);
                  }} placeholder="yarnName" />
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button type="submit">{editingId==null ? 'Paleti Kaydet' : 'Değişiklikleri Kaydet'}</button>
          {editingId!=null && (
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>İptal</button>
          )}
        </div>
      </form>
      {msg && <p>{msg}</p>}

      <table border={1} cellPadding={6} style={{ marginTop: 16 }}>
        <thead><tr><th>ID</th><th>Ad</th><th>Maks</th><th>Renkler</th><th>Aksiyon</th></tr></thead>
        <tbody>
          {items.map(p => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.name}</td>
              <td>{p.max_colors}</td>
              <td>{p.colors?.length}</td>
              <td>
                <div className="row">
                  <button className="btn btn-ghost" type="button" onClick={()=>startEdit(p)}>Düzenle</button>
                  <button className="btn btn-danger" type="button" onClick={()=>delItem(p.id)}>Sil</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 16, width: 540, display: 'grid', gridTemplateColumns: 'auto 140px', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div
                onMouseDown={(e)=>{onHSVSquare(e); const move=(ev:MouseEvent)=>onHSVSquare(ev as any); const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);}; document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);}}
                style={{ width: 300, height: 200, position: 'relative', cursor: 'crosshair', background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(${editHSV.h}deg,100%,50%))`, borderRadius: 8 }}
              >
                <div style={{ position: 'absolute', left: `${editHSV.s*100}%`, top: `${(1-editHSV.v)*100}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: 999, border: '2px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
              </div>
              <div
                onMouseDown={(e)=>{onHueBar(e); const move=(ev:MouseEvent)=>onHueBar(ev as any); const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);}; document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);}}
                style={{ width: 18, height: 200, background: 'linear-gradient(to top, red, #f0f, blue, cyan, lime, yellow, red)', borderRadius: 8, position: 'relative', cursor: 'ns-resize' }}
              >
                <div style={{ position: 'absolute', left: 0, right: 0, top: `${(1-editHSV.h/360)*100}%`, height: 2, background: 'white', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ height: 40, borderRadius: 6, border: '1px solid var(--border)', background: `rgb(${baseRGB.r},${baseRGB.g},${baseRGB.b})` }}></div>
                <div style={{ height: 40, borderRadius: 6, border: '1px solid var(--border)', background: `rgb(${editRGB.r},${editRGB.g},${editRGB.b})` }}></div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <input value={hexFromRGB(editRGB.r,editRGB.g,editRGB.b)} onChange={e=>onHexChange(e.target.value)} placeholder="#RRGGBB" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  <input type="number" min={0} max={255} value={editRGB.r} onChange={e=>onRGBChange('r', e.target.value)} placeholder="R" />
                  <input type="number" min={0} max={255} value={editRGB.g} onChange={e=>onRGBChange('g', e.target.value)} placeholder="G" />
                  <input type="number" min={0} max={255} value={editRGB.b} onChange={e=>onRGBChange('b', e.target.value)} placeholder="B" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={applyPicker}>OK</button>
                <button type="button" onClick={closePicker}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
