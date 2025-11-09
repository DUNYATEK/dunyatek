import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface GenItem { filename: string; path: string; url: string }
interface PromptItem { id:number; name:string; prompt:string; negative?:string; width?:number; height?:number; steps?:number; cfg?:number; sampler?:string; tags?:string }
interface PaletteItem { id:number; name:string; max_colors:number; colors:{id:number;r:number;g:number;b:number;label?:string}[] }
interface LoomItem { id:number; name:string; epi:number; ppi:number; width_cm?:number; height_cm?:number; report_w?:number; report_h?:number }

interface CustomPreset { id: string; name: string; prompt: string; negative?: string; width?: number; height?: number; steps?: number; cfg?: number; sampler?: string }

export default function AIPage() {
  const [prompt, setPrompt] = useState('medalyonlu halı deseni, top-down, flat, seamless repeating tile, symmetric, yüksek detay, ince düğümler, yün dokusu, mavi-gri-altın palet');
  const [negative, setNegative] = useState('interior, room, furniture, sofa, chair, table, bed, lamp, chandelier, window, wall, floor, ceiling, background, scene, perspective, camera, depth of field, photo, 3d render, people, text, watermark, logo, border glitch, shadow, glare, lowres, noisy, low contrast');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(32);
  const [cfg, setCfg] = useState(6.5 as any);
  const [results, setResults] = useState<GenItem[]>([]);
  const [msg, setMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingV1, setGeneratingV1] = useState(false);
  const [generatingV2, setGeneratingV2] = useState(false);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [looms, setLooms] = useState<LoomItem[]>([]);
  const [palettes, setPalettes] = useState<PaletteItem[]>([]);
  const [editPrompt, setEditPrompt] = useState<Partial<PromptItem>|null>(null);
  const [saving, setSaving] = useState(false);
  const [modalMsg, setModalMsg] = useState('');
  const [colorMap, setColorMap] = useState<Record<string, {hex:string; percent:number; r:number; g:number; b:number}[]>>({});
  const [paletteId, setPaletteId] = useState<number|undefined>(undefined);
  const [epi, setEpi] = useState<number|undefined>(undefined); // ends per inch (atkı yoğunluğu)
  const [ppi, setPpi] = useState<number|undefined>(undefined); // picks per inch (çözgü yoğunluğu)
  const [reportW, setReportW] = useState<number|undefined>(undefined);
  const [reportH, setReportH] = useState<number|undefined>(undefined);
  const [loomId, setLoomId] = useState<number|undefined>(undefined);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [cpOpen, setCpOpen] = useState(false);
  const [cpForm, setCpForm] = useState<CustomPreset>({ id: '', name: '', prompt: '', negative: '', width: 1024, height: 1024, steps: 30, cfg: 6 });
  const [tiling, setTiling] = useState(true);
  const [referencePath, setReferencePath] = useState<string|undefined>(undefined);
  const [denoise, setDenoise] = useState<number>(0.55);
  
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptFilter, setPromptFilter] = useState('');
  

  const token = localStorage.getItem('token');
  const auth = token ? { Authorization: `Bearer ${token}` } : undefined;

  const loadPrompts = async () => {
    try {
      const pres = await axios.get('http://127.0.0.1:5000/api/prompts', { headers: auth });
      setPrompts(pres.data);
      // Apply from settings if requested
      try {
        const ap = localStorage.getItem('apply_prompt_id');
        if (ap) {
          const pid = Number(ap);
          const p = (pres.data as any[]).find((pp:any)=>Number(pp.id)===pid);
          if (p) { usePrompt(p); setMsg(`Preset uygulandı: ${p.name}`); }
          localStorage.removeItem('apply_prompt_id');
        }
      } catch {}
    } catch (e:any) {
      if (e?.response?.status === 401) {
        setMsg('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
        window.location.href = '/login';
      }
    }
  };

  const generateV2 = async () => {
    if (!prompt || !prompt.trim()) { setMsg('Prompt gerekli'); return; }
    if (!loomId) { setMsg('Lütfen bir Tezgah (Loom) seçin'); return; }
    const maxColors = currentMaxColors;
    if (!epi || !ppi) { setMsg('Lütfen Ölçü ve EPI/PPI değerlerini girin'); return; }
    setMsg('V2 ile üretiliyor…'); setResults([]); setGenerating(true); setGeneratingV2(true);
    try {
      let finalPrompt = prompt;
      const body:any = {
        prompt: finalPrompt, negative, width, height, steps, cfg,
        loom_id: loomId, epi, ppi, report_w: reportW, report_h: reportH,
      };
      body.tiling = tiling;
      if (paletteId) {
        body.palette_id = paletteId;
        if (maxColors && [8,12,16].includes(maxColors)) body.max_colors = maxColors;
      }
      const reqCfg = { headers: auth, timeout: 600000 } as const;
      const res = await axios.post('http://127.0.0.1:5000/api/v2/ai/txt2img', body, reqCfg);
      setResults(res.data.results || []);
      if (!res.data.results?.length) setMsg('Görsel üretilemedi');
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'V2 üretim hatası');
    } finally {
      setGenerating(false);
      setGeneratingV2(false);
    }
  };

  const saveCustomPresets = (list: CustomPreset[]) => {
    setCustomPresets(list);
    try { localStorage.setItem('custom_presets', JSON.stringify(list)); } catch {}
  };
  const openCustomPresetModal = () => {
    setCpForm({ id: '', name: '', prompt, negative, width, height, steps, cfg });
    setCpOpen(true);
  };
  const applyPreset = (p: CustomPreset) => {
    if (p.prompt) setPrompt(p.prompt);
    if (p.negative !== undefined) setNegative(p.negative);
    if (p.width) setWidth(p.width);
    if (p.height) setHeight(p.height);
    if (p.steps) setSteps(p.steps);
    if (p.cfg) setCfg(p.cfg as number);
  };
  const saveAndUseCustomPreset = () => {
    if (!cpForm.name || !cpForm.prompt) { setMsg('Ad ve Prompt gerekli'); return; }
    const id = cpForm.id || (Date.now().toString());
    const next = [...customPresets.filter(x=>x.id!==id), { ...cpForm, id }];
    saveCustomPresets(next);
    setCpOpen(false);
    applyPreset({ ...cpForm, id });
  };
  const deleteCustomPreset = (id: string) => {
    const next = customPresets.filter(x=>x.id!==id);
    saveCustomPresets(next);
  };

  const loadPalettes = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/palettes', { headers: auth });
      setPalettes(res.data);
    } catch {}
  };

  const loadLooms = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/api/looms', { headers: auth });
      setLooms(res.data);
    } catch (e:any) {
      if (e?.response?.status === 401) {
        setMsg('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
        window.location.href = '/login';
      }
    }
  };

  const analyzeColors = async (item: GenItem) => {
    try {
      const url = `http://127.0.0.1:5000/api/generated/${encodeURIComponent(item.filename)}/colors?k=12`;
      const res = await axios.get(url);
      setColorMap(prev=>({ ...prev, [item.filename]: res.data.colors || [] }));
    } catch (e:any) {
      setMsg(e?.response?.data?.error || 'Renk analizi başarısız');
    }
  };

  useEffect(()=>{ loadPrompts(); loadPalettes(); loadLooms();
    try {
      const raw = localStorage.getItem('custom_presets');
      if (raw) setCustomPresets(JSON.parse(raw));
    } catch {}
    try {
      const sp = new URLSearchParams(window.location.search);
      const ref = sp.get('reference');
      if (ref && ref.trim()) setReferencePath(ref);
    } catch {}
    return () => {};
  },[]);

  // when selecting a loom, populate epi/ppi and report sizes
  useEffect(()=>{
    if (!loomId) return;
    const lm = looms.find(l=>l.id===loomId);
    if (lm) {
      setEpi(lm.epi);
      setPpi(lm.ppi);
      if (lm.report_w) setReportW(lm.report_w as number);
      if (lm.report_h) setReportH(lm.report_h as number);
    }
  }, [loomId, looms]);

  const currentMaxColors = paletteId ? palettes.find(p=>p.id===paletteId)?.max_colors : undefined;

  const generate = async () => {
    // Validation: require prompt, paletteId, maxColors, epi, ppi
    if (!prompt || !prompt.trim()) { setMsg('Prompt gerekli'); return; }
    if (!loomId) { setMsg('Lütfen bir Tezgah (Loom) seçin'); return; }
    const maxColors = currentMaxColors;
    if (!epi || !ppi) { setMsg('Lütfen Ölçü ve EPI/PPI değerlerini girin'); return; }
    setMsg('Desen hazırlanıyor…'); setResults([]); setGenerating(true); setGeneratingV1(true);
    try {
      let finalPrompt = prompt;
      try {
        const loraName = localStorage.getItem('lora_name') || '';
        const loraStrength = localStorage.getItem('lora_strength') || '';
        if (loraName && !finalPrompt.includes('<lora:')) {
          const strength = loraStrength && !isNaN(Number(loraStrength)) ? loraStrength : '1.0';
          finalPrompt = `${prompt} <lora:${loraName}:${strength}>`;
        }
      } catch {}
      const body:any = {
        prompt: finalPrompt, negative, width, height, steps, cfg,
        loom_id: loomId, epi, ppi, report_w: reportW, report_h: reportH,
      };
      body.tiling = tiling;
      if (paletteId) {
        body.palette_id = paletteId;
        if (maxColors && [8,12,16].includes(maxColors)) body.max_colors = maxColors;
      };
      let res;
      const reqCfg = { headers: auth, timeout: 600000 } as const; // 10 dakika
      if (referencePath) {
        body.reference_path = referencePath;
        body.denoising_strength = denoise;
        res = await axios.post('http://127.0.0.1:5000/api/ai/img2img', body, reqCfg);
      } else {
        res = await axios.post('http://127.0.0.1:5000/api/ai/txt2img', body, reqCfg);
      }
      setResults(res.data.results || []);
      if (!res.data.results?.length) setMsg('Görsel üretilemedi');
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Üretim hatası');
    } finally { setGenerating(false); setGeneratingV1(false); }
  };

  const saveAsDesign = async (item: GenItem, name?: string) => {
    setMsg('');
    try {
      const dres = await axios.post('http://127.0.0.1:5000/api/designs', {
        name: name || `AI ${new Date().toLocaleString()}`,
        original_image: item.path,
        loom_id: loomId,
        palette_id: paletteId
      }, { headers: auth });
      const designId = dres.data?.id as number | undefined;
      if (designId) {
        // Create a PatternVersion preview so it appears in Archive
        const params:any = {
          design_id: designId,
          max_colors: currentMaxColors,
          report_w: reportW,
          report_h: reportH,
          dither: false
        };
        try {
          await axios.post('http://127.0.0.1:5000/api/generate-pattern', params, { headers: auth });
          setMsg('Design kaydedildi ve önizleme oluşturuldu');
        } catch (e:any) {
          setMsg('Design kaydedildi ancak önizleme oluşturulamadı');
        }
      } else {
        setMsg('Design kaydedildi');
      }
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Design kaydedilemedi');
    }
  };

  const usePrompt = (p: PromptItem) => {
    setPrompt(p.prompt || '');
    setNegative(p.negative || '');
    if (p.width) setWidth(p.width);
    if (p.height) setHeight(p.height);
    if (p.steps) setSteps(p.steps);
    if (p.cfg) setCfg(Number(p.cfg));
  };

  const savePromptItem = async () => {
    if (!editPrompt?.name || !editPrompt?.prompt) { setModalMsg('Ad ve Prompt gerekli'); return; }
    setSaving(true); setModalMsg('');
    try {
      if (editPrompt.id) {
        await axios.put(`http://127.0.0.1:5000/api/prompts/${editPrompt.id}`, editPrompt, { headers: auth });
        setMsg('Prompt güncellendi');
      } else {
        await axios.post('http://127.0.0.1:5000/api/prompts', editPrompt, { headers: auth });
        setMsg('Prompt eklendi');
      }
      setEditPrompt(null);
      loadPrompts();
    } catch (e:any) {
      if (e?.response?.status === 401) {
        setModalMsg('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
      } else {
        setModalMsg(e?.response?.data?.error || 'Prompt kaydedilemedi');
      }
    } finally {
      setSaving(false);
    }
  };

  const deletePromptItem = async (id:number) => {
    if (!confirm('Prompt silinsin mi?')) return;
    try {
      await axios.delete(`http://127.0.0.1:5000/api/prompts/${id}`, { headers: auth });
      loadPrompts();
    } catch (e:any) {
      if (e?.response?.status === 401) {
        setMsg('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
        window.location.href = '/login';
      } else {
        setMsg(e?.response?.data?.error || 'Silme hatası');
      }
    }
  };

  

  const setPresetIran = () => {
    setPrompt('persian carpet style, intricate arabesque borders, floral medallion, symmetrical, high detail, soft beige and navy');
    setNegative('low detail, blur, text, watermark');
    setWidth(1024); setHeight(1536); setSteps(32); setCfg(7);
    localStorage.setItem('suggested_max_colors','12');
  };
  const setPresetNordic = () => {
    setPrompt('scandinavian rug, minimalist geometric patterns, soft wool texture, light neutral colors, clean lines, cozy, natural light');
    setNegative('busy pattern, cluttered, saturated colors, text, watermark');
    setWidth(1024); setHeight(1536); setSteps(28); setCfg(6);
    localStorage.setItem('suggested_max_colors','8');
  };
  const setPreset3DRug = () => {
    setPrompt('ultra-detailed photorealistic 3D render of a luxurious hand-knotted Persian rug on a neutral studio floor, shallow perspective, soft global illumination, PBR materials, micro-fiber detail, realistic weave, subtle fabric fuzz, 85mm lens, high dynamic range');
    setNegative('lowres, blurry, oversaturated, deformed edges, extra borders, watermark, text, logo, frame, wrong perspective');
    setWidth(1344); setHeight(896); setSteps(32); setCfg(6.5 as any);
  };

  const strongNeg = 'interior, room, furniture, sofa, chair, table, bed, lamp, chandelier, window, wall, floor, ceiling, background, scene, perspective, camera, depth of field, photo, 3d render, people, text, watermark, logo, border glitch, shadow, glare, lowres, noisy, low contrast';
  const setPresetMedallion = () => {
    setPrompt('persian medallion carpet, ornate floral border, center medallion, top-down, flat, seamless repeating tile, symmetric, fine knots, wool texture, blue-gray-gold palette');
    setNegative(strongNeg);
    setWidth(1024); setHeight(1024); setSteps(32); setCfg(6.5 as any); setTiling(true);
  };
  const setPresetAllover = () => {
    setPrompt('persian allover carpet pattern, repeating arabesque motifs, dense ornament, top-down, flat, seamless repeating tile, symmetric, fine knots, wool texture');
    setNegative(strongNeg);
    setWidth(1024); setHeight(1024); setSteps(32); setCfg(6.5 as any); setTiling(true);
  };
  const setPresetKilim = () => {
    setPrompt('geometric kilim carpet, repeating diamonds and stripes, flat weave, top-down, seamless repeating tile, sharp edges, limited color palette');
    setNegative(strongNeg);
    setWidth(1024); setHeight(1024); setSteps(30); setCfg(6 as any); setTiling(true);
  };

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <h2>Yapay Zeka Destekli Desen Üretimi</h2>
      <div className="card" style={{ display: 'grid', gap: 12, maxWidth: 1100 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:12 }}>
          <div style={{ display:'grid', gap:12 }}>
        {/* Tezgah (Loom) seçimi */}
        <div className="row" style={{ gap: 12, alignItems:'center', flexWrap:'wrap' }}>
          <label>
            Tezgah
            <select value={loomId||''} onChange={e=> setLoomId(e.target.value? parseInt(e.target.value): undefined)} style={{ marginLeft:6 }}>
              <option value="">Seçiniz</option>
              {looms.map(l=> (
                <option key={l.id} value={l.id}>{l.name} (EPI {l.epi} / PPI {l.ppi})</option>
              ))}
            </select>
          </label>
        </div>
        {/* Palet seçimi */}
        <div className="row" style={{ gap: 12, alignItems:'center', flexWrap:'wrap' }}>
          <label>
            Palet (opsiyonel)
            <select value={paletteId||''} onChange={e=> setPaletteId(e.target.value? parseInt(e.target.value): undefined)} style={{ marginLeft:6 }}>
              <option value="">Seçiniz</option>
              {palettes.map(p=> (
                <option key={p.id} value={p.id}>{p.name} (max {p.max_colors})</option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Üretim kalitesi paletten etkilenmez; palet, pattern oluştururken uygulanır.</div>
          {/* Palet renkleri önizleme */}
          {paletteId && (
            <div className="row" style={{ gap:6, flexWrap:'wrap' }}>
              {(palettes.find(x=>x.id===paletteId)?.colors||[]).map(c=> (
                <span key={c.id} title={`#${c.r.toString(16).padStart(2,'0')}${c.g.toString(16).padStart(2,'0')}${c.b.toString(16).padStart(2,'0')}`} style={{ width:16, height:16, borderRadius:4, border:'1px solid rgba(0,0,0,0.2)', background:`rgb(${c.r},${c.g},${c.b})` }} />
              ))}
            </div>
          )}
        </div>
        {/* Ölçü & EPI/PPI */}
        <div className="row" style={{ gap: 12, flexWrap:'wrap' }}>
          <label>
            EPI
            <input type="number" value={epi||''} onChange={e=> setEpi(parseInt(e.target.value||'0')||undefined)} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ends per inch (atkı yoğunluğu)</div>
          </label>
          <label>
            PPI
            <input type="number" value={ppi||''} onChange={e=> setPpi(parseInt(e.target.value||'0')||undefined)} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Picks per inch (çözgü yoğunluğu)</div>
          </label>
          <label>
            Rapor W
            <input type="number" value={reportW||''} onChange={e=> setReportW(parseInt(e.target.value||'0')||undefined)} style={{ width: 120, marginLeft: 6 }} />
          </label>
        </div>
        <div style={{ fontWeight:600 }}>Prompt</div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={8} style={{ width:'100%', minHeight:160 }} />
        <div style={{ fontWeight:600 }}>Negative Prompt</div>
        <textarea value={negative} onChange={e=>setNegative(e.target.value)} rows={8} style={{ width:'100%', minHeight:160 }} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>Boyut:</span>
          <button type="button" className="btn btn-ghost" onClick={()=>{setWidth(1024); setHeight(1536);}}>1024×1536 (Dikey)</button>
          <button type="button" className="btn btn-ghost" onClick={()=>{setWidth(1344); setHeight(896);}}>1344×896 (Yatay)</button>
          <button type="button" className="btn btn-ghost" onClick={()=>{setWidth(1024); setHeight(1024);}}>1024×1024 (Kare)</button>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label>
            W
            <input type="number" value={width} onChange={e=>setWidth(parseInt(e.target.value||'0'))} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Genişlik (px)</div>
          </label>
          <label>
            H
            <input type="number" value={height} onChange={e=>setHeight(parseInt(e.target.value||'0'))} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Yükseklik (px)</div>
          </label>
          <label>
            Steps
            <input type="number" value={steps} onChange={e=>setSteps(parseInt(e.target.value||'0'))} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Örnekleme adımı (≈ kalite/hesap)</div>
          </label>
          <label>
            CFG
            <input type="number" value={cfg} onChange={e=>setCfg(parseInt(e.target.value||'0'))} style={{ width: 120, marginLeft: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Prompta bağlılık (6 iyi başlangıç)</div>
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={tiling} onChange={e=> setTiling(e.target.checked)} />
            Seamless (tiling)
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input
              type="checkbox"
              checked={!!referencePath}
              onChange={e=>{
                if (!e.target.checked) {
                  setReferencePath(undefined);
                  try { const url=new URL(window.location.href); url.searchParams.delete('reference'); window.history.replaceState({}, '', url.toString()); } catch {}
                }
              }}
            />
            Referans
            {referencePath && (
              <>
                <span style={{ fontSize:12, color:'var(--muted)' }}>{referencePath.split(/[/\\\\]/).pop()}</span>
                <input type="number" step="0.01" min={0} max={1} value={denoise} onChange={e=>setDenoise(Math.max(0, Math.min(1, parseFloat(e.target.value||'0'))))} style={{ width:90 }} title="Denoising (img2img)" />
              </>
            )}
          </label>
        </div>
        <div className="row" style={{ gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-3d" type="button" onClick={generate} disabled={generating}>{generatingV1 ? 'Hazırlanıyor…' : 'Üret'}</button>
          <button className="btn" type="button" onClick={generateV2} disabled={generating} title="Harici sağlayıcı ile üretim">{generatingV2 ? 'Hazırlanıyor…' : 'Üret V2'}</button>
        </div>
          </div>
          <div style={{ borderLeft:'1px solid #eee', paddingLeft:12, display:'grid', gap:8, maxHeight: 560, overflowY:'auto' }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>Halı Modelleri</div>
            <button type="button" className="btn" onClick={setPresetIran} style={{ background:'#dbeafe', borderColor:'#93c5fd', color:'#1e3a8a' }}>İran Halısı</button>
            <button type="button" className="btn" onClick={setPresetNordic} style={{ background:'#dbeafe', borderColor:'#93c5fd', color:'#1e3a8a' }}>İskandinav Halısı</button>
            <button type="button" className="btn" onClick={setPresetMedallion} style={{ background:'#dcfce7', borderColor:'#86efac', color:'#065f46' }}>Medalyon Deseni</button>
            <button type="button" className="btn" onClick={setPresetAllover} style={{ background:'#dcfce7', borderColor:'#86efac', color:'#065f46' }}>Allover Desen</button>
            <button type="button" className="btn" onClick={setPresetKilim} style={{ background:'#dcfce7', borderColor:'#86efac', color:'#065f46' }}>Kilim Geometrik</button>
            <div style={{ height:8 }} />
            <div style={{ fontWeight:700 }}>Hazır Promptlar</div>
            <div style={{ display:'grid', gap:6 }}>
              <button type="button" className="btn btn-ghost" onClick={()=>setPrompt('ultra detailed paper-cut bas-relief, ornate arabesque floral filigree, ivory on navy')}>Paper‑Cut</button>
              <button type="button" className="btn btn-ghost" onClick={()=>setPrompt('baroque arabesque bas‑relief, carved plaster, floral filigree, ivory, deep shadows, museum lighting')}>Bas‑Relief</button>
              <button type="button" className="btn btn-ghost" onClick={()=>setPrompt('ornate floral filigree frame, layered petals, high relief, ivory on indigo, ultra intricate')}>Çiçek Filigre</button>
              <button type="button" className="btn btn-ghost" onClick={setPreset3DRug}>3D Halı Modeli</button>
            </div>
            <div style={{ height:8 }} />
          </div>
        </div>
      </div>

      {(generating || msg) && (
        <div className="card" style={{ marginTop: 12 }}>
          {generating ? 'Desen hazırlanıyor, lütfen bekleyin…' : msg}
          {msg.includes('127.0.0.1:7860') && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              SD WebUI çalışmıyor olabilir. Lütfen http://127.0.0.1:7860 adresinde başlatın ve tekrar deneyin.
            </div>
          )}
        </div>
      )}

      

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
        {results.map((it, i) => (
          <div key={i} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', borderRadius: 8, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={`http://127.0.0.1:5000${it.url}`} alt={it.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <input placeholder="Design adı" defaultValue={`AI ${i+1}`} id={`dn-${i}`} />
              <div className="row">
                <button className="btn" type="button" onClick={()=>{
                  const el = document.getElementById(`dn-${i}`) as HTMLInputElement | null;
                  saveAsDesign(it, el?.value || undefined);
                }}>Design'e Kaydet</button>
                <a className="btn btn-ghost" href={`http://127.0.0.1:5000${it.url}`} target="_blank" rel="noreferrer">Görüntüyü Aç</a>
                <button className="btn btn-ghost" type="button" onClick={()=>analyzeColors(it)}>Renkleri Analiz Et</button>
              </div>
              {colorMap[it.filename] && (
                <div className="row" style={{ flexWrap:'wrap', gap:8 }}>
                  {colorMap[it.filename].map((c, idx)=> (
                    <div key={idx} title={`${c.hex} • ${c.percent}%`} style={{ display:'flex', alignItems:'center', gap:6, border:'1px solid #eee', borderRadius:6, padding:'4px 8px' }}>
                      <span style={{ width:16, height:16, borderRadius:4, background:c.hex, border:'1px solid rgba(0,0,0,0.1)' }} />
                      <span style={{ fontSize:12 }}>{c.hex} · {c.percent}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {results.length===0 && !generating && (
          <div style={{ color: 'var(--muted)' }}>Henüz üretim yapılmadı. Üstten prompt seçip Üret’e basın.</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16, display:'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
          <button className="btn btn-ghost" type="button" onClick={()=>setPromptsOpen(v=>!v)}>{promptsOpen? '▼' : '►'} Hazır Promptlar</button>
          <div className="row" style={{ gap:8, alignItems:'center' }}>
            {promptsOpen && (
              <input placeholder="Ara (ad/etiket)" value={promptFilter} onChange={e=>setPromptFilter(e.target.value)} />
            )}
            <button className="btn" type="button" onClick={()=>setEditPrompt({ name:'Yeni Prompt', prompt })}>Yeni</button>
          </div>
        </div>
        {promptsOpen && (
          <div style={{ display:'grid', gap:6 }}>
            {prompts.filter(p=>{
              const q = (promptFilter||'').toLowerCase();
              if (!q) return true;
              return (`${p.name||''} ${p.tags||''}`).toLowerCase().includes(q);
            }).map(p => (
              <div key={p.id} className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{p.tags||'-'} • {(p.width||'-')}×{p.height||'-'} • Steps {p.steps||'-'} • CFG {p.cfg||'-'}</div>
                </div>
                <div className="row">
                  <button className="btn btn-ghost" type="button" onClick={()=>usePrompt(p)}>Kullan</button>
                  <button className="btn btn-ghost" type="button" onClick={()=>setEditPrompt(p)}>Düzenle</button>
                  <button className="btn btn-danger" type="button" onClick={()=>deletePromptItem(p.id)}>Sil</button>
                </div>
              </div>
            ))}
            {prompts.length===0 && <div style={{ color:'var(--muted)' }}>Prompt yok.</div>}
          </div>
        )}
      </div>

      {editPrompt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
          <div className="card" style={{ width: 640, display:'grid', gap:8 }}>
            <strong>Prompt Düzenle</strong>
            <input placeholder="Ad" value={editPrompt.name||''} onChange={e=>setEditPrompt({...editPrompt, name:e.target.value})} />
            <div style={{ fontSize:12, color:'var(--muted)' }}>Liste adı. Kolay hatırlamak için kısa ve açıklayıcı bir isim.</div>
            <textarea placeholder="Prompt (örn: persian carpet, floral border, symmetric, high detail)" rows={4} value={editPrompt.prompt||''} onChange={e=>setEditPrompt({...editPrompt, prompt:e.target.value})} />
            <div style={{ fontSize:12, color:'var(--muted)' }}>Üretilecek içerik. Stil/tema/motifleri yazın.</div>
            <textarea placeholder="Negative (örn: blur, text, watermark)" rows={3} value={editPrompt.negative||''} onChange={e=>setEditPrompt({...editPrompt, negative:e.target.value})} />
            <div style={{ fontSize:12, color:'var(--muted)' }}>İstenmeyen öğeler. Görmesini istemediğiniz şeyleri yazın.</div>
            <div className="row">
              <input type="number" placeholder="W (px)" value={(editPrompt.width as number)||''} onChange={e=>setEditPrompt({...editPrompt, width: parseInt(e.target.value||'0')||undefined})} />
              <input type="number" placeholder="H (px)" value={(editPrompt.height as number)||''} onChange={e=>setEditPrompt({...editPrompt, height: parseInt(e.target.value||'0')||undefined})} />
              <input type="number" placeholder="Steps" value={(editPrompt.steps as number)||''} onChange={e=>setEditPrompt({...editPrompt, steps: parseInt(e.target.value||'0')||undefined})} />
              <input type="number" placeholder="CFG" value={(editPrompt.cfg as number)||''} onChange={e=>setEditPrompt({...editPrompt, cfg: parseFloat(e.target.value||'0')||undefined})} />
            </div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>W/H: Görsel boyutu (px). Steps: örnekleme adımı (daha yüksek=genelde daha detay). CFG: prompta bağlılık (5–9 önerilir).</div>
            <input placeholder="Sampler" value={editPrompt.sampler||''} onChange={e=>setEditPrompt({...editPrompt, sampler:e.target.value})} />
            <div style={{ fontSize:12, color:'var(--muted)' }}>Sampler adı (örn. Euler a, DPM++ 2M Karras). Boş bırakabilirsiniz.</div>
            <input placeholder="Tags (virgülle)" value={editPrompt.tags||''} onChange={e=>setEditPrompt({...editPrompt, tags:e.target.value})} />
            <div style={{ fontSize:12, color:'var(--muted)' }}>Etiketler. Örn: max8, max12, max16 (Pattern’de renk önerisi için), iran, scandi…</div>
            {modalMsg && (<div style={{ color:'crimson', fontSize:12 }}>{modalMsg}</div>)}
            <div className="row" style={{ justifyContent:'flex-end' }}>
              <button className="btn" disabled={saving} type="button" onClick={savePromptItem}>{saving ? 'Kaydediliyor…' : (editPrompt.id? 'Kaydet' : 'Ekle')}</button>
              <button className="btn btn-ghost" disabled={saving} type="button" onClick={()=>setEditPrompt(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
