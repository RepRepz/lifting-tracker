import { useState, useEffect, useMemo, useRef } from "react";
import { T } from "./theme.js";

/* ---------- helpers ---------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const mondayOf = (dateStr) => { const d = new Date(dateStr + "T00:00"); const dow = (d.getDay() + 6) % 7; return addDays(dateStr, -dow); };

/* Open Food Facts — free, no API key. Search by name or fetch by barcode. */
async function offSearch(q) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("search failed");
  const j = await r.json();
  return (j.products || []).filter(p => p.product_name && p.nutriments).map(offToFood);
}
async function offBarcode(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
  if (!r.ok) throw new Error("lookup failed");
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return offToFood(j.product);
}
function offToFood(p) {
  const n = p.nutriments || {};
  // OFF nutriments are per 100g
  return {
    name: p.product_name + (p.brands ? ` (${p.brands.split(",")[0]})` : ""),
    per100: {
      kcal: num(n["energy-kcal_100g"]), protein: num(n.proteins_100g),
      carb: num(n.carbohydrates_100g), fat: num(n.fat_100g),
      fiber: num(n.fiber_100g), sodium: num(n.sodium_100g) * 1000, // g -> mg
    },
    barcode: p.code || p._id || "",
  };
}
function scale(per100, grams) {
  const f = (grams || 0) / 100;
  return {
    kcal: Math.round(per100.kcal * f), protein: +(per100.protein * f).toFixed(1),
    carb: +(per100.carb * f).toFixed(1), fat: +(per100.fat * f).toFixed(1),
    fiber: +(per100.fiber * f).toFixed(1), sodium: Math.round(per100.sodium * f),
  };
}
function dayTotals(foods, date) {
  const rows = (foods || []).filter(f => f.date === date);
  return rows.reduce((t, f) => ({
    kcal: t.kcal + num(f.kcal), protein: t.protein + num(f.protein),
    carb: t.carb + num(f.carb), fat: t.fat + num(f.fat),
    fiber: t.fiber + num(f.fiber), sodium: t.sodium + num(f.sodium),
  }), { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0, sodium: 0 });
}

const DEFAULT_GOALS = { kcal: 2200, protein: 160, carb: 220, fat: 70 };
const CARB_BLUE = "#2E8CFF";
const FAT_ORANGE = "#FFB300";

/* ---------- shared bits ---------- */
function CalorieRing({ eaten, goal, size = 130 }) {
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const r = size * 0.415, c = 2 * Math.PI * r, mid = size / 2;
  const over = eaten > goal;
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={mid} cy={mid} r={r} stroke={T.line} strokeWidth={10} fill="none" />
        <circle cx={mid} cy={mid} r={r} stroke={over ? T.down : T.green} strokeWidth={10} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>{Math.round(eaten)}</div>
        <div style={{ fontSize: 11, color: T.sub }}>of {goal} cal</div>
        {over && <div style={{ fontSize: 10, color: T.down, fontWeight: 700 }}>+{Math.round(eaten - goal)} over</div>}
      </div>
    </div>
  );
}

function MacroBar({ label, color, eaten, goal, unit = "g" }) {
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.sub, marginBottom: 3 }}>
        <span style={{ color: T.ink, fontWeight: 600 }}>{label}</span>
        <span>{Math.round(eaten)}{unit} / {goal}{unit}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: T.input, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 4, transition: "width .3s ease" }} />
      </div>
    </div>
  );
}

const btnGreen = { background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, border: "none" };
const btnGhost = { background: T.input, color: T.sub, borderRadius: 10, border: `1px solid ${T.line}` };

