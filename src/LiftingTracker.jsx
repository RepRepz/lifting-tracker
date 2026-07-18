import { useState, useEffect, useMemo, useRef, lazy, Suspense, Fragment, createContext, useContext } from "react";
import { supabase, loadUserState, saveUserState, listMyGroups, listMembers, createGroup, joinGroup, leaveGroup, listReactions, addReaction, removeReaction, setSecurityQuestion, getSecurityQuestion, lastActiveFor, setGroupEmoji, resetInviteCode } from "./lib/storage.js";
import { SECURITY_QUESTIONS } from "./AuthScreen.jsx";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MacroTab, GroupMacrosCard } from "./Nutrition.jsx";

import { T, tipStyle } from "./theme.js";
export { T, tipStyle }; // re-export so older imports keep working

/* Charts load on demand so the gym-critical tabs (Log etc.) start fast. */
const TrendChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.TrendChart })));
const BodyChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.BodyChart })));
const MusclePie = lazy(() => import("./charts.jsx").then(m => ({ default: m.MusclePie })));
const ChartFallback = ({ h }) => <div style={{ height: h, display:"flex", alignItems:"center", justifyContent:"center", color:T.sub, fontSize:13 }}>loading chart…</div>;

/* ---------- seed exercise library ----------
   Each entry: [name, [primary muscles — full credit], [secondary muscles — half credit]]
   A muscle only makes the list at all if it does roughly 20%+ of the work. */
const SEED_EXERCISES = [
  // chest pressing
  ["Bench Press",["Chest"],["Triceps"]],["Incline Bench Press",["Chest"],["Shoulders","Triceps"]],
  ["Incline Dumbbell Press",["Chest"],["Shoulders","Triceps"]],["Dumbbell Bench Press",["Chest"],["Triceps"]],
  ["Machine Chest Press",["Chest"],["Triceps"]],
  ["Chest Fly",["Chest"]],["Cable Crossover",["Chest"]],
  ["Dips",["Chest","Triceps"],["Shoulders"]],
  // push-up family
  ["Push-Up",["Chest","Triceps"],["Shoulders"]],["Wide Push-Up",["Chest"],["Triceps","Shoulders"]],
  ["Diamond Push-Up",["Triceps","Chest"]],["Incline Push-Up",["Chest"],["Triceps"]],
  ["Decline Push-Up",["Chest","Shoulders"],["Triceps"]],["Pike Push-Up",["Shoulders"],["Triceps"]],
  ["Archer Push-Up",["Chest"],["Triceps"]],["Clap Push-Up",["Chest"],["Triceps"]],
  ["One-Arm Push-Up",["Chest","Triceps"],["Abs"]],
  // triceps
  ["Triceps Pushdown",["Triceps"]],["Overhead Triceps Extension",["Triceps"]],["Skullcrusher",["Triceps"]],
  ["Close-Grip Bench Press",["Triceps"],["Chest"]],["Triceps Dip",["Triceps"],["Chest"]],
  // shoulders
  ["Overhead Press",["Shoulders"],["Triceps"]],["Dumbbell Shoulder Press",["Shoulders"],["Triceps"]],
  ["Arnold Press",["Shoulders"],["Triceps"]],["Lateral Raise",["Shoulders"]],["Rear Delt Fly",["Shoulders"]],
  ["Face Pull",["Shoulders"],["Back"]],["Upright Row",["Shoulders"],["Back"]],
  // back
  ["Deadlift",["Back","Legs"]],["Sumo Deadlift",["Legs"],["Back"]],
  ["Barbell Row",["Back"],["Biceps"]],["Pull-Up",["Back"],["Biceps"]],["Chin-Up",["Back","Biceps"]],
  ["Lat Pulldown",["Back"],["Biceps"]],["Seated Cable Row",["Back"],["Biceps"]],["Dumbbell Row",["Back"],["Biceps"]],
  ["T-Bar Row",["Back"],["Biceps"]],["Inverted Row",["Back"],["Biceps"]],
  ["Barbell Shrug",["Back"]],["Dumbbell Shrug",["Back"]],["Back Extension",["Back"],["Legs"]],
  // biceps
  ["Barbell Curl",["Biceps"]],["Dumbbell Curl",["Biceps"]],["Hammer Curl",["Biceps"]],
  ["Preacher Curl",["Biceps"]],["Cable Curl",["Biceps"]],["Concentration Curl",["Biceps"]],
  // legs
  ["Back Squat",["Legs"]],["Front Squat",["Legs"]],["Machine Squat",["Legs"]],["Hack Squat",["Legs"]],
  ["Goblet Squat",["Legs"]],["Bodyweight Squat",["Legs"]],["Leg Press",["Legs"]],["Leg Extension",["Legs"]],
  ["Lying Leg Curl",["Legs"]],["Seated Leg Curl",["Legs"]],["Romanian Deadlift",["Legs"],["Back"]],
  ["Good Morning",["Legs"],["Back"]],["Bulgarian Split Squat",["Legs"]],["Walking Lunge",["Legs"]],
  ["Step-Up",["Legs"]],["Hip Thrust",["Legs"]],["Glute Bridge",["Legs"]],["Hip Abduction Machine",["Legs"]],
  ["Kettlebell Swing",["Legs"],["Back"]],["Standing Calf Raise",["Legs"]],["Seated Calf Raise",["Legs"]],
  // abs / full body
  ["Plank",["Abs"]],["Hanging Leg Raise",["Abs"]],["Cable Crunch",["Abs"]],["Ab Wheel",["Abs"]],
  ["Sit-Up",["Abs"]],["Crunch",["Abs"]],["Russian Twist",["Abs"]],["Mountain Climber",["Abs"]],
  ["Farmer's Carry",["Back"],["Abs"]],
];
const BW_SET = new Set([
  "Pull-Up","Chin-Up","Dips","Triceps Dip","Inverted Row","Back Extension","Bodyweight Squat","Glute Bridge",
  "Push-Up","Wide Push-Up","Diamond Push-Up","Incline Push-Up","Decline Push-Up","Pike Push-Up","Archer Push-Up","Clap Push-Up","One-Arm Push-Up",
  "Plank","Hanging Leg Raise","Ab Wheel","Sit-Up","Crunch","Russian Twist","Mountain Climber",
]);
/* Which seed moves load plates on a straight bar — drives the plate calculator. */
const BARBELL_SEED = new Set([
  "Bench Press","Incline Bench Press","Close-Grip Bench Press","Overhead Press",
  "Deadlift","Sumo Deadlift","Barbell Row","T-Bar Row","Barbell Curl","Back Squat","Front Squat",
  "Romanian Deadlift","Hip Thrust","Barbell Shrug","Upright Row","Good Morning",
]);
/* Primary muscle groups an exercise hits (old saved data may only have a single `muscle`). */
const musclesOf = (ex) => !ex ? []
  : Array.isArray(ex.muscles) && ex.muscles.length ? ex.muscles
  : ex.muscle ? [ex.muscle] : [];
/* Secondary (half-credit) muscle groups. */
const secondariesOf = (ex) => (ex && Array.isArray(ex.muscles2)) ? ex.muscles2 : [];
const muscleOf = (ex) => musclesOf(ex)[0];
/* [muscle, credit] pairs: primaries count as a full set, secondaries as half. */
const muscleCredits = (ex) => [...musclesOf(ex).map(m => [m, 1]), ...secondariesOf(ex).map(m => [m, 0.5])];
/* "Chest · Triceps ½" — for tables and exports */
const muscleLabel = (ex) => [...musclesOf(ex), ...secondariesOf(ex).map(m => m + " ½")].join(" · ");
/* An exercise uses plates if it's flagged barbell (or, for older data with no flag, matches a known barbell move). */
const usesPlates = (ex) => !!ex && ex.type !== "Bodyweight" && (ex.barbell ?? BARBELL_SEED.has(ex.name));
const EQUIP_OPTS = ["Barbell (plates)", "Weighted (other)", "Bodyweight"];
const equipOf = (ex) => ex.type === "Bodyweight" ? "Bodyweight" : (ex.barbell ?? BARBELL_SEED.has(ex.name)) ? "Barbell (plates)" : "Weighted (other)";
const fromEquip = (eq) => eq === "Bodyweight" ? { type: "Bodyweight", barbell: false }
  : eq === "Barbell (plates)" ? { type: "Weighted", barbell: true }
  : { type: "Weighted", barbell: false };
const MUSCLES = ["Chest","Triceps","Shoulders","Back","Biceps","Legs","Abs"];
const MUSCLE_COLORS = ["#009E04","#3D7FD9","#C08A1E","#9C4DE0","#D94F00","#17ABA0","#A83277"];
const EFFORTS = ["Warm-up","Could've done more","Right amount","To failure"];
const MET = { Light: 4, Moderate: 6, Vigorous: 9, "Max Effort": 12 };
const INTENSITY_FEEL = {
  Light: "Easy pace, could hold a full conversation",
  Moderate: "Steady effort, breathing noticeably harder",
  Vigorous: "Hard effort, tough to talk",
  "Max Effort": "All-out — sprints, intervals",
};

/* ---------- helpers ---------- */
/* LOCAL date, not UTC — toISOString() would roll to tomorrow in the evening (US time) */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const e1rm = (w, r) => w * (1 + r / 30);
const fmtDate = (s) => { const d = new Date(s + "T00:00"); return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const monthKey = (s) => s.slice(0, 7);
const monthLabel = (k) => { const [y,m]=k.split("-"); return new Date(+y, +m-1, 1).toLocaleString("en-US",{month:"short",year:"numeric"}); };
const weekStart = (s) => { const d = new Date(s + "T00:00"); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10); };
const RANGE_DAYS = { "1D": 1, "1M": 30, "1Y": 365, "5Y": 1826, All: Infinity };

/* ---------- units (data is always stored in lb; we convert only for display/input) ---------- */
const LB_PER_KG = 2.2046226218;
const UnitCtx = createContext("lb");
const useUnit = () => useContext(UnitCtx);
const uLabel = (u) => u === "kg" ? "kg" : "lb";
// lb -> display number (kg rounded to 1 dp, lb left whole-ish)
const dispW = (lb, u) => lb == null ? lb : (u === "kg" ? Math.round((lb / LB_PER_KG) * 10) / 10 : Math.round(lb * 10) / 10);
// a typed display-unit value -> lb for storage
const toLb = (v, u) => u === "kg" ? v * LB_PER_KG : v;
// "135 lb" / "61.2 kg" from a stored-lb number
const showW = (lb, u) => lb == null ? "—" : `${dispW(lb, u)} ${uLabel(u)}`;

/* plate calculator: what to load per side, heaviest-first. Plates/bar depend on unit. */
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const BARS_LB = [45, 35, 15, 0];
const BARS_KG = [20, 15, 10, 0];
function platesPerSide(total, bar, plates) {
  let side = (total - bar) / 2;
  if (side <= 0) return null;
  const out = [];
  for (const p of plates) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100; }
  return { plates: out, leftover: side };
}

/* default cardio activities — Sport = calories estimated, Machine = read them off the display */
const SEED_CARDIO = [
  ["Walking","Sport"],["Running","Sport"],["Swimming","Sport"],["Cycling","Sport"],
  ["Hiking","Sport"],["Jump Rope","Sport"],["Basketball","Sport"],
  ["Treadmill","Machine"],["Elliptical","Machine"],["Stair Master","Machine"],
  ["Rowing Machine","Machine"],["Exercise Bike","Machine"],
].map(([name, type]) => ({ name, type }));

const defaultData = {
  // `muscle` (primary) is kept alongside `muscles`/`muscles2` so older cached app versions still work
  exercises: SEED_EXERCISES.map(([name, muscles, muscles2 = []]) => ({ name, muscle: muscles[0], muscles, muscles2, type: BW_SET.has(name) ? "Bodyweight" : "Weighted", barbell: BARBELL_SEED.has(name) })),
  log: [], bodyweight: [], cardio: [], cardioActivities: SEED_CARDIO,
  routines: [], // optional workout templates (feature toggled in Settings)
  foods: [], nutritionGoals: {}, // optional macro tracking (feature toggled in Settings)
  customFoods: [], recipes: [], recurringSkips: [], water: [], waterPrefs: {}, fasting: {}, dayDone: [],
  profile: {}, // heightIn (inches) lives here once set
  pins: [],    // pinned dashboard charts (exercise names)
  libraryV: 4, // bumped when the seed library changes, so existing users get the update once
};

/* One-time upgrade of previously saved data: pull in newly added seed exercises and
   the current primary/secondary muscle lists — custom moves pass through untouched.
   Runs only when libraryV is behind, so later deletions stay deleted. */
function migrateData(d) {
  // pins used to live in this device's localStorage — carry them into account data once
  if (!Array.isArray(d.pins)) {
    let p = [];
    try { const q = JSON.parse(localStorage.getItem("lt-pins")); if (Array.isArray(q)) p = q; } catch {}
    d = { ...d, pins: p };
  }
  if ((d.libraryV || 0) >= defaultData.libraryV) return d;
  const seedMap = Object.fromEntries(defaultData.exercises.map(s => [s.name, s]));
  const have = new Set((d.exercises || []).map(x => x.name));
  const exercises = [
    // known seeds get the refreshed muscle lists (type/equipment edits are kept)
    ...(d.exercises || []).map(x => seedMap[x.name] ? { ...x, muscle: seedMap[x.name].muscle, muscles: seedMap[x.name].muscles, muscles2: seedMap[x.name].muscles2 } : x),
    ...defaultData.exercises.filter(s => !have.has(s.name)),
  ];
  const haveAct = new Set((d.cardioActivities || []).map(a => a.name));
  const cardioActivities = [...(d.cardioActivities || []), ...SEED_CARDIO.filter(a => !haveAct.has(a.name))];
  return { ...d, exercises, cardioActivities, libraryV: defaultData.libraryV };
}

/* weekly streak (lifting OR cardio) with mid-week protection */
function computeStreak(log, cardio) {
  const weeks = new Set([...(log||[]).map(e=>weekStart(e.date)), ...(cardio||[]).map(e=>weekStart(e.date))]);
  if (!weeks.size) return { cur:0, best:0 };
  let best=0, cur=0;
  const thisWk = weekStart(todayStr());
  let run=0;
  const sortedWeeks=[...weeks].sort();
  const first=sortedWeeks[0];
  for (let d=new Date(first+"T00:00"); ; d.setDate(d.getDate()+7)) {
    const key=d.toISOString().slice(0,10);
    if (weeks.has(key)) { run++; best=Math.max(best,run); } else run=0;
    if (key===thisWk) { cur = run; break; }
    if (key>thisWk) break;
  }
  if (!weeks.has(thisWk)) { // mid-week protection: use last week's run
    let r=0; const lw=new Date(thisWk+"T00:00"); lw.setDate(lw.getDate()-7);
    for (let d=lw; ; d.setDate(d.getDate()-7)) { const k=d.toISOString().slice(0,10); if (weeks.has(k)) r++; else break; }
    cur=r;
  }
  return { cur, best };
}

