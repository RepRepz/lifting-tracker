import { useState, useMemo, useRef } from "react";
import { T } from "./LiftingTracker.jsx";

/* ---------- helpers ---------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

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

/* ---------- calorie ring (Cronometer-style, Robinhood colors) ---------- */
function CalorieRing({ eaten, goal }) {
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const r = 54, c = 2 * Math.PI * r;
  const over = eaten > goal;
  return (
    <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto" }}>
      <svg width={130} height={130} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={65} cy={65} r={r} stroke={T.line} strokeWidth={10} fill="none" />
        <circle cx={65} cy={65} r={r} stroke={over ? T.down : T.green} strokeWidth={10} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>{Math.round(eaten)}</div>
        <div style={{ fontSize: 11, color: T.sub }}>of {goal} kcal</div>
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

/* ---------- add food modal ---------- */
function AddFoodModal({ meal, date, onSave, onClose }) {
  const [mode, setMode] = useState("search"); // search | scan | manual
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState(null); // food with per100
  const [grams, setGrams] = useState(100);
  const [manual, setManual] = useState({ name: "", kcal: "", protein: "", carb: "", fat: "" });
  const [scanErr, setScanErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef(null); const streamRef = useRef(null);

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
    const m = scale(picked.per100, grams);
    onSave({ id: uid(), date, meal, name: picked.name, grams: num(grams), barcode: picked.barcode, ...m });
  };
  const confirmManual = () => {
    if (!manual.name.trim() || !manual.kcal) return;
    onSave({ id: uid(), date, meal, name: manual.name.trim(), grams: null,
      kcal: num(manual.kcal), protein: num(manual.protein), carb: num(manual.carb), fat: num(manual.fat), fiber: 0, sodium: 0 });
  };

  const close = () => { stopScan(); onClose(); };
  const tabBtn = (id, label) => (
    <button onClick={() => { stopScan(); setMode(id); setPicked(null); }} style={{
      flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13,
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

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {tabBtn("search", "🔍 Search")}{tabBtn("scan", "📷 Scan")}{tabBtn("manual", "✏️ Manual")}
        </div>

        {mode === "search" && !picked && (
          <>
            <form onSubmit={doSearch} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. chicken breast" />
              <button type="submit" style={{ background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, padding: "0 16px", border: "none" }}>Go</button>
            </form>
            {busy && <div style={{ color: T.sub, fontSize: 13 }}>Searching…</div>}
            {err && <div style={{ color: T.down, fontSize: 13 }}>{err}</div>}
            {results?.length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>No results — try a simpler term, or use Manual.</div>}
            {results?.map((f, i) => (
              <button key={i} onClick={() => setPicked(f)} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(f.per100.kcal)} kcal / 100g · P{Math.round(f.per100.protein)} C{Math.round(f.per100.carb)} F{Math.round(f.per100.fat)}</div>
              </button>
            ))}
          </>
        )}

        {mode === "scan" && !picked && (
          <div>
            {!scanning && <button onClick={startScan} style={{ width: "100%", background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, padding: "12px 0", border: "none", marginBottom: 10 }}>Start camera</button>}
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
              <button onClick={() => manualCode.trim() && lookupBarcode(manualCode.trim())} style={{ background: T.input, color: T.green, fontWeight: 700, borderRadius: 10, padding: "0 14px", border: `1px solid ${T.line}` }}>Look up</button>
            </div>
          </div>
        )}

        {picked && (mode === "search" || mode === "scan") && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 8 }}>{picked.name}</div>
            <label style={{ fontSize: 12, color: T.sub }}>Amount (grams)</label>
            <input type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>
              {(() => { const m = scale(picked.per100, grams); return `${m.kcal} kcal · P${m.protein} C${m.carb} F${m.fat}`; })()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPicked(null)} style={{ flex: 1, background: T.input, color: T.sub, borderRadius: 10, padding: "10px 0", border: `1px solid ${T.line}` }}>Back</button>
              <button onClick={confirmPicked} style={{ flex: 2, background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, padding: "10px 0", border: "none" }}>Add</button>
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
            <button onClick={confirmManual} disabled={!manual.name.trim() || !manual.kcal} style={{ width: "100%", background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, padding: "11px 0", border: "none", opacity: (!manual.name.trim() || !manual.kcal) ? .5 : 1 }}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalsModal({ goals, onSave, onClose }) {
  const [g, setG] = useState(goals);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, padding: 18, width: "90%", maxWidth: 380 }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk, marginBottom: 10 }}>🎯 Daily goals</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[["kcal", "Calories"], ["protein", "Protein (g)"], ["carb", "Carbs (g)"], ["fat", "Fat (g)"]].map(([k, l]) => (
            <div key={k}><label style={{ fontSize: 12, color: T.sub }}>{l}</label><input type="number" inputMode="numeric" value={g[k]} onChange={e => setG(s => ({ ...s, [k]: num(e.target.value) }))} /></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, background: T.input, color: T.sub, borderRadius: 10, padding: "10px 0", border: `1px solid ${T.line}` }}>Cancel</button>
          <button onClick={() => onSave(g)} style={{ flex: 1, background: T.green, color: "#000", fontWeight: 700, borderRadius: 10, padding: "10px 0", border: "none" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- main tab ---------- */
export function MacroTab({ data, setData }) {
  const [sel, setSel] = useState(todayStr());
  const [addMeal, setAddMeal] = useState(null);
  const [showGoals, setShowGoals] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const foods = data.foods || [];
  const goals = { ...DEFAULT_GOALS, ...(data.nutritionGoals || {}) };
  const totals = useMemo(() => dayTotals(foods, sel), [foods, sel]);
  const byMeal = useMemo(() => {
    const m = {}; for (const meal of MEALS) m[meal] = [];
    for (const f of foods) if (f.date === sel) (m[f.meal] ||= []).push(f);
    return m;
  }, [foods, sel]);

  const addFood = (f) => { setData(d => ({ ...d, foods: [...(d.foods || []), f] })); setAddMeal(null); };
  const removeFood = (id) => setData(d => ({ ...d, foods: (d.foods || []).filter(f => f.id !== id) }));
  const saveGoals = (g) => { setData(d => ({ ...d, nutritionGoals: g })); setShowGoals(false); };

  const shiftDay = (n) => { const dt = new Date(sel + "T00:00"); dt.setDate(dt.getDate() + n); setSel(dt.toISOString().slice(0, 10)); };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={() => shiftDay(-1)} style={{ background: T.input, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 12px" }}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{sel === todayStr() ? "Today" : sel}</div>
          </div>
          <button onClick={() => shiftDay(1)} style={{ background: T.input, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 12px" }}>›</button>
        </div>
        <CalorieRing eaten={totals.kcal} goal={goals.kcal} />
        <div style={{ marginTop: 16 }}>
          <MacroBar label="Protein" color={T.green} eaten={totals.protein} goal={goals.protein} />
          <MacroBar label="Carbs" color="#2E8CFF" eaten={totals.carb} goal={goals.carb} />
          <MacroBar label="Fat" color={T.down} eaten={totals.fat} goal={goals.fat} />
        </div>
        <button onClick={() => setShowGoals(true)} style={{ marginTop: 10, background: "none", border: "none", color: T.sub, fontSize: 12, textDecoration: "underline", padding: 0 }}>Edit goals</button>
        {(totals.fiber > 0 || totals.sodium > 0) && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setExpanded(x => !x)} style={{ background: "none", border: "none", color: T.sub, fontSize: 12, padding: 0 }}>{expanded ? "Hide" : "Show"} more nutrients ▾</button>
            {expanded && (
              <div style={{ fontSize: 12, color: T.sub, marginTop: 6 }}>
                Fiber: {Math.round(totals.fiber)}g · Sodium: {Math.round(totals.sodium)}mg
              </div>
            )}
          </div>
        )}
      </div>

      {MEALS.map(meal => (
        <div key={meal} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{meal}</div>
            <button onClick={() => setAddMeal(meal)} style={{ background: T.mint, color: T.green, border: "none", borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>+ Add</button>
          </div>
          {!byMeal[meal].length && <div style={{ fontSize: 13, color: T.sub }}>Nothing logged</div>}
          {byMeal[meal].map(f => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${T.line}` }}>
              <div>
                <div style={{ fontSize: 13.5, color: T.ink }}>{f.name}{f.grams ? ` · ${f.grams}g` : ""}</div>
                <div style={{ fontSize: 11.5, color: T.sub }}>{f.kcal} kcal · P{f.protein} C{f.carb} F{f.fat}</div>
              </div>
              <button onClick={() => removeFood(f.id)} style={{ background: "none", border: "none", color: T.sub, fontSize: 15, padding: 4 }}>🗑</button>
            </div>
          ))}
        </div>
      ))}

      {addMeal && <AddFoodModal meal={addMeal} date={sel} onSave={addFood} onClose={() => setAddMeal(null)} />}
      {showGoals && <GoalsModal goals={goals} onSave={saveGoals} onClose={() => setShowGoals(false)} />}
    </div>
  );
}

/* ---------- group card: today's macros for the group ---------- */
export function GroupMacrosCard({ members, states, myId }) {
  const today = todayStr();
  const rows = (members || []).map(m => {
    const t = dayTotals(states[m.user_id]?.foods, today);
    const goal = { ...DEFAULT_GOALS, ...(states[m.user_id]?.nutritionGoals || {}) };
    return { name: m.username, mine: m.user_id === myId, kcal: t.kcal, protein: t.protein, goal: goal.kcal };
  }).sort((a, b) => b.kcal - a.kcal);
  if (!rows.some(r => r.kcal > 0)) return null;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="h" style={{ fontSize: 17, color: T.tealDk, marginBottom: 8 }}>🥗 Today's macros</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
          <div style={{ fontSize: 13.5, color: r.mine ? T.green : T.ink, fontWeight: r.mine ? 700 : 500 }}>{r.name}{r.mine ? " (you)" : ""}</div>
          <div style={{ fontSize: 12.5, color: T.sub }}>{Math.round(r.kcal)} / {r.goal} kcal · P{Math.round(r.protein)}g</div>
        </div>
      ))}
    </div>
  );
}