/* ---------- add food modal (search / scan / my foods / manual) ---------- */
function AddFoodModal({ meal, date, data, setData, onSave, onClose }) {
  const [mode, setMode] = useState("search"); // search | scan | mine | manual
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState(null); // {name, per100} OR {name, fixed:{...macros}, servings?}
  const [grams, setGrams] = useState(100);
  const [servings, setServings] = useState(1);
  const [manual, setManual] = useState({ name: "", kcal: "", protein: "", carb: "", fat: "", saveIt: false, recurring: false });
  const [scanErr, setScanErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef(null); const streamRef = useRef(null);

  const customFoods = data.customFoods || [];
  const recipes = data.recipes || [];

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(""); setResults(null);
    try { setResults(await offSearch(q.trim())); }
    catch { setErr("Search failed — check your connection."); }
    setBusy(false);
  };

  const lookupBarcode = async (code) => {
    setBusy(true); setScanErr("");
    try {
      const f = await offBarcode(code);
      if (!f) setScanErr("No product found for that barcode — try Search or Manual instead.");
      else setPicked(f);
    } catch { setScanErr("Lookup failed — check your connection."); }
    setBusy(false);
  };

  const startScan = async () => {
    setScanErr("");
    let Detector = window.BarcodeDetector;
    if (!Detector) {
      // iOS Safari (and some others) have no built-in scanner — load the polyfill on demand
      try { Detector = (await import("barcode-detector/ponyfill")).BarcodeDetector; }
      catch { setScanErr("Couldn't load the scanner — check your connection, or enter the number below."); return; }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      // wait a tick so the <video> is on screen before attaching the stream (iOS shows black otherwise)
      await new Promise(r => setTimeout(r, 50));
      const v = videoRef.current;
      if (v) {
        // React doesn't write the muted attribute (react#10389); iOS needs all three set for real or it renders black
        v.muted = true;
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.setAttribute("autoplay", "");
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length) { stopScan(); lookupBarcode(codes[0].rawValue); return; }
        } catch {}
        if (streamRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { setScanErr("Couldn't access the camera — check permissions, or enter the barcode number below."); }
  };
  const stopScan = () => {
    streamRef.current?.getTracks()?.forEach(t => t.stop());
    streamRef.current = null; setScanning(false);
  };

  const confirmPicked = () => {
    if (picked.per100) {
      const m = scale(picked.per100, grams);
      onSave({ id: uid(), date, meal, name: picked.name, grams: num(grams), barcode: picked.barcode || "", ...m });
    } else {
      const s = num(servings, 1);
      const f = picked.fixed;
      onSave({ id: uid(), date, meal, name: picked.name + (s !== 1 ? ` ×${s}` : ""), grams: null,
        kcal: Math.round(f.kcal * s), protein: +(f.protein * s).toFixed(1), carb: +(f.carb * s).toFixed(1),
        fat: +(f.fat * s).toFixed(1), fiber: +((f.fiber || 0) * s).toFixed(1), sodium: Math.round((f.sodium || 0) * s) });
    }
  };
  const confirmManual = () => {
    if (!manual.name.trim() || !manual.kcal) return;
    const entry = { id: uid(), date, meal, name: manual.name.trim(), grams: null,
      kcal: num(manual.kcal), protein: num(manual.protein), carb: num(manual.carb), fat: num(manual.fat), fiber: 0, sodium: 0 };
    if (manual.saveIt || manual.recurring) {
      const cf = { id: uid(), name: entry.name, fixed: { kcal: entry.kcal, protein: entry.protein, carb: entry.carb, fat: entry.fat, fiber: 0, sodium: 0 },
        recurring: manual.recurring, meal };
      setData(d => ({ ...d, customFoods: [...(d.customFoods || []), cf] }));
      if (manual.recurring) entry.recurringId = cf.id;
    }
    onSave(entry);
  };

  const close = () => { stopScan(); onClose(); };
  const tabBtn = (id, label) => (
    <button onClick={() => { stopScan(); setMode(id); setPicked(null); }} style={{
      flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12.5,
      background: mode === id ? T.green : T.input, color: mode === id ? "#000" : T.sub,
    }}>{label}</button>
  );

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>Add to {meal}</div>
          <button onClick={close} style={{ background: "none", border: "none", color: T.sub, fontSize: 20, padding: 4 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {tabBtn("search", "🔍 Search")}{tabBtn("scan", "📷 Scan")}{tabBtn("mine", "⭐ Mine")}{tabBtn("manual", "✏️ Manual")}
        </div>

        {mode === "search" && !picked && (
          <>
            <form onSubmit={doSearch} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. chicken breast" />
              <button type="submit" style={{ ...btnGreen, padding: "0 16px" }}>Go</button>
            </form>
            {busy && <div style={{ color: T.sub, fontSize: 13 }}>Searching…</div>}
            {err && <div style={{ color: T.down, fontSize: 13 }}>{err}</div>}
            {results?.length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>No results — try a simpler term, or use Manual.</div>}
            {results?.map((f, i) => (
              <button key={i} onClick={() => setPicked(f)} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(f.per100.kcal)} cal / 100g · P{Math.round(f.per100.protein)} C{Math.round(f.per100.carb)} F{Math.round(f.per100.fat)}</div>
              </button>
            ))}
          </>
        )}

        {mode === "scan" && !picked && (
          <div>
            {!scanning && <button onClick={startScan} style={{ ...btnGreen, width: "100%", padding: "12px 0", marginBottom: 10 }}>Start camera</button>}
            {scanning && (
              <div style={{ position: "relative", marginBottom: 10 }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000" }} />
                <button onClick={stopScan} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px" }}>Stop</button>
              </div>
            )}
            {busy && <div style={{ color: T.sub, fontSize: 13, marginBottom: 8 }}>Looking up…</div>}
            {scanErr && <div style={{ color: T.down, fontSize: 13, marginBottom: 8 }}>{scanErr}</div>}
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>Or type the barcode number:</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={manualCode} onChange={e => setManualCode(e.target.value)} inputMode="numeric" placeholder="e.g. 0123456789012" />
              <button onClick={() => manualCode.trim() && lookupBarcode(manualCode.trim())} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "0 14px" }}>Look up</button>
            </div>
          </div>
        )}

        {mode === "mine" && !picked && (
          <div>
            {!customFoods.length && !recipes.length && (
              <div style={{ color: T.sub, fontSize: 13, marginBottom: 8 }}>
                Nothing saved yet. Save foods with the checkbox in ✏️ Manual, or build recipes in the 🍲 Recipes card on the Macros tab.
              </div>
            )}
            {recipes.map(r => (
              <button key={r.id} onClick={() => setPicked({ name: r.name, fixed: r.perServing })} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>🍲 {r.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(r.perServing.kcal)} cal / serving · P{Math.round(r.perServing.protein)} C{Math.round(r.perServing.carb)} F{Math.round(r.perServing.fat)}</div>
              </button>
            ))}
            {customFoods.map(f => (
              <button key={f.id} onClick={() => setPicked({ name: f.name, fixed: f.fixed })} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.recurring ? "🔁 " : "⭐ "}{f.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(f.fixed.kcal)} cal · P{Math.round(f.fixed.protein)} C{Math.round(f.fixed.carb)} F{Math.round(f.fixed.fat)}</div>
              </button>
            ))}
          </div>
        )}

        {picked && mode !== "manual" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 8 }}>{picked.name}</div>
            {picked.per100 ? (<>
              <label style={{ fontSize: 12, color: T.sub }}>Amount (grams)</label>
              <input type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>
                {(() => { const m = scale(picked.per100, grams); return `${m.kcal} cal · P${m.protein} C${m.carb} F${m.fat}`; })()}
              </div>
            </>) : (<>
              <label style={{ fontSize: 12, color: T.sub }}>Servings</label>
              <input type="number" inputMode="decimal" value={servings} onChange={e => setServings(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>
                {Math.round(picked.fixed.kcal * num(servings, 1))} cal · P{+(picked.fixed.protein * num(servings, 1)).toFixed(1)} C{+(picked.fixed.carb * num(servings, 1)).toFixed(1)} F{+(picked.fixed.fat * num(servings, 1)).toFixed(1)}
              </div>
            </>)}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPicked(null)} style={{ ...btnGhost, flex: 1, padding: "10px 0" }}>Back</button>
              <button onClick={confirmPicked} style={{ ...btnGreen, flex: 2, padding: "10px 0" }}>Add</button>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <div>
            <label style={{ fontSize: 12, color: T.sub }}>Food name</label>
            <input value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} style={{ marginBottom: 8 }} placeholder="e.g. protein shake" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div><label style={{ fontSize: 12, color: T.sub }}>Calories</label><input type="number" inputMode="numeric" value={manual.kcal} onChange={e => setManual(m => ({ ...m, kcal: e.target.value }))} /></div>
              <div><label style={{ fontSize: 12, color: T.sub }}>Protein (g)</label><input type="number" inputMode="decimal" value={manual.protein} onChange={e => setManual(m => ({ ...m, protein: e.target.value }))} /></div>
              <div><label style={{ fontSize: 12, color: T.sub }}>Carbs (g)</label><input type="number" inputMode="decimal" value={manual.carb} onChange={e => setManual(m => ({ ...m, carb: e.target.value }))} /></div>
              <div><label style={{ fontSize: 12, color: T.sub }}>Fat (g)</label><input type="number" inputMode="decimal" value={manual.fat} onChange={e => setManual(m => ({ ...m, fat: e.target.value }))} /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={manual.saveIt} onChange={e => setManual(m => ({ ...m, saveIt: e.target.checked }))} style={{ width: 17, height: 17, minHeight: 0, accentColor: T.green }} />
              ⭐ Save to My Foods for next time
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={manual.recurring} onChange={e => setManual(m => ({ ...m, recurring: e.target.checked }))} style={{ width: 17, height: 17, minHeight: 0, accentColor: T.green }} />
              🔁 Log this automatically every day ({meal})
            </label>
            <button onClick={confirmManual} disabled={!manual.name.trim() || !manual.kcal} style={{ ...btnGreen, width: "100%", padding: "11px 0", opacity: (!manual.name.trim() || !manual.kcal) ? .5 : 1 }}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- goals: full TDEE calculator (Mifflin-St Jeor) ---------- */