export default function LiftingTracker({ user }) {
  const [data, setData] = useState(defaultData);
  const [startTab, setStartTab] = useState(() => localStorage.getItem("lt-start-tab") || "dash");
  const [tab, setTab] = useState(() => localStorage.getItem("lt-start-tab") || "dash");
  const [showSettings, setShowSettings] = useState(false);
  const [units, setUnits] = useState(() => localStorage.getItem("lt-units") || "lb");
  const [hunit, setHunit] = useState(() => localStorage.getItem("lt-hunit") || "ftin"); // height: "ftin" | "cm"
  const [routinesOn, setRoutinesOn] = useState(() => localStorage.getItem("lt-routines-on") === "1"); // optional templates feature
  const [liftingOn, setLiftingOn] = useState(() => localStorage.getItem("lt-lifting-on") !== "0"); // default on
  const [nutritionOn, setNutritionOn] = useState(() => localStorage.getItem("lt-nutrition-on") !== "0"); // default on
  const [streaksOn, setStreaksOn] = useState(() => localStorage.getItem("lt-streaks-on") !== "0"); // default on
  useEffect(() => { localStorage.setItem("lt-streaks-on", streaksOn ? "1" : "0"); }, [streaksOn]);
  useEffect(() => { localStorage.setItem("lt-start-tab", startTab); }, [startTab]);
  useEffect(() => { localStorage.setItem("lt-units", units); }, [units]);
  useEffect(() => { localStorage.setItem("lt-hunit", hunit); }, [hunit]);
  useEffect(() => { localStorage.setItem("lt-routines-on", routinesOn ? "1" : "0"); }, [routinesOn]);
  useEffect(() => { localStorage.setItem("lt-lifting-on", liftingOn ? "1" : "0"); }, [liftingOn]);
  useEffect(() => { localStorage.setItem("lt-nutrition-on", nutritionOn ? "1" : "0"); }, [nutritionOn]);
  useEffect(() => {
    const liftTabs = new Set(["dash","log","records","body","cardio","ex"]);
    if ((liftTabs.has(tab) && !liftingOn) || (tab === "macros" && !nutritionOn)) {
      setTab(liftingOn ? "dash" : (nutritionOn ? "macros" : "friends"));
    }
  }, [liftingOn, nutritionOn, tab]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncState, setSyncState] = useState("synced"); // "synced" | "offline"
  const saveTimer = useRef(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const username = user.user_metadata?.username || "you";
  const cacheKey = `lt-cache-${user.id}`;
  const pendKey = `lt-pending-${user.id}`;

  useEffect(() => { (async () => {
    const cachedRaw = localStorage.getItem(cacheKey);
    // Unsynced offline edits from a previous session win (accepted trade-off)
    if (localStorage.getItem(pendKey) === "1" && cachedRaw) {
      try { setData({ ...defaultData, ...migrateData(JSON.parse(cachedRaw)) }); setLoaded(true); return; } catch {}
    }
    try {
      const v = await loadUserState(user.id);
      if (v) {
        setData({ ...defaultData, ...migrateData(v) });
        localStorage.setItem(cacheKey, JSON.stringify(v));
        setLoaded(true); return;
      }
      setLoaded(true);
    } catch (e) {
      console.error("load failed", e);
      if (cachedRaw) {
        // no signal, but we have this device's last copy — keep going offline
        try { setData({ ...defaultData, ...migrateData(JSON.parse(cachedRaw)) }); setSyncState("offline"); setLoaded(true); return; } catch {}
      }
      setLoadFailed(true);
    }
  })(); }, [user.id]);

  useEffect(() => { if (!loaded) return;
    // Always land the change on this device instantly; the cloud follows.
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(pendKey, "1");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveUserState(user.id, data); localStorage.removeItem(pendKey); setSyncState("synced"); }
      catch (e) { console.error("save failed", e); setSyncState("offline"); }
    }, 500);
  }, [data, loaded, user.id]);

  // When signal returns (or every 30s), push anything still pending.
  useEffect(() => {
    const retry = async () => {
      if (localStorage.getItem(pendKey) !== "1") return;
      try { await saveUserState(user.id, dataRef.current); localStorage.removeItem(pendKey); setSyncState("synced"); }
      catch { /* still offline — keep waiting */ }
    };
    window.addEventListener("online", retry);
    const iv = setInterval(retry, 30000);
    return () => { window.removeEventListener("online", retry); clearInterval(iv); };
  }, [user.id]);


  const exMap = useMemo(() => Object.fromEntries(data.exercises.map(e => [e.name, e])), [data.exercises]);
  const latestBW = useMemo(() => {
    const rows = [...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length-1].weight : 195;
  }, [data.bodyweight]);

  if (loadFailed) return (
    <div style={{fontFamily:"system-ui",padding:40,color:T.sub}}>
      ⚠️ Couldn't load your data — check your internet connection and refresh the page.
      (Saving is switched off so nothing gets overwritten.)
    </div>
  );

  if (!loaded) return <div style={{fontFamily:"system-ui",padding:40,color:T.sub}}>Loading your tracker…</div>;

  const tabs = [
    ...(liftingOn ? [["dash","Dash","📊"],["log","Log","📝"],["records","Records","🏆"]] : []),
    ["friends","Groups","👥"],
    ...(nutritionOn ? [["macros","Macros","🥗"]] : []),
    ...(liftingOn ? [["body","Body","⚖️"],["cardio","Cardio","🏃"],["ex","Library","📚"]] : []),
  ];

  return (
    <UnitCtx.Provider value={units}>
    <div style={{ fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", background:T.bg, minHeight:"100dvh", color:T.ink }} className="app-root">
      <style>{`
        html { color-scheme:dark; scroll-behavior:smooth; }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        /* 16px minimum: anything smaller makes iOS Safari zoom in when a field is tapped */
        input,select,button { font-family:inherit; font-size:16px; }
        input,select,button { touch-action:manipulation; }
        button { -webkit-touch-callout:none; user-select:none; }
        input,select { border:1px solid ${T.line}; border-radius:10px; padding:9px 10px; background:${T.input}; color:${T.ink}; width:100%; transition:border-color .15s ease; min-height:44px; -webkit-appearance:none; appearance:none; }
        select { background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238C8F90' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px; }
        input[type=date] { min-width:0; }
        input[type=date]::-webkit-date-and-time-value { text-align:left; }
        input::placeholder { color:${T.sub}; opacity:.75; }
        input:focus,select:focus { outline:2px solid ${T.green}; outline-offset:0; border-color:${T.green}; }
        button { cursor:pointer; border:none; border-radius:24px; transition:transform .08s ease, background-color .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease; }
        button:active { transform:scale(.96); }
        table { border-collapse:collapse; width:100%; } td,th { padding:9px 10px; text-align:left; font-size:13.5px; }
        th { background:none; color:${T.sub}; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; white-space:nowrap; border-bottom:1px solid ${T.line}; }
        td { border-bottom:1px solid ${T.line}; }
        .card { background:${T.card}; border:1px solid ${T.line}; border-radius:14px; padding:16px; margin-bottom:14px; animation:rise .22s ease-out both; }
        .recharts-text { fill:${T.sub}; }
        .h { font-weight:800; letter-spacing:.2px; }
        @keyframes rise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes pop { 0% { transform:scale(.6); opacity:0; } 70% { transform:scale(1.06); opacity:1; } 100% { transform:scale(1); opacity:1; } }
        @keyframes grow { from { transform:scaleY(0); } }
        .vbar { transform-origin:bottom; animation:grow .5s ease-out both; }
        .chip { animation:pop .25s ease-out both; }
        .chip { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
        @keyframes fadeSwap { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
        @keyframes sheetUp { from { transform:translateY(100%); } to { transform:none; } }
        .tabview { animation:fadeSwap .2s ease-out both; }
        /* staggered card entrance — transform/opacity only, one-shot, GPU-cheap */
        .tabview > .card:nth-child(2) { animation-delay:.05s; }
        .tabview > .card:nth-child(3) { animation-delay:.10s; }
        .tabview > .card:nth-child(4) { animation-delay:.15s; }
        .tabview > .card:nth-child(5) { animation-delay:.20s; }
        .tabview > .card:nth-child(n+6) { animation-delay:.24s; }
        @media(hover:hover){ .card { transition:border-color .2s ease; } .card:hover { border-color:#2E3234; } }
        .navicon { transition:transform .18s ease; }
        .navicon.on { transform:translateY(-2px) scale(1.14); }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }

        /* ---- responsive: phone (<900px) vs desktop (>=900px) ---- */
        /* mobile-first: tabs live in a fixed BOTTOM bar for thumb reach */
        .nav-top { display:none; }
        .nav-bottom {
          position:fixed; bottom:0; left:0; right:0; z-index:20;
          display:grid; grid-template-columns:repeat(7, 1fr);
          background:${T.bg}; border-top:1px solid ${T.line};
          padding-bottom:env(safe-area-inset-bottom);
        }
        .app-main { max-width:860px; margin:0 auto; padding:16px 14px; }
        .app-root { padding-bottom:calc(68px + env(safe-area-inset-bottom)); }

        @media (min-width:900px) {
          /* desktop: tabs move into the TOP app bar, bottom bar disappears.
             Content stays a clean CENTERED single column (no stretching). */
          .nav-top { display:flex; gap:2px; }
          .nav-bottom { display:none; }
          .app-root { padding-bottom:36px; }
          .app-main { max-width:880px; padding:24px 20px; }
        }

        /* drag-to-reorder */
        .drag-handle { cursor:grab; touch-action:none; }
        .dragging { opacity:.55; }
        .drag-over-top { box-shadow:0 -3px 0 ${T.green}; }
        .drag-over-bot { box-shadow:0 3px 0 ${T.green}; }
      `}</style>

      <div style={{ position:"sticky", top:0, zIndex:10, background:T.bg, borderBottom:`1px solid ${T.line}` }}>
        <div style={{ maxWidth:960, margin:"0 auto", display:"flex", alignItems:"center", gap:14,
          padding:"calc(12px + env(safe-area-inset-top)) 20px 8px", color:"#fff" }}>
          <div className="h" onClick={()=>setTab("dash")} style={{ fontSize:19, cursor:"pointer", userSelect:"none", whiteSpace:"nowrap", minWidth:0, overflow:"hidden", textOverflow:"ellipsis" }}>🏋️ MY LIFTING TRACKER</div>
          {/* tabs: inline & centered in the app bar on desktop; hidden on phone (bottom bar used) */}
          <nav className="nav-top" style={{ flex:1, justifyContent:"center" }}>
            {tabs.map(([id,label,icon]) => (
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:"6px 12px 8px", background:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                color: tab===id?T.green:T.sub, fontWeight: tab===id?700:500, fontSize:12, borderRadius:0,
                borderBottom: tab===id?`3px solid ${T.green}`:"3px solid transparent",
              }}>
                <span className={"navicon" + (tab===id?" on":"")} style={{fontSize:18}}>{icon}</span>
                <span style={{whiteSpace:"nowrap"}}>{label}</span>
              </button>
            ))}
          </nav>
          <button onClick={()=>setShowSettings(true)} style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, marginLeft:"auto", background:"rgba(255,255,255,.10)", color:"#fff", padding:"6px 12px 6px 13px", fontSize:13, fontWeight:600 }}>
            💪 {username} <span style={{ fontSize:15, opacity:.8 }}>⚙️</span>
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal user={user} username={username} data={data}
          startTab={startTab} setStartTab={setStartTab} tabs={tabs}
          units={units} setUnits={setUnits} hunit={hunit} setHunit={setHunit}
          routinesOn={routinesOn} setRoutinesOn={setRoutinesOn}
          liftingOn={liftingOn} setLiftingOn={setLiftingOn}
          nutritionOn={nutritionOn} setNutritionOn={setNutritionOn}
          streaksOn={streaksOn} setStreaksOn={setStreaksOn}
          onClose={()=>setShowSettings(false)} />
      )}

      {syncState === "offline" && (
        <div style={{ background:"#2A2416", color:"#E3BE55", padding:"8px 18px", fontSize:13, fontWeight:600 }}>
          📴 Offline — your sets are saved on this device and will sync automatically when signal returns.
        </div>
      )}

      <main className="app-main">
        <div className="tabview" key={tab}>
          {tab==="dash" && liftingOn && <Dashboard data={data} exMap={exMap} setData={setData} />}
          {tab==="log" && liftingOn && <LogTab data={data} exMap={exMap} setData={setData} routinesOn={routinesOn} />}
          {tab==="records" && liftingOn && <RecordsTab data={data} exMap={exMap} />}
          {tab==="friends" && <FriendsTab user={user} nutritionOn={nutritionOn} streaksOn={streaksOn} />}
          {tab==="macros" && nutritionOn && <MacroTab data={data} setData={setData} streaksOn={streaksOn} />}
          {tab==="body" && liftingOn && <BodyTab data={data} setData={setData} hunit={hunit} />}
          {tab==="cardio" && liftingOn && <CardioTab data={data} setData={setData} latestBW={latestBW} />}
          {tab==="ex" && liftingOn && <ExercisesTab data={data} setData={setData} />}
        </div>
      </main>

      {/* phone tab bar (bottom, thumb-reachable). Hidden on desktop — see .nav-bottom */}
      <nav className="nav-bottom">
        {tabs.map(([id,label,icon]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"7px 0 8px", background:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:1,
            color: tab===id?T.green:T.sub, fontWeight: tab===id?700:500, fontSize:10.5, borderRadius:0, minWidth:0,
            borderTop: tab===id?`3px solid ${T.green}`:"3px solid transparent",
          }}>
            <span className={"navicon" + (tab===id?" on":"")} style={{fontSize:18}}>{icon}</span>
            <span style={{maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
    </UnitCtx.Provider>
  );
}

/* ================= ROUTINES (optional feature, toggled in Settings) =================
   A routine is a saved template: { id, name, items:[{exercise, sets, reps}] }.
   "Start" walks you exercise-by-exercise; tapping one loads it into the log form.
   Kept fully self-contained so the whole feature can be removed by deleting this
   block + the `routinesOn` wiring, with no other code depending on it. */
function RoutinesPanel({ data, setData, onPick }) {
  const routines = Array.isArray(data.routines) ? data.routines : [];
  const [view, setView] = useState(routines.length ? "list" : "list");
  const [draft, setDraft] = useState(null);   // routine being built/edited
  const [runId, setRunId] = useState(null);   // routine being followed
  const [collapsed, setCollapsed] = useState(routines.length === 0);
  const today = todayStr();

  const running = routines.find(r => r.id === runId);

  const saveRoutines = (next) => setData(d => ({ ...d, routines: next }));

  const startNew = () => { setDraft({ id: Date.now(), name: "", items: [] }); setView("build"); };
  const editRoutine = (r) => { setDraft(JSON.parse(JSON.stringify(r))); setView("build"); };
  const removeRoutine = (id) => saveRoutines(routines.filter(r => r.id !== id));

  const addItem = () => setDraft(d => ({ ...d, items: [...d.items, { exercise: "", sets: 3, reps: "8-12" }] }));
  const setItem = (i, patch) => setDraft(d => ({ ...d, items: d.items.map((it, j) => j === i ? { ...it, ...patch } : it) }));
  const delItem = (i) => setDraft(d => ({ ...d, items: d.items.filter((_, j) => j !== i) }));
  const moveItem = (i, dir) => setDraft(d => {
    const j = i + dir; if (j < 0 || j >= d.items.length) return d;
    const items = [...d.items]; [items[i], items[j]] = [items[j], items[i]]; return { ...d, items };
  });

  const draftValid = draft && draft.name.trim() && draft.items.length && draft.items.every(it => it.exercise);
  const saveDraft = () => {
    if (!draftValid) return;
    const clean = { ...draft, name: draft.name.trim(), items: draft.items.map(it => ({ exercise: it.exercise, sets: Math.max(1, parseInt(it.sets) || 1), reps: String(it.reps || "").trim() })) };
    const exists = routines.some(r => r.id === clean.id);
    saveRoutines(exists ? routines.map(r => r.id === clean.id ? clean : r) : [...routines, clean]);
    setDraft(null); setView("list");
  };

  const doneToday = (ex) => data.log.filter(e => e.exercise === ex && e.date === today && e.effort !== "Warm-up").length;

  const box = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 14 };
  const smallBtn = { background: T.input, color: T.ink, border: `1px solid ${T.line}`, padding: "6px 11px", fontSize: 13, fontWeight: 600 };

  /* ---- BUILDER ---- */
  if (view === "build" && draft) {
    return (
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>{routines.some(r => r.id === draft.id) ? "Edit routine" : "New routine"}</div>
          <button onClick={() => { setDraft(null); setView("list"); }} style={{ ...smallBtn, marginLeft: "auto", color: T.sub }}>Cancel</button>
        </div>
        <label style={lbl}>Routine name
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Push Day" autoCapitalize="words" />
        </label>
        <div style={{ margin: "14px 0 6px", fontSize: 13, fontWeight: 700, color: T.sub }}>EXERCISES</div>
        {draft.items.map((it, i) => (
          <div key={i} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>
              <select value={it.exercise} onChange={e => setItem(i, { exercise: e.target.value })} style={{ flex: 1, minHeight: 0 }}>
                <option value="">— pick exercise —</option>
                {MUSCLES.map(m => (
                  <optgroup key={m} label={m}>
                    {data.exercises.filter(x => muscleOf(x) === m).map(x => <option key={x.name}>{x.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => moveItem(i, -1)} style={{ ...smallBtn, padding: "6px 8px" }} title="Move up">↑</button>
              <button onClick={() => moveItem(i, 1)} style={{ ...smallBtn, padding: "6px 8px" }} title="Move down">↓</button>
              <button onClick={() => delItem(i)} style={{ ...smallBtn, padding: "6px 8px", color: T.danger }} title="Remove">✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
              <label style={{ ...lbl, fontSize: 12 }}>Sets<input type="number" min="1" value={it.sets} onChange={e => setItem(i, { sets: e.target.value })} /></label>
              <label style={{ ...lbl, fontSize: 12 }}>Target reps<input value={it.reps} onChange={e => setItem(i, { reps: e.target.value })} placeholder="e.g. 8-12" /></label>
            </div>
          </div>
        ))}
        <button onClick={addItem} style={{ ...smallBtn, width: "100%", padding: "10px", marginTop: 2 }}>+ Add exercise</button>
        <button onClick={saveDraft} disabled={!draftValid}
          style={{ width: "100%", marginTop: 12, background: draftValid ? T.green : T.input, color: draftValid ? "#000" : T.sub, fontWeight: 800, padding: "12px" }}>
          Save routine
        </button>
      </div>
    );
  }

  /* ---- RUNNING a routine ---- */
  if (view === "run" && running) {
    const totalSets = running.items.reduce((s, it) => s + (parseInt(it.sets) || 0), 0);
    const doneSets = running.items.reduce((s, it) => s + Math.min(doneToday(it.exercise), parseInt(it.sets) || 0), 0);
    return (
      <div style={{ ...box, borderColor: T.green }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div className="h" style={{ fontSize: 18, color: T.tealDk }}>▶ {running.name}</div>
          <button onClick={() => { setRunId(null); setView("list"); }} style={{ ...smallBtn, marginLeft: "auto", color: T.sub }}>Done</button>
        </div>
        <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 4 }}>{doneSets} / {totalSets} sets logged today</div>
        <div style={{ height: 5, background: T.input, borderRadius: 99, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalSets ? doneSets / totalSets * 100 : 0}%`, background: T.green, borderRadius: 99, transition: "width .3s" }} />
        </div>
        {running.items.map((it, i) => {
          const done = doneToday(it.exercise);
          const target = parseInt(it.sets) || 0;
          const complete = done >= target;
          return (
            <button key={i} onClick={() => onPick(it.exercise, it.reps)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                background: complete ? T.mint : T.input, border: `1px solid ${complete ? T.green : T.line}`,
                borderRadius: 10, padding: "11px 12px", marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{complete ? "✅" : "⬜"}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: T.ink }}>{it.exercise}</span>
                <span style={{ fontSize: 12, color: T.sub }}>{done}/{target} sets{it.reps ? ` · ${it.reps} reps` : ""}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: complete ? T.green : T.ink }}>{complete ? "Done" : "Log ›"}</span>
            </button>
          );
        })}
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 4 }}>Tap an exercise to load it into the form below, then log your sets as normal.</div>
      </div>
    );
  }

  /* ---- LIST (default) ---- */
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="h" style={{ fontSize: 18, color: T.tealDk }}>📋 Routines</div>
        <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", color: T.sub, fontSize: 13, padding: "4px 8px", marginLeft: "auto" }}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (<>
        {routines.length === 0 && (
          <div style={{ fontSize: 13, color: T.sub, margin: "8px 0 12px" }}>
            Build a template like “Push Day,” then tap Start to log it exercise-by-exercise.
          </div>
        )}
        {routines.map(r => (
          <div key={r.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{r.name}</div>
              <div style={{ fontSize: 12, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.items.length} exercise{r.items.length !== 1 ? "s" : ""} · {r.items.map(it => it.exercise).join(", ")}
              </div>
            </div>
            <button onClick={() => { setRunId(r.id); setView("run"); }} style={{ background: T.green, color: "#000", fontWeight: 800, padding: "8px 14px", fontSize: 13 }}>Start</button>
            <button onClick={() => editRoutine(r)} style={smallBtn}>Edit</button>
            <ConfirmX onConfirm={() => removeRoutine(r.id)} />
          </div>
        ))}
        <button onClick={startNew} style={{ ...smallBtn, width: "100%", padding: "10px", marginTop: 12 }}>+ New routine</button>
      </>)}
    </div>
  );
}

/* ================= LOG ================= */
function LogTab({ data, exMap, setData, routinesOn }) {
  const sorted = useMemo(()=>[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id),[data.log]);
  const last = sorted[sorted.length-1];
  const [date, setDate] = useState(last?.date || todayStr());
  const [exName, setExName] = useState(last?.exercise || "");
  const [setNum, setSetNum] = useState(last ? (last.exercise===exName? last.set+1 : 1) : 1);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [justSaved, setJustSaved] = useState(null);
  const units = useUnit();
  const plateSet = units === "kg" ? PLATES_KG : PLATES_LB;
  const barOpts = units === "kg" ? BARS_KG : BARS_LB;
  const [bar, setBar] = useState(units === "kg" ? 20 : 45);
  const [plateMode, setPlateMode] = useState("weight"); // "weight" = type total | "build" = tap plates
  const [built, setBuilt] = useState([]); // plates on ONE side, in the build tool
  const sumSide = built.reduce((s,p)=>s+p, 0);
  const addPlate = (p) => { const nb=[...built,p].sort((a,b)=>b-a); setBuilt(nb); setWeight(String(bar + 2*nb.reduce((s,x)=>s+x,0))); };
  const undoPlate = () => { const nb=built.slice(0,-1); setBuilt(nb); setWeight(nb.length ? String(bar + 2*nb.reduce((s,x)=>s+x,0)) : ""); };
  const clearPlates = () => { setBuilt([]); setWeight(""); };
  // switching units resets the bar/plates to that unit's defaults
  useEffect(() => { setBar(units === "kg" ? 20 : 45); setBuilt([]); }, [units]);

  // rest timer — the END TIME lives in localStorage, so the countdown survives
  // switching tabs and even closing the app (0 duration = timer switched off)
  const [restDur, setRestDur] = useState(() => {
    const raw = localStorage.getItem("lt-rest");
    return raw === null ? 90 : Number(raw);
  });
  const restEndAt = () => Number(localStorage.getItem("lt-rest-end")) || 0;
  const secsLeft = (end) => Math.max(0, Math.ceil((end - Date.now()) / 1000));
  const [restLeft, setRestLeft] = useState(() => secsLeft(restEndAt()));
  const [restDone, setRestDone] = useState(() => {
    const end = restEndAt(); // finished while we were away (within the last 10 min)?
    return end > 0 && end <= Date.now() && Date.now() - end < 10 * 60 * 1000;
  });
  useEffect(() => { localStorage.setItem("lt-rest", String(restDur)); }, [restDur]);
  const startRest = () => {
    if (restDur <= 0) return;
    localStorage.setItem("lt-rest-end", String(Date.now() + restDur * 1000));
    setRestDone(false); setRestLeft(restDur);
  };
  const stopRest = () => { localStorage.removeItem("lt-rest-end"); setRestLeft(0); setRestDone(false); };
  useEffect(() => {
    if (restLeft <= 0) return;
    const t = setInterval(() => {
      const s = secsLeft(restEndAt()); // clock-based: stays honest even if ticks get throttled
      setRestLeft(s);
      if (s <= 0) { clearInterval(t); navigator.vibrate?.([250,120,250]); setRestDone(true); localStorage.removeItem("lt-rest-end"); }
    }, 1000);
    return () => clearInterval(t);
  }, [restLeft > 0]);
  // the ✅ done note clears itself after a few seconds
  useEffect(() => {
    if (!restDone) return;
    const t = setTimeout(() => { setRestDone(false); localStorage.removeItem("lt-rest-end"); }, 6000);
    return () => clearTimeout(t);
  }, [restDone]);

  const isBW = exMap[exName]?.type === "Bodyweight";

  const lastTime = useMemo(() => {
    if (!exName) return null;
    const prior = sorted.filter(e => e.exercise===exName && e.date < date);
    if (!prior.length) return { first:true };
    const lastDate = prior[prior.length-1].date;
    const sess = prior.filter(e => e.date===lastDate);
    if (isBW) { const best = Math.max(...sess.map(s=>s.reps)); return { text:`${best} reps`, date:lastDate, bestVal:best }; }
    const best = sess.reduce((a,b)=> e1rm(b.weight||0,b.reps) > e1rm(a.weight||0,a.reps) ? b : a);
    return { text:`${dispW(best.weight,units)} × ${best.reps}`, date:lastDate, bestVal:e1rm(best.weight||0,best.reps) };
  }, [exName, date, sorted, isBW, units]);

  // live "are you beating last time?" from the current inputs
  const beaten = useMemo(() => {
    if (!lastTime || lastTime.first || !reps) return false;
    if (isBW) return parseInt(reps) > lastTime.bestVal;
    if (!weight) return false;
    return e1rm(toLb(parseFloat(weight), units), parseInt(reps)) > lastTime.bestVal;
  }, [lastTime, isBW, weight, reps, units]);

  /* session-best history for the picked exercise (last 10 sessions before today's date) */
  const sparkPts = useMemo(() => {
    if (!exName) return null;
    const byDate = {};
    for (const e of sorted) {
      if (e.exercise !== exName || e.date >= date || e.effort === "Warm-up") continue;
      const v = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
      byDate[e.date] = Math.max(byDate[e.date] || 0, v);
    }
    return Object.keys(byDate).sort().map(k => Math.round(byDate[k])).slice(-10);
  }, [exName, date, sorted, isBW]);

  const checkPR = (entry) => {
    const prior = data.log.filter(e => e.exercise===entry.exercise && e.date < entry.date);
    if (!prior.length) return false;
    if (isBW) return entry.reps > Math.max(...prior.map(p=>p.reps));
    return e1rm(entry.weight, entry.reps) > Math.max(...prior.map(p=>e1rm(p.weight||0,p.reps)));
  };

  const addSet = () => {
    if (!exName || !reps || (!isBW && !weight)) return;
    if (date > todayStr()) { setDate(todayStr()); return; } // no logging the future
    const entry = { id: Date.now(), date, exercise: exName, set: setNum,
      weight: isBW ? null : toLb(parseFloat(weight), units), reps: parseInt(reps), effort, notes };
    const pr = checkPR(entry);
    setData(d => ({ ...d, log: [...d.log, entry] }));
    setJustSaved({ ...entry, pr });
    setSetNum(n => n + 1); setNotes(""); setEffort("");
    if (effort !== "Warm-up") startRest(); // auto-start rest between working sets (no-op when Off)
  };
  const sameAgain = () => {
    if (!justSaved) return;
    setReps(String(justSaved.reps));
    if (justSaved.weight != null) setWeight(String(dispW(justSaved.weight, units)));
    setJustSaved(null);
  };

  const startNewExercise = (name) => { setExName(name); setSetNum(1); setWeight(""); setReps(""); setJustSaved(null); };

  // routine tapped: load the exercise into the form, prefill target reps, jump to today
  const pickFromRoutine = (exercise, reps) => {
    startNewExercise(exercise);
    const already = data.log.filter(e => e.exercise === exercise && e.date === todayStr() && e.effort !== "Warm-up").length;
    setSetNum(already + 1);
    const n = String(reps || "").match(/\d+/);
    if (n) setReps(n[0]);
    setDate(todayStr());
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // exercise search (matches anywhere in the name)
  const [exQ, setExQ] = useState("");
  const exMatches = useMemo(() => {
    const q = exQ.trim().toLowerCase();
    if (!q) return [];
    return data.exercises.filter(x => x.name.toLowerCase().includes(q)).slice(0, 8);
  }, [exQ, data.exercises]);

  const [histQ, setHistQ] = useState("");
  const recent = useMemo(() => {
    const q = histQ.trim().toLowerCase();
    const src = q ? sorted.filter(e => e.exercise.toLowerCase().includes(q)) : sorted;
    return [...src].reverse().slice(0, 30);
  }, [sorted, histQ]);

  const [edit, setEdit] = useState(null); // copy of the set being edited
  const editIsBW = edit ? exMap[edit.exercise]?.type === "Bodyweight" : false;
  const editValid = edit && edit.reps !== "" && edit.exercise && (editIsBW || edit.weight !== "");
  const saveEdit = () => {
    if (!editValid) return;
    setData(d => ({ ...d, log: d.log.map(x => x.id === edit.id ? {
      ...x, date: edit.date > todayStr() ? todayStr() : edit.date, exercise: edit.exercise, set: parseInt(edit.set) || 1,
      weight: editIsBW ? null : toLb(parseFloat(edit.weight), units), reps: parseInt(edit.reps),
      effort: edit.effort, notes: edit.notes,
    } : x) }));
    setEdit(null);
  };

  return (<>
    {restDone && restLeft <= 0 && (
      <div className="card" style={{ padding:"12px 16px", marginBottom:14, borderColor:T.green, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:15, fontWeight:800, color:T.green }}>✅ Rest done — next set!</span>
        <button onClick={()=>setRestDone(false)} style={{ marginLeft:"auto", background:T.input, color:T.sub, padding:"6px 12px", fontSize:13, fontWeight:600 }}>OK</button>
      </div>
    )}
    {restLeft > 0 && (
      <div className="card" style={{ padding:"12px 16px", marginBottom:14, borderColor:T.green }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:26, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums", minWidth:74 }}>
            {Math.floor(restLeft/60)}:{String(restLeft%60).padStart(2,"0")}
          </span>
          <span style={{ fontSize:13, color:T.sub, flex:1 }}>Rest timer</span>
          <button onClick={()=>{ localStorage.setItem("lt-rest-end", String((restEndAt() || Date.now()) + 30000)); setRestLeft(s=>s+30); }} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"7px 12px", fontSize:13, fontWeight:600 }}>+30s</button>
          <button onClick={stopRest} style={{ background:T.input, color:T.sub, padding:"7px 12px", fontSize:13, fontWeight:600 }}>Skip</button>
        </div>
        <div style={{ height:5, background:T.input, borderRadius:99, marginTop:10, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${restDur>0 ? Math.min(100, restLeft/restDur*100) : 100}%`, background:T.green, borderRadius:99, transition:"width 1s linear" }} />
        </div>
      </div>
    )}
    {routinesOn && <RoutinesPanel data={data} setData={setData} onPick={pickFromRoutine} />}
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>Log a set</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <label style={lbl}>Date<input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Set #<input type="number" min="1" value={setNum} onChange={e=>setSetNum(parseInt(e.target.value)||1)} /></label>
      </div>
      <label style={lbl}>Exercise
        <input value={exQ} onChange={e=>setExQ(e.target.value)} placeholder="🔍 Type to search (e.g. push)…"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:6}} />
        {exMatches.length > 0 && (
          <div style={{border:`1px solid ${T.line}`, borderRadius:10, overflow:"hidden", marginBottom:6}}>
            {exMatches.map(x=>(
              <button key={x.name} type="button" onClick={()=>{ startNewExercise(x.name); setExQ(""); }}
                style={{display:"block", width:"100%", textAlign:"left", padding:"11px 13px", background:T.input,
                  color:T.ink, borderRadius:0, borderBottom:`1px solid ${T.line}`, fontSize:14.5, fontWeight:600}}>
                {x.name} <span style={{color:T.sub, fontSize:12, fontWeight:500}}>· {muscleOf(x)}</span>
              </button>
            ))}
          </div>
        )}
        {exQ.trim() && !exMatches.length && (
          <div style={{fontSize:12.5, color:T.sub, marginBottom:6}}>No match — you can add new moves in the 📚 Library tab.</div>
        )}
        <select value={exName} onChange={e=>startNewExercise(e.target.value)}>
          <option value="">— pick an exercise —</option>
          {MUSCLES.map(m => (
            <optgroup key={m} label={m}>
              {data.exercises.filter(x=>muscleOf(x)===m).map(x=><option key={x.name}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {exName && (
        <div style={{ background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:"9px 12px", margin:"10px 0", fontSize:14 }}>
          {lastTime?.first
            ? <b>First time logging this!</b>
            : <>Last time: <b>{lastTime.text}</b> <span style={{color:T.sub}}>({fmtDate(lastTime.date)})</span> — beat it.
              {beaten && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:8}}>🔥 Beating last time!</span>}</>}
          {isBW && <div style={{fontSize:12, color:T.sub, marginTop:2}}>Bodyweight move — tracked by reps, no weight needed.</div>}
          {sparkPts && sparkPts.length >= 2 && (
            <div style={{display:"flex", alignItems:"center", gap:10, marginTop:8}}>
              <Spark pts={sparkPts} w={110} h={28} />
              <span style={{fontSize:11.5, color:T.sub}}>your last {sparkPts.length} sessions ({isBW ? "best reps" : "best est. 1RM"})</span>
            </div>
          )}
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns: isBW ? "1fr" : "1fr 1fr", gap:10, marginBottom:10}}>
        {!isBW && <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>}
        <label style={lbl}>Reps<input type="number" inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} /></label>
      </div>
      {usesPlates(exMap[exName]) && (
        <div style={{ background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:"10px 12px", marginBottom:10, fontSize:13.5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: (plateMode==="build" || weight>0) ? 9 : 0, flexWrap:"wrap" }}>
            <span style={{fontWeight:700}}>🏋️ Plates</span>
            <div style={{ display:"flex", background:T.input, borderRadius:8, padding:2 }}>
              <button onClick={()=>setPlateMode("weight")} style={{ padding:"4px 10px", fontSize:12, borderRadius:6, background: plateMode==="weight"?T.green:"none", color: plateMode==="weight"?"#000":T.sub, fontWeight:700 }}>Show for weight</button>
              <button onClick={()=>setPlateMode("build")} style={{ padding:"4px 10px", fontSize:12, borderRadius:6, background: plateMode==="build"?T.green:"none", color: plateMode==="build"?"#000":T.sub, fontWeight:700 }}>Tap what's loaded</button>
            </div>
            <select value={bar} onChange={e=>{ const nb=parseFloat(e.target.value); setBar(nb); if(plateMode==="build") setWeight(built.length? String(nb + 2*sumSide) : ""); }}
              style={{width:"auto", marginLeft:"auto", padding:"4px 26px 4px 8px", fontSize:12.5, minHeight:0}}>
              {barOpts.map(b=><option key={b} value={b}>{b===0 ? "no bar" : `${b} ${uLabel(units)} bar`}</option>)}
            </select>
          </div>

          {plateMode==="weight" ? (
            weight>0 ? (() => {
              const res = platesPerSide(parseFloat(weight), bar, plateSet);
              return (
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{color:T.sub, fontSize:12.5}}>Load per side:</span>
                  {!res ? <span style={{color:T.sub}}>at or below the bar — no plates</span>
                    : <>
                      <span style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                        {res.plates.map((p,i)=>(<span key={i} style={{background:T.mint, color:T.green, borderRadius:6, padding:"1px 7px", fontWeight:700, fontSize:12.5}}>{p}</span>))}
                      </span>
                      {res.leftover > 0 && <span style={{color:T.sub, fontSize:12}}>(+{res.leftover} left over)</span>}
                    </>}
                </div>
              );
            })() : <div style={{color:T.sub, fontSize:12.5}}>Type a weight above and I'll show the plates to load.</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:9 }}>
                {plateSet.map(p=>(
                  <button key={p} onClick={()=>addPlate(p)} style={{ background:T.input, border:`1px solid ${T.line}`, color:T.ink, borderRadius:8, padding:"7px 12px", fontWeight:700, fontSize:13.5 }}>+{p}</button>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{color:T.sub, fontSize:12.5}}>Per side:</span>
                {built.length ? (
                  <span style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                    {built.map((p,i)=>(<span key={i} style={{background:T.mint, color:T.green, borderRadius:6, padding:"1px 7px", fontWeight:700, fontSize:12.5}}>{p}</span>))}
                  </span>
                ) : <span style={{color:T.sub, fontSize:12.5}}>nothing yet — tap the plates on the bar</span>}
                {built.length>0 && <>
                  <button onClick={undoPlate} style={{ background:"none", color:T.sub, fontSize:12.5, textDecoration:"underline", padding:"0 4px", marginLeft:"auto" }}>undo</button>
                  <button onClick={clearPlates} style={{ background:"none", color:T.danger, fontSize:12.5, textDecoration:"underline", padding:"0 4px" }}>clear</button>
                </>}
              </div>
              <div style={{ marginTop:9, fontSize:15 }}>
                Total: <b style={{color:T.green, fontSize:17}}>{bar + 2*sumSide} {uLabel(units)}</b>
                <span style={{color:T.sub, fontSize:12, marginLeft:6}}>({bar} bar + {sumSide}×2)</span>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Effort / Warm-up
          <select value={effort} onChange={e=>setEffort(e.target.value)}>
            <option value="">—</option>{EFFORTS.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label style={lbl}>Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional" /></label>
      </div>
      <button onClick={addSet} disabled={!exName || !reps || (!isBW && !weight)}
        style={{ width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:(!exName||!reps||(!isBW&&!weight))?0.45:1 }}>
        Save set {setNum}
      </button>

      <div style={{display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap"}}>
        <span style={{fontSize:12.5, color:T.sub}}>⏱ Rest:</span>
        {[0,60,90,120,180].map(s=>(
          <button key={s} onClick={()=>{ setRestDur(s); if (s===0) stopRest(); }} style={{
            background: restDur===s ? T.mint : T.input, color: restDur===s ? T.green : T.sub,
            border:`1px solid ${restDur===s ? T.green : T.line}`, padding:"5px 11px", fontSize:12.5, fontWeight:700,
          }}>{s===0?"Off":s<60?`${s}s`:`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`}</button>
        ))}
        <span style={{fontSize:11.5, color:T.sub}}>{restDur===0?"timer off — stays off until you pick a time":"auto-starts after each working set"}</span>
      </div>

      {justSaved && (
        <div style={{marginTop:12, textAlign:"center", fontSize:14}}>
          Saved: {justSaved.exercise} — set {justSaved.set}{justSaved.weight!=null?`, ${dispW(justSaved.weight,units)}×${justSaved.reps}`:`, ${justSaved.reps} reps`}
          {justSaved.pr && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:8}}>🎉 New PR!</span>}
          <div style={{marginTop:8}}>
            <button onClick={sameAgain} style={{ background:T.input, border:`1px solid ${T.line}`, color:T.ink, padding:"8px 16px", fontSize:13.5, fontWeight:700 }}>
              ↻ Same again
            </button>
          </div>
        </div>
      )}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent sets</div>
      <input value={histQ} onChange={e=>setHistQ(e.target.value)} placeholder="🔍 Filter by exercise…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th>Set</th><th>Weight ({uLabel(units)})</th><th>Reps</th><th>Effort</th><th></th></tr></thead>
          <tbody>{recent.map(e => (<Fragment key={e.id}>
            <tr>
              <td>{fmtDate(e.date)}</td><td>{e.exercise}</td><td>{e.set}</td>
              <td>{e.weight==null ? "BW" : dispW(e.weight, units)}</td><td>{e.reps}</td><td style={{color:T.sub}}>{e.effort||""}</td>
              <td style={{whiteSpace:"nowrap"}}>
                <PencilBtn onClick={()=>setEdit({ id:e.id, date:e.date, exercise:e.exercise, set:e.set, weight:e.weight==null ? "" : dispW(e.weight, units), reps:e.reps, effort:e.effort||"", notes:e.notes||"" })} />
                <ConfirmX onConfirm={()=>setData(d=>({...d, log:d.log.filter(x=>x.id!==e.id)}))} />
              </td>
            </tr>
            {edit?.id === e.id && (
              <tr><td colSpan={7} style={{padding:"6px 4px"}}>
                <div style={editBox}>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                    <label style={lbl}>Date<input type="date" value={edit.date} max={todayStr()} onChange={ev=>setEdit(s=>({...s, date:ev.target.value}))} /></label>
                    <label style={lbl}>Set #<input type="number" min="1" value={edit.set} onChange={ev=>setEdit(s=>({...s, set:ev.target.value}))} /></label>
                  </div>
                  <label style={{...lbl, marginBottom:8, display:"block"}}>Exercise
                    <select value={edit.exercise} onChange={ev=>setEdit(s=>({...s, exercise:ev.target.value}))}>
                      {MUSCLES.map(m => (
                        <optgroup key={m} label={m}>
                          {data.exercises.filter(x=>muscleOf(x)===m).map(x=><option key={x.name}>{x.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div style={{display:"grid", gridTemplateColumns: editIsBW ? "1fr" : "1fr 1fr", gap:8, marginBottom:8}}>
                    {!editIsBW && <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={edit.weight} onChange={ev=>setEdit(s=>({...s, weight:ev.target.value}))} /></label>}
                    <label style={lbl}>Reps<input type="number" inputMode="numeric" value={edit.reps} onChange={ev=>setEdit(s=>({...s, reps:ev.target.value}))} /></label>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                    <label style={lbl}>Effort
                      <select value={edit.effort} onChange={ev=>setEdit(s=>({...s, effort:ev.target.value}))}>
                        <option value="">—</option>{EFFORTS.map(x=><option key={x}>{x}</option>)}
                      </select>
                    </label>
                    <label style={lbl}>Notes<input value={edit.notes} onChange={ev=>setEdit(s=>({...s, notes:ev.target.value}))} /></label>
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={saveEdit} disabled={!editValid} style={{...saveSm, opacity:editValid?1:0.45}}>Save changes</button>
                    <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                  </div>
                </div>
              </td></tr>
            )}
          </Fragment>))}
            {!recent.length && <tr><td colSpan={7} style={{color:T.sub}}>Nothing logged yet — your first set goes here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>);
}
const lbl = { display:"block", fontSize:12.5, fontWeight:600, color:"#A9BDBA", marginBottom:0 };

/* Feather-light inline SVG sparkline — no chart library needed (safe for the Log tab). */
function Spark({ pts, w = 88, h = 26 }) {
  if (!pts || pts.length < 2) return <span style={{ color: T.sub, fontSize: 11 }}>—</span>;
  const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
  const step = w / (pts.length - 1);
  const color = pts[pts.length - 1] >= pts[0] ? T.green : T.down;
  const xy = pts.map((v, i) => [i * step, h - 3 - (v - min) / span * (h - 6)]);
  const last = xy[xy.length - 1];
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <polyline points={xy.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
        fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

/* Horizontal progress bar with a highlighted target zone (weekly sets). */
function TargetBar({ count, color, lo = 12, hi = 16, max = 20 }) {
  const pct = Math.min(count, max) / max * 100;
  return (
    <div style={{ position: "relative", height: 10, background: T.input, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: `${lo / max * 100}%`, width: `${(hi - lo) / max * 100}%`, top: 0, bottom: 0, background: "rgba(255,255,255,.10)" }} />
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width .6s ease" }} />
    </div>
  );
}

/* Small pencil button that opens an inline editor. */
function PencilBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Edit" style={{ background:"none", color:T.sub, fontSize:14, padding:"2px 7px" }}>
      ✎
    </button>
  );
}
const saveSm = { background:T.green, color:"#000", fontWeight:700, padding:"9px 18px", fontSize:13.5 };
const cancelSm = { background:"none", border:`1px solid ${T.line}`, color:T.sub, padding:"9px 14px", fontSize:13.5 };
const editBox = { background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:12 };

/* Two-tap delete: first tap arms it ("Sure?"), second tap confirms; disarms itself. */
function ConfirmX({ onConfirm, label }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) return (
    <button onClick={onConfirm} style={{ background:T.down, color:"#000", fontSize:11.5, fontWeight:700, padding:"3px 10px", whiteSpace:"nowrap" }}>
      Sure?
    </button>
  );
  return (
    <button onClick={()=>setArmed(true)} style={{ background:"none", color:label?T.sub:T.danger, fontSize:label?12.5:13, textDecoration:label?"underline":"none" }}>
      {label || "✕"}
    </button>
  );
}

/* ---------- drag-to-reorder (pointer events: works on mouse AND touch) ---------- */
function useReorder(storageKey, defaultIds) {
  const [saved, setSaved] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(s)) return s; } catch {}
    return null;
  });
  useEffect(() => { if (saved) localStorage.setItem(storageKey, JSON.stringify(saved)); }, [storageKey, saved]);
  // reconcile: honor saved order, append any new widgets, drop any that vanished
  const base = saved || defaultIds;
  const ids = [...base.filter(id => defaultIds.includes(id)), ...defaultIds.filter(id => !base.includes(id))];
  return [ids, setSaved];
}

/* One sortable widget (dnd-kit). Drag starts only from the grip pill, so buttons
   and charts inside the card keep working normally. */
function SortableWidget({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform), transition,
      position:"relative", zIndex: isDragging ? 20 : "auto", opacity: isDragging ? 0.9 : 1,
      outline:`2px dashed ${isDragging ? T.green : T.line}`, outlineOffset:-3, borderRadius:16, marginBottom:2,
    }}>
      <div className="drag-handle" {...attributes} {...listeners}
        style={{ position:"absolute", top:6, left:"50%", transform:"translateX(-50%)", zIndex:6,
          background:T.green, color:"#000", borderRadius:99, padding:"3px 16px", fontSize:12, fontWeight:800,
          boxShadow:"0 2px 8px rgba(0,0,0,.4)", cursor:"grab", touchAction:"none", userSelect:"none" }}>
        ⠿ drag
      </div>
      {/* freeze the card's interior while arranging so hovering (e.g. the
          calendar's day cells) can't fire — only the drag handle stays live */}
      <div style={{ pointerEvents:"none" }}>{children}</div>
    </div>
  );
}

/* renderItem(id) -> node. When enabled is false it just renders in order (no dnd). */
function DragList({ ids, setIds, enabled, renderItem }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) setIds(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)));
  };
  if (!enabled) return ids.map(id => <div key={id}>{renderItem(id)}</div>);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map(id => <SortableWidget key={id} id={id}>{renderItem(id)}</SortableWidget>)}
      </SortableContext>
    </DndContext>
  );
}

/* ---------- export helpers ---------- */
const csvEsc = (v) => { const s = v==null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const download = (name, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* Workout calendar: last 90 days, built for thumbs — the 13-week grid fits the
   screen with no sideways scrolling, and TAPPING a day shows its details below. */
const CAL_VIEWS = { "1M": 5, "3M": 13, "6M": 26, "1Y": 52 }; // label -> weeks shown
function WorkoutHeatmap({ log, cardio, exMap = {} }) {
  const [sel, setSel] = useState(todayStr());
  // view choice sticks (remembered on this device)
  const [view, setView] = useState(() => {
    const v = localStorage.getItem("lt-cal-view");
    return CAL_VIEWS[v] ? v : "3M";
  });
  useEffect(() => { localStorage.setItem("lt-cal-view", view); }, [view]);
  const { cols, monthMarks, info } = useMemo(() => {
    const info = {}; // date -> { n (sets), ms (muscles), ex {name:sets}, cd [cardio lines] }
    for (const e of (log||[])) if (e.effort !== "Warm-up") {
      const d = (info[e.date] ||= { n:0, ms:new Set(), ex:{}, cd:[] });
      d.n++; d.ex[e.exercise] = (d.ex[e.exercise]||0) + 1;
      for (const m of musclesOf(exMap[e.exercise])) d.ms.add(m);
      for (const m of secondariesOf(exMap[e.exercise])) d.ms.add(m);
    }
    for (const c of (cardio||[])) {
      const d = (info[c.date] ||= { n:0, ms:new Set(), ex:{}, cd:[] });
      d.cd.push(`${c.activity} · ${c.duration} min`);
    }
    const WEEKS = CAL_VIEWS[view];
    const end = new Date(todayStr() + "T00:00");
    const start = new Date(weekStart(todayStr()) + "T00:00");
    start.setDate(start.getDate() - 7*(WEEKS-1));
    const cols = []; const monthMarks = [];
    let d = new Date(start), lastMonth = -1;
    for (let w=0; w<WEEKS; w++) {
      const days = [];
      for (let i=0; i<7; i++) {
        const key = d.toISOString().slice(0,10);
        const di = info[key];
        days.push({ key, n: (di?.n || 0) + (di?.cd.length || 0), future: d > end });
        if (d.getMonth() !== lastMonth && d.getDate() <= 7) { monthMarks.push({ col:w, label:d.toLocaleString("en-US",{month:"short"}) }); lastMonth = d.getMonth(); }
        d.setDate(d.getDate()+1);
      }
      cols.push(days);
    }
    return { cols, monthMarks, info };
  }, [log, cardio, exMap, view]);

  const shade = (n, future) => {
    if (future) return "transparent";
    if (n === 0) return T.input;
    if (n <= 2) return "rgba(0,200,5,.30)";
    if (n <= 4) return "rgba(0,200,5,.55)";
    if (n <= 6) return "rgba(0,200,5,.80)";
    return T.green;
  };

  const order = [...MUSCLES, "Cardio"];
  const day = info[sel];
  const muscles = day ? [...day.ms].sort((a,b)=>order.indexOf(a)-order.indexOf(b)) : [];

  const weeks = CAL_VIEWS[view];
  const gap = weeks > 26 ? 2 : 4;
  const pick = (d) => { if (!d.future) setSel(d.key); };
  const outlineFor = (d) =>
    sel===d.key ? `2px solid ${T.ink}` : d.key===todayStr() ? `1.5px solid ${T.sub}` : "none";

  /* 1M: a real calendar — 7 columns (Mon–Sun), day numbers, exactly the last 30 days */
  const monthGrid = () => {
    const days = cols.flat();
    const cutoff = new Date(todayStr() + "T00:00"); cutoff.setDate(cutoff.getDate() - 29);
    const cutKey = cutoff.toISOString().slice(0,10);
    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6, maxWidth:380, margin:"0 auto" }}>
        {["M","T","W","T","F","S","S"].map((w,i)=>(
          <div key={i} style={{ textAlign:"center", fontSize:10.5, color:T.sub, fontWeight:600 }}>{w}</div>
        ))}
        {days.map(d=>{
          const hidden = d.future || d.key < cutKey;
          return (
            <div key={d.key} onClick={()=>pick(d)} onMouseEnter={()=>pick(d)}
              style={{ aspectRatio:"1", borderRadius:8, background:shade(d.n, d.future),
                visibility: hidden ? "hidden" : "visible", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12.5, fontWeight:600, color: d.n > 4 ? "#000" : T.sub,
                outline: outlineFor(d), outlineOffset:-1 }}>
              {Number(d.key.slice(8))}
            </div>
          );
        })}
      </div>
    );
  };

  /* 3M/6M/1Y: GitHub-style week columns, capped so cells never balloon */
  const weekGrid = () => (
    <div style={{ maxWidth: weeks===13 ? 400 : weeks===26 ? 700 : "none", margin:"0 auto" }}>
      <div style={{ position:"relative", height:14 }}>
        {monthMarks.map((m,i)=>(
          <span key={i} style={{ position:"absolute", left:`${m.col/weeks*100}%`, fontSize:10, color:T.sub }}>{m.label}</span>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${weeks}, 1fr)`, gap }}>
        {cols.map((week,wi)=>(
          <div key={wi} style={{ display:"flex", flexDirection:"column", gap }}>
            {week.map(d=>(
              <div key={d.key} onClick={()=>pick(d)} onMouseEnter={()=>pick(d)}
                style={{ aspectRatio:"1", borderRadius: weeks > 26 ? 2 : 4, background:shade(d.n, d.future),
                  cursor: d.future ? "default" : "pointer",
                  outline: outlineFor(d), outlineOffset:-1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* view switcher — remembered */}
      <div style={{ display:"flex", gap:2, marginBottom:8, justifyContent:"center" }}>
        {Object.keys(CAL_VIEWS).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{
            background:"none", padding:"4px 10px", fontSize:12, fontWeight:700, letterSpacing:".5px", borderRadius:0,
            color: view===v?T.green:T.sub, borderBottom: view===v?`2px solid ${T.green}`:"2px solid transparent",
          }}>{v}</button>
        ))}
      </div>
      {view === "1M" ? monthGrid() : weekGrid()}

      {/* tapped-day details */}
      <div style={{ marginTop:12, background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"10px 13px" }} key={sel}>
        <div style={{ fontSize:13.5, fontWeight:700, marginBottom: day ? 4 : 0 }}>
          {fmtDate(sel)}{sel===todayStr() ? " (today)" : ""}
          {!day && (sel < todayStr()
            ? <span style={{ color:T.sub, fontWeight:500 }}> — rest day 😴</span>
            : <span style={{ color:T.sub, fontWeight:500 }}> — nothing logged yet</span>)}
        </div>
        {day && (
          <>
            {day.n > 0 && (
              <div style={{ fontSize:12.5, marginBottom:4 }}>
                <b style={{ color:T.green }}>{day.n} set{day.n===1?"":"s"}</b>
                {muscles.length > 0 && <span style={{ color:T.sub }}> · {muscles.join(", ")}</span>}
              </div>
            )}
            {Object.keys(day.ex).length > 0 && (
              <div style={{ fontSize:12, color:T.sub, lineHeight:1.6 }}>
                {Object.entries(day.ex).map(([n,c]) => `${n} ×${c}`).join(" · ")}
              </div>
            )}
            {day.cd.map((c,i)=>(
              <div key={i} style={{ fontSize:12, color:T.sub }}>🏃 {c}</div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* Spotify-Wrapped-style yearly recap. */
function YearRecap({ data }) {
  const units = useUnit();
  const year = new Date().getFullYear();
  const stats = useMemo(() => {
    const log = (data.log||[]).filter(e => e.date.startsWith(String(year)));
    const cardio = (data.cardio||[]).filter(c => c.date.startsWith(String(year)));
    const days = new Set([...log.map(e=>e.date), ...cardio.map(c=>c.date)]);
    const volume = log.reduce((s,e)=>s + (e.weight||0)*e.reps, 0);
    const byMuscle = {};
    const exCred = Object.fromEntries((data.exercises||[]).map(x=>[x.name,muscleCredits(x)]));
    for (const e of log) { if (e.effort==="Warm-up") continue; for (const [m,w] of exCred[e.exercise]||[]) byMuscle[m]=(byMuscle[m]||0)+w; }
    const topMuscle = Object.entries(byMuscle).sort((a,b)=>b[1]-a[1])[0];
    let bigPR = null;
    for (const e of log) {
      if (e.weight==null) continue;
      const est = e1rm(e.weight, e.reps);
      if (!bigPR || est > bigPR.est) bigPR = { est, text:`${dispW(e.weight,units)}×${e.reps} ${e.exercise}` };
    }
    const cardioMin = cardio.reduce((s,c)=>s+(c.duration||0),0);
    return { sets: log.length, days: days.size, volume: Math.round(dispW(volume,units)), topMuscle, bigPR, cardioMin, empty: !log.length && !cardio.length };
  }, [data, year, units]);

  if (stats.empty) return null;
  const Item = ({ big, label }) => (
    <div style={{ textAlign:"center", padding:"6px 4px" }}>
      <div style={{ fontSize:24, fontWeight:800, color:T.ink, lineHeight:1.15 }}>{big}</div>
      <div style={{ fontSize:11.5, color:T.sub }}>{label}</div>
    </div>
  );
  return (
    <div className="card" style={{ background:"linear-gradient(160deg,#0C1A0E,#0C0D0D 60%)", border:`1px solid ${T.creamLine}` }}>
      <div className="h" style={{ fontSize:19, color:T.green, marginBottom:2 }}>✨ {year} in review</div>
      <div style={{ fontSize:12.5, color:T.sub, marginBottom:12 }}>Your year so far.</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        <Item big={stats.sets} label="sets logged" />
        <Item big={stats.days} label="workout days" />
        <Item big={stats.volume.toLocaleString()} label={`${uLabel(units)} total volume`} />
        <Item big={stats.topMuscle ? stats.topMuscle[0] : "—"} label="most trained" />
        <Item big={stats.cardioMin} label="cardio minutes" />
        <Item big={stats.bigPR ? dispW(stats.bigPR.est, units) : "—"} label="top est. 1RM" />
      </div>
      {stats.bigPR && <div style={{ marginTop:12, textAlign:"center", fontSize:13 }}>
        🏆 Biggest lift: <b style={{color:T.green}}>{stats.bigPR.text}</b>
      </div>}
    </div>
  );
}

/* ================= DASHBOARD ================= */
const DASH_WIDGETS = ["charts","target","streak","calendar","muscle","recap"];
function Dashboard({ data, exMap, setData, own = true }) {
  const units = useUnit();
  // range sticks forever (remembered on this device)
  const [range, setRange] = useState(() => {
    const r = localStorage.getItem("lt-range");
    return r && RANGE_DAYS[r] !== undefined ? r : "1M";
  });
  useEffect(() => { localStorage.setItem("lt-range", range); }, [range]);
  /* draggable dashboard widget order (remembered on this device) */
  const [arrange, setArrange] = useState(false);
  const [wOrder, setWOrder] = useReorder("lt-dash-order", DASH_WIDGETS);
  /* Pinned charts live in account data (data.pins) so they sync across devices and
     friends' profiles show THEIR pins. Local state first, then persisted when it's your own. */
  const [pins, setPins] = useState(() => Array.isArray(data.pins) ? data.pins : []);
  useEffect(() => {
    if (!own) return;
    setData(d => {
      const cur = Array.isArray(d.pins) ? d.pins : [];
      return cur.length === pins.length && cur.every((p, i) => p === pins[i]) ? d : { ...d, pins };
    });
  }, [pins, own, setData]);
  // read-only profiles: always mirror THAT person's pins (data can arrive/switch after mount)
  useEffect(() => {
    if (!own) setPins(Array.isArray(data.pins) ? data.pins : []);
  }, [own, data.pins]);

  /* exercises with at least one working set, newest session first */
  const logged = useMemo(() => {
    const last = {};
    for (const e of data.log) {
      if (e.effort === "Warm-up" || !exMap[e.exercise]) continue;
      if (!last[e.exercise] || e.date > last[e.exercise]) last[e.exercise] = e.date;
    }
    return Object.keys(last).sort((a, b) => last[b].localeCompare(last[a]));
  }, [data.log, exMap]);

  const validPins = pins.filter(p => exMap[p]);
  const picks = useMemo(() => {
    const out = [...validPins];
    for (const name of logged) {
      if (out.length >= 4) break;
      if (!out.includes(name)) out.push(name);
    }
    return out.slice(0, 4);
  }, [pins, logged, exMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPinned = (i) => i < validPins.length;
  /* choosing from the dropdown pins that slot; the 📌 button toggles */
  const changePick = (i, name) => setPins(() => {
    const without = validPins.filter(p => p !== name);
    without.splice(Math.min(i, without.length), 0, name);
    return without;
  });
  const togglePin = (i) => setPins(() => {
    if (i < validPins.length) return validPins.filter((_, j) => j !== i);
    const name = picks[i];
    return name && !validPins.includes(name) ? [...validPins, name] : validPins;
  });

  const chartOpts = useMemo(() => [...logged].sort((a, b) => a.localeCompare(b)), [logged]);

  const seriesFor = (exName) => {
    const ex = exMap[exName]; if (!ex) return [];
    const entries = data.log.filter(e => e.exercise===exName && !(e.effort==="Warm-up"));
    if (!entries.length) return [];
    const isBWex = ex.type==="Bodyweight";

    /* 1D: the latest session set-by-set — one dot per set, running rep total
       for bodyweight moves, per-set est. 1RM for weighted ones */
    if (range === "1D") {
      const lastDate = entries.reduce((a,b)=>a.date>b.date?a:b).date;
      const day = entries.filter(e=>e.date===lastDate).sort((a,b)=>(a.id||0)-(b.id||0));
      let run = 0;
      return day.map((e,i) => isBWex
        ? (run += e.reps, { date:lastDate, label:`Set ${e.set ?? i+1}`, value:run, sub:`+${e.reps} reps (total ${run})` })
        : { date:lastDate, label:`Set ${e.set ?? i+1}`, value:dispW(e1rm(e.weight||0, e.reps), units), sub:`${dispW(e.weight,units)} ${uLabel(units)} × ${e.reps}` });
    }

    /* longer ranges: one point per day — TOTAL reps that day for bodyweight
       moves, best est. 1RM that day for weighted ones */
    const byDate = {};
    for (const e of entries) {
      if (isBWex) byDate[e.date] = (byDate[e.date]||0) + e.reps;
      else byDate[e.date] = Math.max(byDate[e.date]||0, dispW(e1rm(e.weight||0, e.reps), units));
    }
    let pts = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([d,v])=>({ date:d, label:fmtDate(d), value:Math.round(v*10)/10 }));
    const days = RANGE_DAYS[range];
    if (days!==Infinity && pts.length) {
      const latest = new Date(pts[pts.length-1].date+"T00:00");
      const cutoff = new Date(latest); cutoff.setDate(cutoff.getDate()-days);
      pts = pts.filter(p => new Date(p.date+"T00:00") >= cutoff);
    }
    return pts;
  };

  /* weekly sets per muscle (this week, warm-ups excluded) */
  const wkStart = weekStart(todayStr());
  const weekSets = useMemo(() => {
    const c = Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for (const e of data.log) {
      if (e.effort==="Warm-up") continue;
      if (weekStart(e.date)!==wkStart) continue;
      for (const [m,w] of muscleCredits(exMap[e.exercise])) if (m in c) c[m]+=w;
    }
    return c;
  }, [data.log, exMap, wkStart]);

  /* 30-day pie */
  const pieData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    const c = Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for (const e of data.log) {
      if (e.effort==="Warm-up") continue;
      if (new Date(e.date+"T00:00") < cutoff) continue;
      for (const [m,w] of muscleCredits(exMap[e.exercise])) if (m in c) c[m]+=w;
    }
    return MUSCLES.map((m,i)=>({name:m, value:Math.round(c[m]*10)/10, fill:MUSCLE_COLORS[i]})).filter(x=>x.value>0);
  }, [data.log, exMap]);

  /* weekly streak (lifting OR cardio) with mid-week protection */
  const streak = useMemo(() => computeStreak(data.log, data.cardio), [data.log, data.cardio]);

  const cardioMin = data.cardio.filter(e=>weekStart(e.date)===wkStart).reduce((s,e)=>s+(e.duration||0),0);

  /* each dashboard block is a widget you can drag to reorder */
  const widgets = {};
  widgets.charts = (<>
    <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", gap:8, flexWrap:"wrap"}}>
      <div className="h" style={{fontSize:16, color:T.tealDk}}>📈 Progress</div>
      <div style={{display:"flex", gap:2}}>
        {Object.keys(RANGE_DAYS).map(r=>(
          <button key={r} onClick={()=>setRange(r)} style={{
            background:"none", padding:"5px 10px", fontSize:12, fontWeight:700, letterSpacing:".5px", borderRadius:0,
            color: range===r?T.green:T.sub, borderBottom: range===r?`2px solid ${T.green}`:"2px solid transparent",
          }}>{r.toUpperCase()}</button>
        ))}
      </div>
    </div>

    {picks.length === 0 && (
      <div className="card" style={{textAlign:"center", color:T.sub, fontSize:14, padding:"30px 16px"}}>
        Log your first set and your charts show up here automatically. 📈
      </div>
    )}

    {picks.map((p,i)=>{
      const pts = seriesFor(p);
      const pinned = isPinned(i);
      /* latest session totals for this exercise (working sets only) */
      const sess = data.log.filter(e => e.exercise===p && e.effort!=="Warm-up");
      const lastDate = sess.length ? sess.reduce((a,b)=>a.date>b.date?a:b).date : null;
      const daySets = lastDate ? sess.filter(e=>e.date===lastDate) : [];
      const dayReps = daySets.reduce((s,e)=>s+e.reps, 0);
      return (
      <div className="card" key={p}>
        <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:6}}>
          <select value={p} onChange={e=>changePick(i, e.target.value)}
            style={{flex:1, background:T.cream, fontWeight:600}}>
            {!chartOpts.includes(p) && <option key={p}>{p}</option>}
            {chartOpts.map(x=><option key={x}>{x}</option>)}
          </select>
          {own && (
          <button onClick={()=>togglePin(i)} title={pinned ? "Unpin — go back to most recent" : "Pin this chart"} style={{
            flexShrink:0, minHeight:38, padding:"5px 12px", fontSize:12.5, fontWeight:700, borderRadius:99,
            background: pinned ? "rgba(0,200,5,.14)" : "none",
            border: `1px solid ${pinned ? T.green : T.line}`,
            color: pinned ? T.green : T.sub,
          }}>
            {pinned ? "📌 Pinned" : "📌 Pin"}
          </button>
          )}
        </div>
        {lastDate && (
          <div style={{fontSize:12.5, color:T.ink, marginBottom:2}}>
            Last workout {fmtDate(lastDate)}: <b style={{color:T.green}}>{daySets.length} set{daySets.length===1?"":"s"}</b> · <b style={{color:T.green}}>{dayReps} reps</b>
          </div>
        )}
        <div style={{fontSize:11.5, color:T.sub, fontStyle:"italic", marginBottom:4}}>
          {range==="1D" ? "Latest session, set by set — tap a dot for the details"
            : exMap[p]?.type==="Bodyweight" ? "Tracked by total reps per day" : `Tracked by est. 1RM (${uLabel(units)})`}
        </div>
        {pts.length
          ? <Suspense fallback={<ChartFallback h={210} />}><TrendChart pts={pts} dots={range==="1D"} unit={exMap[p]?.type==="Bodyweight" ? " reps" : " "+uLabel(units)} /></Suspense>
          : <div style={{color:T.sub, fontSize:14, padding:"28px 0", textAlign:"center"}}>No sessions logged for this lift yet.</div>}
      </div>
      );
    })}
  </>);

  widgets.target = (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>Weekly set target</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:12}}>Aim for 12–16 hard sets per muscle — the brighter zone on each bar. Main muscles count a full set; secondary ones (like triceps on bench) count half.</div>
      {MUSCLES.map((m,i)=>{
        const n = weekSets[m];
        const status = n<12 ? "under" : n<=16 ? "✓ on target" : "over";
        const sColor = n<12 ? T.sub : n<=16 ? T.green : T.down;
        return (
          <div key={m} style={{display:"grid", gridTemplateColumns:"78px 1fr 92px", gap:10, alignItems:"center", marginBottom:9}}>
            <span style={{fontSize:13, fontWeight:600}}>{m}</span>
            <TargetBar count={n} color={MUSCLE_COLORS[i]} />
            <span style={{fontSize:12, textAlign:"right", whiteSpace:"nowrap"}}>
              <b style={{color:T.ink, fontSize:13}}>{n}</b> <span style={{color:sColor, fontWeight:600}}>{status}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  widgets.streak = (
    <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center"}}>
      <div><div style={kpiN}>{streak.cur}</div><div style={kpiL}>Current streak (weeks)</div></div>
      <div><div style={kpiN}>{streak.best}</div><div style={kpiL}>Best streak (weeks)</div></div>
      <div><div style={kpiN}>{cardioMin}</div><div style={kpiL}>Cardio this week (min)</div></div>
    </div>
  );

  widgets.calendar = (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>Workout calendar</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Greener means more sets. Tap a day (hover works on a computer) to see what you did.</div>
      <WorkoutHeatmap log={data.log} cardio={data.cardio} exMap={exMap} />
    </div>
  );

  widgets.muscle = (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>Last 30 days — work by muscle</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:4}}>Main muscles get full credit, secondaries half — a bench set counts 1 for chest, ½ for triceps.</div>
      {pieData.length ? (
        <Suspense fallback={<ChartFallback h={230} />}><MusclePie data={pieData} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log some sets and your split shows up here.</div>}
    </div>
  );

  widgets.recap = <YearRecap data={data} />;

  return (<>
    {own && (
      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:10}}>
        <button onClick={()=>setArrange(a=>!a)} style={{
          background: arrange ? T.green : T.input, color: arrange ? "#000" : T.sub,
          border:`1px solid ${arrange ? T.green : T.line}`, padding:"6px 14px", fontSize:13, fontWeight:700,
        }}>{arrange ? "✓ Done arranging" : "⇅ Arrange"}</button>
      </div>
    )}
    <DragList ids={own ? wOrder : DASH_WIDGETS} setIds={setWOrder} enabled={arrange && own}
      renderItem={(id) => widgets[id]} />
  </>);
}
const kpiN = { fontWeight:800, fontSize:28, color:T.ink };
const kpiL = { fontSize:11.5, color:T.sub };


/* ================= RECORDS ================= */
function RecordsTab({ data, exMap }) {
  const units = useUnit();
  const rows = useMemo(() => data.exercises.map(ex => {
    const entries = data.log.filter(e => e.exercise===ex.name);
    if (!entries.length) return { ...ex, empty:true };
    const isBW = ex.type==="Bodyweight";
    const mostReps = Math.max(...entries.map(e=>e.reps));
    const lastDone = entries.reduce((a,b)=>a.date>b.date?a:b).date;
    const byDate = {};
    for (const e of entries) {
      const v = isBW ? e.reps : e1rm(e.weight||0, e.reps);
      byDate[e.date] = Math.max(byDate[e.date]||0, v);
    }
    const spark = Object.keys(byDate).sort().map(k=>byDate[k]).slice(-10);
    const sessions = Object.keys(byDate).length;
    if (isBW) return { ...ex, isBW:true, heaviest:"BW", best:"BW", est:null, mostReps, vol:"—", lastDone, spark, sessions };
    const maxW = Math.max(...entries.map(e=>e.weight||0));
    const repsAtMax = Math.max(...entries.filter(e=>e.weight===maxW).map(e=>e.reps));
    const bestEntry = entries.reduce((a,b)=> e1rm(b.weight||0,b.reps)>e1rm(a.weight||0,a.reps)?b:a);
    const vol = Math.max(...entries.map(e=>(e.weight||0)*e.reps));
    return { ...ex, isBW:false, heaviest:`${dispW(maxW,units)} × ${repsAtMax}`, best:`${dispW(bestEntry.weight,units)} × ${bestEntry.reps}`,
      est: dispW(e1rm(bestEntry.weight, bestEntry.reps), units), mostReps, vol: Math.round(dispW(vol,units)), lastDone, spark, sessions };
  }), [data, units]);
  const logged = rows.filter(r=>!r.empty);

  const [filter, setFilter] = useState("All");
  const [recQ, setRecQ] = useState("");
  const [openEx, setOpenEx] = useState(null);
  const hits = (r, m) => musclesOf(r).includes(m) || secondariesOf(r).includes(m);
  const present = MUSCLES.filter(m => logged.some(r => hits(r, m)));
  const q = recQ.trim().toLowerCase();
  const shown = (filter==="All" ? logged : logged.filter(r => hits(r, filter)))
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .slice().sort((a,b)=>b.lastDone.localeCompare(a.lastDone) || a.name.localeCompare(b.name));

  const statBox = { background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"8px 10px" };
  const statL = { fontSize:10.5, color:T.sub, textTransform:"uppercase", letterSpacing:".6px", fontWeight:600 };
  const statV = { fontSize:15, fontWeight:700, color:T.ink, marginTop:2 };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:2}}>🏆 Personal records</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:12}}>Best-ever numbers per lift, in {uLabel(units)} — freshest first. Tap a lift for the full breakdown.</div>
      <input value={recQ} onChange={e=>setRecQ(e.target.value)} placeholder="🔍 Search lifts…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:8}} />
      {/* muscle filter chips (scroll sideways if they overflow) */}
      <div style={{display:"flex", gap:6, overflowX:"auto", paddingBottom:2, WebkitOverflowScrolling:"touch"}}>
        {["All", ...present].map(m=>(
          <button key={m} onClick={()=>setFilter(m)} style={{
            flexShrink:0, padding:"6px 14px", borderRadius:99, fontSize:13, fontWeight:700,
            background: filter===m ? T.green : T.input, color: filter===m ? "#000" : T.sub,
            border:`1px solid ${filter===m ? T.green : T.line}`,
          }}>{m}</button>
        ))}
      </div>
    </div>

    {!logged.length && (
      <div className="card" style={{color:T.sub, fontSize:14, textAlign:"center", padding:"30px 16px"}}>
        No lifts logged yet — records build themselves as you train. 🏗️
      </div>
    )}

    {shown.map(r=>{
      const open = openEx === r.name;
      return (
        <div key={r.name} className="card" onClick={()=>setOpenEx(o=>o===r.name?null:r.name)}
          style={{padding:"13px 14px", marginBottom:8, cursor:"pointer", borderColor: open ? T.green : T.line}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:15.5, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{r.name}</div>
              <div style={{fontSize:11.5, color:T.sub, marginTop:1}}>{muscleLabel(r)}</div>
            </div>
            <div style={{textAlign:"right", flexShrink:0}}>
              <div style={{fontSize:17, fontWeight:800, color:T.green}}>
                {r.isBW ? r.mostReps : r.est}<span style={{fontSize:11, color:T.sub, fontWeight:600}}> {r.isBW ? "reps" : uLabel(units)}</span>
              </div>
              <div style={{fontSize:10.5, color:T.sub}}>{r.isBW ? "best set" : "est. 1RM"}</div>
            </div>
            <Spark pts={r.spark} />
            <span style={{color:T.sub, fontSize:12, transform: open ? "rotate(90deg)" : "none", transition:"transform .15s ease"}}>▶</span>
          </div>
          {open && (
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:12, animation:"fadeSwap .18s ease-out both"}}>
              <div style={statBox}><div style={statL}>Heaviest</div><div style={statV}>{r.heaviest}</div></div>
              <div style={statBox}><div style={statL}>Best set</div><div style={statV}>{r.best}</div></div>
              <div style={statBox}><div style={statL}>Most reps</div><div style={statV}>{r.mostReps}</div></div>
              <div style={statBox}><div style={statL}>Top volume</div><div style={statV}>{r.vol}</div></div>
              <div style={statBox}><div style={statL}>Sessions</div><div style={statV}>{r.sessions}</div></div>
              <div style={statBox}><div style={statL}>Last done</div><div style={statV}>{fmtDate(r.lastDone)}</div></div>
            </div>
          )}
        </div>
      );
    })}
    {logged.length > 0 && !shown.length && (
      <div className="card" style={{color:T.sub, fontSize:14, textAlign:"center"}}>{recQ ? `Nothing matches "${recQ.trim()}".` : `Nothing logged for ${filter} yet.`}</div>
    )}
  </>);
}

/* ================= BODY WEIGHT ================= */
/* ---------- BMI (height saved once; weight auto-follows the latest weigh-in) ---------- */
const BMI_CATS = [
  { max: 18.5, label: "Underweight", color: "#E3BE55" },
  { max: 25,   label: "Normal",      color: T.green },
  { max: 30,   label: "Overweight",  color: "#E3BE55" },
  { max: Infinity, label: "Obese",   color: T.down },
];
/* ---------- goal weight (MyFitnessPal-style: bar from start -> goal, pace ETA) ---------- */
function GoalCard({ data, setData, current, rows }) {
  const units = useUnit();
  const goal = data.profile?.goalWeight || null;         // lb
  const start = data.profile?.goalStartWeight || null;   // lb, weight when the goal was set
  const [inp, setInp] = useState("");
  const [editing, setEditing] = useState(false);

  const save = () => {
    const v = parseFloat(inp);
    if (!v || v <= 0 || !current) return;
    setData(d => ({ ...d, profile: { ...(d.profile||{}), goalWeight: toLb(v, units), goalStartWeight: current.weight, goalSetDate: todayStr() } }));
    setInp(""); setEditing(false);
  };
  const clear = () => setData(d => ({ ...d, profile: { ...(d.profile||{}), goalWeight: null, goalStartWeight: null, goalSetDate: null } }));

  if (!current) return null; // needs at least one weigh-in

  if (!goal || editing) return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>🎯 Goal weight</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Set a target and every weigh-in moves the progress bar — cutting or bulking both work.</div>
      <div style={{display:"flex", gap:8}}>
        <input type="number" inputMode="decimal" value={inp} onChange={e=>setInp(e.target.value)}
          placeholder={`e.g. ${dispW(current.weight, units) + (units==="kg" ? -5 : -10)}`} style={{flex:1}} />
        <button onClick={save} disabled={!parseFloat(inp)}
          style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:parseFloat(inp)?1:0.45}}>Set goal</button>
        {editing && <button onClick={()=>setEditing(false)} style={{background:T.input, color:T.sub, padding:"0 14px", fontWeight:600}}>Cancel</button>}
      </div>
      <div style={{fontSize:11.5, color:T.sub, marginTop:6}}>In {uLabel(units)} — you're at {showW(current.weight, units)} now.</div>
    </div>
  );

  const span = goal - start;                       // + bulking, - cutting
  const done = current.weight - start;
  const pct = span === 0 ? 100 : Math.max(0, Math.min(100, done / span * 100));
  const remain = goal - current.weight;            // + still to gain, - still to lose
  const reached = span >= 0 ? current.weight >= goal : current.weight <= goal;

  /* pace from the last 30 days of weigh-ins -> ETA */
  let eta = null, wrongWay = false;
  const cutoff = new Date(todayStr()+"T00:00"); cutoff.setDate(cutoff.getDate()-30);
  const recent = rows.filter(r => new Date(r.date+"T00:00") >= cutoff);
  if (!reached && recent.length >= 2) {
    const daysSpan = (new Date(recent[recent.length-1].date+"T00:00") - new Date(recent[0].date+"T00:00")) / 864e5;
    if (daysSpan >= 7) {
      const rate = (recent[recent.length-1].weight - recent[0].weight) / daysSpan; // lb/day
      if (Math.abs(rate) > 0.01) {
        const daysLeft = remain / rate;
        if (daysLeft > 0) { const d = new Date(); d.setDate(d.getDate() + Math.round(daysLeft)); eta = d.toLocaleDateString("en-US", { month:"short", day:"numeric" }); }
        else wrongWay = true;
      }
    }
  }

  const showPct = reached ? 100 : pct;
  return (
    <div className="card" style={reached ? {borderColor:T.green} : undefined}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
        <div className="h" style={{fontSize:17, color:T.tealDk}}>🎯 Goal weight</div>
        <div style={{display:"flex", gap:4, alignItems:"center"}}>
          <PencilBtn onClick={()=>{setEditing(true); setInp(String(dispW(goal, units)));}} />
          <ConfirmX onConfirm={clear} />
        </div>
      </div>

      {/* hero */}
      <div style={{textAlign:"center", marginBottom:14}}>
        {reached ? (<>
          <div style={{fontSize:26, fontWeight:800, color:T.green, lineHeight:1.15}}>🎉 Goal reached</div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:3}}>You hit {showW(goal, units)} — set the next one when you're ready.</div>
        </>) : (<>
          <div style={{fontSize:32, fontWeight:800, color:T.green, lineHeight:1.1}}>
            {Math.abs(dispW(remain, units))}<span style={{fontSize:15, color:T.sub, fontWeight:600}}> {uLabel(units)} {remain > 0 ? "to gain" : "to lose"}</span>
          </div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:3}}>{Math.round(pct)}% of the way there</div>
        </>)}
      </div>

      {/* progress bar with position marker */}
      <div style={{position:"relative", height:12, background:T.input, borderRadius:99, marginBottom:8}}>
        <div style={{position:"absolute", inset:0, width:`${showPct}%`, background:`linear-gradient(90deg, rgba(0,200,5,.55), ${T.green})`, borderRadius:99, transition:"width .6s ease"}} />
        <div style={{position:"absolute", top:"50%", left:`${showPct}%`, transform:"translate(-50%,-50%)",
          width:18, height:18, borderRadius:99, background:"#FFF", border:`3px solid ${T.green}`,
          boxShadow:"0 1px 6px rgba(0,0,0,.5)", transition:"left .6s ease"}} />
      </div>

      {/* start / now / goal */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", textAlign:"center", marginTop:12}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.sub}}>{dispW(start, units)}</div><div style={kpiL}>Start</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{dispW(current.weight, units)}</div><div style={kpiL}>Now</div></div>
        <div><div style={{fontSize:16, fontWeight:700, color:T.green}}>{dispW(goal, units)}</div><div style={kpiL}>Goal</div></div>
      </div>

      {(eta || wrongWay) && !reached && (
        <div style={{textAlign:"center", marginTop:10}}>
          {eta && <span className="chip" style={{background:T.mint, color:T.green}}>📅 On pace for {eta}</span>}
          {wrongWay && <span className="chip" style={{background:"#2A1105", color:T.down}}>Trending the wrong way — you've got this 💪</span>}
        </div>
      )}
    </div>
  );
}

function BMICard({ data, setData, hunit, current }) {
  const units = useUnit();
  const saved = data.profile?.heightIn || null; // inches, canonical
  const [ft, setFt] = useState(saved ? String(Math.floor(saved / 12)) : "");
  const [inch, setInch] = useState(saved ? String(Math.round((saved % 12) * 10) / 10) : "");
  const [cm, setCm] = useState(saved ? String(Math.round(saved * 2.54)) : "");
  const typedIn = hunit === "cm"
    ? (parseFloat(cm) || 0) / 2.54
    : (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
  const canSave = typedIn >= 36 && typedIn <= 96; // 3ft–8ft sanity window
  const dirty = canSave && Math.abs(typedIn - (saved || 0)) > 0.05;
  const save = () => setData(d => ({ ...d, profile: { ...(d.profile || {}), heightIn: Math.round(typedIn * 10) / 10 } }));

  const bmi = saved && current ? Math.round(703 * current.weight / (saved * saved) * 10) / 10 : null;
  const cat = bmi != null ? BMI_CATS.find(c => bmi < c.max) : null;
  const lo = saved ? 18.5 * saved * saved / 703 : null, hi = saved ? 24.9 * saved * saved / 703 : null;
  const hLabel = saved ? (hunit === "cm" ? `${Math.round(saved * 2.54)} cm` : `${Math.floor(saved / 12)}'${Math.round(saved % 12)}"`) : null;

  return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>🧮 BMI</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:10}}>
        Uses your latest weigh-in automatically — just set your height once.
        (Height unit switches to cm in ⚙️ Settings.)
      </div>
      <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap", marginBottom: bmi != null ? 12 : 0}}>
        {hunit === "cm" ? (
          <label style={{...lbl, flex:1, minWidth:110, marginBottom:0}}>Height (cm)
            <input type="number" inputMode="decimal" value={cm} onChange={e=>setCm(e.target.value)} placeholder="e.g. 180" />
          </label>
        ) : (<>
          <label style={{...lbl, flex:1, minWidth:80, marginBottom:0}}>Height (ft)
            <input type="number" inputMode="numeric" value={ft} onChange={e=>setFt(e.target.value)} placeholder="5" />
          </label>
          <label style={{...lbl, flex:1, minWidth:80, marginBottom:0}}>+ inches
            <input type="number" inputMode="decimal" value={inch} onChange={e=>setInch(e.target.value)} placeholder="11" />
          </label>
        </>)}
        {(dirty || !saved) && (
          <button onClick={save} disabled={!canSave} style={{background:T.green, color:"#000", padding:"11px 18px", fontWeight:700, opacity:canSave?1:0.45}}>
            Save height
          </button>
        )}
      </div>
      {!saved ? (
        <div style={{fontSize:13, color:T.sub, marginTop:10}}>Type your height and hit save — BMI shows up right here.</div>
      ) : !current ? (
        <div style={{fontSize:13, color:T.sub}}>Log a weigh-in above and your BMI appears here.</div>
      ) : (
        <>
          <div style={{display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:34, fontWeight:800, color:cat.color}}>{bmi}</span>
            <span className="chip" style={{background:"none", border:`1px solid ${cat.color}`, color:cat.color}}>{cat.label}</span>
          </div>
          {current.weight < lo && (
            <div style={{fontSize:13.5, fontWeight:700, color:cat.color, marginTop:6}}>
              {Math.round(dispW(lo - current.weight, units))} {uLabel(units)} below the healthy range — gaining that puts you at Normal.
            </div>
          )}
          {current.weight > hi && (
            <div style={{fontSize:13.5, fontWeight:700, color:cat.color, marginTop:6}}>
              {Math.round(dispW(current.weight - hi, units))} {uLabel(units)} above the healthy range.
            </div>
          )}
          <div style={{fontSize:12.5, color:T.sub, marginTop:6}}>
            {hLabel} · {showW(current.weight, units)} (latest weigh-in, {fmtDate(current.date)})
            <br/>Healthy-BMI weight range for your height: <b style={{color:T.ink}}>{Math.round(dispW(lo,units))}–{Math.round(dispW(hi,units))} {uLabel(units)}</b>
            <br/>Heads up: BMI can't tell muscle from fat — lifters often read a category high.
          </div>
        </>
      )}
    </div>
  );
}

