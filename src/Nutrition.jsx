import { useState, useEffect, useMemo, useRef } from "react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import { T } from "./theme.js";

/* ---------- helpers ---------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const mondayOf = (dateStr) => { const d = new Date(dateStr + "T00:00"); const dow = (d.getDay() + 6) % 7; return addDays(dateStr, -dow); };

/* Open Food Facts — free, no API key. Search by name or fetch by barcode.
   Uses the newer Search-a-licious engine sorted by scan popularity, which returns far
   more relevant results than the classic search; falls back to the old endpoint. */
async function offSearch(q) {
  try {
    const r = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&sort_by=-unique_scans_n`);
    if (!r.ok) throw new Error("sal failed");
    const j = await r.json();
    const out = (j.hits || []).filter(p => p.product_name && p.nutriments).map(offToFood);
    if (out.length) return rankResults(out, q);
  } catch {}
  const r2 = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&sort_by=unique_scans_n`);
  if (!r2.ok) throw new Error("search failed");
  const j2 = await r2.json();
  return rankResults((j2.products || []).filter(p => p.product_name && p.nutriments).map(offToFood), q);
}
/* USDA FoodData Central — generic whole foods (banana, chicken breast…) that the
   barcode database is weak on. DEMO_KEY is rate-limited but fine at family scale;
   failures are silently ignored so it can only ever ADD results. */
