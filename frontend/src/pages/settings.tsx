import React, { useEffect, useState } from 'react';
import axios from 'axios';

type DirItem = { name: string; path: string; type: 'dir' };

export default function SettingsPage() {
  const [outputRoot, setOutputRoot] = useState('');
  const [sdUrl, setSdUrl] = useState('');
  // Generation defaults
  const [genSteps, setGenSteps] = useState<number | ''>('');
  const [genCfg, setGenCfg] = useState<number | ''>('');
  const [genSampler, setGenSampler] = useState('');
  const [genWidth, setGenWidth] = useState<number | ''>('');
  const [genHeight, setGenHeight] = useState<number | ''>('');
  const [previewTarget, setPreviewTarget] = useState<number | ''>('');
  const [patDither, setPatDither] = useState(false);
  const [patMaxColors, setPatMaxColors] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [loraName, setLoraName] = useState('');
  const [loraStrength, setLoraStrength] = useState('');
  const [openaiHasKey, setOpenaiHasKey] = useState<boolean|null>(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [openaiPreview, setOpenaiPreview] = useState<string>('');

  // Browser modal
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<DirItem[]>([]);
  const [bmsg, setBmsg] = useState('');

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;
  // Presets
  const [allPrompts, setAllPrompts] = useState<any[]>([]);
  const [featuredIds, setFeaturedIds] = useState<number[]>([]);
  const [pinDirty, setPinDirty] = useState(false);
  const [pinFilter, setPinFilter] = useState('');
  const filteredPrompts = allPrompts.filter((p:any)=>{
    const q = (pinFilter||'').toLowerCase();
    if (!q) return true;
    const hay = `${p.name||''} ${p.tags||''}`.toLowerCase();
    return hay.includes(q);
  });
  const [editPr, setEditPr] = useState<any|null>(null);
  const [savingPr, setSavingPr] = useState(false);

  const load = async () => {
    setMsg('');
    try {
      const [prot, stg, mdl, gen, prm, pins] = await Promise.all([
        axios.get('http://127.0.0.1:5000/api/protected', { headers: auth }),
        axios.get('http://127.0.0.1:5000/api/settings/storage', { headers: auth }),
        axios.get('http://127.0.0.1:5000/api/settings/model', { headers: auth }).catch(()=>({ data:{} })),
        axios.get('http://127.0.0.1:5000/api/settings/generation', { headers: auth }).catch(()=>({ data:{} })),
        axios.get('http://127.0.0.1:5000/api/prompts', { headers: auth }).catch(()=>({ data:[] })),
        axios.get('http://127.0.0.1:5000/api/settings/presets', { headers: auth }).catch(()=>({ data:{ featured_prompt_ids: [] } })),
      ]);
      setRole(prot.data?.role || null);
      setOutputRoot(stg.data?.output_root || '');
      setSdUrl(mdl.data?.sd_url || '');
      if (gen.data) {
        setGenSteps(gen.data.gen_steps ?? '');
        setGenCfg(gen.data.gen_cfg ?? '');
        setGenSampler(gen.data.gen_sampler ?? '');
        setGenWidth(gen.data.gen_width ?? '');
        setGenHeight(gen.data.gen_height ?? '');
        setPreviewTarget(gen.data.preview_target ?? '');
        setPatDither(!!gen.data.pattern_default_dither);
        setPatMaxColors(gen.data.pattern_default_max_colors ?? '');
      }
      setAllPrompts(prm.data || []);
      setFeaturedIds((pins.data?.featured_prompt_ids || []).map((x:any)=>Number(x)));
      try {
        setLoraName(localStorage.getItem('lora_name') || '');
        setLoraStrength(localStorage.getItem('lora_strength') || '');
      } catch {}
      // Load OpenAI key status
      try {
        const okr = await axios.get('http://127.0.0.1:5000/api/settings/openai', { headers: auth });
        setOpenaiHasKey(!!okr.data?.has_key);
        setOpenaiPreview(okr.data?.key_preview || '');
      } catch { setOpenaiHasKey(null); setOpenaiPreview(''); }
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Ayarlar okunamadı');
    }
  };

  const saveGeneration = async () => {
    setLoading(true); setMsg('');
    try {
      const payload: any = {
        gen_steps: genSteps === '' ? undefined : Number(genSteps),
        gen_cfg: genCfg === '' ? undefined : Number(genCfg),
        gen_sampler: genSampler || undefined,
        gen_width: genWidth === '' ? undefined : Number(genWidth),
        gen_height: genHeight === '' ? undefined : Number(genHeight),
        preview_target: previewTarget === '' ? undefined : Number(previewTarget),
        pattern_default_dither: patDither,
        pattern_default_max_colors: patMaxColors === '' ? undefined : Number(patMaxColors),
      };
      const res = await axios.put('http://127.0.0.1:5000/api/settings/generation', payload, { headers: auth });
      setMsg('Model üretim parametreleri kaydedildi');
      const d = res.data || {};
      setGenSteps(d.gen_steps ?? genSteps);
      setGenCfg(d.gen_cfg ?? genCfg);
      setGenSampler(d.gen_sampler ?? genSampler);
      setGenWidth(d.gen_width ?? genWidth);
      setGenHeight(d.gen_height ?? genHeight);
      setPreviewTarget(d.preview_target ?? previewTarget);
      setPatDither(!!d.pattern_default_dither);
      setPatMaxColors(d.pattern_default_max_colors ?? patMaxColors);
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Model üretim parametreleri kaydedilemedi');
    } finally { setLoading(false); }
  };

  // Pinli Presetler yönetimi
  const savePins = async () => {
    setLoading(true); setMsg('');
    try {
      const res = await axios.put('http://127.0.0.1:5000/api/settings/presets', { featured_prompt_ids: featuredIds }, { headers: auth });
      setFeaturedIds((res.data?.featured_prompt_ids||[]).map((x:any)=>Number(x)));
      setMsg('Pinli presetler kaydedildi');
      setPinDirty(false);
      try { localStorage.setItem('pins_version', String(Date.now())); } catch {}
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Pinler kaydedilemedi');
    } finally { setLoading(false); }
  };

  const addBaroquePresetAndPin = async () => {
    setLoading(true); setMsg('');
    try {
      const body:any = {
        name: 'Barok Kabartmalı Halı (Referans)',
        prompt: 'baroque/rococo bas-relief carpet pattern, symmetric central medallion, wide border and corner panels, ornate arabesque spirals, bej cream ivory light blue pastel orange accents, illustrative clean lines, neutral lighting, high complexity',
        negative: 'human, text, watermark, room, furniture, blur, noise, jpeg artifacts, deformed',
        width: 1024,
        height: 1024,
        steps: 35,
        cfg: 6.5,
        sampler: 'DPM++ 2M Karras',
        tags: 'baroque,referans,max16'
      };
      const resp = await axios.post('http://127.0.0.1:5000/api/prompts', body, { headers: auth });
      const newId = Number(resp.data?.id);
      const prm = await axios.get('http://127.0.0.1:5000/api/prompts', { headers: auth });
      setAllPrompts(prm.data||[]);
      const next = Array.from(new Set([...(featuredIds||[]), newId]));
      const pins = await axios.put('http://127.0.0.1:5000/api/settings/presets', { featured_prompt_ids: next }, { headers: auth });
      setFeaturedIds((pins.data?.featured_prompt_ids||next).map((x:any)=>Number(x)));
      setMsg('Barok preset eklendi ve pinlendi');
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Barok preset eklenemedi');
    } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const saveStorage = async () => {
    if (!outputRoot) { setMsg('Lütfen bir klasör yolu girin'); return; }
    setLoading(true); setMsg('');
    try {
      const res = await axios.put('http://127.0.0.1:5000/api/settings/storage', { output_root: outputRoot }, { headers: auth });
      setMsg('Depolama kaydedildi');
      setOutputRoot(res.data?.output_root || outputRoot);
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Depolama kaydedilemedi');
    } finally { setLoading(false); }
  };

  const saveModel = async () => {
    if (!sdUrl) { setMsg('Lütfen SD URL girin'); return; }
    setLoading(true); setMsg('');
    try {
      const res = await axios.put('http://127.0.0.1:5000/api/settings/model', { sd_url: sdUrl }, { headers: auth });
      setMsg('Model ayarı kaydedildi');
      setSdUrl(res.data?.sd_url || sdUrl);
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Model ayarı kaydedilemedi');
    } finally { setLoading(false); }
  };

  const refreshOpenAIStatus = async () => {
    try {
      const okr = await axios.get('http://127.0.0.1:5000/api/settings/openai', { headers: auth });
      setOpenaiHasKey(!!okr.data?.has_key);
      setOpenaiPreview(okr.data?.key_preview || '');
    } catch { setOpenaiHasKey(null); setOpenaiPreview(''); }
  };

  const saveOpenAIKey = async () => {
    if (!openaiKeyInput.trim()) { setMsg('Lütfen bir API anahtarı girin'); return; }
    setLoading(true); setMsg('');
    try {
      const resp = await axios.put('http://127.0.0.1:5000/api/settings/openai', { key: openaiKeyInput.trim() }, { headers: auth });
      setMsg('OpenAI anahtarı kaydedildi');
      setOpenaiHasKey(true);
      setOpenaiPreview(resp.data?.key_preview || '');
      setOpenaiKeyInput('');
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'OpenAI anahtarı kaydedilemedi');
    } finally { setLoading(false); }
  };

  const saveLora = () => {
    try {
      localStorage.setItem('lora_name', loraName.trim());
      localStorage.setItem('lora_strength', loraStrength.trim());
      setMsg('LoRA ayarları kaydedildi');
    } catch {
      setMsg('LoRA ayarları kaydedilemedi');
    }
  };

  const loadDrives = async () => {
    setBmsg(''); setEntries([]); setBrowsePath('');
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/fs/drives', { headers: auth });
      const items: string[] = res.data?.drives || [];
      setEntries(items.map(d=>({ name: d, path: d, type: 'dir' })));
    } catch (e:any) { setBmsg(e?.response?.data?.error || 'Sürücüler okunamadı'); }
  };
  const openBrowser = async () => {
    setBrowseOpen(true); await loadDrives();
  };
  const listPath = async (p: string) => {
    setBmsg('');
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/fs/list', { params: { path: p }, headers: auth });
      setBrowsePath(res.data?.path || p);
      setEntries((res.data?.items || []) as DirItem[]);
    } catch (e:any) { setBmsg(e?.response?.data?.error || 'Klasör okunamadı'); }
  };
  const upOne = () => {
    if (!browsePath) return;
    const up = browsePath.replace(/[\\/]+$/,'');
    const idx = Math.max(up.lastIndexOf('\\'), up.lastIndexOf('/'));
    if (idx>1) listPath(up.slice(0, idx+1)); else loadDrives();
  };
  const choose = () => { setOutputRoot(browsePath || outputRoot); setBrowseOpen(false); };

  if (role && role !== 'admin') {
    return (
      <div className="container" style={{ paddingTop: 16 }}>
        <h2>Ayarlar</h2>
        <div className="card" style={{ color:'crimson' }}>Bu sayfaya sadece yönetici erişebilir.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Ayarlar</h2>

      <div className="card" style={{ display:'grid', gap: 8, maxWidth: 900 }}>
        <strong>Depolama</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Tüm dosyalar (generated, images, matrices, previews, exports) bu kökün altında tutulur. Taşınabilirlik için sunucuya uygun bir disk/klasör seçin.
        </div>
        <div className="row" style={{ gap:8, alignItems:'center' }}>
          <input value={outputRoot} onChange={e=>setOutputRoot(e.target.value)} placeholder="D:\\DunyaOutput" style={{ flex:1 }} />
          <button className="btn btn-ghost" onClick={openBrowser} type="button">Gözat…</button>
        </div>
        <div className="row">
          <button className="btn" disabled={loading} onClick={saveStorage} type="button">{loading? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="btn btn-ghost" disabled={loading} onClick={load} type="button">Yenile</button>
        </div>
      </div>

      <div className="card" style={{ display:'grid', gap:8, maxWidth: 900, marginTop: 12 }}>
        <strong>Model (Stable Diffusion)</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          SD WebUI adresi. Başka sunucuya taşındığında buradan güncelleyebilirsiniz. Örn: http://127.0.0.1:7860
        </div>
        <div className="row" style={{ gap:8, alignItems:'center' }}>
          <input value={sdUrl} onChange={e=>setSdUrl(e.target.value)} placeholder="http://127.0.0.1:7860" style={{ flex:1 }} />
          <button className="btn" disabled={loading} onClick={saveModel} type="button">{loading? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="btn btn-ghost" disabled={loading} onClick={load} type="button">Yenile</button>
        </div>
      </div>

      <div className="card" style={{ display:'grid', gap:8, maxWidth: 900, marginTop: 12 }}>
        <strong>OpenAI Entegrasyonu</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          V2 görsel üretimi için OpenAI API anahtarını burada yönetin. Güvenlik gereği mevcut anahtar değeri gösterilmez; yalnızca var/yok bilgisi görünür.
        </div>
        <div className="row" style={{ gap:8, alignItems:'center' }}>
          <input value={openaiKeyInput} onChange={e=>setOpenaiKeyInput(e.target.value)} placeholder="OpenAI API Key (ör. sk-...)" style={{ flex:1 }} />
          <button className="btn" disabled={loading} onClick={saveOpenAIKey} type="button">{loading? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="btn btn-ghost" disabled={loading} onClick={refreshOpenAIStatus} type="button">Yenile</button>
        </div>
        <div style={{ fontSize:12, color: openaiHasKey? 'green':'#7f1d1d' }}>
          {openaiHasKey===null ? 'Durum alınamadı' : openaiHasKey ? 'Anahtar kayıtlı' : 'Anahtar kayıtlı değil'}
        </div>
        {openaiHasKey && openaiPreview && (
          <div style={{ fontSize:12, color:'#1e3a8a' }}>Anahtar: {openaiPreview}</div>
        )}
      </div>

      <div className="card" style={{ display:'grid', gap:8, maxWidth: 900, marginTop: 12 }}>
        <strong>LoRA Entegrasyonu</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Prompt'a otomatik LoRA etiketi eklemek için isim ve güç değerini girin. Örn: MyCarpet ve 1.0
        </div>
        <div className="row" style={{ gap:8, alignItems:'center' }}>
          <input value={loraName} onChange={e=>setLoraName(e.target.value)} placeholder="LoRA adı (örn: MyCarpet)" style={{ flex:1 }} />
          <input value={loraStrength} onChange={e=>setLoraStrength(e.target.value)} placeholder="Güç (örn: 1.0)" style={{ width:140 }} />
        </div>
        <div className="row">
          <button className="btn" disabled={loading} onClick={saveLora} type="button">Kaydet</button>
          <button className="btn btn-ghost" disabled={loading} onClick={load} type="button">Yenile</button>
        </div>
      </div>

      <div className="card" style={{ display:'grid', gap:8, maxWidth: 900, marginTop: 12 }}>
        <strong>Model Üretim Parametreleri</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Buradaki değerler AI üretiminde varsayılan olarak kullanılır. Kullanıcı neyi değiştirdiğini kolayca anlasın diye her alanın altında kısa açıklama bulunur.
        </div>
        <div className="grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:8 }}>
          <label style={{ display:'grid', gap:4 }}>
            <span>Varsayılan Steps</span>
            <input type="number" value={genSteps} onChange={e=>setGenSteps(e.target.value===''? '' : Number(e.target.value))} min={1} max={100} />
            <small style={{ color:'var(--muted)' }}>Kaç adımda örnekleme yapılacağını belirler. Daha yüksek değer daha detaylı ama daha yavaştır.</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Varsayılan CFG</span>
            <input type="number" step="0.1" value={genCfg} onChange={e=>setGenCfg(e.target.value===''? '' : Number(e.target.value))} min={1} max={15} />
            <small style={{ color:'var(--muted)' }}>Prompta bağlı kalma derecesi. Yüksek CFG prompta daha çok bağlılık sağlar.</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Varsayılan Sampler</span>
            <input value={genSampler} onChange={e=>setGenSampler(e.target.value)} placeholder="DPM++ 2M Karras" />
            <small style={{ color:'var(--muted)' }}>Kullanılacak örnekleyici algoritma adı.</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Varsayılan Genişlik</span>
            <input type="number" value={genWidth} onChange={e=>setGenWidth(e.target.value===''? '' : Number(e.target.value))} min={64} max={2048} />
            <small style={{ color:'var(--muted)' }}>Üretilecek görselin genişliği (px).</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Varsayılan Yükseklik</span>
            <input type="number" value={genHeight} onChange={e=>setGenHeight(e.target.value===''? '' : Number(e.target.value))} min={64} max={2048} />
            <small style={{ color:'var(--muted)' }}>Üretilecek görselin yüksekliği (px).</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Önizleme Hedef Boyutu</span>
            <input type="number" value={previewTarget} onChange={e=>setPreviewTarget(e.target.value===''? '' : Number(e.target.value))} min={400} max={4000} />
            <small style={{ color:'var(--muted)' }}>Arşiv önizlemeleri bu hedefe yakın piksel boyutuna büyütülür.</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Pattern Varsayılan Dither</span>
            <select value={patDither? '1':'0'} onChange={e=>setPatDither(e.target.value==='1')}>
              <option value="0">Kapalı</option>
              <option value="1">Açık</option>
            </select>
            <small style={{ color:'var(--muted)' }}>Renk azaltmada dithering kullanılsın mı.</small>
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span>Pattern Varsayılan Max Colors</span>
            <select value={patMaxColors} onChange={e=>setPatMaxColors(e.target.value===''? '' : Number(e.target.value))}>
              <option value="">Seç</option>
              <option value="8">8</option>
              <option value="12">12</option>
              <option value="16">16</option>
              <option value="32">32</option>
              <option value="64">64</option>
              <option value="128">128</option>
              <option value="256">256</option>
            </select>
            <small style={{ color:'var(--muted)' }}>Desen renklendirmede üst sınır. (Genelde 8/12/16)</small>
          </label>
        </div>
        <div className="row">
          <button className="btn" disabled={loading} onClick={saveGeneration} type="button">{loading? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button className="btn btn-ghost" disabled={loading} onClick={load} type="button">Yenile</button>
        </div>
      </div>

      {msg && (<div className="card" style={{ marginTop:12, color: msg.includes('kaydedildi')? 'green':'#7f1d1d', background:'#fff', borderColor:'#eee' }}>{msg}</div>)}

      {browseOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width: 720, maxWidth:'95vw', display:'grid', gap:8 }}>
            <strong>Klasör Seç</strong>
            <div className="row" style={{ gap:8 }}>
              <button className="btn btn-ghost" onClick={loadDrives} type="button">Sürücüler</button>
              <button className="btn btn-ghost" onClick={upOne} type="button">Yukarı</button>
              <input value={browsePath} onChange={e=>setBrowsePath(e.target.value)} style={{ flex:1 }} />
              <button className="btn" onClick={()=>listPath(browsePath)} type="button">Git</button>
            </div>
            <div style={{ maxHeight:'50vh', overflow:'auto', border:'1px solid #eee', borderRadius:8, padding:8, display:'grid', gap:6 }}>
              {entries.map((it, i)=> (
                <div key={i} className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ width:16, height:16, background:'#eef', border:'1px solid #ccd', borderRadius:3 }} />
                    <button className="btn btn-ghost" onClick={()=>listPath(it.path)} type="button" title={it.path}>{it.name}</button>
                  </div>
                  <button className="btn" onClick={()=>{ setBrowsePath(it.path.endsWith('\\')? it.path : it.path + '\\'); }} type="button">Seç</button>
                </div>
              ))}
              {entries.length===0 && <div style={{ color:'var(--muted)' }}>Liste boş.</div>}
            </div>
            {bmsg && (<div style={{ color:'crimson' }}>{bmsg}</div>)}
            <div className="row" style={{ justifyContent:'flex-end' }}>
              <button className="btn" onClick={choose} type="button">Tamam</button>
              <button className="btn btn-ghost" onClick={()=>setBrowseOpen(false)} type="button">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