function BodyTab({ data, setData, hunit }) {
  const units = useUnit();
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [creatine, setCreatine] = useState("No");
  const rows = useMemo(()=>[...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)),[data.bodyweight]);

  const current = rows.length ? rows[rows.length-1] : null;
  const starting = rows.length ? rows[0] : null;
  const change = current && starting ? (current.weight - starting.weight) : null;
  const changeDisp = change==null ? null : dispW(change, units);

  const months = useMemo(() => {
    if (!rows.length) return [];
    const byM = {};
    for (const r of rows) { (byM[monthKey(r.date)] ||= []).push(r); }
    const keys = Object.keys(byM).sort();
    const first = keys[0], last = keys[keys.length-1];
    const out=[];
    let [y,m]=first.split("-").map(Number);
    const [ly,lm]=last.split("-").map(Number);
    while (y<ly || (y===ly && m<=lm)) {
      const k=`${y}-${String(m).padStart(2,"0")}`;
      const rs=byM[k]||[];
      const avg = rs.length ? Math.round(rs.reduce((s,r)=>s+r.weight,0)/rs.length*10)/10 : null;
      const cr = !rs.length ? "-" : rs.every(r=>r.creatine==="Yes") ? "Yes" : rs.every(r=>r.creatine==="No") ? "No" : "Mixed";
      out.push({ key:k, label:monthLabel(k), avg, creatine:cr });
      m++; if (m>12){m=1;y++;}
    }
    return out;
  }, [rows]);

  const chartData = months.map(m=>({ label:m.label.replace(" 20"," '"), value:dispW(m.avg, units) }));

  const add = () => {
    if (!weight) return;
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==date), { date, weight:toLb(parseFloat(weight), units), creatine }] }));
    setWeight("");
  };

  const [edit, setEdit] = useState(null); // { orig (original date), date, weight, creatine }
  const saveEdit = () => {
    if (!edit.weight) return;
    // drop the old row plus any row already on the new date, then add the edited one
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==edit.orig && r.date!==edit.date),
      { date:edit.date, weight:toLb(parseFloat(edit.weight), units), creatine:edit.creatine }] }));
    setEdit(null);
  };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>⚖️ Log a weigh-in</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Date<input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>
        <label style={lbl}>Creatine today?<select value={creatine} onChange={e=>setCreatine(e.target.value)}><option>No</option><option>Yes</option></select></label>
      </div>
      <button onClick={add} disabled={!weight} style={{width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:weight?1:0.45}}>Save weigh-in</button>
    </div>

    <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, textAlign:"center"}}>
      <div><div style={kpiN}>{current?dispW(current.weight,units):"—"}</div><div style={kpiL}>Current</div></div>
      <div><div style={kpiN}>{starting?dispW(starting.weight,units):"—"}</div><div style={kpiL}>Starting</div></div>
      <div><div style={{...kpiN, color: changeDisp==null ? T.ink : changeDisp >= 0 ? T.green : T.down}}>{changeDisp!=null?(changeDisp>0?"+":"")+changeDisp:"—"}</div><div style={kpiL}>Change ({uLabel(units)})</div></div>
      <div><div style={{...kpiN, fontSize:20, paddingTop:8}}>{current?fmtDate(current.date):"—"}</div><div style={kpiL}>Latest</div></div>
    </div>

    <GoalCard data={data} setData={setData} current={current} rows={rows} />

    <BMICard data={data} setData={setData} hunit={hunit} current={current} />

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:4}}>Body weight — monthly average</div>
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>One dot per month. Months you didn't log stay blank.</div>
      {chartData.length ? (
        <Suspense fallback={<ChartFallback h={220} />}><BodyChart data={chartData} unit={" "+uLabel(units)} /></Suspense>
      ) : <div style={{color:T.sub, fontSize:14}}>Log a weigh-in and the trend starts here.</div>}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Monthly average</div>
      <table><thead><tr><th>Month</th><th>Avg wt ({uLabel(units)})</th><th>vs prev</th><th>Creatine</th></tr></thead>
        <tbody>{(() => {
          // pair each month with the previous month that actually has an average
          const withPrev = months.map((m, i) => {
            let prev = null;
            for (let j = i - 1; j >= 0; j--) if (months[j].avg != null) { prev = months[j].avg; break; }
            return { ...m, diff: (m.avg != null && prev != null) ? dispW(m.avg - prev, units) : null };
          });
          return [...withPrev].reverse().map(m=>(
            <tr key={m.key}><td>{m.label}</td><td style={{fontWeight:600}}>{m.avg==null ? "-" : dispW(m.avg, units)}</td>
              <td style={{color: m.diff==null ? T.sub : m.diff >= 0 ? T.green : T.down, fontWeight:700}}>
                {m.diff==null ? "—" : `${m.diff>0?"▲ +":m.diff<0?"▼ ":""}${m.diff===0?"0":Math.abs(m.diff)}`}
              </td>
              <td style={{color:T.sub}}>{m.creatine}</td></tr>
          ));
        })()}
        {!months.length && <tr><td colSpan={4} style={{color:T.sub}}>No weigh-ins yet.</td></tr>}
        </tbody></table>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>All weigh-ins</div>
      <table><thead><tr><th>Date</th><th>Weight ({uLabel(units)})</th><th>Creatine</th><th></th></tr></thead>
        <tbody>{[...rows].reverse().map(r=>(<Fragment key={r.date}>
          <tr><td>{fmtDate(r.date)}</td><td>{dispW(r.weight,units)}</td><td>{r.creatine}</td>
            <td style={{whiteSpace:"nowrap"}}>
              <PencilBtn onClick={()=>setEdit({ orig:r.date, date:r.date, weight:dispW(r.weight,units), creatine:r.creatine||"No" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, bodyweight:d.bodyweight.filter(x=>x.date!==r.date)}))} />
            </td></tr>
          {edit?.orig === r.date && (
            <tr><td colSpan={4} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10}}>
                  <label style={lbl}>Date<input type="date" value={edit.date} max={todayStr()} onChange={ev=>setEdit(s=>({...s, date:ev.target.value}))} /></label>
                  <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={edit.weight} onChange={ev=>setEdit(s=>({...s, weight:ev.target.value}))} /></label>
                  <label style={lbl}>Creatine<select value={edit.creatine} onChange={ev=>setEdit(s=>({...s, creatine:ev.target.value}))}><option>No</option><option>Yes</option></select></label>
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.weight} style={{...saveSm, opacity:edit.weight?1:0.45}}>Save changes</button>
                  <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                </div>
              </div>
            </td></tr>
          )}
        </Fragment>))}</tbody></table>
    </div>
  </>);
}