function GoalsModal({ data, goals, onSave, onClose }) {
  const heightIn = data.profile?.heightIn || null;
  const latestBW = useMemo(() => {
    const rows = [...(data.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length - 1].weight : null;
  }, [data.bodyweight]);
  const saved = goals.calc || {};
  const [calc, setCalc] = useState({ age: saved.age || "", sex: saved.sex || "male", activity: saved.activity || "1.375", plan: saved.plan || "maintain" });
  const [g, setG] = useState(goals);
  const [mode, setMode] = useState("calc"); // calc | manual

  const canCalc = heightIn && latestBW && num(calc.age) > 0;
  const compute = () => {
    const kg = latestBW * 0.4536, cm = heightIn * 2.54;
    const bmr = 10 * kg + 6.25 * cm - 5 * num(calc.age) + (calc.sex === "male" ? 5 : -161);
    let cal = bmr * num(calc.activity, 1.375);
    if (calc.plan === "cut") cal -= 500;
    if (calc.plan === "bulk") cal += 300;
    cal = Math.round(cal / 10) * 10;
    const protein = Math.round(latestBW * (calc.plan === "cut" ? 1 : 0.8)); // g per lb bodyweight
    const fat = Math.round(cal * 0.25 / 9);
    const carb = Math.round((cal - protein * 4 - fat * 9) / 4);
    setG({ kcal: cal, protein, carb, fat, calc });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, padding: 18, width: "92%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk, marginBottom: 10 }}>🎯 Nutrition goals</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["calc", "Calculate for me"], ["manual", "Enter manually"]].map(([id, l]) => (
            <button key={id} onClick={() => setMode(id)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, background: mode === id ? T.green : T.input, color: mode === id ? "#000" : T.sub }}>{l}</button>
          ))}
        </div>

        {mode === "calc" && (<>
          <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 10 }}>
            Uses your height {heightIn ? `(${Math.floor(heightIn / 12)}'${Math.round(heightIn % 12)}")` : "(not set — add it in Body tab)"} and latest weigh-in {latestBW ? `(${Math.round(latestBW)} lb)` : "(none yet — log one in Body tab)"}.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><label style={{ fontSize: 12, color: T.sub }}>Age</label><input type="number" inputMode="numeric" value={calc.age} onChange={e => setCalc(c => ({ ...c, age: e.target.value }))} /></div>
            <div><label style={{ fontSize: 12, color: T.sub }}>Sex</label>
              <select value={calc.sex} onChange={e => setCalc(c => ({ ...c, sex: e.target.value }))}>
                <option value="male">Male</option><option value="female">Female</option>
              </select></div>
          </div>
          <label style={{ fontSize: 12, color: T.sub }}>Activity level</label>
          <select value={calc.activity} onChange={e => setCalc(c => ({ ...c, activity: e.target.value }))} style={{ marginBottom: 8 }}>
            <option value="1.2">Mostly sitting (little exercise)</option>
            <option value="1.375">Light (1–3 workouts/week)</option>
            <option value="1.55">Moderate (3–5 workouts/week)</option>
            <option value="1.725">Hard (6–7 workouts/week)</option>
          </select>
          <label style={{ fontSize: 12, color: T.sub }}>Goal</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[["cut", "✂️ Cut"], ["maintain", "⚖️ Maintain"], ["bulk", "📈 Bulk"]].map(([id, l]) => (
              <button key={id} onClick={() => setCalc(c => ({ ...c, plan: id }))} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${calc.plan === id ? T.green : T.line}`, fontWeight: 700, fontSize: 13, background: calc.plan === id ? T.mint : T.input, color: calc.plan === id ? T.green : T.sub }}>{l}</button>
            ))}
          </div>
          <button onClick={compute} disabled={!canCalc} style={{ ...btnGreen, width: "100%", padding: "11px 0", marginBottom: 10, opacity: canCalc ? 1 : .5 }}>Calculate</button>
          {!canCalc && <div style={{ fontSize: 12, color: T.down, marginBottom: 8 }}>Need height + a weigh-in (Body tab) + your age first.</div>}
        </>)}

        {mode === "manual" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[["kcal", "Calories"], ["protein", "Protein (g)"], ["carb", "Carbs (g)"], ["fat", "Fat (g)"]].map(([k, l]) => (
              <div key={k}><label style={{ fontSize: 12, color: T.sub }}>{l}</label><input type="number" inputMode="numeric" value={g[k]} onChange={e => setG(s => ({ ...s, [k]: num(e.target.value) }))} /></div>
            ))}
          </div>
        )}

        <div style={{ background: T.input, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13.5, color: T.ink }}>
          <b style={{ color: T.green }}>{g.kcal} cal</b> · P {g.protein}g · C {g.carb}g · F {g.fat}g
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btnGhost, flex: 1, padding: "10px 0" }}>Cancel</button>
          <button onClick={() => onSave(g)} style={{ ...btnGreen, flex: 1, padding: "10px 0" }}>Save goals</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- recipe builder ---------- */
function RecipeModal({ data, setData, onClose }) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [items, setItems] = useState([]); // {name, kcal, protein, carb, fat}
  const [row, setRow] = useState({ name: "", kcal: "", protein: "", carb: "", fat: "" });
  const addRow = () => {
    if (!row.name.trim() || !row.kcal) return;
    setItems(a => [...a, { name: row.name.trim(), kcal: num(row.kcal), protein: num(row.protein), carb: num(row.carb), fat: num(row.fat) }]);
    setRow({ name: "", kcal: "", protein: "", carb: "", fat: "" });
  };
  const tot = items.reduce((t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carb: t.carb + i.carb, fat: t.fat + i.fat }), { kcal: 0, protein: 0, carb: 0, fat: 0 });
  const save = () => {
    const s = Math.max(1, num(servings, 1));
    const perServing = { kcal: Math.round(tot.kcal / s), protein: +(tot.protein / s).toFixed(1), carb: +(tot.carb / s).toFixed(1), fat: +(tot.fat / s).toFixed(1), fiber: 0, sodium: 0 };
    setData(d => ({ ...d, recipes: [...(d.recipes || []), { id: uid(), name: name.trim(), servings: s, items, perServing }] }));
    onClose();
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk, marginBottom: 10 }}>🍲 New recipe</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><label style={{ fontSize: 12, color: T.sub }}>Recipe name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chicken rice bowl" /></div>
          <div><label style={{ fontSize: 12, color: T.sub }}>Servings it makes</label><input type="number" inputMode="numeric" value={servings} onChange={e => setServings(e.target.value)} /></div>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.ink, padding: "5px 0", borderBottom: `1px solid ${T.line}` }}>
            <span>{it.name}</span>
            <span style={{ color: T.sub }}>{it.kcal} cal <button onClick={() => setItems(a => a.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: T.sub }}>✕</button></span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: T.sub, margin: "10px 0 4px" }}>Add ingredient (per amount you actually use):</div>
        <input value={row.name} onChange={e => setRow(r => ({ ...r, name: e.target.value }))} placeholder="Ingredient" style={{ marginBottom: 6 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          {[["kcal", "cal"], ["protein", "P (g)"], ["carb", "C (g)"], ["fat", "F (g)"]].map(([k, l]) => (
            <input key={k} type="number" inputMode="decimal" value={row[k]} onChange={e => setRow(r => ({ ...r, [k]: e.target.value }))} placeholder={l} />
          ))}
        </div>
        <button onClick={addRow} style={{ ...btnGhost, color: T.green, fontWeight: 700, width: "100%", padding: "9px 0", marginBottom: 12 }}>+ Add ingredient</button>
        <div style={{ background: T.input, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13.5, color: T.ink }}>
          Total: <b style={{ color: T.green }}>{Math.round(tot.kcal)} cal</b> · P {Math.round(tot.protein)} C {Math.round(tot.carb)} F {Math.round(tot.fat)}
          {num(servings, 1) > 1 && <span style={{ color: T.sub }}> — {Math.round(tot.kcal / num(servings, 1))} cal / serving</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btnGhost, flex: 1, padding: "10px 0" }}>Cancel</button>
          <button onClick={save} disabled={!name.trim() || !items.length} style={{ ...btnGreen, flex: 1, padding: "10px 0", opacity: (!name.trim() || !items.length) ? .5 : 1 }}>Save recipe</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- fasting ---------- */
const PROTOCOLS = { "16:8": 8, "18:6": 6, "20:4": 4 };
function fastingStatus(f, now = new Date()) {
  if (!f?.enabled) return null;
  if (f.adHoc) {
    const h = (now - new Date(f.adHoc)) / 36e5;
    return { fasting: true, adHoc: true, label: `Fasting — ${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m so far` };
  }
  const eatHours = f.protocol === "custom" ? num(f.customEatHours, 8) : (PROTOCOLS[f.protocol] || 8);
  const [sh, sm] = (f.eatStart || "12:00").split(":").map(Number);
  const start = new Date(now); start.setHours(sh, sm, 0, 0);
  const end = new Date(start.getTime() + eatHours * 36e5);
  if (now >= start && now < end) {
    const mins = Math.round((end - now) / 6e4);
    return { fasting: false, label: `🍽 Eating window open — closes in ${Math.floor(mins / 60)}h ${mins % 60}m` };
  }
  const next = now < start ? start : new Date(start.getTime() + 864e5);
  const mins = Math.round((next - now) / 6e4);
  return { fasting: true, label: `⏳ Fasting — eating opens in ${Math.floor(mins / 60)}h ${mins % 60}m` };
}

function FastingCard({ data, setData }) {
  const f = data.fasting || {};
  const [, tickRe] = useState(0);
  useEffect(() => { const iv = setInterval(() => tickRe(x => x + 1), 30000); return () => clearInterval(iv); }, []);
  const [editing, setEditing] = useState(false);
  const st = fastingStatus(f);
  const save = (patch) => setData(d => ({ ...d, fasting: { ...(d.fasting || {}), ...patch } }));

  if (!f.enabled) return (
    <div className="card" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 14, color: T.sub }}>⏳ Intermittent fasting</div>
      <button onClick={() => save({ enabled: true, protocol: "16:8", eatStart: "12:00" })} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "7px 14px", fontSize: 13 }}>Turn on</button>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>⏳ Fasting {f.protocol !== "custom" ? `(${f.protocol || "16:8"})` : "(custom)"}</div>
        <button onClick={() => setEditing(e => !e)} style={{ background: "none", border: "none", color: T.sub, fontSize: 13 }}>{editing ? "Done" : "⚙️"}</button>
      </div>
      <div style={{ fontSize: 14, color: st?.fasting ? T.green : T.ink, fontWeight: 600, marginBottom: 8 }}>{st?.label}</div>
      {!f.adHoc
        ? <button onClick={() => save({ adHoc: new Date().toISOString() })} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "8px 14px", fontSize: 13 }}>▶ Start a fast right now</button>
        : <button onClick={() => save({ adHoc: null })} style={{ ...btnGreen, padding: "8px 14px", fontSize: 13 }}>■ End fast</button>}
      {editing && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
          <label style={{ fontSize: 12, color: T.sub }}>Protocol</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["16:8", "18:6", "20:4", "custom"].map(p => (
              <button key={p} onClick={() => save({ protocol: p })} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${(f.protocol || "16:8") === p ? T.green : T.line}`, background: (f.protocol || "16:8") === p ? T.mint : T.input, color: (f.protocol || "16:8") === p ? T.green : T.sub, fontWeight: 700, fontSize: 12.5 }}>{p}</button>
            ))}
          </div>
          {f.protocol === "custom" && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: T.sub }}>Eating window length (hours)</label>
              <input type="number" inputMode="numeric" value={f.customEatHours || 8} onChange={e => save({ customEatHours: e.target.value })} />
            </div>
          )}
          <label style={{ fontSize: 12, color: T.sub }}>Eating window opens at</label>
          <input type="time" value={f.eatStart || "12:00"} onChange={e => save({ eatStart: e.target.value })} style={{ marginBottom: 8 }} />
          <button onClick={() => save({ enabled: false, adHoc: null })} style={{ background: "none", border: "none", color: T.down, fontSize: 13, padding: 0 }}>Turn fasting off</button>
        </div>
      )}
    </div>
  );
}