async function usdaSearch(q) {
  const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(q)}&pageSize=8&dataType=Foundation,SR%20Legacy`);
  if (!r.ok) throw new Error("usda failed");
  const j = await r.json();
  const get = (f, id) => num(f.foodNutrients?.find(n => n.nutrientId === id)?.value);
  return (j.foods || []).map(f => ({
    name: f.description.charAt(0) + f.description.slice(1).toLowerCase(),
    src: "USDA",
    per100: { kcal: get(f, 1008), protein: get(f, 1003), carb: get(f, 1005), fat: get(f, 1004), fiber: get(f, 1079), sodium: get(f, 1093) },
    barcode: "",
  })).filter(f => f.per100.kcal > 0);
}

/* both databases at once — whichever answers contributes; only fails if BOTH fail */
async function searchAll(q) {
  const [usda, off] = await Promise.allSettled([usdaSearch(q), offSearch(q)]);
  // junk filter: no zero-calorie ghosts, no essay-length names, name must actually
  // contain what was typed; barcode DB capped so it can't drown the good stuff
  const s = q.toLowerCase();
  const clean = (list) => (list || []).filter(f =>
    f.per100.kcal >= 5 && f.name.length <= 60 && f.name.toLowerCase().includes(s.split(" ")[0]));
  const list = [...clean(usda.value), ...clean(off.value).slice(0, 6)];
  if (!list.length && usda.status === "rejected" && off.status === "rejected") throw new Error("all failed");
  const seen = new Set();
  return rankResults(list.filter(f => { const k = f.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }), q);
}

/* relevance: exact name, then starts-with, then whole-word match, then the rest —
   USDA (lab-verified whole foods) wins every tie */
function rankResults(list, q) {
  const s = q.toLowerCase().trim();
  const score = (f) => {
    const n = f.name.toLowerCase().replace(/ \(.*\)$/, "");
    let base;
    if (n === s) base = 0;
    else if (n.startsWith(s)) base = 1;
    else if (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n)) base = 2;
    else if (n.includes(s)) base = 3;
    else base = 4;
    return base + (f.src === "USDA" ? 0 : 0.5);
  };
  return [...list].sort((a, b) => score(a) - score(b));
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
const NCAL_VIEWS = { "1M": 5, "3M": 13, "6M": 26, "1Y": 52 }; // label -> weeks shown
const CARB_BLUE = "#2E8CFF";
const FAT_ORANGE = "#FFB300";

/* ---------- shared bits ---------- */
/* Open 270° gauge with the calories-LEFT number reading inside it — the value people
   actually decide with. No stray percentage. */
function CalorieRing({ eaten, goal, size = 150 }) {
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const over = eaten > goal;
  const r = size * 0.40, mid = size / 2, sw = size * 0.08;
  const sweep = 270, startA = 135; // gap at the bottom
  const arc = (deg) => {
    const a = ((startA + deg) % 360) * Math.PI / 180;
    return [mid + r * Math.cos(a), mid + r * Math.sin(a)];
  };
  const path = (deg) => {
    if (deg <= 0) return "";
    const [x0, y0] = arc(0), [x1, y1] = arc(Math.min(deg, sweep));
    return `M ${x0} ${y0} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const left = Math.round(goal - eaten);
  const gid = useRef("g" + Math.random().toString(36).slice(2)).current;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={over ? "#FF5000" : "#007A03"} />
            <stop offset="100%" stopColor={over ? "#FF8A50" : "#00E606"} />
          </linearGradient>
          <filter id={gid + "f"} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={sw * 0.4} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={path(sweep)} stroke={T.line} strokeWidth={sw} fill="none" strokeLinecap="round" />
        <path d={path(pct * sweep)} stroke={`url(#${gid})`} strokeWidth={sw} fill="none" strokeLinecap="round"
          filter={`url(#${gid}f)`} style={{ transition: "d .5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: size * 0.24, fontWeight: 800, color: over ? T.down : T.ink, lineHeight: 1 }}>{Math.abs(left).toLocaleString()}</div>
        <div style={{ fontSize: size * 0.088, color: T.sub, marginTop: 3, fontWeight: 600 }}>{over ? "cal over" : "cal left"}</div>
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
  
  const videoRef = useRef(null); const streamRef = useRef(null);

  const customFoods = data.customFoods || [];
  const recipes = data.recipes || [];
  // most-logged foods over the last 2 weeks, ready to re-add in one tap
  const commonFoods = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const cutKey = cutoff.toISOString().slice(0, 10);
    const byName = {};
    for (const f of (data.foods || [])) {
      if (f.date < cutKey) continue;
      const e = (byName[f.name] ||= { n: 0, last: f });
      e.n++;
      if (f.date >= e.last.date) e.last = f;
    }
    return Object.values(byName).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [data.foods]);

  // foods logged in THIS meal over the last 2 weeks, ranked by how often you logged them
  // (most popular first), so re-adding your usual for this time of day is one tap
  const mealRecents = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const cutKey = cutoff.toISOString().slice(0, 10);
    const byName = {};
    for (const f of (data.foods || [])) {
      if (f.date < cutKey) continue;
      if (meal !== "Uncategorized" && f.meal !== meal) continue;
      const e = (byName[f.name] ||= { n: 0, last: f });
      e.n++;
      if (f.date >= e.last.date) e.last = f;
    }
    return Object.values(byName)
      .sort((a, b) => b.n - a.n || b.last.date.localeCompare(a.last.date))
      .map(e => ({ ...e.last, _n: e.n }))
      .slice(0, 15);
  }, [data.foods, meal]);
  const quickPick = (f) => setPicked({ name: f.name, fixed: { kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat, fiber: f.fiber || 0, sodium: f.sodium || 0 } });

  // live search: suggestions appear as you type (or backspace), no button needed.
  // Old results stay on screen while new ones load; a failed attempt retries itself
  // once before showing any error, and stale responses are discarded.
  const reqId = useRef(0);
  useEffect(() => {
    if (mode !== "search") return;
    const s = q.trim();
    if (s.length < 2) { setResults(null); setErr(""); setBusy(false); return; }
    setBusy(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      let r = null;
      try { r = await searchAll(s); }
      catch { try { r = await searchAll(s); } catch {} } // auto-retry once
      if (reqId.current !== id) return; // user kept typing — this answer is stale
      if (r) { setResults(r); setErr(""); }
      else setErr("Couldn't reach the food databases — still trying as you type.");
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode]);

  const lookupBarcode = async (code) => {
    setBusy(true); setScanErr("");
    try {
      const f = await offBarcode(code);
      if (!f) setScanErr("No product found for that barcode — try Search instead.");
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
      catch { setScanErr("Couldn't load the scanner — check your connection, or use Search instead."); return; }
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
    } catch { setScanErr("Couldn't access the camera — check permissions, or use Search instead."); }
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
      flex: 1, padding: "9px 2px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 11.5, lineHeight: 1.3,
      background: mode === id ? T.green : T.input, color: mode === id ? "#000" : T.sub,
    }}>{label}</button>
  );

  return (
    <div className="nt-overlay" onClick={close}>
      <div className="nt-modal nt-full" onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: "16px 16px 0 0", padding: 18, width: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>{meal === "Uncategorized" ? "🍎 Add food" : `Add to ${meal}`}</div>
          <button onClick={close} style={{ background: "none", border: "none", color: T.sub, fontSize: 20, padding: 4 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {tabBtn("search", "🔍 Search")}{tabBtn("recents", "🕑 Recents")}{tabBtn("mine", "⭐ Favorites")}{tabBtn("scan", "📷 Camera")}{tabBtn("manual", "✏️ Manual")}
        </div>

        {mode === "recents" && !picked && (
          <div>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>Your {meal === "Uncategorized" ? "" : `${meal.toLowerCase()} `}foods from the last 2 weeks — most logged first.</div>
            {!mealRecents.length && <div style={{ color: T.sub, fontSize: 13 }}>Nothing logged {meal === "Uncategorized" ? "" : `for ${meal.toLowerCase()} `}in the last 2 weeks yet.</div>}
            {mealRecents.map((f, i) => (
              <button key={i} onClick={() => quickPick(f)} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.name}{f.grams ? <span style={{ color: T.sub, fontWeight: 400 }}> · {f.grams}g</span> : ""}{f._n > 1 && <span style={{ fontSize: 11, color: T.green, fontWeight: 700, marginLeft: 6 }}>×{f._n}</span>}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{f.kcal} cal · {Math.round(f.protein)}g protein · {Math.round(f.carb)}g carbs · {Math.round(f.fat)}g fat</div>
              </button>
            ))}
          </div>
        )}

        {mode === "search" && !picked && (
          <>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Start typing… e.g. chicken breast" style={{ marginBottom: 10 }} />
            {busy && <div style={{ color: T.sub, fontSize: 13, marginBottom: 6 }}>Searching…</div>}
            {err && <div style={{ color: T.down, fontSize: 13 }}>{err}</div>}
            {results?.length === 0 && !busy && <div style={{ color: T.sub, fontSize: 13 }}>No results — try a simpler term, or use Manual.</div>}
            {results?.map((f, i) => (
              <button key={i} onClick={() => setPicked(f)} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.name}{f.src === "USDA" && <span style={{ fontSize: 10, color: T.green, background: T.mint, borderRadius: 6, padding: "1px 6px", marginLeft: 6, fontWeight: 700, verticalAlign: "middle" }}>USDA</span>}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(f.per100.kcal)} cal / 100g · {Math.round(f.per100.protein)}g protein · {Math.round(f.per100.carb)}g carbs · {Math.round(f.per100.fat)}g fat</div>
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
          </div>
        )}

        {mode === "mine" && !picked && (
          <div>
            {commonFoods.length > 0 && (<>
              <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>🕑 Common — last 2 weeks</div>
              {commonFoods.map((c, i) => (
                <button key={i} onClick={() => setPicked({ name: c.last.name, fixed: { kcal: c.last.kcal, protein: c.last.protein, carb: c.last.carb, fat: c.last.fat, fiber: c.last.fiber || 0, sodium: c.last.sodium || 0 } })}
                  style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{c.last.name} <span style={{ fontSize: 11, color: T.sub, fontWeight: 500 }}>×{c.n}</span></div>
                  <div style={{ fontSize: 12, color: T.sub }}>{c.last.kcal} cal · {Math.round(c.last.protein)}g protein · {Math.round(c.last.carb)}g carbs · {Math.round(c.last.fat)}g fat</div>
                </button>
              ))}
              {(customFoods.length > 0 || recipes.length > 0) && <div style={{ fontSize: 11.5, color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", margin: "10px 0 6px" }}>⭐ Favorites & recipes</div>}
            </>)}
            {!customFoods.length && !recipes.length && !commonFoods.length && (
              <div style={{ color: T.sub, fontSize: 13, marginBottom: 8 }}>
                Nothing saved yet. Favorite foods with the checkbox in ✏️ Manual, or build recipes in the 🍲 Recipes card on the Macros tab.
              </div>
            )}
            {recipes.map(r => (
              <button key={r.id} onClick={() => setPicked({ name: r.name, fixed: r.perServing })} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>🍲 {r.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(r.perServing.kcal)} cal / serving · {Math.round(r.perServing.protein)}g protein · {Math.round(r.perServing.carb)}g carbs · {Math.round(r.perServing.fat)}g fat</div>
              </button>
            ))}
            {customFoods.map(f => (
              <button key={f.id} onClick={() => setPicked({ name: f.name, fixed: f.fixed })} style={{ display: "block", width: "100%", textAlign: "left", background: T.input, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{f.recurring ? "🔁 " : "⭐ "}{f.name}</div>
                <div style={{ fontSize: 12, color: T.sub }}>{Math.round(f.fixed.kcal)} cal · {Math.round(f.fixed.protein)}g protein · {Math.round(f.fixed.carb)}g carbs · {Math.round(f.fixed.fat)}g fat</div>
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
                {(() => { const m = scale(picked.per100, grams); return `${m.kcal} cal · ${m.protein}g protein · ${m.carb}g carbs · ${m.fat}g fat`; })()}
              </div>
            </>) : (<>
              <label style={{ fontSize: 12, color: T.sub }}>Servings</label>
              <input type="number" inputMode="decimal" value={servings} onChange={e => setServings(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>
                {Math.round(picked.fixed.kcal * num(servings, 1))} cal · {+(picked.fixed.protein * num(servings, 1)).toFixed(1)}g protein · {+(picked.fixed.carb * num(servings, 1)).toFixed(1)}g carbs · {+(picked.fixed.fat * num(servings, 1)).toFixed(1)}g fat
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
              ⭐ Save to Favorites for next time
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

/* ---------- edit a logged food (name, amount label, macros) ---------- */
function EditFoodModal({ food, onSave, onClose }) {
  const [f, setF] = useState({
    name: food.name, grams: food.grams ?? "",
    kcal: food.kcal, protein: food.protein, carb: food.carb, fat: food.fat,
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = () => {
    if (!f.name.trim()) return;
    onSave({ name: f.name.trim(), grams: f.grams === "" ? null : num(f.grams),
      kcal: num(f.kcal), protein: num(f.protein), carb: num(f.carb), fat: num(f.fat) });
  };
  return (
    <div className="nt-overlay" onClick={onClose}>
      <div className="nt-modal" onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, padding: 18, width: "92%", maxWidth: 400 }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk, marginBottom: 10 }}>✏️ Edit food</div>
        <label style={{ fontSize: 12, color: T.sub }}>Name</label>
        <input value={f.name} onChange={e => set("name", e.target.value)} style={{ marginBottom: 8 }} />
        <label style={{ fontSize: 12, color: T.sub }}>Amount (grams, optional)</label>
        <input type="number" inputMode="decimal" value={f.grams} onChange={e => set("grams", e.target.value)} placeholder="e.g. 200" style={{ marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[["kcal", "Calories"], ["protein", "Protein (g)"], ["carb", "Carbs (g)"], ["fat", "Fat (g)"]].map(([k, l]) => (
            <div key={k}><label style={{ fontSize: 12, color: T.sub }}>{l}</label>
              <input type="number" inputMode="decimal" value={f[k]} onChange={e => set(k, e.target.value)} /></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btnGhost, flex: 1, padding: "10px 0" }}>Cancel</button>
          <button onClick={save} disabled={!f.name.trim()} style={{ ...btnGreen, flex: 1, padding: "10px 0", opacity: f.name.trim() ? 1 : .5 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- goals: full TDEE calculator (Mifflin-St Jeor) ---------- */
function GoalsModal({ data, setData, goals, onSave, onClose, firstTime }) {
  const heightIn = data.profile?.heightIn || null;
  const latestBW = useMemo(() => {
    const rows = [...(data.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length - 1].weight : null;
  }, [data.bodyweight]);
  const saved = goals.calc || {};
  const [calc, setCalc] = useState({ age: saved.age || "", sex: saved.sex || "male", activity: saved.activity || "1.375", plan: saved.plan || "maintain" });
  const [g, setG] = useState(goals);
  const [mode, setMode] = useState("calc"); // calc | manual
  const [goalW, setGoalW] = useState(data.profile?.goalWeight ? Math.round(data.profile.goalWeight) : "");
  // suggest a plan from the gap between goal weight and current weight
  const suggestedPlan = (goalW && latestBW) ? (num(goalW) < latestBW - 3 ? "cut" : num(goalW) > latestBW + 3 ? "bulk" : "maintain") : null;

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
  // no Calculate button needed — targets refresh the moment anything changes
  useEffect(() => { if (mode === "calc" && canCalc) compute(); }, [calc, mode, heightIn, latestBW]);

  return (
    <div className="nt-overlay" onClick={onClose} style={{ alignItems: "center" }}>
      <div className="nt-modal" onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, padding: 18, width: "92%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk, marginBottom: 4 }}>🎯 {firstTime ? "Welcome — set your goals" : "Nutrition goals"}</div>
        {firstTime && <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 10 }}>Quick one-time setup so your rings mean something. You can change all of this later.</div>}

        {/* goal weight — shared with the Body tab */}
        <label style={{ fontSize: 12, color: T.sub }}>Goal weight (lb) — synced with the Body tab</label>
        <input type="number" inputMode="numeric" value={goalW} placeholder={latestBW ? `current: ${Math.round(latestBW)} lb` : "e.g. 185"}
          onChange={e => setGoalW(e.target.value)} style={{ marginBottom: 6 }} />
        {suggestedPlan && suggestedPlan !== calc.plan && (
          <button onClick={() => setCalc(c => ({ ...c, plan: suggestedPlan }))} style={{ background: T.mint, border: "none", color: T.green, fontSize: 12, fontWeight: 700, borderRadius: 8, padding: "5px 10px", marginBottom: 8 }}>
            💡 That's {Math.abs(Math.round(num(goalW) - latestBW))} lb {num(goalW) < latestBW ? "down" : "up"} — we'd suggest {suggestedPlan === "cut" ? "✂️ Cut" : suggestedPlan === "bulk" ? "📈 Bulk" : "⚖️ Maintain"}. Tap to use it.
          </button>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 12, marginTop: 4 }}>
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
          {!canCalc && <div style={{ fontSize: 12, color: T.down, marginBottom: 8 }}>
            To calculate automatically we need {!heightIn && "your height (Body tab)"}{!heightIn && (!latestBW || !num(calc.age)) && ", "}{!latestBW && "a weigh-in (Body tab)"}{!latestBW && !num(calc.age) && ", "}{!num(calc.age) && "your age (above)"}. Or switch to “Enter manually.”
          </div>}
        </>)}

        {mode === "manual" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[["kcal", "Calories"], ["protein", "Protein (g)"], ["carb", "Carbs (g)"], ["fat", "Fat (g)"]].map(([k, l]) => (
              <div key={k}><label style={{ fontSize: 12, color: T.sub }}>{l}</label><input type="number" inputMode="numeric" value={g[k] === 0 || g[k] === undefined ? "" : g[k]} placeholder="0" onChange={e => setG(s => ({ ...s, [k]: e.target.value }))} /></div>
            ))}
          </div>
        )}

        {/* plain-English daily targets */}
        <div style={{ fontSize: 11.5, color: T.sub, marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>Your daily targets</div>
        <div style={{ fontSize: 11.5, color: mode === "calc" && canCalc ? T.green : T.sub, marginBottom: 6 }}>
          {mode === "calc"
            ? (canCalc ? "✓ calculated live — changing anything above updates these instantly" : "showing your current numbers — fill in the missing info above to auto-calculate")
            : "using the numbers you typed above"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            ["Calories", num(g.kcal) ? num(g.kcal).toLocaleString() : "—", "energy for the day", T.ink],
            ["Protein", num(g.protein) ? `${num(g.protein)}g` : "—", "builds muscle", T.green],
            ["Carbs", num(g.carb) ? `${num(g.carb)}g` : "—", "fuels workouts", CARB_BLUE],
            ["Fat", num(g.fat) ? `${num(g.fat)}g` : "—", "hormones & health", FAT_ORANGE],
          ].map(([label, v, hint, color]) => (
            <div key={label} style={{ background: T.input, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11.5, color: T.sub, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: "inline-block" }} />{label}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, margin: "2px 0" }}>{v}</div>
              <div style={{ fontSize: 10.5, color: T.sub }}>{hint}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!firstTime && <button onClick={onClose} style={{ ...btnGhost, flex: 1, padding: "10px 0" }}>Cancel</button>}
          <button onClick={() => {
            if (goalW && setData) setData(d => ({ ...d, profile: { ...(d.profile || {}), goalWeight: num(goalW), goalStartWeight: d.profile?.goalWeight ? d.profile?.goalStartWeight : latestBW, goalSetDate: d.profile?.goalSetDate || todayStr() } }));
            onSave({ ...g, kcal: num(g.kcal), protein: num(g.protein), carb: num(g.carb), fat: num(g.fat), set: true });
          }} style={{ ...btnGreen, flex: 2, padding: "10px 0" }}>{firstTime ? "Start tracking →" : "Save goals"}</button>
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
    <div className="nt-overlay" onClick={onClose}>
      <div className="nt-modal" onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
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
          Total: <b style={{ color: T.green }}>{Math.round(tot.kcal)} cal</b> · {Math.round(tot.protein)}g protein · {Math.round(tot.carb)}g carbs · {Math.round(tot.fat)}g fat
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
    <div className="card" style={{ marginBottom: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 13.5, color: T.sub }}>⏳ Intermittent fasting</div>
      <button className="nt-press" onClick={() => save({ enabled: true, protocol: "16:8", eatStart: "12:00" })} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "6px 13px", fontSize: 12.5 }}>Turn on</button>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: st?.fasting ? T.green : T.ink, fontWeight: 700, minWidth: 0 }}>{st?.label} <span style={{ color: T.sub, fontWeight: 500, fontSize: 11.5 }}>({f.protocol !== "custom" ? (f.protocol || "16:8") : "custom"})</span></div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!f.adHoc
            ? <button className="nt-press" onClick={() => save({ adHoc: new Date().toISOString() })} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "6px 11px", fontSize: 12.5 }}>▶ Fast now</button>
            : <button className="nt-press" onClick={() => save({ adHoc: null })} style={{ ...btnGreen, padding: "6px 11px", fontSize: 12.5 }}>■ End</button>}
          <button className="nt-press" onClick={() => setEditing(e => !e)} style={{ background: "none", border: "none", color: T.sub, fontSize: 13 }}>{editing ? "Done" : "⚙️"}</button>
        </div>
      </div>
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
const WATER_UNITS = { oz: { label: "oz", dec: 0 }, L: { label: "L", dec: 2 }, gal: { label: "gal", dec: 2 } };
function WaterCard({ data, setData, date }) {
  const prefs = { cupOz: 8, goal: 8, unit: "oz", ...(data.waterPrefs || {}) };
  const u = WATER_UNITS[prefs.unit] || WATER_UNITS.oz;
  const cupSize = num(prefs.cupOz, 8), goalCups = Math.max(1, num(prefs.goal, 8));
  const fmtAmt = (cups) => `${(cups * cupSize).toFixed(u.dec).replace(/\.00$/, "")} ${u.label}`;
  const entry = (data.water || []).find(w => w.date === date);
  const count = entry?.count || 0;
  const [editing, setEditing] = useState(false);
  const setCount = (n) => setData(d => {
    const rest = (d.water || []).filter(w => w.date !== date);
    return { ...d, water: n > 0 ? [...rest, { date, count: n }] : rest };
  });
  const pct = Math.min(1, count / goalCups);
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>💧 <span style={{ color: "#4FC3F7" }}>{count}</span><span style={{ fontSize: 12, color: T.sub, fontWeight: 500 }}> / {goalCups} cups · {fmtAmt(count)}</span></span>
        </div>
        <button className="nt-press" onClick={() => setCount(Math.max(0, count - 1))} style={{ ...btnGhost, width: 34, height: 34, fontSize: 17, fontWeight: 700 }}>−</button>
        <button className="nt-press" onClick={() => setCount(count + 1)} style={{ background: "#4FC3F7", color: "#000", width: 34, height: 34, fontSize: 17, fontWeight: 700, border: "none", borderRadius: 10 }}>+</button>
        <button className="nt-press" onClick={() => setEditing(e => !e)} style={{ background: "none", border: "none", color: T.sub, fontSize: 13, padding: 2 }}>{editing ? "Done" : "⚙️"}</button>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: T.input, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: "#4FC3F7", borderRadius: 4, transition: "width .3s ease" }} />
      </div>
      {editing && (
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: T.sub }}>Measure water in</label>
          <div style={{ display: "flex", gap: 6, margin: "4px 0 8px" }}>
            {[["oz", "Ounces"], ["L", "Liters"], ["gal", "Gallons"]].map(([id, l]) => (
              <button key={id} className="nt-press" onClick={() => setData(d => ({ ...d, waterPrefs: { ...prefs, unit: id, cupOz: id === "oz" ? 8 : id === "L" ? 0.25 : 0.0625 } }))} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5,
                border: `1px solid ${prefs.unit === id ? T.green : T.line}`,
                background: prefs.unit === id ? T.mint : T.input, color: prefs.unit === id ? T.green : T.sub,
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 12, color: T.sub }}>Cup size ({u.label})</label>
              <input type="number" inputMode="decimal" value={prefs.cupOz} onChange={e => setData(d => ({ ...d, waterPrefs: { ...prefs, cupOz: e.target.value } }))} /></div>
            <div><label style={{ fontSize: 12, color: T.sub }}>Daily goal (cups)</label>
              <input type="number" inputMode="numeric" value={prefs.goal} onChange={e => setData(d => ({ ...d, waterPrefs: { ...prefs, goal: e.target.value } }))} /></div>
          </div>
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
const fmtShort = (d) => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const NT_CSS = `
@keyframes ntUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes ntSlide { from { transform:translateY(40px); opacity:.4; } to { transform:none; opacity:1; } }
.nt-card { animation: ntUp .35s ease both; }
.nt-modal { animation: ntSlide .28s cubic-bezier(.2,.8,.3,1) both; }
.nt-press { transition: transform .12s ease, opacity .12s ease; }
.nt-press:active { transform: scale(.94); }
/* bottom sheet on phones, centered dialog on desktop */
.nt-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:200; display:flex; align-items:flex-end; justify-content:center; }
@media (min-width:700px) {
  .nt-overlay { align-items:center; }
  .nt-overlay .nt-modal { border-radius:16px !important; max-height:80vh !important; }
}
/* add-food: full screen on phones, big centered dialog (background peeking) on desktop */
.nt-full { height:100dvh; max-height:100dvh !important; border-radius:0 !important; padding-top:calc(14px + env(safe-area-inset-top)) !important; }
@media (min-width:700px) {
  .nt-overlay .nt-full { width:min(520px, 90vw); height:auto; min-height:340px; max-height:78vh !important; border-radius:16px !important; padding-top:18px !important; }
}
.nt-cal-grid { max-width:420px; margin:0 auto; }
/* phones: one comfortable centered column. desktop: two columns so much more fits at once */
.nt-col { max-width:620px; margin:0 auto; }
.nt-left, .nt-right { min-width:0; }
@media (min-width:1000px) {
  .nt-col { max-width:1200px; }
  .nt-grid { display:grid; grid-template-columns:minmax(0,1.02fr) minmax(0,0.98fr); gap:16px; align-items:start; }
}
/* summary hero: stacked+centered on phones, gauge beside macros on wider screens */
.nt-summary-top { display:flex; flex-direction:column; align-items:center; gap:16px; }
.nt-summary-top > svg, .nt-summary-top > div:first-child { margin:0 auto; }
.nt-macro-stats { width:100%; max-width:340px; }
@media (min-width:560px) {
  .nt-summary-top { flex-direction:row; align-items:center; gap:28px; }
  .nt-macro-stats { flex:1; max-width:none; }
}
`;
const NTStyle = () => <style>{NT_CSS}</style>;

/* One food row in the diary — the WHOLE row is the drag handle:
   - press-and-drag anywhere on it (a brief hold on touch) to move it to another meal
   - the ⋯ button (or right-click) opens a menu with edit/move/copy/duplicate/delete
   Text selection is disabled so dragging on mobile never highlights the label.
   Kept at module scope so it isn't remounted every render (which would kill drags). */
function DiaryRow({ f, onDelete, onMenu }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: f.id });
  const noSelect = { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" };
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onContextMenu={(e) => { e.preventDefault(); onMenu(f, e.clientX, e.clientY); }}
      style={{ position: "relative", background: "#17191B", border: `1px solid ${isDragging ? T.green : "#22262A"}`, borderRadius: 12,
        marginTop: 7, padding: "10px 10px 10px 9px", display: "flex", alignItems: "center", gap: 8,
        // move the real row with the finger from where it was grabbed (no floating clone that
        // mis-anchors on iOS); lift it above the other cards while dragging
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 9999 : "auto",
        boxShadow: isDragging ? "0 14px 34px rgba(0,0,0,.6)" : "none",
        transition: isDragging ? "none" : "box-shadow .15s ease, border-color .15s ease",
        opacity: 1, cursor: "grab", touchAction: "manipulation", outline: "none", ...noSelect }}>
      <span style={{ color: "#4A4E52", fontSize: 15, lineHeight: 1, flexShrink: 0, ...noSelect }}>⠿</span>
      <div style={{ minWidth: 0, flex: 1, ...noSelect }}>
        <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.recurringId ? "🔁 " : ""}{f.name}{f.grams ? <span style={{ color: T.sub, fontWeight: 400 }}> · {f.grams}g</span> : ""}</div>
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: T.ink, fontWeight: 700 }}>{f.kcal} cal</span>
          <span><MacroDot c={T.green} />{f.protein}</span>
          <span><MacroDot c={CARB_BLUE} />{f.carb}</span>
          <span><MacroDot c={FAT_ORANGE} />{f.fat}</span>
        </div>
      </div>
      <button className="nt-press" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onMenu(f, e.clientX, e.clientY); }} title="More"
        style={{ background: "none", border: "none", color: T.sub, fontSize: 20, padding: "4px 8px", flexShrink: 0, lineHeight: 1, ...noSelect }}>⋯</button>
    </div>
  );
}
const MEAL_ICON = { Uncategorized: "🗂", Breakfast: "🍳", Lunch: "🥗", Dinner: "🍽️", Snacks: "🍎" };
const MacroDot = ({ c }) => <span style={{ width: 6, height: 6, borderRadius: 99, background: c, display: "inline-block", marginRight: 4, verticalAlign: "middle" }} />;

function MenuItem({ label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
      color: danger ? T.danger : T.ink, fontSize: 13.5, fontWeight: 600, padding: "9px 10px", borderRadius: 7 }}
      onMouseEnter={e => e.currentTarget.style.background = T.input}
      onMouseLeave={e => e.currentTarget.style.background = "none"}>{label}</button>
  );
}

/* Each meal is its own elevated card that food can be dropped into. */
function MealDrop({ meal, children, header, empty }) {
  const { setNodeRef, isOver } = useDroppable({ id: `meal:${meal}` });
  return (
    <div ref={setNodeRef} className="card nt-card" style={{ marginBottom: 8, padding: "12px 14px",
      background: isOver ? "rgba(0,200,5,.09)" : T.card, borderColor: isOver ? T.green : undefined,
      transition: "background .15s ease, border-color .15s ease" }}>
      {header}
      {children}
      {empty && (
        <div style={{ marginTop: 8, border: `1.5px dashed ${isOver ? T.green : "#22262A"}`, borderRadius: 12,
          height: 42, transition: "border-color .15s ease" }} />
      )}
    </div>
  );
}
export function MacroTab({ data, setData, streaksOn = true, waterOn = true }) {
  const [sel, setSel] = useState(todayStr());
  const [addMeal, setAddMeal] = useState(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(null);      // { f, x, y } right-click / ⋯ menu
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    // defer one tick: otherwise the very click that opened the menu closes it again,
    // because React attaches this listener synchronously before the click finishes bubbling
    const id = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => { clearTimeout(id); window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);
  // mouse drags immediately on desktop; touch needs a brief hold (so the page can still
  // scroll and taps still work), and it won't select/highlight the text under your finger
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  // keep a dragged food inside the meals region (never over the calendar etc.) and moving
  // only up/down — a dnd-kit modifier that clamps the live transform each move
  const diaryRef = useRef(null);
  const restrictToDiary = ({ transform, draggingNodeRect }) => {
    if (!draggingNodeRect || !diaryRef.current) return { ...transform, x: 0 };
    const c = diaryRef.current.getBoundingClientRect();
    const minY = c.top - draggingNodeRect.top;
    const maxY = c.bottom - draggingNodeRect.bottom;
    return { ...transform, x: 0, y: Math.max(minY, Math.min(maxY, transform.y)) };
  };
  const foods = data.foods || [];
  const goals = { ...DEFAULT_GOALS, ...(data.nutritionGoals || {}) };
  const firstTime = !data.nutritionGoals?.set;
  useEffect(() => { if (firstTime) setShowGoals(true); }, []); // one-time goal setup before tracking
  const totals = useMemo(() => dayTotals(foods, sel), [foods, sel]);
  const byMeal = useMemo(() => {
    const m = { Uncategorized: [] }; for (const meal of MEALS) m[meal] = [];
    for (const f of foods) if (f.date === sel) (m[f.meal] || m.Uncategorized).push(f);
    return m;
  }, [foods, sel]);
  const moveFood = (id, meal) => setData(d => ({ ...d, foods: (d.foods || []).map(f => f.id === id ? { ...f, meal } : f) }));
  const onDragEnd = ({ active, over }) => {
    if (over && String(over.id).startsWith("meal:")) moveFood(active.id, String(over.id).slice(5));
  };
  const copyFood = (f, date) => setData(d => ({ ...d, foods: [...(d.foods || []), { ...f, id: uid(), date, recurringId: undefined }] }));
  const [editFood, setEditFood] = useState(null); // food being edited
  const updateFood = (patch) => { setData(d => ({ ...d, foods: (d.foods || []).map(f => f.id === editFood.id ? { ...f, ...patch } : f) })); setEditFood(null); };

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

  // make a food auto-log every day going forward (uses the recurring-foods system)
  const makeRecurring = (f) => {
    const cf = { id: uid(), name: f.name, meal: f.meal, recurring: true,
      fixed: { kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat, fiber: f.fiber || 0, sodium: f.sodium || 0 } };
    setData(d => ({ ...d,
      customFoods: [...(d.customFoods || []), cf],
      // tag this occurrence so the auto-logger doesn't add a duplicate for its day
      foods: (d.foods || []).map(x => x.id === f.id ? { ...x, recurringId: cf.id } : x),
    }));
  };
  // stop the daily repeat: removes it from today forward, keeps every previous day's entry
  const stopRecurring = (f) => setData(d => ({ ...d,
    customFoods: (d.customFoods || []).filter(c => c.id !== f.recurringId),
    foods: (d.foods || []).filter(x => x.id !== f.id),
    recurringSkips: [...(d.recurringSkips || []), `${f.date}:${f.recurringId}`],
  }));

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
    <div className="nt-col">
      <style>{NT_CSS}</style>
      {/* slim header: add-food top left, small date picker + finish-check top right */}
      <div className="nt-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, padding: "2px 2px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button className="nt-press" onClick={() => setAddMeal("Uncategorized")} style={{ ...btnGreen, padding: "7px 13px", fontSize: 13.5 }}>🍎 Add food</button>
          {streaksOn && streak > 0 && <span style={{ fontSize: 12, color: T.sub, fontWeight: 600, whiteSpace: "nowrap" }}>🔥 {streak}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="nt-press" onClick={() => shiftDay(-1)} style={{ ...btnGhost, color: T.ink, padding: "4px 11px", fontSize: 14 }}>‹</button>
          <button className="nt-press" onClick={() => setSel(todayStr())} style={{ background: "none", border: "none", fontSize: 13.5, fontWeight: 800, color: sel === todayStr() ? T.ink : T.green, minWidth: 52 }}>
            {sel === todayStr() ? "Today" : fmtShort(sel)}
          </button>
          <button className="nt-press" onClick={() => shiftDay(1)} style={{ ...btnGhost, color: T.ink, padding: "4px 11px", fontSize: 14 }}>›</button>
          <button className="nt-press" onClick={toggleDone} title="Finish logging for the day" style={{
            width: 34, height: 34, borderRadius: 10, fontSize: 15, fontWeight: 800,
            background: isDone ? T.green : T.input, color: isDone ? "#000" : T.sub,
            border: `1px solid ${isDone ? T.green : T.line}`, transition: "background .2s ease, color .2s ease",
          }}>✓</button>
        </div>
      </div>

      <div className="nt-grid">
      <div className="nt-left">
      {/* summary hero: big calorie gauge, then three macro stat blocks */}
      <div className="card nt-card nt-summary" style={{ marginBottom: 8, padding: 18 }}>
        <div className="nt-summary-top">
          <CalorieRing eaten={totals.kcal} goal={goals.kcal} size={148} />
          <div className="nt-macro-stats">
            {[
              ["Protein", T.green, totals.protein, goals.protein],
              ["Carbs", CARB_BLUE, totals.carb, goals.carb],
              ["Fat", FAT_ORANGE, totals.fat, goals.fat],
            ].map(([label, color, eaten, goal]) => {
              const pct = goal ? Math.min(1, eaten / goal) : 0;
              return (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: color, display: "inline-block" }} />{label}
                    </span>
                    <span style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}><b style={{ color: T.ink }}>{Math.round(eaten)}</b> / {Math.round(goal)}g</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, background: T.input, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 5, transition: "width .3s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button className="nt-press" onClick={() => setShowGoals(true)} style={{ background: T.input, border: "none", color: T.green, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 99 }}>🎯 Edit goals</button>
          <button className="nt-press" onClick={() => setExpanded(x => !x)} style={{ background: "none", border: "none", color: T.sub, fontSize: 12.5, padding: 0 }}>{expanded ? "Less ▴" : "More ▾"}</button>
        </div>
        {expanded && (
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 8, animation: "ntUp .25s ease both" }}>
            Fiber: {Math.round(totals.fiber)}g · Sodium: {Math.round(totals.sodium)}mg
            <br />Remaining today: {Math.max(0, goals.kcal - Math.round(totals.kcal))} cal · {Math.max(0, goals.protein - Math.round(totals.protein))}g protein · {Math.max(0, goals.carb - Math.round(totals.carb))}g carbs · {Math.max(0, goals.fat - Math.round(totals.fat))}g fat
          </div>
        )}
      </div>

      {/* diary: drag a food between meals — movement is locked to this region and to the
          vertical axis, so it can't wander off over the calendar or other cards */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={[restrictToDiary]}>
        <div ref={diaryRef}>
        {["Uncategorized", ...MEALS].map((meal) => {
          const rows = byMeal[meal];
          if (meal === "Uncategorized" && !rows.length) return null; // only appears when something's in it
          const mealCal = rows.reduce((s, f) => s + num(f.kcal), 0);
          const header = (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 17 }}>{MEAL_ICON[meal]}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{meal === "Uncategorized" ? "To sort" : meal}</span>
                {mealCal > 0 && <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{Math.round(mealCal)} cal</span>}
              </div>
              {meal !== "Uncategorized" && <button className="nt-press" onClick={() => setAddMeal(meal)} title={`Add to ${meal}`}
                style={{ background: T.mint, color: T.green, border: "none", width: 30, height: 30, borderRadius: 99, fontWeight: 800, fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>}
            </div>
          );
          return (
            <MealDrop key={meal} meal={meal} header={header} empty={meal !== "Uncategorized" && !rows.length}>
              {rows.map(f => <DiaryRow key={f.id} f={f} onDelete={removeFood} onMenu={(food, x, y) => setMenu({ f: food, x, y })} />)}
            </MealDrop>
          );
        })}
        </div>
      </DndContext>
      </div>{/* end nt-left */}

      {/* right-click / ⋯ context menu */}
      {menu && (
        <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 190), top: Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 700) - 340), zIndex: 300,
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 5, minWidth: 182, boxShadow: "0 10px 30px rgba(0,0,0,.55)", animation: "ntUp .12s ease both" }}>
          <MenuItem label="✏️ Edit food" onClick={() => { setEditFood(menu.f); setMenu(null); }} />
          {menu.f.recurringId
            ? <MenuItem label="🔁 Stop making daily" onClick={() => { stopRecurring(menu.f); setMenu(null); }} />
            : menu.f.date >= todayStr() && <MenuItem label="🔁 Make daily (auto-log)" onClick={() => { makeRecurring(menu.f); setMenu(null); }} />}
          <div style={{ height: 1, background: T.line, margin: "4px 6px" }} />
          <div style={{ fontSize: 10.5, color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", padding: "3px 10px" }}>Move to</div>
          {MEALS.filter(m2 => m2 !== menu.f.meal).map(m2 => (
            <MenuItem key={m2} label={`→ ${m2}`} onClick={() => { moveFood(menu.f.id, m2); setMenu(null); }} />
          ))}
          <div style={{ height: 1, background: T.line, margin: "4px 6px" }} />
          {sel !== todayStr() && <MenuItem label="⧉ Copy to today" onClick={() => { copyFood(menu.f, todayStr()); setMenu(null); }} />}
          <MenuItem label="⧉ Copy to tomorrow" onClick={() => { copyFood(menu.f, addDays(menu.f.date, 1)); setMenu(null); }} />
          <MenuItem label="⧉ Duplicate here" onClick={() => { copyFood(menu.f, menu.f.date); setMenu(null); }} />
          <MenuItem label="🗑 Delete" danger onClick={() => { removeFood(menu.f); setMenu(null); }} />
        </div>
      )}
      {editFood && <EditFoodModal food={editFood} onSave={updateFood} onClose={() => setEditFood(null)} />}

      <div className="nt-right">
      {waterOn && <div className="nt-card" style={{ animationDelay: ".1s" }}><WaterCard data={data} setData={setData} date={sel} /></div>}
      <div className="nt-card" style={{ animationDelay: ".15s" }}><FastingCard data={data} setData={setData} /></div>

      {/* weekly averages */}
      {(thisWeek || lastWeek) && (
        <div className="card nt-card" style={{ marginBottom: 8, padding: 12, animationDelay: ".2s" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>📅 Weekly averages <span style={{ fontSize: 11, color: T.sub, fontWeight: 500 }}>(from Monday)</span></div>
          {[["This week", thisWeek], ["Last week", lastWeek]].map(([label, w]) => w && (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${T.line}`, fontSize: 13 }}>
              <span style={{ color: T.ink, fontWeight: 600 }}>{label} <span style={{ color: T.sub, fontWeight: 400, fontSize: 11 }}>({w.n}d)</span></span>
              <span style={{ color: T.sub }}><b style={{ color: T.green }}>{w.kcal}</b> cal · {w.protein}g protein · {w.fat}g fat</span>
            </div>
          ))}
        </div>
      )}

      <div className="nt-card" style={{ animationDelay: ".22s" }}><MacroCalendar data={data} /></div>

      {/* recipes entry point */}
      <div className="card nt-card" style={{ marginBottom: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", animationDelay: ".25s" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>🍲 Recipes</div>
          <div style={{ fontSize: 12, color: T.sub }}>{(data.recipes || []).length ? `${data.recipes.length} saved — log them from ⭐ Favorites` : "Build meals once, log them in one tap"}</div>
        </div>
        <button className="nt-press" onClick={() => setShowRecipe(true)} style={{ ...btnGhost, color: T.green, fontWeight: 700, padding: "7px 14px", fontSize: 13 }}>+ New</button>
      </div>
      </div>{/* end nt-right */}
      </div>{/* end nt-grid */}

      {addMeal && <AddFoodModal meal={addMeal} date={sel} data={data} setData={setData} onSave={addFood} onClose={() => setAddMeal(null)} />}
      {showGoals && <GoalsModal data={data} setData={setData} goals={goals} firstTime={firstTime} onSave={saveGoals} onClose={() => setShowGoals(false)} />}
      {showRecipe && <RecipeModal data={data} setData={setData} onClose={() => setShowRecipe(false)} />}
    </div>
  );
}

/* ---------- nutrition calendar + day-by-day log (own tab and group profiles) ---------- */
export function MacroCalendar({ data, title = "🥗 Nutrition calendar" }) {
  const [sel, setSel] = useState(todayStr());
  const [view, setView] = useState(() => {
    const v = localStorage.getItem("lt-ncal-view");
    return NCAL_VIEWS[v] ? v : "1M";
  });
  useEffect(() => { localStorage.setItem("lt-ncal-view", view); }, [view]);
  const foods = data.foods || [];
  const goals = { ...DEFAULT_GOALS, ...(data.nutritionGoals || {}) };
  const plan = data.nutritionGoals?.calc?.plan || "maintain";
  const totalsByDate = useMemo(() => {
    const m = {};
    for (const f of foods) {
      const t = (m[f.date] ||= { kcal: 0, protein: 0 });
      t.kcal += num(f.kcal); t.protein += num(f.protein);
    }
    return m;
  }, [foods]);

  /* a day is "good" on calories relative to the plan: under while cutting,
     over while bulking, within ±10% while maintaining. protein: goal hit. */
  const calGood = (t) => plan === "cut" ? t.kcal <= goals.kcal
    : plan === "bulk" ? t.kcal >= goals.kcal
    : Math.abs(t.kcal - goals.kcal) <= goals.kcal * 0.1;
  const protGood = (t) => t.protein >= goals.protein;
  const shade = (t, future) => {
    if (future) return "transparent";
    if (!t) return T.input;
    const hits = (calGood(t) ? 1 : 0) + (protGood(t) ? 1 : 0);
    if (hits === 2) return "rgba(0,200,5,.70)";       // both on target
    if (hits === 1) return "rgba(227,190,85,.45)";    // one of the two
    return "rgba(255,80,0,.35)";                      // logged, both off
  };

  const { cols, monthMarks } = useMemo(() => {
    const WEEKS = NCAL_VIEWS[view];
    const end = new Date(todayStr() + "T00:00");
    const start2 = new Date(mondayOf(todayStr()) + "T00:00");
    start2.setDate(start2.getDate() - 7 * (WEEKS - 1));
    const cols = []; const monthMarks = [];
    let d = new Date(start2), lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const key = d.toISOString().slice(0, 10);
        days.push({ key, t: totalsByDate[key], future: d > end });
        if (d.getMonth() !== lastMonth && d.getDate() <= 7) { monthMarks.push({ col: w, label: d.toLocaleString("en-US", { month: "short" }) }); lastMonth = d.getMonth(); }
        d.setDate(d.getDate() + 1);
      }
      cols.push(days);
    }
    return { cols, monthMarks };
  }, [totalsByDate, view]);

  const weeks = NCAL_VIEWS[view];
  const gap = weeks > 26 ? 2 : 4;
  const pick = (d) => { if (!d.future) setSel(d.key); };
  const outlineFor = (d) =>
    sel === d.key ? `2px solid ${T.ink}` : d.key === todayStr() ? `1.5px solid ${T.sub}` : "none";

  /* 1M: a real calendar — 7 columns, day numbers, exactly the last 30 days */
  const monthGrid = () => {
    const days = cols.flat();
    const cutoff = new Date(todayStr() + "T00:00"); cutoff.setDate(cutoff.getDate() - 29);
    const cutKey = cutoff.toISOString().slice(0, 10);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, maxWidth: 380, margin: "0 auto" }}>
        {["M","T","W","T","F","S","S"].map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: T.sub, fontWeight: 600 }}>{w}</div>
        ))}
        {days.map(d => {
          const hidden = d.future || d.key < cutKey;
          return (
            <div key={d.key} onClick={() => pick(d)} onMouseEnter={() => pick(d)}
              title={d.t ? `${Math.round(d.t.kcal)} cal · ${Math.round(d.t.protein)}g protein` : "nothing logged"}
              style={{ aspectRatio: "1", borderRadius: 8, background: shade(d.t, d.future),
                visibility: hidden ? "hidden" : "visible", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12.5, fontWeight: 600, color: d.t ? "#fff" : T.sub,
                outline: outlineFor(d), outlineOffset: -1 }}>
              {Number(d.key.slice(8))}
            </div>
          );
        })}
      </div>
    );
  };

  /* 3M/6M/1Y: GitHub-style week columns */
  const weekGrid = () => (
    <div style={{ maxWidth: weeks === 13 ? 400 : weeks === 26 ? 700 : "none", margin: "0 auto" }}>
      <div style={{ position: "relative", height: 14 }}>
        {monthMarks.map((m, i) => (
          <span key={i} style={{ position: "absolute", left: `${m.col / weeks * 100}%`, fontSize: 10, color: T.sub }}>{m.label}</span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap }}>
        {cols.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
            {week.map(d => (
              <div key={d.key} onClick={() => pick(d)} onMouseEnter={() => pick(d)}
                title={d.t ? `${Math.round(d.t.kcal)} cal · ${Math.round(d.t.protein)}g protein` : ""}
                style={{ aspectRatio: "1", borderRadius: weeks > 26 ? 2 : 4, background: shade(d.t, d.future),
                  cursor: d.future ? "default" : "pointer", outline: outlineFor(d), outlineOffset: -1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const dayFoods = foods.filter(f => f.date === sel);
  const selT = totalsByDate[sel];

  return (
    <div className="card" style={{ marginBottom: 8, padding: 12 }}>
      <NTStyle />
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>
      {/* view switcher — same style as the workout calendar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 8, justifyContent: "center" }}>
        {Object.keys(NCAL_VIEWS).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: "none", padding: "4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: ".5px", borderRadius: 0,
            color: view === v ? T.green : T.sub, border: "none", borderBottom: view === v ? `2px solid ${T.green}` : "2px solid transparent",
          }}>{v}</button>
        ))}
      </div>
      {view === "1M" ? monthGrid() : weekGrid()}
      <div style={{ fontSize: 10.5, color: T.sub, textAlign: "center", marginTop: 8 }}>
        🟩 calories + protein on target · 🟨 one of the two · 🟧 logged but off · grey = nothing logged
      </div>
      {/* tapped-day details — full food log for that day */}
      <div style={{ marginTop: 10, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
          {fmtShort(sel)}{sel === todayStr() ? " (today)" : ""}
          {selT
            ? <span style={{ color: T.sub, fontWeight: 500 }}> — <b style={{ color: T.green }}>{Math.round(selT.kcal)} cal</b> · {Math.round(selT.protein)}g protein</span>
            : <span style={{ color: T.sub, fontWeight: 500 }}> — nothing logged</span>}
        </div>
        {MEALS.concat("Uncategorized").map(meal => {
          const items = dayFoods.filter(f => (f.meal === meal) || (meal === "Uncategorized" && !MEALS.includes(f.meal)));
          if (!items.length) return null;
          return (
            <div key={meal} style={{ marginTop: 5 }}>
              <div style={{ fontSize: 10.5, color: T.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" }}>{meal}</div>
              {items.map(f => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.ink, padding: "2px 0" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{f.name}</span>
                  <span style={{ color: T.sub, flexShrink: 0 }}>{f.kcal} cal · {Math.round(f.protein)}g protein</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- group card: everyone's day, expandable per person ---------- */
export function GroupMacrosCard({ members, states, myId, streaksOn = true }) {
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
              {r.name}{r.mine ? " (you)" : ""} {r.done && "✓"}{streaksOn && r.streak > 1 ? ` 🔥${r.streak}` : ""}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, color: T.sub }}><b style={{ color: T.ink }}>{Math.round(r.t.kcal).toLocaleString()}</b> / {r.goal.kcal.toLocaleString()} calories</div>
              <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>
                <b style={{ color: r.t.protein >= r.goal.protein ? T.green : T.ink }}>{Math.round(r.t.protein)}</b> / {r.goal.protein}g protein{r.t.protein >= r.goal.protein ? " ✓" : ""}
              </div>
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