/* ================= CARDIO ================= */
function CardioTab({ data, setData, latestBW }) {
  const units = useUnit();
  const [date, setDate] = useState(todayStr());
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("");
  const [machineCal, setMachineCal] = useState("");
  const [newAct, setNewAct] = useState(""); const [newType, setNewType] = useState("Sport");

  const actMap = Object.fromEntries(data.cardioActivities.map(a=>[a.name,a.type]));
  const isMachine = actMap[activity]==="Machine";
  const kg = latestBW * 0.453592;

  const estCal = (!isMachine && duration && intensity) ? Math.round(MET[intensity]*kg*(duration/60)) : null;

  const add = () => {
    if (!activity || !duration) return;
    const calories = isMachine ? (machineCal?parseInt(machineCal):null) : estCal;
    setData(d=>({ ...d, cardio:[...d.cardio, { id:Date.now(), date, activity, duration:parseInt(duration), intensity: isMachine?null:intensity, calories }] }));
    setDuration(""); setMachineCal("");
  };

  const [cardQ, setCardQ] = useState("");
  const rows = useMemo(() => {
    const q = cardQ.trim().toLowerCase();
    return [...data.cardio].filter(e => !q || e.activity.toLowerCase().includes(q))
      .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);
  }, [data.cardio, cardQ]);

  /* minutes per week, last 8 weeks (current week last) */
  const weeks = useMemo(() => {
    const mins = {};
    for (const c of data.cardio) { const w = weekStart(c.date); mins[w] = (mins[w]||0) + (c.duration||0); }
    const out = [];
    const d = new Date(weekStart(todayStr()) + "T00:00");
    d.setDate(d.getDate() - 7*7);
    for (let i=0;i<8;i++) {
      const k = d.toISOString().slice(0,10);
      out.push({ k, label:`${d.getMonth()+1}/${d.getDate()}`, min:mins[k]||0 });
      d.setDate(d.getDate()+7);
    }
    return out;
  }, [data.cardio]);
  const weekMax = Math.max(...weeks.map(w=>w.min), 1);

  const [editAct, setEditAct] = useState(null); // { orig, name, type }
  const actValid = editAct && editAct.name.trim() &&
    !data.cardioActivities.some(a => a.name === editAct.name.trim() && a.name !== editAct.orig);
  const saveAct = () => {
    if (!actValid) return;
    const nn = editAct.name.trim();
    setData(d=>({ ...d,
      cardioActivities: d.cardioActivities.map(a => a.name===editAct.orig ? { name:nn, type:editAct.type } : a),
      cardio: nn !== editAct.orig ? d.cardio.map(c => c.activity===editAct.orig ? { ...c, activity:nn } : c) : d.cardio,
    }));
    setEditAct(null);
  };

  const [edit, setEdit] = useState(null); // { id, date, activity, duration, intensity, machineCal }
  const editIsMachine = edit ? actMap[edit.activity]==="Machine" : false;
  const saveEdit = () => {
    if (!edit.activity || !edit.duration) return;
    const dur = parseInt(edit.duration);
    const calories = editIsMachine
      ? (edit.machineCal ? parseInt(edit.machineCal) : null)
      : (edit.intensity ? Math.round(MET[edit.intensity]*kg*(dur/60)) : null);
    setData(d=>({ ...d, cardio: d.cardio.map(x => x.id===edit.id ? {
      ...x, date:edit.date, activity:edit.activity, duration:dur,
      intensity: editIsMachine ? null : (edit.intensity || null), calories,
    } : x) }));
    setEdit(null);
  };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>🏃 Log cardio</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Sports get an automatic calorie estimate from duration × intensity × your tracked bodyweight ({showW(latestBW, units)}).
        Machines: type in what the display says.
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <label style={lbl}>Date<input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)} /></label>
        <label style={lbl}>Activity
          <select value={activity} onChange={e=>setActivity(e.target.value)}>
            <option value="">— pick —</option>
            {data.cardioActivities.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
        {isMachine
          ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={machineCal} onChange={e=>setMachineCal(e.target.value)} placeholder="from the display" /></label>
          : <label style={lbl}>Intensity
              <select value={intensity} onChange={e=>setIntensity(e.target.value)}>
                <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
              </select>
            </label>}
      </div>
      {estCal!=null && <div style={{background:T.cream, borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:14}}>Estimated: <b>{estCal} cal</b></div>}
      <button onClick={add} disabled={!activity||!duration} style={{width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:(activity&&duration)?1:0.45}}>Save session</button>
    </div>

    {data.cardio.length > 0 && (
      <div className="card">
        <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>Cardio minutes — last 8 weeks</div>
        <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Each bar is one week (Mon–Sun). The last bar is this week.</div>
        <div style={{display:"flex", alignItems:"flex-end", gap:8, height:110}}>
          {weeks.map((w,i)=>(
            <div key={w.k} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:0}}>
              <span style={{fontSize:11, fontWeight:700, color:w.min>0?T.green:T.sub}}>{w.min>0?w.min:""}</span>
              <div className="vbar" style={{
                width:"100%", maxWidth:34, borderRadius:"5px 5px 2px 2px",
                height: w.min>0 ? Math.max(6, w.min/weekMax*70) : 3,
                background: w.min>0 ? (i===weeks.length-1 ? T.green : "rgba(0,200,5,.55)") : T.line,
                animationDelay: `${i*0.04}s`,
              }} />
              <span style={{fontSize:10, color:T.sub}}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:6}}>Your activities</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Add your own (Basketball, Elliptical, whatever you do). Sport = we estimate calories. Machine = you type them in.</div>
      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Activity name" />
        <select value={newType} onChange={e=>setNewType(e.target.value)} style={{width:120}}><option>Sport</option><option>Machine</option></select>
        <button onClick={()=>{ if(!newAct.trim())return; setData(d=>({...d, cardioActivities:[...d.cardioActivities.filter(a=>a.name!==newAct.trim()), {name:newAct.trim(), type:newType}]})); setNewAct(""); }}
          style={{background:T.green, color:"#000", padding:"0 16px", fontWeight:700}}>Add</button>
      </div>
      {data.cardioActivities.map(a=>(
        <span key={a.name} className="chip" style={{background:T.mint, color:T.green, marginRight:6, marginBottom:6}}>
          {a.name} · {a.type}
          <PencilBtn onClick={()=>setEditAct({ orig:a.name, name:a.name, type:a.type })} />
          <ConfirmX onConfirm={()=>setData(d=>({...d, cardioActivities:d.cardioActivities.filter(x=>x.name!==a.name)}))} />
        </span>
      ))}
      {editAct && (
        <div style={{...editBox, marginTop:8}}>
          <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Editing <b>{editAct.orig}</b> — renaming updates all your past sessions too.</div>
          <div style={{display:"flex", gap:8, marginBottom:10}}>
            <input value={editAct.name} onChange={ev=>setEditAct(s=>({...s, name:ev.target.value}))} />
            <select value={editAct.type} onChange={ev=>setEditAct(s=>({...s, type:ev.target.value}))} style={{width:120}}><option>Sport</option><option>Machine</option></select>
          </div>
          <div style={{display:"flex", gap:8}}>
            <button onClick={saveAct} disabled={!actValid} style={{...saveSm, opacity:actValid?1:0.45}}>Save changes</button>
            <button onClick={()=>setEditAct(null)} style={cancelSm}>Cancel</button>
          </div>
          {!actValid && editAct.name.trim() && <div style={{fontSize:12, color:T.danger, marginTop:6}}>That name is already taken by another activity.</div>}
        </div>
      )}
      <div style={{marginTop:12, fontSize:12.5, color:T.sub}}>
        <b>Intensity guide:</b> {Object.entries(INTENSITY_FEEL).map(([k,v])=><div key={k}>• <b>{k}</b> — {v}</div>)}
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
      <input value={cardQ} onChange={e=>setCardQ(e.target.value)} placeholder="🔍 Filter by activity…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <table><thead><tr><th>Date</th><th>Activity</th><th>Min</th><th>Intensity</th><th>Cal</th><th></th></tr></thead>
        <tbody>{rows.map(e=>(<Fragment key={e.id}>
          <tr><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration}</td><td>{e.intensity||"machine"}</td><td>{e.calories??"—"}</td>
            <td style={{whiteSpace:"nowrap"}}>
              <PencilBtn onClick={()=>setEdit({ id:e.id, date:e.date, activity:e.activity, duration:e.duration, intensity:e.intensity||"", machineCal:e.calories ?? "" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, cardio:d.cardio.filter(x=>x.id!==e.id)}))} />
            </td></tr>
          {edit?.id === e.id && (
            <tr><td colSpan={6} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                  <label style={lbl}>Date<input type="date" value={edit.date} max={todayStr()} onChange={ev=>setEdit(s=>({...s, date:ev.target.value}))} /></label>
                  <label style={lbl}>Activity
                    <select value={edit.activity} onChange={ev=>setEdit(s=>({...s, activity:ev.target.value}))}>
                      {data.cardioActivities.map(a=><option key={a.name}>{a.name}</option>)}
                      {!data.cardioActivities.some(a=>a.name===edit.activity) && <option>{edit.activity}</option>}
                    </select>
                  </label>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                  <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={edit.duration} onChange={ev=>setEdit(s=>({...s, duration:ev.target.value}))} /></label>
                  {editIsMachine
                    ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={edit.machineCal} onChange={ev=>setEdit(s=>({...s, machineCal:ev.target.value}))} /></label>
                    : <label style={lbl}>Intensity
                        <select value={edit.intensity} onChange={ev=>setEdit(s=>({...s, intensity:ev.target.value}))}>
                          <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
                        </select>
                      </label>}
                </div>
                {!editIsMachine && <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Calories re-estimate automatically when you save.</div>}
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.activity||!edit.duration} style={{...saveSm, opacity:(edit.activity&&edit.duration)?1:0.45}}>Save changes</button>
                  <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                </div>
              </div>
            </td></tr>
          )}
        </Fragment>))}
        {!rows.length && <tr><td colSpan={6} style={{color:T.sub}}>No cardio logged yet.</td></tr>}
        </tbody></table>
    </div>
  </>);
}