/* ---------- water ---------- */
function WaterCard({ data, setData, date }) {
  const prefs = { cupOz: 8, goal: 8, ...(data.waterPrefs || {}) };
  const entry = (data.water || []).find(w => w.date === date);
  const count = entry?.count || 0;
  const [editing, setEditing] = useState(false);
  const setCount = (n) => setData(d => {
    const rest = (d.water || []).filter(w => w.date !== date);
    return { ...d, water: n > 0 ? [...rest, { date, count: n }] : rest };
  });
  const pct = Math.min(1, count / prefs.goal);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>💧 Water</div>
        <button onClick={() => setEditing(e => !e)} style={{ background: "none", border: "none", color: T.sub, fontSize: 13 }}>{editing ? "Done" : "⚙️"}</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={() => setCount(Math.max(0, count - 1))} style={{ ...btnGhost, width: 42, height: 42, fontSize: 20, fontWeight: 700 }}>−</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#4FC3F7" }}>{count} <span style={{ fontSize: 13, color: T.sub, fontWeight: 500 }}>/ {prefs.goal} cups</span></div>
          <div style={{ fontSize: 11.5, color: T.sub }}>{count * prefs.cupOz} oz today ({prefs.cupOz} oz cups)</div>
        </div>
        <button onClick={() => setCount(count + 1)} style={{ background: "#4FC3F7", color: "#000", width: 42, height: 42, fontSize: 20, fontWeight: 700, border: "none", borderRadius: 10 }}>+</button>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: T.input, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: "#4FC3F7", borderRadius: 4, transition: "width .3s ease" }} />
      </div>
      {editing && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <div><label style={{ fontSize: 12, color: T.sub }}>Cup size (oz)</label>
            <input type="number" inputMode="numeric" value={prefs.cupOz} onChange={e => setData(d => ({ ...d, waterPrefs: { ...prefs, cupOz: num(e.target.value, 8) } }))} /></div>
          <div><label style={{ fontSize: 12, color: T.sub }}>Daily goal (cups)</label>
            <input type="number" inputMode="numeric" value={prefs.goal} onChange={e => setData(d => ({ ...d, waterPrefs: { ...prefs, goal: num(e.target.value, 8) } }))} /></div>
        </div>
      )}
    </div>
  );
}