/* ================= EXERCISES ================= */
/* 3-state muscle picker: tap once = main muscle (full credit, green ✓),
   tap again = secondary (half credit, amber ½), third tap = off. */
const AMBER = "#E3BE55";
function MuscleChips({ prim, sec, onChange }) {
  const cycle = (m) => {
    if (prim.includes(m)) onChange(prim.filter(x => x !== m), [...sec, m]);
    else if (sec.includes(m)) onChange(prim, sec.filter(x => x !== m));
    else onChange([...prim, m], sec);
  };
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
      {MUSCLES.map((m)=>{
        const state = prim.includes(m) ? "prim" : sec.includes(m) ? "sec" : "off";
        const col = state === "prim" ? T.green : state === "sec" ? AMBER : T.sub;
        return (
          <button key={m} type="button" onClick={()=>cycle(m)} style={{
            padding:"6px 12px", borderRadius:99, fontSize:13, fontWeight:600, minHeight:36,
            background: state === "prim" ? "rgba(0,200,5,.14)" : state === "sec" ? "rgba(227,190,85,.12)" : "none",
            border: `1px solid ${state === "off" ? T.line : col}`, color: col,
          }}>
            {state === "prim" ? "✓ " : state === "sec" ? "½ " : ""}{m}
          </button>
        );
      })}
    </div>
  );
}

function ExercisesTab({ data, setData }) {
  const [name, setName] = useState(""); const [muscles, setMuscles] = useState(["Chest"]);
  const [muscles2, setMuscles2] = useState([]); const [equip, setEquip] = useState("Barbell (plates)");
  const [libQ, setLibQ] = useState(""); const [libM, setLibM] = useState("All");
  const shownEx = useMemo(() => {
    const q = libQ.trim().toLowerCase();
    return data.exercises.filter(x =>
      (!q || x.name.toLowerCase().includes(q)) &&
      (libM === "All" || musclesOf(x).includes(libM) || secondariesOf(x).includes(libM)));
  }, [data.exercises, libQ, libM]);

  const [edit, setEdit] = useState(null); // { orig, name, muscles, muscles2, equip }
  const editValid = edit && edit.name.trim() && edit.muscles.length > 0 &&
    !data.exercises.some(x => x.name === edit.name.trim() && x.name !== edit.orig);
  const saveEdit = () => {
    if (!editValid) return;
    const nn = edit.name.trim();
    setData(d=>({ ...d,
      exercises: d.exercises.map(x => x.name===edit.orig ? { name:nn, muscle:edit.muscles[0], muscles:edit.muscles, muscles2:edit.muscles2, ...fromEquip(edit.equip) } : x),
      log: nn !== edit.orig ? d.log.map(e => e.exercise===edit.orig ? { ...e, exercise:nn } : e) : d.log,
    }));
    setEdit(null);
  };

  const exMuscle = Object.fromEntries(data.exercises.map(x => [x.name, muscleLabel(x)]));
  const stamp = todayStr();
  const exportLog = () => download(`workout-log-${stamp}.csv`, "﻿" + [
    "date,exercise,muscle,set,weight_lb,reps,effort,notes",
    ...[...data.log].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id)
      .map(e => [e.date, e.exercise, exMuscle[e.exercise]||"", e.set, e.weight ?? "BW", e.reps, e.effort||"", e.notes||""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportBW = () => download(`body-weight-${stamp}.csv`, "﻿" + [
    "date,weight_lb,creatine",
    ...[...data.bodyweight].sort((a,b)=>a.date.localeCompare(b.date))
      .map(r => [r.date, r.weight, r.creatine||""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportCardio = () => download(`cardio-${stamp}.csv`, "﻿" + [
    "date,activity,duration_min,intensity,calories",
    ...[...data.cardio].sort((a,b)=>a.date.localeCompare(b.date))
      .map(e => [e.date, e.activity, e.duration, e.intensity||"machine", e.calories ?? ""].map(csvEsc).join(",")),
  ].join("\n"), "text/csv");
  const exportAll = () => download(`lifting-tracker-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  const outBtn = { background:"none", border:`1px solid ${T.line}`, color:T.ink, padding:"9px 14px", fontSize:13.5, fontWeight:600 };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>📚 Exercise library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Add your own moves (e.g. Decline Push-Up). Pick <b>Barbell</b> to get the plate helper when logging; <b>Bodyweight</b> moves auto-track by reps.</div>
      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Exercise name" style={{flex:2, minWidth:150}} />
        <select value={equip} onChange={e=>setEquip(e.target.value)} style={{flex:1, minWidth:150}}>{EQUIP_OPTS.map(o=><option key={o}>{o}</option>)}</select>
      </div>
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Muscle groups: tap once = <b style={{color:T.green}}>✓ main</b> (full set credit) · tap again = <b style={{color:AMBER}}>½ secondary</b> (half credit) · third tap clears. First main pick decides where it sorts.</div>
      <MuscleChips prim={muscles} sec={muscles2} onChange={(p,s)=>{setMuscles(p);setMuscles2(s);}} />
      <button onClick={()=>{ if(!name.trim()||!muscles.length)return; setData(d=>({...d, exercises:[...d.exercises.filter(x=>x.name!==name.trim()), {name:name.trim(), muscle:muscles[0], muscles, muscles2, ...fromEquip(equip)}]})); setName(""); setMuscles(["Chest"]); setMuscles2([]); }}
        disabled={!name.trim()||!muscles.length}
        style={{background:T.green, color:"#000", padding:"10px 20px", fontWeight:700, marginTop:10, marginBottom:14, opacity:(!name.trim()||!muscles.length)?0.45:1}}>Add exercise</button>
      <input value={libQ} onChange={e=>setLibQ(e.target.value)} placeholder="🔍 Search your library…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:8}} />
      <div style={{display:"flex", gap:6, overflowX:"auto", paddingBottom:6, WebkitOverflowScrolling:"touch"}}>
        {["All", ...MUSCLES].map(m=>(
          <button key={m} onClick={()=>setLibM(m)} style={{
            flexShrink:0, padding:"5px 12px", borderRadius:99, fontSize:12.5, fontWeight:700,
            background: libM===m ? T.green : T.input, color: libM===m ? "#000" : T.sub,
            border:`1px solid ${libM===m ? T.green : T.line}`,
          }}>{m}</button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Exercise</th><th>Muscle</th><th>Equipment</th><th></th></tr></thead>
          <tbody>{shownEx.map(x=>(<Fragment key={x.name}>
            <tr><td>{x.name}</td><td>{muscleLabel(x)}</td><td>{equipOf(x)}</td>
              <td style={{whiteSpace:"nowrap"}}>
                <PencilBtn onClick={()=>setEdit({ orig:x.name, name:x.name, muscles:musclesOf(x), muscles2:secondariesOf(x), equip:equipOf(x) })} />
                <ConfirmX onConfirm={()=>setData(d=>({...d, exercises:d.exercises.filter(e=>e.name!==x.name)}))} />
              </td></tr>
            {edit?.orig === x.name && (
              <tr><td colSpan={4} style={{padding:"6px 4px"}}>
                <div style={editBox}>
                  <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Renaming updates every set you've logged for it — history stays intact.</div>
                  <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
                    <input value={edit.name} onChange={ev=>setEdit(s=>({...s, name:ev.target.value}))} style={{flex:2, minWidth:150}} />
                    <select value={edit.equip} onChange={ev=>setEdit(s=>({...s, equip:ev.target.value}))} style={{flex:1, minWidth:150}}>{EQUIP_OPTS.map(o=><option key={o}>{o}</option>)}</select>
                  </div>
                  <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Tap once = ✓ main (full credit) · again = ½ secondary (half credit) · again = off:</div>
                  <div style={{marginBottom:10}}>
                    <MuscleChips prim={edit.muscles} sec={edit.muscles2} onChange={(p,s2)=>setEdit(s=>({...s, muscles:p, muscles2:s2}))} />
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={saveEdit} disabled={!editValid} style={{...saveSm, opacity:editValid?1:0.45}}>Save changes</button>
                    <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                  </div>
                  {!editValid && edit.name.trim() && <div style={{fontSize:12, color:T.danger, marginTop:6}}>That name is already used by another exercise.</div>}
                </div>
              </td></tr>
            )}
          </Fragment>))}</tbody></table>
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>💾 Your data</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:12}}>
        Download a copy any time — it's yours. CSV files open straight in Excel or Google Sheets.
        The full backup holds everything in one file.
      </div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <button onClick={exportLog} style={outBtn}>Workout log (CSV)</button>
        <button onClick={exportBW} style={outBtn}>Body weight (CSV)</button>
        <button onClick={exportCardio} style={outBtn}>Cardio (CSV)</button>
        <button onClick={exportAll} style={outBtn}>Full backup (JSON)</button>
      </div>
    </div>
  </>);
}

/* ================= SETTINGS / ACCOUNT ================= */
/* On a phone browser (not already installed as a home-screen app)? */
const IS_MOBILE = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const IS_STANDALONE = typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator?.standalone === true);

function DownloadAppCard() {
  const [done, setDone] = useState(() => localStorage.getItem("lt-a2hs-done") === "1");
  if (!IS_MOBILE || IS_STANDALONE || done) return null;
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div style={{ ...sCard, borderColor:T.green }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.green, marginBottom:2 }}>📲 Download the app</div>
      <div style={{ fontSize:12.5, color:T.ink, lineHeight:1.6 }}>
        {isiOS ? (<>
          Put this on your home screen and it opens like a real app — full screen, no browser bar:
          <ol style={{ margin:"6px 0", paddingLeft:20 }}>
            <li>Open this site in <b>Safari</b> (Apple's built-in browser).</li>
            <li><b>Tap once near the bottom of the screen</b> to bring up Safari's toolbar if it's hidden. <span style={{color:T.sub}}>(On iPad the toolbar is at the top instead.)</span></li>
            <li>Tap the <b>Share</b> button — the <b>square with an ↑ arrow</b>, in the middle of the bottom toolbar. <span style={{color:T.sub}}>If you only see three dots <b>•••</b>, tap those first, then Share.</span></li>
            <li>In the menu that slides up, <b>scroll down</b> and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> (top-right). Done — look for the barbell icon on your home screen.</li>
          </ol>
          <div style={{ fontSize:12, color:T.sub, marginBottom:4 }}>Note: the Share button is <b>not</b> the three-lines/aA button next to the web address — that one only changes text size.</div>
          <b style={{color:T.down}}>Things to avoid:</b>
          <ul style={{ margin:"4px 0", paddingLeft:20, color:T.sub }}>
            <li>In-app browsers (Instagram, Snapchat, TikTok, Messenger) <b>hide</b> Add to Home Screen — copy the link into Safari first.</li>
            <li>Private/incognito tabs forget your sign-in every time.</li>
            <li>Some browsers clear cookies aggressively and sign you out. Your data is <b>always safe in the cloud</b> — you'd only have to sign in again — but the home-screen app avoids the hassle.</li>
          </ul>
        </>) : (<>
          Put this on your home screen and it opens like a real app:
          <ol style={{ margin:"6px 0", paddingLeft:20 }}>
            <li>Open this site in <b>Chrome</b>.</li>
            <li>Tap the <b>⋮</b> menu (top right).</li>
            <li>Tap <b>Add to Home screen</b>, then <b>Add</b>.</li>
          </ol>
          <span style={{color:T.sub}}>Avoid in-app browsers (Instagram, Snapchat…) — they hide this option. Your data is always safe in the cloud either way.</span>
        </>)}
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
        <input type="checkbox" style={{ width:18, height:18, minHeight:0, accentColor:T.green }}
          onChange={()=>{ localStorage.setItem("lt-a2hs-done","1"); setDone(true); }} />
        I added it — hide this
      </label>
    </div>
  );
}

function FeatureToggle({ label, desc, on, setOn }) {
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>{desc}</div>
      <div style={{ display:"flex", background:T.input, borderRadius:10, padding:3, maxWidth:200 }}>
        {[["off","Off"],["on","On"]].map(([v,l])=>{
          const isOn = v === "on";
          return (
            <button key={v} onClick={()=>setOn(isOn)} style={{
              flex:1, padding:"9px 0", borderRadius:8, fontWeight:700, fontSize:14,
              background: on===isOn ? T.green : "none", color: on===isOn ? "#000" : T.sub,
            }}>{l}</button>
          );
        })}
      </div>
    </div>
  );
}

function SectionHead({ icon, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 2px 10px" }}>
      <span style={{ fontSize:12, fontWeight:800, color:T.green, textTransform:"uppercase", letterSpacing:"1.2px" }}>{icon} {label}</span>
      <div style={{ flex:1, height:1, background:T.line }} />
    </div>
  );
}

function SettingsModal({ user, username, data, startTab, setStartTab, tabs, units, setUnits, hunit, setHunit, routinesOn, setRoutinesOn, liftingOn, setLiftingOn, nutritionOn, setNutritionOn, streaksOn, setStreaksOn, onClose }) {
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const totalSets = (data.log||[]).length;

  // close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center",
      animation:"fadeSwap .18s ease-out both",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.card, borderTop:`1px solid ${T.line}`, borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:520, maxHeight:"88vh", overflowY:"auto",
        padding:"18px 16px calc(20px + env(safe-area-inset-bottom))",
        animation:"sheetUp .26s cubic-bezier(.22,1,.36,1) both",
      }}>
        <div style={{ width:38, height:4, background:T.line, borderRadius:99, margin:"0 auto 14px" }} />

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div className="h" style={{ fontSize:22, color:T.tealDk }}>💪 {username}</div>
            <div style={{ fontSize:12.5, color:T.sub, marginTop:2 }}>Member since {memberSince} · {totalSets} sets logged</div>
          </div>
          <button onClick={onClose} style={{ background:T.input, color:T.sub, width:34, height:34, borderRadius:99, fontSize:16, flexShrink:0 }}>✕</button>
        </div>

        <SectionHead icon="📲" label="Take it with you" />
        <DownloadAppCard />

        <SectionHead icon="🎛" label="Make it yours" />
        {/* units */}
        <div style={{ ...sCard }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Weight units</div>
          <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Changes everything shown across the app, and switches the plate calculator to matching plates. Your data is unchanged underneath.</div>
          <div style={{ display:"flex", background:T.input, borderRadius:10, padding:3, maxWidth:200 }}>
            {["lb","kg"].map(u=>(
              <button key={u} onClick={()=>setUnits(u)} style={{
                flex:1, padding:"9px 0", borderRadius:8, fontWeight:700, fontSize:14,
                background: units===u ? T.green : "none", color: units===u ? "#000" : T.sub,
              }}>{u === "lb" ? "Pounds (lb)" : "Kilos (kg)"}</button>
            ))}
          </div>
        </div>

        {/* height units (for the BMI calculator on the Body tab) */}
        <div style={{ ...sCard }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Height units</div>
          <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Used by the BMI calculator on the Body tab.</div>
          <div style={{ display:"flex", background:T.input, borderRadius:10, padding:3, maxWidth:230 }}>
            {[["ftin","Feet + inches"],["cm","Centimeters"]].map(([v,label])=>(
              <button key={v} onClick={()=>setHunit(v)} style={{
                flex:1, padding:"9px 0", borderRadius:8, fontWeight:700, fontSize:14,
                background: hunit===v ? T.green : "none", color: hunit===v ? "#000" : T.sub,
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* view preference */}
        <div style={{ ...sCard }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Open the app on</div>
          <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Pick the tab you land on each time — set it to Log for the fastest gym start.</div>
          <select value={startTab} onChange={e=>setStartTab(e.target.value)}>
            {tabs.map(([id,label,icon])=><option key={id} value={id}>{icon} {label}</option>)}
          </select>
        </div>

        <SectionHead icon="🧩" label="Pick your features" />
        {/* lifting features on/off */}
        <FeatureToggle label="Lifting tracker" on={liftingOn} setOn={setLiftingOn}
          desc="Shows Dash, Log, Records, Body, Cardio and Library. Off by default only for people who just want macro tracking. Turning it off just hides these tabs — your data stays." />

        {/* nutrition / macro tracking on/off */}
        <FeatureToggle label="Macro tracking" on={nutritionOn} setOn={setNutritionOn}
          desc="Adds a Macros tab: log food by search, barcode scan, or manual entry, and see calorie/protein/carb/fat rings for the day. Turning it off just hides it — your food log stays." />

        {/* workout routines / templates (optional) */}
        <FeatureToggle label="Workout routines" on={routinesOn} setOn={setRoutinesOn}
          desc="Adds a Routines section to the Log tab: build templates like “Push Day,” then tap Start to log them exercise-by-exercise. Off by default. Turning it off just hides it — your saved routines stay." />

        {/* streaks on/off */}
        <FeatureToggle label="Streaks & fire" on={streaksOn} setOn={setStreaksOn}
          desc="Shows 🔥 streak counters on the Macros tab and in your group. Turn off if streaks stress you out — nothing is lost, they keep counting quietly." />

        <SectionHead icon="🔐" label="Keys to the castle" />
        <ChangePasswordCard />
        <SecurityCard username={username} />

        <button onClick={()=>supabase.auth.signOut()} style={{
          width:"100%", marginTop:6, padding:13, background:T.dangerBg, color:T.danger, fontWeight:700, fontSize:15,
        }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
const sCard = { background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:12, padding:14, marginBottom:12 };

/* Change the password while signed in (no current-password needed — session proves identity). */
function ChangePasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  const save = async () => {
    setMsg(null);
    if (pw.length < 6) { setMsg({ ok:false, text:"At least 6 characters." }); return; }
    if (pw !== pw2) { setMsg({ ok:false, text:"The two passwords don't match." }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg({ ok:true, text:"✅ Password changed — your browser will offer to update the saved one." });
      setPw(""); setPw2("");
    } catch (e) { setMsg({ ok:false, text:String(e?.message || e) }); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:10 }}>Change password</div>
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <input type={show?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value); setMsg(null);}} placeholder="new password" autoComplete="new-password" />
        <button onClick={()=>setShow(s=>!s)} style={{ background:T.input, color:T.sub, padding:"0 12px", fontSize:13, border:`1px solid ${T.line}` }}>{show?"Hide":"Show"}</button>
      </div>
      <input type={show?"text":"password"} value={pw2} onChange={e=>{setPw2(e.target.value); setMsg(null);}} placeholder="confirm new password" autoComplete="new-password" style={{ marginBottom:10 }} />
      <button onClick={save} disabled={busy || !pw || !pw2} style={{ background:T.green, color:"#000", padding:"10px 18px", fontWeight:700, opacity:(busy||!pw||!pw2)?0.5:1 }}>
        {busy ? "Saving…" : "Update password"}
      </button>
      {msg && <div style={{ marginTop:8, fontSize:13, color: msg.ok?T.green:T.danger }}>{msg.text}</div>}
    </div>
  );
}

/* Set/change the password-reset security question (answers are hashed server-side). */
function SecurityCard({ username }) {
  const [q, setQ] = useState(SECURITY_QUESTIONS[0]);
  const [a, setA] = useState("");
  const [cur, setCur] = useState(null); // question currently saved on the server
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sq = await getSecurityQuestion(username);
        if (live && sq) { setCur(sq); if (SECURITY_QUESTIONS.includes(sq)) setQ(sq); }
      } catch { /* card still works without it */ }
    })();
    return () => { live = false; };
  }, [username]);
  const save = async () => {
    if (a.trim().length < 2) return;
    setBusy(true); setErr(""); setSaved(false);
    try { await setSecurityQuestion(q, a); setSaved(true); setCur(q); setA(""); }
    catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>🔒 Password reset question</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:12}}>
        If you ever forget your password, answering this on the sign-in screen lets you set a new one — no email involved.
        Saving here replaces whatever question you had before. Answers aren't case-sensitive.
      </div>
      {cur && (
        <div style={{fontSize:13, background:T.input, border:`1px solid ${T.line}`, borderRadius:8, padding:"9px 12px", marginBottom:12}}>
          Currently active: <b>{cur}</b>
        </div>
      )}
      <div style={{display:"grid", gap:10, marginBottom:12}}>
        <label style={lbl}>Question
          <select value={q} onChange={e=>setQ(e.target.value)}>
            {SECURITY_QUESTIONS.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label style={lbl}>Your answer
          <input value={a} onChange={e=>{setA(e.target.value); setSaved(false);}} placeholder="something you'll remember" />
        </label>
      </div>
      <button onClick={save} disabled={busy || a.trim().length < 2}
        style={{background:T.green, color:"#000", padding:"11px 20px", fontWeight:700, opacity:(busy || a.trim().length<2)?0.5:1}}>
        {busy ? "Saving…" : "Save question"}
      </button>
      {saved && <span className="chip" style={{background:T.mint, color:T.green, marginLeft:10}}>✓ Saved</span>}
      {err && <div style={{color:T.danger, fontSize:13, marginTop:8}}>{err}</div>}
    </div>
  );
}

/* ================= FRIENDS ================= */
const BIG_LIFTS = ["Bench Press","Back Squat","Deadlift","Overhead Press"];
const LIFT_SHORT = { "Bench Press":"Bench", "Back Squat":"Squat", "Deadlift":"Dead", "Overhead Press":"OHP" };

function FriendsTab({ user, nutritionOn, streaksOn }) {
  const units = useUnit();
  const [groups, setGroups] = useState(null);        // null = loading
  const [active, setActive] = useState(null);        // selected group
  const [members, setMembers] = useState(null);
  const [states, setStates] = useState({});          // user_id -> tracker data
  const [profile, setProfile] = useState(null);      // member whose profile is open
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gname, setGname] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState({}); // event_key -> [{reactor_id, reactor_name}]
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [feedN, setFeedN] = useState(null); // null = auto (3, or the whole latest day if bigger)
  const myName = user.user_metadata?.username || "you";
  const isOwner = active?.created_by === user.id;

  const saveEmoji = async (e) => {
    if (!e || !active) return;
    setActive(a => ({ ...a, emoji: e })); // instant locally; cloud follows
    setEmojiOpen(false);
    try { await setGroupEmoji(active.id, e); refreshGroups(); }
    catch (err2) { setErr(String(err2?.message || err2)); }
  };

  const refreshGroups = async () => {
    try { setGroups(await listMyGroups()); setErr(""); }
    catch (e) { setGroups([]); setErr("Couldn't load groups — check your connection. (If this is the first time, the database part may not be set up yet.)"); }
  };
  useEffect(() => { refreshGroups(); }, []);

  /* one-line preview per group: members + how recently each was active */
  const [previews, setPreviews] = useState({}); // group_id -> [{username, last}]
  useEffect(() => {
    if (!groups?.length) return;
    (async () => {
      try {
        const p = {};
        await Promise.all(groups.map(async (g) => {
          const ms = await listMembers(g.id);
          const la = await lastActiveFor(ms.map(m => m.user_id));
          p[g.id] = ms.map(m => ({ username: m.username, last: la[m.user_id] || null }))
            .sort((a, b) => (b.last || "").localeCompare(a.last || ""));
        }));
        setPreviews(p);
      } catch { /* previews are a bonus — group list works without them */ }
    })();
  }, [groups]);
  const agoTxt = (ts) => {
    if (!ts) return null;
    const d = (Date.now() - new Date(ts).getTime()) / 864e5;
    if (d < 1) return "today"; if (d < 2) return "1d"; if (d < 7) return `${Math.floor(d)}d`;
    if (d < 30) return `${Math.floor(d/7)}w`; return `${Math.floor(d/30)}mo`;
  };

  useEffect(() => {
    if (!active) return;
    (async () => {
      setMembers(null); setStates({}); setReactions({}); setEmojiOpen(false); setFeedN(null);
      try {
        const ms = await listMembers(active.id);
        setMembers(ms);
        const st = {};
        await Promise.all(ms.map(async (m) => {
          try { st[m.user_id] = await loadUserState(m.user_id); } catch { /* member has no data yet */ }
        }));
        setStates(st);
        try {
          const rs = await listReactions(active.id);
          const map = {};
          for (const r of rs) (map[r.event_key] ||= []).push(r);
          setReactions(map);
        } catch { /* reactions table may not exist yet — feed still works */ }
      } catch (e) { setErr("Couldn't load this group."); }
    })();
  }, [active?.id]);

  const toggleReact = async (key) => {
    const mine = (reactions[key] || []).some(r => r.reactor_id === user.id);
    setReactions(prev => {
      const cur = prev[key] || [];
      return { ...prev, [key]: mine ? cur.filter(r => r.reactor_id !== user.id) : [...cur, { reactor_id: user.id, reactor_name: myName }] };
    });
    try {
      if (mine) await removeReaction(active.id, key, user.id);
      else await addReaction(active.id, key, myName);
    } catch { /* offline or table missing — optimistic UI stays, refresh reconciles */ }
  };

  const doCreate = async () => {
    if (!gname.trim()) return;
    setBusy(true); setErr("");
    try { await createGroup(gname.trim()); setGname(""); await refreshGroups(); }
    catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const doJoin = async () => {
    if (!code.trim()) return;
    setBusy(true); setErr("");
    try { await joinGroup(code.trim()); setCode(""); await refreshGroups(); }
    catch (e) { setErr(/no group/i.test(String(e?.message)) ? "No group found with that invite code — double-check it." : String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(active.invite_code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(()=>{});
  };

  /* ---- feed + scoreboards, computed from members' data ---- */
  const feed = useMemo(() => {
    if (!members) return [];
    const evs = [];
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      const exType = Object.fromEntries((st.exercises || []).map(x => [x.name, x.type]));
      const sorted = [...(st.log || [])].sort((a,b)=>a.date.localeCompare(b.date)||(a.id||0)-(b.id||0));
      const bestSoFar = {}; const prsByDate = {}; const byDate = {};
      for (const e of sorted) {
        (byDate[e.date] ||= []).push(e);
        const isBW = exType[e.exercise] === "Bodyweight";
        const score = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
        if (bestSoFar[e.exercise] != null && score > bestSoFar[e.exercise]) {
          (prsByDate[e.date] ||= []).push(isBW ? `${e.exercise} ${e.reps} reps` : `${e.exercise} ${dispW(e.weight,units)}×${e.reps}`);
        }
        bestSoFar[e.exercise] = Math.max(bestSoFar[e.exercise] ?? -1, score);
      }
      for (const [date, entries] of Object.entries(byDate)) {
        const names = [...new Set(entries.map(e=>e.exercise))];
        evs.push({ key:`${m.user_id}-${date}-lift`, date, user:m.username, kind:"lift",
          sets: entries.length, names: names.slice(0,3), more: Math.max(0, names.length-3),
          prs: [...new Set(prsByDate[date] || [])] });
      }
      for (const c of (st.cardio || [])) {
        evs.push({ key:`${m.user_id}-${c.id}-cardio`, date:c.date, user:m.username, kind:"cardio",
          text: `${c.duration} min ${c.activity}` });
      }
    }
    return evs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 25);
  }, [members, states, units]);

  /* default feed length: 3 lines, unless the newest day alone has more — then show that whole day */
  const feedAuto = useMemo(() => {
    if (!feed.length) return 3;
    const latestDayCount = feed.filter(e => e.date === feed[0].date).length;
    return Math.max(3, latestDayCount);
  }, [feed]);
  const feedShown = feedN ?? feedAuto;

  const consistency = useMemo(() => {
    if (!members) return [];
    const thisWk = weekStart(todayStr());
    return members.map(m => {
      const st = states[m.user_id] || {};
      const days = new Set([
        ...(st.log || []).filter(e=>weekStart(e.date)===thisWk).map(e=>e.date),
        ...(st.cardio || []).filter(e=>weekStart(e.date)===thisWk).map(e=>e.date),
      ]);
      return { user: m.username, uid: m.user_id, workouts: days.size, streak: computeStreak(st.log, st.cardio).cur };
    }).sort((a,b)=>b.workouts-a.workouts || b.streak-a.streak);
  }, [members, states]);

  const strength = useMemo(() => {
    if (!members) return { rows: [], best: {} };
    const rows = members.map(m => {
      const st = states[m.user_id] || {};
      const lifts = {};
      for (const lift of BIG_LIFTS) {
        const entries = (st.log || []).filter(e => e.exercise === lift && e.weight != null);
        lifts[lift] = entries.length ? Math.round(Math.max(...entries.map(e => e1rm(e.weight, e.reps)))) : null;
      }
      return { user: m.username, uid: m.user_id, lifts };
    });
    const best = {};
    for (const lift of BIG_LIFTS) best[lift] = Math.max(0, ...rows.map(r => r.lifts[lift] || 0));
    return { rows, best };
  }, [members, states]);

  /* all-time group records */
  const records = useMemo(() => {
    if (!members) return [];
    let heaviest=null, volBest=null, streakBest=null, weekMost=null, cardioLong=null;
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      for (const e of (st.log || [])) {
        if (e.weight != null && (!heaviest || e.weight > heaviest.v))
          heaviest = { v:e.weight, text:`${dispW(e.weight,units)} ${uLabel(units)} × ${e.reps} — ${e.exercise}`, who:m.username };
      }
      const volByDate = {};
      for (const e of (st.log || [])) volByDate[e.date] = (volByDate[e.date] || 0) + (e.weight || 0) * e.reps;
      for (const [d, v] of Object.entries(volByDate)) {
        if (v > 0 && (!volBest || v > volBest.v))
          volBest = { v, text:`${Math.round(dispW(v,units)).toLocaleString()} ${uLabel(units)} (${fmtDate(d)})`, who:m.username };
      }
      const s = computeStreak(st.log, st.cardio);
      if (s.best > 0 && (!streakBest || s.best > streakBest.v))
        streakBest = { v:s.best, text:`${s.best} week${s.best===1?"":"s"} in a row`, who:m.username };
      const byWeek = {};
      for (const d of new Set([...(st.log||[]).map(e=>e.date), ...(st.cardio||[]).map(e=>e.date)]))
        byWeek[weekStart(d)] = (byWeek[weekStart(d)] || 0) + 1;
      for (const [wk, c] of Object.entries(byWeek)) {
        if (!weekMost || c > weekMost.v)
          weekMost = { v:c, text:`${c} day${c===1?"":"s"} (week of ${fmtDate(wk)})`, who:m.username };
      }
      for (const c of (st.cardio || [])) {
        if (c.duration && (!cardioLong || c.duration > cardioLong.v))
          cardioLong = { v:c.duration, text:`${c.duration} min ${c.activity}`, who:m.username };
      }
    }
    return [
      heaviest   && { icon:"🏋️", label:"Heaviest set", ...heaviest },
      volBest    && { icon:"🐂", label:"Biggest session volume", ...volBest },
      streakBest && { icon:"🔥", label:"Longest streak", ...streakBest },
      weekMost   && { icon:"📅", label:"Most workout days in a week", ...weekMost },
      cardioLong && { icon:"🏃", label:"Longest cardio", ...cardioLong },
    ].filter(Boolean);
  }, [members, states, units]);

  /* ---- read-only profile view ---- */
  if (profile) {
    const raw = states[profile.user_id];
    const pdata = raw ? { ...defaultData, ...raw } : null;
    const pexMap = pdata ? Object.fromEntries(pdata.exercises.map(e=>[e.name,e])) : {};
    const bw = pdata ? [...pdata.bodyweight].sort((a,b)=>a.date.localeCompare(b.date)) : [];
    const recentCardio = pdata ? [...pdata.cardio].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10) : [];
    return (<>
      <button onClick={()=>setProfile(null)} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← Back to group</button>
      <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>💪 {profile.username}</div>
        <span className="chip" style={{background:T.mint, color:T.green}}>read-only</span>
      </div>
      {!pdata ? (
        <div className="card" style={{color:T.sub}}>They haven't logged anything yet.</div>
      ) : (<>
        <Dashboard data={pdata} exMap={pexMap} setData={()=>{}} own={false} />
        <RecordsTab data={pdata} exMap={pexMap} />
        <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center"}}>
          <div><div style={kpiN}>{bw.length ? dispW(bw[bw.length-1].weight, units) : "—"}</div><div style={kpiL}>Body wt ({uLabel(units)})</div></div>
          <div><div style={kpiN}>{bw.length ? (b=>{const c=dispW(bw[bw.length-1].weight-bw[0].weight, units); return (c>0?"+":"")+c;})() : "—"}</div><div style={kpiL}>Change ({uLabel(units)})</div></div>
          <div><div style={kpiN}>{pdata.cardio.length}</div><div style={kpiL}>Cardio sessions</div></div>
        </div>
        {recentCardio.length > 0 && (
          <div className="card">
            <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
            <table><thead><tr><th>Date</th><th>Activity</th><th>Min</th><th>Cal</th></tr></thead>
              <tbody>{recentCardio.map(e=>(
                <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration}</td><td>{e.calories ?? "—"}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </>)}
    </>);
  }

  /* ---- group view ---- */
  if (active) {
    return (<>
      <button onClick={()=>{setActive(null); setMembers(null);}} style={{ background:"none", color:T.green, fontWeight:700, fontSize:14, marginBottom:10 }}>← All groups</button>
      <div className="card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <div className="h" style={{fontSize:19, color:T.tealDk, display:"flex", alignItems:"center", gap:6}}>
            <button onClick={()=>setEmojiOpen(o=>!o)} title="Change group emoji" style={{
              background:T.input, border:`1px solid ${emojiOpen ? T.green : T.line}`, borderRadius:10,
              fontSize:20, padding:"4px 9px", lineHeight:1.2,
            }}>{active.emoji || "👥"}</button>
            {active.name}
          </div>
          <ConfirmX label="Leave group" onConfirm={async ()=>{ try { await leaveGroup(active.id, user.id); setActive(null); refreshGroups(); } catch(e){ setErr(String(e?.message||e)); } }} />
        </div>
        {emojiOpen && (
          <div style={{marginTop:10, background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"10px 12px"}}>
            <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Pick the group's emoji — everyone in the group sees it, and anyone can change it.</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
              {["👥","💪","🏋️","🔥","⚡","🏆","🐐","😤","🦾","❄️","🥩","🚀","🎯","🃏"].map(e=>(
                <button key={e} onClick={()=>saveEmoji(e)} style={{
                  fontSize:20, padding:"5px 9px", borderRadius:10, lineHeight:1.2,
                  background: (active.emoji||"👥")===e ? "rgba(0,200,5,.16)" : T.card,
                  border:`1px solid ${(active.emoji||"👥")===e ? T.green : T.line}`,
                }}>{e}</button>
              ))}
              <input value={customEmoji} onChange={e=>setCustomEmoji(e.target.value)} placeholder="or type any…"
                maxLength={4} style={{width:110, fontSize:15}} />
              {customEmoji.trim() && (
                <button onClick={()=>{ saveEmoji(customEmoji.trim()); setCustomEmoji(""); }}
                  style={{background:T.green, color:"#000", padding:"6px 14px", fontWeight:700, fontSize:13.5}}>Set</button>
              )}
            </div>
          </div>
        )}
      </div>

      {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
      {!members && <div className="card" style={{color:T.sub}}>Loading group…</div>}

      {members && (<>
        {nutritionOn && <GroupMacrosCard members={members} states={states} myId={user.id} streaksOn={streaksOn} />}
        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>📣 Recent activity</div>
          {!feed.length && <div style={{color:T.sub, fontSize:14}}>Nothing yet — someone go lift something.</div>}
          {feed.slice(0, feedShown).map(ev=>{
            const rs = reactions[ev.key] || [];
            const mine = rs.some(r=>r.reactor_id===user.id);
            return (
              <div key={ev.key} style={{padding:"9px 0", borderBottom:`1px solid ${T.line}`, fontSize:14}}>
                <span style={{color:T.sub, fontSize:12.5}}>{fmtDate(ev.date)}</span>{" "}
                <b>{ev.user}</b>{" "}
                {ev.kind==="cardio" ? <>🏃 {ev.text}</> : <>
                  logged {ev.sets} set{ev.sets===1?"":"s"} — {ev.names.join(", ")}{ev.more>0?` +${ev.more} more`:""}
                </>}
                {ev.prs?.map(pr=>(
                  <span key={pr} className="chip" style={{background:T.mint, color:T.green, marginLeft:6}}>🎉 PR: {pr}</span>
                ))}
                <div style={{marginTop:5, display:"flex", alignItems:"center", gap:8}}>
                  <button onClick={()=>toggleReact(ev.key)} style={{
                    background: mine ? T.mint : "none", border:`1px solid ${mine ? T.green : T.line}`,
                    color: mine ? T.green : T.sub, padding:"2px 12px", fontSize:12.5, fontWeight:600, borderRadius:99,
                  }}>
                    💪 {rs.length > 0 ? rs.length : ""}
                  </button>
                  {rs.length > 0 && (
                    <span style={{color:T.sub, fontSize:11.5}}>{rs.map(r=>r.reactor_name).join(", ")}</span>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ display:"flex", gap:8 }}>
            {feed.length > feedShown && (
              <button onClick={()=>setFeedN(feedShown+15)} style={{
                flex:1, marginTop:10, padding:"9px 0", background:T.input, color:T.green,
                fontWeight:700, fontSize:13.5, border:`1px solid ${T.line}`,
              }}>View more ({feed.length - feedShown} older)</button>
            )}
            {feedN !== null && feedShown > feedAuto && (
              <button onClick={()=>setFeedN(null)} style={{
                flex:1, marginTop:10, padding:"9px 0", background:T.input, color:T.sub,
                fontWeight:700, fontSize:13.5, border:`1px solid ${T.line}`,
              }}>View less</button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🏁 This week</div>
          <table><thead><tr><th>Member</th><th>Workouts</th><th>Streak (wks)</th><th></th></tr></thead>
            <tbody>{consistency.map((r,i)=>(
              <tr key={r.uid}>
                <td style={{fontWeight: r.uid===user.id?700:400}}>{i===0 && r.workouts>0 ? "👑 " : ""}{r.user}{r.uid===user.id?" (you)":""}</td>
                <td style={{minWidth:96}}>
                  <div style={{display:"flex", alignItems:"center", gap:7}}>
                    <div style={{flex:1, height:7, background:T.input, borderRadius:99, overflow:"hidden"}}>
                      <div style={{width:`${Math.min(r.workouts,7)/7*100}%`, height:"100%", background:T.green, borderRadius:99, transition:"width .5s ease"}} />
                    </div>
                    <b style={{color: r.workouts>0?T.green:T.sub, fontSize:13}}>{r.workouts}</b>
                  </div>
                </td>
                <td style={{textAlign:"center"}}>{r.streak}</td>
                <td><button onClick={()=>setProfile(members.find(m=>m.user_id===r.uid))} style={{background:"none", color:T.green, fontSize:12.5, textDecoration:"underline"}}>View profile</button></td>
              </tr>
            ))}</tbody></table>
        </div>

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏋️ Strength — best est. 1RM ({uLabel(units)})</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Green = group best.</div>
          <div style={{overflowX:"auto"}}>
            <table><thead><tr><th>Member</th>{BIG_LIFTS.map(l=><th key={l}>{LIFT_SHORT[l]}</th>)}</tr></thead>
              <tbody>{strength.rows.map(r=>(
                <tr key={r.uid}>
                  <td style={{fontWeight: r.uid===user.id?700:400}}>{r.user}</td>
                  {BIG_LIFTS.map(l=>(
                    <td key={l} style={{ color: r.lifts[l] && r.lifts[l]===strength.best[l] ? T.green : T.ink, fontWeight: r.lifts[l] && r.lifts[l]===strength.best[l] ? 700 : 400 }}>
                      {r.lifts[l] == null ? "—" : dispW(r.lifts[l], units)}
                    </td>
                  ))}
                </tr>
              ))}</tbody></table>
          </div>
        </div>

        {records.length > 0 && (
          <div className="card">
            <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🏆 Group records</div>
            <table><thead><tr><th>Record</th><th>Holder</th><th>Mark</th></tr></thead>
              <tbody>{records.map(r=>(
                <tr key={r.label}>
                  <td>{r.icon} {r.label}</td>
                  <td style={{color:T.green, fontWeight:700}}>{r.who}</td>
                  <td>{r.text}</td>
                </tr>
              ))}</tbody></table>
          </div>
        )}

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>🎟️ Invite & members</div>
          <div style={{fontSize:13.5, color:T.sub, marginBottom:10}}>
            Invite code: <b style={{color:T.green, letterSpacing:"1px"}}>{active.invite_code}</b>
            <button onClick={copyCode} style={{background:"none", color:T.green, fontSize:12.5, marginLeft:8, textDecoration:"underline"}}>{copied ? "Copied!" : "Copy"}</button>
            <span style={{marginLeft:6}}>— friends enter it under Groups → Join.</span>
          </div>
          {members.map(m=>(
            <div key={m.user_id} style={{display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:`1px solid ${T.line}`, fontSize:14}}>
              <span style={{flex:1, fontWeight: m.user_id===user.id?700:500}}>
                {m.user_id===active.created_by ? "👑 " : ""}{m.username}{m.user_id===user.id?" (you)":""}
              </span>
              {isOwner && m.user_id !== user.id && (
                <ConfirmX label="Remove" onConfirm={async ()=>{
                  try { await leaveGroup(active.id, m.user_id); setMembers(ms=>ms.filter(x=>x.user_id!==m.user_id)); }
                  catch(e){ setErr(String(e?.message||e)); }
                }} />
              )}
            </div>
          ))}
          {isOwner && (
            <div style={{marginTop:10}}>
              <ConfirmX label="🔄 Reset invite code" onConfirm={async ()=>{
                try { const nc = await resetInviteCode(active.id); setActive(a=>({...a, invite_code:nc})); refreshGroups(); }
                catch(e){ setErr(String(e?.message||e)); }
              }} />
              <div style={{fontSize:11.5, color:T.sub, marginTop:4}}>Resetting kills the old code — anyone who hasn't joined yet needs the new one.</div>
            </div>
          )}
        </div>
      </>)}
    </>);
  }

  /* ---- groups list / create / join ---- */
  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>👥 Groups</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Make a group, send friends the invite code, and see each other's workouts, PRs, and a friendly weekly race.
      </div>
      {groups === null && <div style={{color:T.sub}}>Loading…</div>}
      {groups !== null && !groups.length && <div style={{color:T.sub, fontSize:14, marginBottom:4}}>You're not in a group yet — create one below or join with a friend's code.</div>}
      {groups?.map(g=>{
        const mem = previews[g.id];
        return (
        <button key={g.id} onClick={()=>setActive(g)} style={{
          display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, width:"100%",
          background:T.input, border:`1px solid ${T.line}`, borderRadius:10, padding:"12px 14px",
          color:T.ink, fontSize:15, fontWeight:600, marginBottom:8, textAlign:"left",
        }}>
          <span style={{flex:1, minWidth:0}}>
            <span style={{display:"block"}}>{g.emoji || "👥"} {g.name}{mem && <span style={{color:T.sub, fontWeight:500, fontSize:12.5}}> · {mem.length} member{mem.length===1?"":"s"}</span>}</span>
            {mem && mem.length > 0 && (
              <span style={{display:"block", fontSize:12, color:T.sub, fontWeight:500, marginTop:3,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                {mem.slice(0,4).map(m=>`${m.username}${agoTxt(m.last)?` (${agoTxt(m.last)})`:""}`).join(", ")}
                {mem.length > 4 ? `, +${mem.length-4} more` : ""}
              </span>
            )}
          </span>
          <span style={{color:T.green, flexShrink:0}}>→</span>
        </button>
        );
      })}
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Create a group</div>
      <div style={{display:"flex", gap:8}}>
        <input value={gname} onChange={e=>setGname(e.target.value)} placeholder="e.g. Gym Rats" maxLength={40} />
        <button onClick={doCreate} disabled={busy||!gname.trim()} style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:(busy||!gname.trim())?0.5:1}}>Create</button>
      </div>
    </div>

    <div className="card">
      <div className="h" style={{fontSize:16, color:T.tealDk, marginBottom:8}}>Join with an invite code</div>
      <div style={{display:"flex", gap:8}}>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="6-character code" maxLength={6} style={{letterSpacing:"2px"}} />
        <button onClick={doJoin} disabled={busy||code.trim().length<6} style={{background:T.green, color:"#000", padding:"0 18px", fontWeight:700, opacity:(busy||code.trim().length<6)?0.5:1}}>Join</button>
      </div>
    </div>

    {err && <div className="card" style={{color:T.danger, fontSize:13.5}}>{err}</div>}
  </>);
}