/* ---------- streak from checked-off days ---------- */
function dayStreak(doneDates) {
  const set = new Set(doneDates || []);
  let cur = 0;
  // today counts if checked; otherwise streak continues from yesterday
  let d = set.has(todayStr()) ? todayStr() : addDays(todayStr(), -1);
  while (set.has(d)) { cur++; d = addDays(d, -1); }
  return cur;
}

/* ---------- weekly averages (weeks start Monday) ---------- */
function weekAverages(foods, weekMon) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekMon, i);
    if (d > todayStr()) break;
    const t = dayTotals(foods, d);
    if (t.kcal > 0) days.push(t);
  }
  if (!days.length) return null;
  return {
    n: days.length,
    kcal: Math.round(days.reduce((s, t) => s + t.kcal, 0) / days.length),
    protein: Math.round(days.reduce((s, t) => s + t.protein, 0) / days.length),
    fat: Math.round(days.reduce((s, t) => s + t.fat, 0) / days.length),
  };
}

/* ---------- main tab ---------- */
export function MacroTab({ data, setData }) {
  const [sel, setSel] = useState(todayStr());
  const [addMeal, setAddMeal] = useState(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const foods = data.foods || [];
  const goals = { ...DEFAULT_GOALS, ...(data.nutritionGoals || {}) };
  const totals = useMemo(() => dayTotals(foods, sel), [foods, sel]);
  const byMeal = useMemo(() => {
    const m = {}; for (const meal of MEALS) m[meal] = [];
    for (const f of foods) if (f.date === sel) (m[f.meal] ||= []).push(f);
    return m;
  }, [foods, sel]);

  /* auto-log recurring foods for today (skipped ones stay skipped) */
  useEffect(() => {
    const today = todayStr();
    const rec = (data.customFoods || []).filter(c => c.recurring);
    if (!rec.length) return;
    const skips = new Set(data.recurringSkips || []);
    const have = new Set(foods.filter(f => f.date === today && f.recurringId).map(f => f.recurringId));
    const missing = rec.filter(c => !have.has(c.id) && !skips.has(`${today}:${c.id}`));
    if (!missing.length) return;
    setData(d => ({ ...d, foods: [...(d.foods || []), ...missing.map(c => ({
      id: uid(), date: today, meal: c.meal || "Breakfast", name: c.name, grams: null, recurringId: c.id,
      kcal: c.fixed.kcal, protein: c.fixed.protein, carb: c.fixed.carb, fat: c.fixed.fat, fiber: c.fixed.fiber || 0, sodium: c.fixed.sodium || 0,
    }))] }));
  }, []); // once per visit is enough — sync merges handle the rest

  const addFood = (f) => { setData(d => ({ ...d, foods: [...(d.foods || []), f] })); setAddMeal(null); };
  const removeFood = (f) => setData(d => ({
    ...d,
    foods: (d.foods || []).filter(x => x.id !== f.id),
    // deleting an auto-logged item means "skip it today" — otherwise it would come right back
    ...(f.recurringId ? { recurringSkips: [...(d.recurringSkips || []), `${f.date}:${f.recurringId}`] } : {}),
  }));
  const saveGoals = (g) => { setData(d => ({ ...d, nutritionGoals: g })); setShowGoals(false); };

  const doneDates = data.dayDone || [];
  const isDone = doneDates.includes(sel);
  const streak = dayStreak(doneDates);
  const toggleDone = () => setData(d => ({
    ...d, dayDone: isDone ? (d.dayDone || []).filter(x => x !== sel) : [...(d.dayDone || []), sel],
  }));

  const thisWeek = useMemo(() => weekAverages(foods, mondayOf(todayStr())), [foods]);
  const lastWeek = useMemo(() => weekAverages(foods, addDays(mondayOf(todayStr()), -7)), [foods]);

  const shiftDay = (n) => setSel(s => addDays(s, n));

  return (
    <div>
      {/* header: date nav + streak + finish-day check */}
      <div className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={() => shiftDay(-1)} style={{ ...btnGhost, color: T.ink, padding: "6px 13px" }}>‹</button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{sel === todayStr() ? "Today" : sel}</div>
          {streak > 0 && <div style={{ fontSize: 11.5, color: T.sub }}>🔥 {streak}-day logging streak</div>}
        </div>
        <button onClick={() => shiftDay(1)} style={{ ...btnGhost, color: T.ink, padding: "6px 13px" }}>›</button>
        <button onClick={toggleDone} title="Finish logging for the day" style={{
          width: 42, height: 42, borderRadius: 12, fontSize: 19, fontWeight: 800,
          background: isDone ? T.green : T.input, color: isDone ? "#000" : T.sub,
          border: `1px solid ${isDone ? T.green : T.line}`,
        }}>✓</button>
      </div>

      {/* summary: ring + macro bars */}
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CalorieRing eaten={totals.kcal} goal={goals.kcal} size={118} />
          <div style={{ flex: 1 }}>
            <MacroBar label="Protein" color={T.green} eaten={totals.protein} goal={goals.protein} />
            <MacroBar label="Carbs" color={CARB_BLUE} eaten={totals.carb} goal={goals.carb} />
            <MacroBar label="Fat" color={FAT_ORANGE} eaten={totals.fat} goal={goals.fat} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button onClick={() => setShowGoals(true)} style={{ background: "none", border: "none", color: T.green, fontSize: 12.5, fontWeight: 700, padding: 0 }}>🎯 Goals</button>
          <button onClick={() => setExpanded(x => !x)} style={{ background: "none", border: "none", color: T.sub, fontSize: 12, padding: 0 }}>{expanded ? "Hide ▴" : "Show more ▾"}</button>
        </div>
        {expanded && (
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
            Fiber: {Math.round(totals.fiber)}g · Sodium: {Math.round(totals.sodium)}mg
            <br />Remaining: {Math.max(0, goals.kcal - Math.round(totals.kcal))} cal · P {Math.max(0, goals.protein - Math.round(totals.protein))}g · C {Math.max(0, goals.carb - Math.round(totals.carb))}g · F {Math.max(0, goals.fat - Math.round(totals.fat))}g
          </div>
        )}
      </div>

      <FastingCard data={data} setData={setData} />
      <WaterCard data={data} setData={setData} date={sel} />

      {/* weekly averages */}
      {(thisWeek || lastWeek) && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 8 }}>📅 Weekly averages <span style={{ fontSize: 11.5, color: T.sub, fontWeight: 500 }}>(weeks start Monday)</span></div>
          {[["This week", thisWeek], ["Last week", lastWeek]].map(([label, w]) => w && (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <span style={{ color: T.ink, fontWeight: 600 }}>{label} <span style={{ color: T.sub, fontWeight: 400, fontSize: 11.5 }}>({w.n} day{w.n > 1 ? "s" : ""})</span></span>
              <span style={{ color: T.sub }}><b style={{ color: T.green }}>{w.kcal}</b> cal · P {w.protein}g · F {w.fat}g</span>
            </div>
          ))}
        </div>
      )}

      {/* meals */}
      {MEALS.map(meal => {
        const rows = byMeal[meal];
        const mealCal = rows.reduce((s, f) => s + num(f.kcal), 0);
        return (
          <div key={meal} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{meal}{mealCal > 0 && <span style={{ fontSize: 12, color: T.sub, fontWeight: 500 }}> · {Math.round(mealCal)} cal</span>}</div>
              <button onClick={() => setAddMeal(meal)} style={{ background: T.mint, color: T.green, border: "none", borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>+ Add</button>
            </div>
            {!rows.length && <div style={{ fontSize: 13, color: T.sub }}>Nothing logged</div>}
            {rows.map(f => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `1px solid ${T.line}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>{f.recurringId ? "🔁 " : ""}{f.name}{f.grams ? <span style={{ color: T.sub, fontWeight: 400 }}> · {f.grams}g</span> : ""}</div>
                  <div style={{ fontSize: 11.5, color: T.sub }}>
                    <b style={{ color: T.ink }}>{f.kcal} cal</b>
                    {" · "}<span style={{ color: T.green }}>P {f.protein}</span>
                    {" · "}<span style={{ color: CARB_BLUE }}>C {f.carb}</span>
                    {" · "}<span style={{ color: FAT_ORANGE }}>F {f.fat}</span>
                  </div>
                </div>
                <button onClick={() => removeFood(f)} style={{ background: "none", border: "none", color: T.sub, fontSize: 15, padding: 4 }}>🗑</button>
              </div>
            ))}
          </div>
        );
      })}

      {/* recipes entry point */}
      <div className="card" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>🍲 Recipes</div>
          <div style={{ fontSize: 12, color: T.sub }}>{(data.recipes || []).length ? `${data.recipes.length} saved — add them from ⭐ Mine when logging` : "Build meals once, log them in one tap"}</div>
        </div>
        <button onClick={() => setShowRecipe(true)} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "7px 14px", fontSize: 13 }}>+ New</button>
      </div>

      {addMeal && <AddFoodModal meal={addMeal} date={sel} data={data} setData={setData} onSave={addFood} onClose={() => setAddMeal(null)} />}
      {showGoals && <GoalsModal data={data} goals={goals} onSave={saveGoals} onClose={() => setShowGoals(false)} />}
      {showRecipe && <RecipeModal data={data} setData={setData} onClose={() => setShowRecipe(false)} />}
    </div>
  );
}

/* ---------- group card: everyone's day, expandable per person ---------- */
export function GroupMacrosCard({ members, states, myId }) {
  const today = todayStr();
  const [open, setOpen] = useState({}); // user_id -> bool
  const rows = (members || []).map(m => {
    const s = states[m.user_id] || {};
    const t = dayTotals(s.foods, today);
    const goal = { ...DEFAULT_GOALS, ...(s.nutritionGoals || {}) };
    const water = (s.water || []).find(w => w.date === today)?.count || 0;
    const done = (s.dayDone || []).includes(today);
    const streak = dayStreak(s.dayDone);
    const foods = (s.foods || []).filter(f => f.date === today);
    return { id: m.user_id, name: m.username, mine: m.user_id === myId, t, goal, water, done, streak, foods };
  }).sort((a, b) => b.t.kcal - a.t.kcal);
  if (!rows.some(r => r.t.kcal > 0 || r.water > 0)) return null;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="h" style={{ fontSize: 17, color: T.tealDk, marginBottom: 8 }}>🥗 Today's nutrition</div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ borderTop: i ? `1px solid ${T.line}` : "none", padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13.5, color: r.mine ? T.green : T.ink, fontWeight: r.mine ? 700 : 600 }}>
              {r.name}{r.mine ? " (you)" : ""} {r.done && "✓"}{r.streak > 1 ? ` 🔥${r.streak}` : ""}
            </div>
            <div style={{ fontSize: 12.5, color: T.sub }}>
              <b style={{ color: r.t.kcal > r.goal.kcal ? T.down : T.ink }}>{Math.round(r.t.kcal)}</b>/{r.goal.kcal} cal · P{Math.round(r.t.protein)} {r.water > 0 && `· 💧${r.water}`}
            </div>
          </div>
          {r.foods.length > 0 && (
            <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} style={{ background: "none", border: "none", color: T.sub, fontSize: 11.5, padding: "2px 0" }}>
              {open[r.id] ? "hide ▴" : `show more (${r.foods.length} items) ▾`}
            </button>
          )}
          {open[r.id] && MEALS.map(meal => {
            const items = r.foods.filter(f => f.meal === meal);
            if (!items.length) return null;
            return (
              <div key={meal} style={{ marginLeft: 8, marginTop: 3 }}>
                <div style={{ fontSize: 11, color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" }}>{meal}</div>
                {items.map(f => (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.ink, padding: "2px 0" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{f.name}</span>
                    <span style={{ color: T.sub, flexShrink: 0 }}>{f.kcal} cal</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
