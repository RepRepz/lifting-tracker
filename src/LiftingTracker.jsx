import { useState, useEffect, useMemo, useRef, lazy, Suspense, Fragment, createContext, useContext } from "react";
import { supabase, loadUserState, saveUserState, listMyGroups, listMembers, createGroup, joinGroup, leaveGroup, listReactions, addReaction, removeReaction, setSecurityQuestion, getSecurityQuestion, lastActiveFor, setGroupEmoji, resetInviteCode, listCloudBackups, getCloudBackup, getStepToken, stepsFor, lastStepSync, createDuel, listDuels, deleteDuel, acceptDuel, declineDuel, listProUserIds } from "./lib/storage.js";
import { SECURITY_QUESTIONS } from "./AuthScreen.jsx";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MacroTab, GroupMacrosCard, MacroCalendar } from "./Nutrition.jsx";

import { T, tipStyle } from "./theme.js";
import LoadingScreen from "./LoadingScreen.jsx";
export { T, tipStyle }; // re-export so older imports keep working

/* Charts load on demand so the gym-critical tabs (Log etc.) start fast. */
const TrendChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.TrendChart })));
const BodyChart = lazy(() => import("./charts.jsx").then(m => ({ default: m.BodyChart })));
const MusclePie = lazy(() => import("./charts.jsx").then(m => ({ default: m.MusclePie })));
const ChartFallback = ({ h }) => <div className="skeleton" style={{ height: h, borderRadius:12 }} />;

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
  ["Arnold Press",["Shoulders"],["Triceps"]],["Lateral Raise",["Shoulders"]],["Single-Arm Cable Side Raise",["Shoulders"]],["Rear Delt Fly",["Shoulders"]],
  ["Face Pull",["Shoulders"],["Back"]],["Upright Row",["Shoulders"],["Back"]],
  // back
  ["Deadlift",["Back","Legs"]],["Sumo Deadlift",["Legs"],["Back"]],
  ["Barbell Row",["Back"],["Biceps"]],["Pull-Up",["Back"],["Biceps"]],["Chin-Up",["Back","Biceps"]],
  ["Lat Pulldown",["Back"],["Biceps"]],["Seated Cable Row",["Back"],["Biceps"]],["Dumbbell Row",["Back"],["Biceps"]],
  ["T-Bar Row",["Back"],["Biceps"]],["Inverted Row",["Back"],["Biceps"]],
  ["Barbell Shrug",["Back"]],["Dumbbell Shrug",["Back"]],["Back Extension",["Back"],["Legs"]],
  // biceps
  ["Barbell Curl",["Biceps"]],["Dumbbell Curl",["Biceps"]],["Incline Dumbbell Curl",["Biceps"]],["Hammer Curl",["Biceps"]],
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
  ["Sit-Up",["Abs"]],["Crunch",["Abs"]],["Decline Ab Crunch",["Abs"]],["Russian Twist",["Abs"]],["Mountain Climber",["Abs"]],
  ["Farmer's Carry",["Back"],["Abs"]],
];
const BW_SET = new Set([
  "Pull-Up","Chin-Up","Dips","Triceps Dip","Inverted Row","Back Extension","Bodyweight Squat","Glute Bridge",
  "Push-Up","Wide Push-Up","Diamond Push-Up","Incline Push-Up","Decline Push-Up","Pike Push-Up","Archer Push-Up","Clap Push-Up","One-Arm Push-Up",
  "Plank","Hanging Leg Raise","Ab Wheel","Sit-Up","Crunch","Decline Ab Crunch","Russian Twist","Mountain Climber",
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
/* Time zone: "auto" follows this device's clock; a Settings pick overrides it.
   Assigned from profile.tz on every render of the main component. */
let APP_TZ = "auto";
const detectedTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
/* Current date + hour in the chosen zone (en-CA formats as YYYY-MM-DD). */
const nowInfo = () => {
  if (APP_TZ !== "auto") {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hourCycle:"h23" }).formatToParts(new Date());
      const g = (t) => parts.find(p => p.type === t)?.value;
      return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: +g("hour") };
    } catch {}
  }
  const d = new Date();
  return { date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, hour: d.getHours() };
};
/* LOCAL date, not UTC — toISOString() would roll to tomorrow in the evening (US time) */
const todayStr = () => nowInfo().date;
// "Gym day": anything logged before YOUR chosen day-start hour (Settings, default 4 AM)
// still counts as the previous calendar day — so a night owl's 1 AM session stays on
// "tonight", while someone whose day starts at midnight gets the new date immediately.
// Only used to prefill the set form; the 🌙 hint shows the pick and one tap changes it.
let DAY_START = 4; // hour the date flips for logging; assigned from profile.dayStart
const gymDayStr = () => {
  const { date, hour } = nowInfo();
  if (hour >= DAY_START) return date;
  const d = new Date(date + "T00:00"); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
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

/* default cardio activities — Sport = calories estimated, Machine = read them off the display,
   Steps = enter a step count (calories estimated from steps × bodyweight) */
const SEED_CARDIO = [
  ["Walking","Sport"],["Running","Sport"],["Swimming","Sport"],["Cycling","Sport"],
  ["Hiking","Sport"],["Jump Rope","Sport"],["Basketball","Sport"],
  ["Treadmill","Machine"],["Elliptical","Machine"],["Stair Master","Machine"],
  ["Rowing Machine","Machine"],["Exercise Bike","Machine"],
  ["Walk (Steps)","Steps"],
].map(([name, type]) => ({ name, type }));
/* ~0.00057 cal burned per step per kg bodyweight (≈45 cal/1000 steps at 80kg). */
const stepsCal = (steps, kg) => steps ? Math.round(steps * 0.00057 * kg) : null;
/* rough distance from steps: average stride ≈ 0.75 m */
const stepsMiles = (steps) => steps ? +(steps * 0.75 / 1609.34).toFixed(2) : null;

const defaultData = {
  // `muscle` (primary) is kept alongside `muscles`/`muscles2` so older cached app versions still work
  exercises: SEED_EXERCISES.map(([name, muscles, muscles2 = []]) => ({ name, muscle: muscles[0], muscles, muscles2, type: BW_SET.has(name) ? "Bodyweight" : "Weighted", barbell: BARBELL_SEED.has(name) })),
  log: [], bodyweight: [], cardio: [], cardioActivities: SEED_CARDIO,
  routines: [], // optional workout templates (feature toggled in Settings)
  foods: [], nutritionGoals: {}, // optional macro tracking (feature toggled in Settings)
  customFoods: [], recipes: [], recurringSkips: [], water: [], waterPrefs: {}, fasting: {}, dayDone: [],
  journal: {}, // { "YYYY-MM-DD": { mood, sleep, text } } — daily notes
  profile: {}, // heightIn (inches) lives here once set
  pins: [],    // pinned dashboard charts (exercise names)
  libraryV: 8, // bumped when the seed library changes, so existing users get the update once
};

/* One-time upgrade of previously saved data: pull in newly added seed exercises and
   the current primary/secondary muscle lists — custom moves pass through untouched.
   Runs only when libraryV is behind, so later deletions stay deleted. */
function migrateData(d, uname) {
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
  // one-off cleanup: fold any "Low to High Side Raise" (a custom name) into the seed
  // "Single-Arm Cable Side Raise" — rename its log entries and drop the old library entry.
  const norm = (s) => (s || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const isOldSideRaise = (name) => { const n = norm(name); return n.includes("low to high") && n.includes("side raise"); };
  let log = (d.log || []).map(e => isOldSideRaise(e.exercise) ? { ...e, exercise: "Single-Arm Cable Side Raise" } : e);
  const cleanedExercises = exercises.filter(x => !isOldSideRaise(x.name));
  // one-off: dimi's 7/20 decline ab session, logged for him by request (runs once — the
  // libraryV gate above plus this duplicate check keep it from ever doubling up)
  if (uname === "dimi" && !log.some(e => e.exercise === "Decline Ab Crunch" && e.date === "2026-07-20")) {
    const base = new Date("2026-07-20T12:00").getTime();
    const note = "Kept my upper back off the bench the whole set — abs under constant tension, really activated.";
    log = [...log, ...[1, 2, 3].map(n => ({ id: base + n, date: "2026-07-20", exercise: "Decline Ab Crunch",
      set: n, weight: null, reps: 8, effort: "To failure", notes: n === 1 ? note : "" }))];
  }
  return { ...d, log, exercises: cleanedExercises, cardioActivities, libraryV: defaultData.libraryV };
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
  const [tab, setTab] = useState(() => {
    const pref = localStorage.getItem("lt-start-tab") || "dash";
    return pref === "last" ? (localStorage.getItem("lt-last-tab") || "dash") : pref;
  });
  useEffect(() => { localStorage.setItem("lt-last-tab", tab); }, [tab]);
  const [showSettings, setShowSettings] = useState(false);
  const [navHidden, setNavHidden] = useState(false); // bottom bar slides away on scroll-down
  const nudging = useRef(false); // true while the launch viewport-nudge runs (below) — ignore its scrolls
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      if (nudging.current) return;                             // ignore the automated launch nudge
      const y = window.scrollY;
      if (y < 12) { setNavHidden(false); last = y; return; }   // always show near the top
      const dy = y - last;
      if (Math.abs(dy) < 8) return;                             // ignore tiny jitters
      setNavHidden(dy > 0);                                     // down = hide, up = show
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* iOS installed-app (standalone) cold-launch fix.
     When the app opens STRAIGHT onto a short, non-scrolling tab (e.g. Groups), iOS
     anchors the fixed bottom bar to a viewport height that hasn't settled yet, leaving
     a phantom empty row until you swipe. Opening on any other tab first avoids it because
     rendering/scrolling settles the viewport. So on launch we reproduce that swipe once,
     automatically: make the page briefly scrollable, nudge-scroll, then restore — which
     forces WebKit to recompute the viewport before the glitch is ever visible. */
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (!standalone) return;
    nudging.current = true;
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { position:"absolute", top:"0", left:"0", width:"1px", height:"150vh", opacity:"0", pointerEvents:"none", zIndex:"-1" });
    document.body.appendChild(spacer);
    const t1 = setTimeout(() => { window.scrollTo(0, 60); }, 50);          // "swipe down"
    const t2 = setTimeout(() => {                                           // "swipe back up"
      window.scrollTo(0, 0);
      spacer.remove();
      nudging.current = false;
    }, 240);
    return () => { clearTimeout(t1); clearTimeout(t2); if (spacer.parentNode) spacer.remove(); nudging.current = false; };
  }, []);
  const [units, setUnits] = useState(() => localStorage.getItem("lt-units") || "lb");
  const [hunit, setHunit] = useState(() => localStorage.getItem("lt-hunit") || "ftin"); // height: "ftin" | "cm"
  const [routinesOn, setRoutinesOn] = useState(() => localStorage.getItem("lt-routines-on") === "1"); // optional templates feature
  const [stepsOn, setStepsOn] = useState(() => localStorage.getItem("lt-steps-on") === "1"); // Apple Health steps tab
  // Lifting is always on for everyone. The full Macros/nutrition feature is built and kept
  // in the codebase (Nutrition.jsx + the tab wiring below) but PARKED for most accounts.
  // Currently unlocked ONLY for these usernames (a private demo for Anis). Add a name here
  // to give someone access, or set to `true` to turn it on for everyone.
  const liftingOn = true;
  const MACRO_ACCOUNTS = ["dimi", "ancenurkic"];
  const [proIds, setProIds] = useState([]);
  useEffect(() => { listProUserIds().then(setProIds).catch(()=>{}); }, []);
  const isPro = proIds.includes(user.id);
  // Nutrition/Macros is a Pro feature now (still on for the legacy demo accounts).
  const nutritionOn = isPro || MACRO_ACCOUNTS.includes((user.user_metadata?.username || "").toLowerCase());
  const [streaksOn, setStreaksOn] = useState(() => localStorage.getItem("lt-streaks-on") !== "0"); // default on
  const [waterOn, setWaterOn] = useState(() => localStorage.getItem("lt-water-on") !== "0"); // default on
  useEffect(() => { localStorage.setItem("lt-streaks-on", streaksOn ? "1" : "0"); }, [streaksOn]);
  useEffect(() => { localStorage.setItem("lt-water-on", waterOn ? "1" : "0"); }, [waterOn]);
  useEffect(() => { localStorage.setItem("lt-start-tab", startTab); }, [startTab]);
  useEffect(() => { localStorage.setItem("lt-units", units); }, [units]);
  useEffect(() => { localStorage.setItem("lt-hunit", hunit); }, [hunit]);
  useEffect(() => { localStorage.setItem("lt-routines-on", routinesOn ? "1" : "0"); }, [routinesOn]);
  useEffect(() => { localStorage.setItem("lt-steps-on", stepsOn ? "1" : "0"); }, [stepsOn]);
  // The Steps toggle is PROFILE-WIDE: turning it on (or off) on one device syncs to the
  // rest via the cloud state, so enabling on your phone lights it up on your PC too.
  const setStepsOnSynced = (v) => {
    const on = typeof v === "function" ? v(stepsOn) : v;
    setStepsOn(on);
    setData(d => ({ ...d, profile: { ...(d.profile || {}), stepsOn: on } }));
  };
  useEffect(() => {
    const v = data?.profile?.stepsOn;
    if (typeof v === "boolean" && v !== stepsOn) setStepsOn(v); // adopt the cloud value on load / cross-device change
  }, [data?.profile?.stepsOn]);
  useEffect(() => {
    if (tab === "macros" && !nutritionOn) setTab("dash"); // non-dev accounts never land on Macros
    if (tab === "steps" && !stepsOn) setTab("dash");      // hide the Steps tab when the feature is off
  }, [nutritionOn, stepsOn, tab]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncState, setSyncState] = useState("synced"); // "synced" | "offline"
  const saveTimer = useRef(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const username = user.user_metadata?.username || "you";
  const unameLower = (user.user_metadata?.username || "").toLowerCase();
  const cacheKey = `lt-cache-${user.id}`;
  const pendKey = `lt-pending-${user.id}`;
  APP_TZ = data.profile?.tz || "auto"; // date helpers everywhere follow the Settings pick
  DAY_START = data.profile?.dayStart ?? 4; // 0 = date flips at midnight

  useEffect(() => { (async () => {
    const cachedRaw = localStorage.getItem(cacheKey);
    // Unsynced offline edits from a previous session win (accepted trade-off)
    if (localStorage.getItem(pendKey) === "1" && cachedRaw) {
      try { setData({ ...defaultData, ...migrateData(JSON.parse(cachedRaw), unameLower) }); setLoaded(true); return; } catch {}
    }
    try {
      const v = await loadUserState(user.id);
      if (v) {
        setData({ ...defaultData, ...migrateData(v, unameLower) });
        localStorage.setItem(cacheKey, JSON.stringify(v));
        setLoaded(true); return;
      }
      setLoaded(true);
    } catch (e) {
      console.error("load failed", e);
      if (cachedRaw) {
        // no signal, but we have this device's last copy — keep going offline
        try { setData({ ...defaultData, ...migrateData(JSON.parse(cachedRaw), unameLower) }); setSyncState("offline"); setLoaded(true); return; } catch {}
      }
      setLoadFailed(true);
    }
  })(); }, [user.id]);

  // Big-delete guard: if one change would wipe out a big chunk of the data (a bug or a
  // fat-fingered mass delete), saving pauses and a modal asks first. One-at-a-time
  // deletes never come close to triggering it.
  const [shrinkWarn, setShrinkWarn] = useState(null); // { prev, next } while a save is held
  const allowShrink = useRef(false);
  const entryCount = (d) => (d.log||[]).length + (d.bodyweight||[]).length + (d.cardio||[]).length;
  useEffect(() => { if (!loaded) return;
    let prevN = null;
    try { const raw = localStorage.getItem(cacheKey); if (raw) prevN = entryCount(JSON.parse(raw)); } catch {}
    const nextN = entryCount(data);
    if (!allowShrink.current && prevN !== null && prevN >= 20 && nextN < prevN / 2) {
      setShrinkWarn({ prev: prevN, next: nextN });
      return; // NOTHING is written (device or cloud) until the user decides
    }
    allowShrink.current = false;
    // Rolling backups: first save of each day keeps a snapshot on this device (last 7 days),
    // restorable from Settings → Data safety.
    try {
      const bkey = `lt-bk-${user.id}-${todayStr()}`;
      if (!localStorage.getItem(bkey)) {
        localStorage.setItem(bkey, localStorage.getItem(cacheKey) || JSON.stringify(data));
        const mine = Object.keys(localStorage).filter(k => k.startsWith(`lt-bk-${user.id}-`)).sort();
        while (mine.length > 7) localStorage.removeItem(mine.shift());
      }
    } catch {}
    // Always land the change on this device instantly; the cloud follows.
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(pendKey, "1");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveUserState(user.id, data); localStorage.removeItem(pendKey); setSyncState("synced"); }
      catch (e) { console.error("save failed", e); setSyncState("offline"); }
    }, 500);
  }, [data, loaded, user.id]);
  const keepData = () => { // undo the mass delete: reload the untouched copy from this device
    setShrinkWarn(null);
    try { const raw = localStorage.getItem(cacheKey); if (raw) setData({ ...defaultData, ...migrateData(JSON.parse(raw), unameLower) }); } catch {}
  };
  const deleteAnyway = () => { allowShrink.current = true; setShrinkWarn(null); setData(d => ({ ...d })); };

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

  if (!loaded) return <LoadingScreen />;

  // order chosen so the phone bottom bar reads as two clean rows of four:
  //   row 1: Dash · Log · Records · Library     row 2: Macros · Groups · Cardio · Body
  const tabs = [
    ...(liftingOn ? [["dash","Dash","📊"],["log","Log","📝"],["records","Records","🏆"],["ex","Library","📚"]] : []),
    ...(nutritionOn ? [["macros","Macros","🥗"]] : []),
    ["journal","Journal","📓"],
    ["friends","Groups","👥"],
    ...(liftingOn ? [["cardio","Cardio","🏃"]] : []),
    ...(liftingOn && stepsOn ? [["steps","Steps","👟"]] : []),
    ...(liftingOn ? [["body","Body","⚖️"]] : []),
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
        input,select,textarea { border:1px solid ${T.line}; border-radius:10px; padding:9px 10px; background:${T.input}; color:${T.ink}; width:100%; transition:border-color .18s ease, box-shadow .22s ease; min-height:44px; -webkit-appearance:none; appearance:none; }
        select { background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238C8F90' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px; }
        input[type=date] { min-width:0; }
        input[type=date]::-webkit-date-and-time-value { text-align:left; }
        input::placeholder,textarea::placeholder { color:${T.sub}; opacity:.75; }
        /* soft green focus glow instead of a hard outline jump */
        input:focus,select:focus,textarea:focus { outline:none; border-color:${T.green}; box-shadow:0 0 0 3px rgba(0,200,5,.18); }
        button { cursor:pointer; border:none; border-radius:24px; transition:transform .14s cubic-bezier(.34,1.56,.64,1), background-color .18s ease, color .18s ease, border-color .18s ease, opacity .18s ease, box-shadow .18s ease, filter .18s ease; }
        button:active { transform:scale(.95); }
        @media(hover:hover){ button:hover:not(:disabled){ filter:brightness(1.08); } }
        table { border-collapse:collapse; width:100%; } td,th { padding:9px 10px; text-align:left; font-size:13.5px; }
        th { background:none; color:${T.sub}; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; white-space:nowrap; border-bottom:1px solid ${T.line}; }
        td { border-bottom:1px solid ${T.line}; }
        .card { background:${T.card}; border:1px solid ${T.line}; border-radius:14px; padding:16px; margin-bottom:14px; animation:rise .34s cubic-bezier(.22,1,.36,1) both; }
        .recharts-text { fill:${T.sub}; }
        .h { font-weight:800; letter-spacing:.2px; }
        @keyframes rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes pop { 0% { transform:scale(.6); opacity:0; } 70% { transform:scale(1.06); opacity:1; } 100% { transform:scale(1); opacity:1; } }
        @keyframes grow { from { transform:scaleY(0); } }
        .vbar { transform-origin:bottom; animation:grow .5s ease-out both; }
        .chip { animation:pop .25s ease-out both; }
        .chip { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
        @keyframes fadeSwap { from { opacity:0; transform:translateY(8px) scale(.994); } to { opacity:1; transform:none; } }
        @keyframes sheetUp { from { transform:translateY(100%); } to { transform:none; } }
        .tabview { animation:fadeSwap .28s cubic-bezier(.22,1,.36,1) both; }
        /* staggered card entrance — transform/opacity only, one-shot, GPU-cheap */
        .tabview > .card:nth-child(2) { animation-delay:.05s; }
        .tabview > .card:nth-child(3) { animation-delay:.10s; }
        .tabview > .card:nth-child(4) { animation-delay:.15s; }
        .tabview > .card:nth-child(5) { animation-delay:.20s; }
        .tabview > .card:nth-child(n+6) { animation-delay:.24s; }
        /* desktop depth: cards lift slightly and cast a soft shadow on hover */
        @media(hover:hover){ .card { transition:border-color .2s ease, transform .2s ease, box-shadow .2s ease; } .card:hover { border-color:#2E3234; transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.28); } }
        .navicon { transition:transform .2s cubic-bezier(.34,1.56,.64,1); font-size:19px; }
        .navicon.on { transform:translateY(-1px) scale(1.16); }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important} }

        /* settings sheet: a bottom sheet on phones, a centered dialog on desktop */
        @media(min-width:640px){
          .sheet-wrap { align-items:center !important; padding:24px; }
          .sheet { border-radius:18px !important; border:1px solid ${T.line} !important; max-height:86vh !important;
            animation:calPop .2s cubic-bezier(.22,1,.36,1) both !important; }
        }

        /* ---- custom date picker ---- */
        .cal-pop { animation:calPop .16s cubic-bezier(.22,1,.36,1) both; transform-origin:top left; }
        @keyframes calPop { from { opacity:0; transform:translateY(-6px) scale(.97); } to { opacity:1; transform:none; } }
        .cal-day { transition:background .12s ease, color .12s ease, transform .1s ease; }
        .cal-day:active:not(.cal-off) { transform:scale(.85); }
        @media(hover:hover){ .cal-day:not(.cal-off):not(.cal-sel):hover { background:rgba(255,255,255,.09)!important; } }
        .cal-nav { transition:background .14s ease, color .14s ease; }
        @media(hover:hover){ .cal-nav:not(:disabled):hover { background:rgba(255,255,255,.10)!important; color:#fff!important; } }

        /* ---- shimmering skeleton for loading states ---- */
        .skeleton { position:relative; overflow:hidden; background:${T.input}; }
        .skeleton::after { content:""; position:absolute; inset:0; transform:translateX(-100%);
          background:linear-gradient(90deg, transparent, rgba(255,255,255,.06) 45%, rgba(0,200,5,.10) 50%, rgba(255,255,255,.06) 55%, transparent);
          animation:shimmer 1.35s ease-in-out infinite; }
        @keyframes shimmer { 100% { transform:translateX(100%); } }

        /* ---- weigh-in note: expand/collapse ---- */
        .note-reveal { animation:noteIn .32s cubic-bezier(.22,1,.36,1); overflow:hidden; }
        @keyframes noteIn { from { opacity:0; transform:translateY(-6px); max-height:0; } to { opacity:1; transform:translateY(0); max-height:400px; } }
        /* settings sections: fade/slide only — NO max-height, so tall content (password
           card etc.) is never clipped and the sheet can scroll through all of it */
        @keyframes secIn { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:none; } }
        .note-btn { transition:color .15s ease, background .15s ease, transform .12s ease; }
        .note-btn:active { transform:scale(.9); }
        @media(hover:hover){ .note-btn:hover{ color:${T.green}!important; } }
        .note-caret { display:inline-block; transition:transform .28s cubic-bezier(.22,1,.36,1); }
        .note-caret.open { transform:rotate(90deg); }

        /* ---- monthly group recap popup ---- */
        @keyframes recapPop { 0%{opacity:0; transform:translateY(24px) scale(.94);} 60%{opacity:1; transform:translateY(0) scale(1.015);} 100%{opacity:1; transform:translateY(0) scale(1);} }
        @keyframes recapRow { from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:none;} }
        @keyframes recapSheen { 0%{background-position:-160% 0;} 100%{background-position:260% 0;} }
        @keyframes recapBar { from{transform:scaleX(0);} to{transform:scaleX(1);} }
        @keyframes confFall { 0%{opacity:0; transform:translateY(-14px) rotate(0);} 12%{opacity:1;} 100%{opacity:0; transform:translateY(120px) rotate(320deg);} }
        .recap-card { animation:recapPop .42s cubic-bezier(.22,1,.36,1) both; }
        .recap-title { background:linear-gradient(100deg,#8fe3a0 0%,${T.green} 30%,#F4D58D 50%,#E9C46A 60%,${T.green} 80%,#8fe3a0 100%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation:recapSheen 3.2s linear infinite; }
        .recap-row { animation:recapRow .4s cubic-bezier(.22,1,.36,1) both; }
        .recap-bar-fill { transform-origin:left; animation:recapBar .7s cubic-bezier(.22,1,.36,1) both; }
        .conf { position:absolute; top:0; width:7px; height:11px; border-radius:2px; animation:confFall linear both; }

        /* ---- responsive: phone (<900px) vs desktop (>=900px) ---- */
        /* mobile-first: tabs live in a fixed BOTTOM bar for thumb reach */
        .nav-top { display:none; }
        .nav-bottom {
          position:fixed; bottom:0; left:0; right:0; z-index:20;
          /* GRID, not flex-wrap: 5 columns → up to 10 tabs make exactly two tight rows
             (icons sit closer together). Flex-wrap used to spill a button onto a phantom
             extra row at launch on iOS when the viewport width wasn't settled; grid can't. */
          display:grid; grid-template-columns:repeat(5, 1fr); row-gap:1px;
          padding:4px 3px calc(4px + min(env(safe-area-inset-bottom), 34px));
          background:${T.bg}; border-top:1px solid ${T.line};
          transition:transform .3s cubic-bezier(.4,0,.2,1);
          /* Keep the bar on its OWN GPU layer at all times. Without a persistent
             non-none transform, iOS Safari doesn't give a position:fixed element a
             compositor layer, so during momentum/rubber-band scrolling it gets
             "stranded" mid-page until the scroll settles (looked like the bar was
             floating in the middle of the screen). translateZ(0) pins it. */
          transform:translateY(0) translateZ(0); will-change:transform; backface-visibility:hidden;
        }
        /* slide the bar down out of view while scrolling down; back up on scroll-up */
        .nav-bottom.nav-hidden { transform:translateY(140%) translateZ(0); }
        /* tab button — soft green pill on the active one, Robinhood style */
        .navbtn {
          display:flex; flex-direction:column; align-items:center; gap:1px; min-width:0;
          padding:6px 0 5px; border:none; border-radius:11px; background:transparent;
          color:${T.sub}; font-weight:500; font-size:9.5px; cursor:pointer;
          transition:background .22s ease, color .22s ease, transform .16s cubic-bezier(.34,1.56,.64,1);
        }
        .navbtn .navlbl { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .navbtn.on { background:rgba(0,200,5,.12); color:${T.green}; font-weight:700; }
        @media(hover:hover){ .navbtn:hover:not(.on){ background:rgba(255,255,255,.05); color:${T.ink}; } }
        .navbtn:active { transform:scale(.9); }
        .app-main { max-width:860px; margin:0 auto; padding:16px 14px; }
        /* bottom bar is two tight rows of five now — reserve room for two */
        .app-root { padding-bottom:calc(120px + min(env(safe-area-inset-bottom), 34px)); }
        /* floating "back" on member profiles — above the bottom nav on phones */
        .profile-back-fab { position:fixed; right:16px; z-index:40; bottom:calc(96px + min(env(safe-area-inset-bottom), 34px)); }

        @media (min-width:900px) {
          /* desktop: tabs move into the TOP app bar, bottom bar disappears.
             Content stays a clean CENTERED single column (no stretching). */
          .nav-top { display:flex; gap:6px; }
          .nav-bottom { display:none; }
          .app-root { padding-bottom:36px; }
          .navtop-btn {
            display:flex; flex-direction:column; align-items:center; gap:4px;
            padding:9px 17px; border:none; border-radius:13px; background:transparent;
            color:${T.sub}; font-weight:600; font-size:12.5px; cursor:pointer; white-space:nowrap;
            transition:background .18s ease, color .18s ease, transform .15s ease;
          }
          .navtop-btn .navicon { font-size:21px; }
          .navtop-btn:active { transform:scale(.94); }
          .navtop-btn.on { background:rgba(0,200,5,.13); color:${T.green}; font-weight:700; }
          .navtop-btn:hover:not(.on){ background:rgba(255,255,255,.06); color:${T.ink}; }
          .profile-back-fab { bottom:28px; }
          .app-main { max-width:880px; padding:24px 20px; }
          /* the Macros tab uses a two-column layout, so it gets a wider canvas */
          .app-main-wide { max-width:1200px; }
        }

        /* Robinhood-style slider (Settings → My day starts at) */
        input[type=range].lab-range { -webkit-appearance:none; appearance:none; width:100%; height:26px; border-radius:99px; border:none; padding:10px 0; min-height:26px; background-clip:content-box; outline:none; cursor:pointer; }
        input[type=range].lab-range:focus { box-shadow:none; }
        .lab-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:26px; height:26px; border-radius:50%; background:#000; border:3px solid ${T.green}; box-shadow:0 2px 10px rgba(0,200,5,.45); transition:transform .15s ease; }
        .lab-range:active::-webkit-slider-thumb { transform:scale(1.18); }
        .lab-range::-moz-range-thumb { width:26px; height:26px; border-radius:50%; background:#000; border:3px solid ${T.green}; box-shadow:0 2px 10px rgba(0,200,5,.45); }
        /* drag-to-reorder */
        .drag-handle { cursor:grab; touch-action:none; }
        .dragging { opacity:.55; }
        .drag-over-top { box-shadow:0 -3px 0 ${T.green}; }
        .drag-over-bot { box-shadow:0 3px 0 ${T.green}; }
      `}</style>

      <div style={{ position:"sticky", top:0, zIndex:10, background:T.bg, borderBottom:`1px solid ${T.line}` }}>
        <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", alignItems:"center", gap:14,
          padding:"calc(12px + env(safe-area-inset-top)) 20px 8px", color:"#fff" }}>
          <div className="h" onClick={()=>setTab("dash")} style={{ fontSize:19, cursor:"pointer", userSelect:"none", whiteSpace:"nowrap", minWidth:0, overflow:"hidden", textOverflow:"ellipsis" }}>🏋️ THE LAB</div>
          {/* tabs: inline & centered in the app bar on desktop; hidden on phone (bottom bar used) */}
          <nav className="nav-top" style={{ flex:1, justifyContent:"center" }}>
            {tabs.map(([id,label,icon]) => (
              <button key={id} onClick={()=>setTab(id)} className={"navtop-btn" + (tab===id?" on":"")}>
                <span className={"navicon" + (tab===id?" on":"")}>{icon}</span>
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
        <SettingsModal user={user} username={username} data={data} setData={setData}
          startTab={startTab} setStartTab={setStartTab} tabs={tabs}
          units={units} setUnits={setUnits} hunit={hunit} setHunit={setHunit}
          routinesOn={routinesOn} setRoutinesOn={setRoutinesOn}
          stepsOn={stepsOn} setStepsOn={setStepsOnSynced} isPro={isPro}
          streaksOn={streaksOn} setStreaksOn={setStreaksOn}
          waterOn={waterOn} setWaterOn={setWaterOn}
          nutritionOn={nutritionOn}
          onClose={()=>setShowSettings(false)} />
      )}

      {shrinkWarn && (
        <div style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.72)", backdropFilter:"blur(2px)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeSwap .18s ease-out both" }}>
          <div className="card" style={{ maxWidth:430, width:"100%", borderColor:T.danger, marginBottom:0 }}>
            <div className="h" style={{ fontSize:18, color:T.danger, marginBottom:8 }}>⚠️ Hold up — big deletion</div>
            <div style={{ fontSize:14.5, color:T.ink, lineHeight:1.6, marginBottom:14 }}>
              This change would shrink your data from <b>{shrinkWarn.prev}</b> logged entries to <b>{shrinkWarn.next}</b>.
              Nothing has been saved yet — if you didn't mean to delete this much, keep your data and it's like it never happened.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={keepData} style={{ flex:1, background:T.green, color:"#000", padding:"12px", fontWeight:800, fontSize:15 }}>Keep my data</button>
              <button onClick={deleteAnyway} style={{ background:T.dangerBg, color:T.danger, padding:"12px 16px", fontWeight:700, fontSize:14 }}>Delete anyway</button>
            </div>
          </div>
        </div>
      )}

      {syncState === "offline" && (
        <div style={{ background:"#2A2416", color:"#E3BE55", padding:"8px 18px", fontSize:13, fontWeight:600 }}>
          📴 Offline — your sets are saved on this device and will sync automatically when signal returns.
        </div>
      )}

      <main className={"app-main" + (tab==="macros" ? " app-main-wide" : "")}>
        <div className="tabview" key={tab}>
          {tab==="dash" && liftingOn && <Dashboard data={data} exMap={exMap} setData={setData} />}
          {tab==="log" && liftingOn && <LogTab data={data} exMap={exMap} setData={setData} routinesOn={routinesOn} />}
          {tab==="records" && liftingOn && <RecordsTab data={data} exMap={exMap} />}
          {tab==="journal" && <JournalTab data={data} setData={setData} />}
          {tab==="friends" && <FriendsTab user={user} nutritionOn={nutritionOn} streaksOn={streaksOn} />}
          {tab==="macros" && nutritionOn && <MacroTab data={data} setData={setData} streaksOn={streaksOn} waterOn={waterOn} />}
          {tab==="body" && liftingOn && <BodyTab data={data} setData={setData} hunit={hunit} />}
          {tab==="cardio" && liftingOn && <CardioTab data={data} setData={setData} latestBW={latestBW} user={user} stepsOn={stepsOn} />}
          {tab==="steps" && liftingOn && stepsOn && <StepsTab user={user} data={data} setData={setData} />}
          {tab==="ex" && liftingOn && <ExercisesTab data={data} setData={setData} />}
        </div>
      </main>

      {/* phone tab bar (bottom, thumb-reachable) — up to two rows of four. Hidden on desktop. */}
      <nav className={"nav-bottom" + (navHidden ? " nav-hidden" : "")}>
        {tabs.map(([id,label,icon]) => (
          <button key={id} onClick={()=>setTab(id)} className={"navbtn" + (tab===id?" on":"")}>
            <span className={"navicon" + (tab===id?" on":"")}>{icon}</span>
            <span className="navlbl">{label}</span>
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
  // date defaults to the "gym day" (before your Settings day-start hour = still yesterday);
  // exercise only carries over from that same day
  const gymDay = gymDayStr();
  const [date, setDate] = useState(gymDay);
  const [exName, setExName] = useState(last?.date === gymDay ? last.exercise : "");
  const [setNum, setSetNum] = useState(1);
  // set # follows what's actually in the log for this exercise+date, so it resets on a new
  // day/exercise and heals itself when a set is deleted (no more phantom "set 4 of 3")
  useEffect(() => {
    const n = data.log.filter(e => e.date === date && e.exercise === exName).length;
    setSetNum(n + 1);
  }, [data.log, date, exName]);
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

  // drop sets: same set, weight lowered mid-set and kept going — extra {weight, reps} rows
  const [drops, setDrops] = useState([]);
  const addSet = () => {
    if (!exName || !reps || (!isBW && !weight)) return;
    if (date > todayStr()) { setDate(todayStr()); return; } // no logging the future
    const cleanDrops = drops
      .map(dr => ({ weight: toLb(parseFloat(dr.weight), units), reps: parseInt(dr.reps) }))
      .filter(dr => dr.weight > 0 && dr.reps > 0);
    const entry = { id: Date.now(), date, exercise: exName, set: setNum,
      weight: isBW ? null : toLb(parseFloat(weight), units), reps: parseInt(reps), effort, notes,
      ...(cleanDrops.length ? { drops: cleanDrops } : {}) };
    const pr = checkPR(entry);
    setData(d => ({ ...d, log: [...d.log, entry] }));
    setJustSaved({ ...entry, pr });
    setSetNum(n => n + 1); setNotes(""); setEffort(""); setDrops([]);
    if (effort !== "Warm-up") startRest(); // auto-start rest between working sets (no-op when Off)
  };
  const sameAgain = () => {
    if (!justSaved) return;
    setReps(String(justSaved.reps));
    if (justSaved.weight != null) setWeight(String(dispW(justSaved.weight, units)));
    if (justSaved.drops?.length) setDrops(justSaved.drops.map(dr => ({ weight: String(dispW(dr.weight, units)), reps: String(dr.reps) })));
    setJustSaved(null);
  };

  // most recent logged weight (in lb) for an exercise — lets us pre-fill the weight field so
  // you don't retype a weight that didn't change; you only edit it when it's actually different.
  const lastWeightFor = (name) => {
    let best = null;
    for (const e of data.log) {
      if (e.exercise === name && e.weight != null &&
          (!best || e.date > best.date || (e.date === best.date && (e.id||0) > (best.id||0)))) best = e;
    }
    return best ? best.weight : null;
  };
  const startNewExercise = (name) => {
    const w = lastWeightFor(name);
    setExName(name); setSetNum(1);
    setWeight(w != null ? String(dispW(w, units)) : ""); // pre-fill the last weight used for this exercise
    setReps(""); setJustSaved(null); setDrops([]);
  };
  // on reopen: if an exercise carried over from the current gym-day, pre-fill its last weight too
  useEffect(() => {
    if (exName && weight === "") {
      const w = lastWeightFor(exName);
      if (w != null) setWeight(String(dispW(w, units)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // routine tapped: load the exercise into the form, prefill target reps, jump to the gym day
  const pickFromRoutine = (exercise, reps) => {
    startNewExercise(exercise);
    const already = data.log.filter(e => e.exercise === exercise && e.date === gymDay && e.effort !== "Warm-up").length;
    setSetNum(already + 1);
    const n = String(reps || "").match(/\d+/);
    if (n) setReps(n[0]);
    setDate(gymDay);
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
  const [histLimit, setHistLimit] = useState(50); // show newest 50, "Show more" reveals the rest
  const histFull = useMemo(() => {
    const q = histQ.trim().toLowerCase();
    const src = q ? sorted.filter(e => e.exercise.toLowerCase().includes(q)) : sorted;
    return [...src].reverse(); // full history, newest first — nothing dropped
  }, [sorted, histQ]);
  const searching = histQ.trim() !== "";
  const recent = searching ? histFull : histFull.slice(0, histLimit); // filtering shows every match

  const [noteOpen, setNoteOpen] = useState(null); // set id whose 📝 note is expanded
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
        <div>
          <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
          {date === gymDay && gymDay !== todayStr() && (
            <span style={{display:"block", fontSize:11, color:T.sub, marginTop:3}}>🌙 counted as yesterday</span>
          )}
        </div>
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
      {!isBW && exName && (
        <div style={{marginBottom:10}}>
          {drops.map((dr, i) => (
            <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 1fr 44px", gap:10, marginBottom:8, alignItems:"end"}}>
              <label style={lbl}>Drop {i+1} weight ({uLabel(units)})
                <input type="number" inputMode="decimal" value={dr.weight} onChange={ev=>setDrops(a=>a.map((x,j)=>j===i?{...x, weight:ev.target.value}:x))} /></label>
              <label style={lbl}>Reps
                <input type="number" inputMode="numeric" value={dr.reps} onChange={ev=>setDrops(a=>a.map((x,j)=>j===i?{...x, reps:ev.target.value}:x))} /></label>
              <button type="button" onClick={()=>setDrops(a=>a.filter((_,j)=>j!==i))}
                style={{background:T.input, color:T.danger, border:`1px solid ${T.line}`, minHeight:44, borderRadius:10, fontSize:15}}>✕</button>
            </div>
          ))}
          <button type="button" onClick={()=>setDrops(a=>[...a, {weight:"", reps:""}])}
            style={{background:"none", border:`1px dashed ${T.line}`, color:T.sub, padding:"9px 14px", fontSize:13, fontWeight:600, borderRadius:10, width:"100%"}}>
            ⤵ Drop set — lowered the weight, kept going (saves inside this set)
          </button>
        </div>
      )}
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
          {justSaved.drops?.length ? ` + ${justSaved.drops.length} drop${justSaved.drops.length===1?"":"s"}` : ""}
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
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Set history</div>
      <input value={histQ} onChange={e=>{setHistQ(e.target.value); setHistLimit(50);}} placeholder="🔍 Filter by exercise…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th style={{textAlign:"center"}}>Set</th><th style={{textAlign:"center"}}>Weight ({uLabel(units)})</th><th style={{textAlign:"center"}}>Reps</th><th>Effort</th><th></th></tr></thead>
          <tbody>{recent.map(e => { const isToday = e.date === todayStr(); return (<Fragment key={e.id}>
            <tr style={isToday ? {background:"rgba(0,200,5,.05)"} : undefined}>
              <td>{isToday ? <span style={{color:"#00A804", fontWeight:800}}>Today</span> : fmtDate(e.date)}</td><td>{e.exercise}</td><td style={{textAlign:"center"}}>{e.set}</td>
              <td style={{textAlign:"center"}}>{e.weight==null ? "BW" : dispW(e.weight, units)}{e.drops?.length ? <span style={{color:T.sub}}>{" ↘ "}{e.drops.map(dr=>dispW(dr.weight, units)).join(" ↘ ")}</span> : null}</td>
              <td style={{textAlign:"center"}}>{e.reps}{e.drops?.length ? <span style={{color:T.sub}}>{" / "}{e.drops.map(dr=>dr.reps).join(" / ")}</span> : null}</td>
              <td style={{color:T.sub}}>{e.effort||""}</td>
              <td style={{whiteSpace:"nowrap"}}>
                {String(e.notes||"").trim() && (
                  <button className="note-btn" onClick={()=>setNoteOpen(o=>o===e.id?null:e.id)}
                    style={{background:"none", color:T.green, fontSize:12.5, fontWeight:700, padding:"4px 6px"}}>
                    <span className="note-caret" style={{display:"inline-block", transform: noteOpen===e.id?"rotate(90deg)":"none"}}>▸</span> Note
                  </button>
                )}
                <PencilBtn onClick={()=>setEdit({ id:e.id, date:e.date, exercise:e.exercise, set:e.set, weight:e.weight==null ? "" : dispW(e.weight, units), reps:e.reps, effort:e.effort||"", notes:e.notes||"" })} />
                <ConfirmX onConfirm={()=>setData(d=>({...d, log:d.log.filter(x=>x.id!==e.id)}))} />
              </td>
            </tr>
            {noteOpen === e.id && (
              <tr><td colSpan={7} style={{padding:"4px 6px 10px"}}>
                <div className="note-reveal" style={noteBox}><span style={{flexShrink:0}}>📝</span><span>{e.notes}</span></div>
              </td></tr>
            )}
            {edit?.id === e.id && (
              <tr><td colSpan={7} style={{padding:"6px 4px"}}>
                <div style={editBox}>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                    <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
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
          </Fragment>);})}
            {!recent.length && <tr><td colSpan={7} style={{color:T.sub}}>{searching ? "No sets match that exercise." : "Nothing logged yet — your first set goes here."}</td></tr>}
          </tbody>
        </table>
      </div>
      {!searching && histFull.length > recent.length && (
        <div style={{display:"flex", gap:8, marginTop:12}}>
          <button onClick={()=>setHistLimit(l=>l+50)} style={{flex:1, background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"10px", fontWeight:700, fontSize:13, borderRadius:10}}>
            Show more ({histFull.length - recent.length} older)
          </button>
          <button onClick={()=>setHistLimit(histFull.length)} style={{background:"none", color:T.sub, padding:"10px 14px", fontWeight:700, fontSize:13}}>Show all</button>
        </div>
      )}
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

/* ---------- custom Robinhood-themed date picker ----------
   Replaces the native <input type=date> (whose OS popup ignores our theme and looks
   terrible on black). Same contract: value/onChange use "YYYY-MM-DD" strings; max/min
   clamp which days are selectable. Works with mouse and touch. */
const CAL_DOW = ["S","M","T","W","T","F","S"];
const calNav = (disabled) => ({ background:T.input, color:disabled?T.line:T.ink, width:32, height:32,
  borderRadius:9, fontSize:19, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center",
  opacity:disabled?0.5:1 });
function DateField({ label, value, onChange, max, min }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((value || todayStr()).slice(0,7)); // "YYYY-MM"
  const wrapRef = useRef(null);
  const pad = (n) => String(n).padStart(2,"0");

  useEffect(() => { if (open) setView((value || todayStr()).slice(0,7)); }, [open]); // reopen on the selected month
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const [vy, vm] = view.split("-").map(Number);
  const title = new Date(vy, vm-1, 1).toLocaleString("en-US", { month:"long", year:"numeric" });
  const firstDow = new Date(vy, vm-1, 1).getDay();
  const nDays = new Date(vy, vm, 0).getDate();
  const shift = (n) => { const d = new Date(vy, vm-1+n, 1); setView(`${d.getFullYear()}-${pad(d.getMonth()+1)}`); };
  const nextDisabled = max ? view >= max.slice(0,7) : false;
  const prevDisabled = min ? view <= min.slice(0,7) : false;
  const fmtLong = (s) => new Date(s+"T00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });

  const pick = (day) => {
    const ds = `${vy}-${pad(vm)}-${pad(day)}`;
    if ((max && ds > max) || (min && ds < min)) return;
    onChange(ds); setOpen(false);
  };

  const cells = [];
  for (let i=0;i<firstDow;i++) cells.push(null);
  for (let d=1;d<=nDays;d++) cells.push(d);

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      {label && <div style={{...lbl, marginBottom:4}}>{label}</div>}
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{
        display:"flex", alignItems:"center", gap:8, width:"100%", minHeight:44,
        background:T.input, color:value?T.ink:T.sub, border:`1px solid ${open?T.green:T.line}`,
        borderRadius:10, padding:"9px 11px", fontSize:15, fontWeight:600,
        boxShadow: open?"0 0 0 3px rgba(0,200,5,.18)":"none", transition:"border-color .18s ease, box-shadow .22s ease",
      }}>
        <span style={{fontSize:15, lineHeight:1}}>📅</span>
        <span style={{flex:1, textAlign:"left", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{value ? fmtLong(value) : "Select date"}</span>
        <span style={{color:T.sub, fontSize:10, transform:open?"rotate(180deg)":"none", transition:"transform .2s ease"}}>▼</span>
      </button>

      {open && (
        <div className="cal-pop" style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:40,
          width:268, maxWidth:"calc(100vw - 32px)",
          background:T.card, border:`1px solid ${T.creamLine}`, borderRadius:14, padding:12,
          boxShadow:"0 18px 50px rgba(0,0,0,.55)",
        }}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
            <button type="button" className="cal-nav" disabled={prevDisabled} onClick={()=>shift(-1)} style={calNav(prevDisabled)}>‹</button>
            <div style={{fontSize:14, fontWeight:800, color:T.ink}}>{title}</div>
            <button type="button" className="cal-nav" disabled={nextDisabled} onClick={()=>shift(1)} style={calNav(nextDisabled)}>›</button>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4}}>
            {CAL_DOW.map((w,i)=>(<div key={i} style={{textAlign:"center", fontSize:10.5, fontWeight:700, color:T.sub, padding:"2px 0"}}>{w}</div>))}
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2}}>
            {cells.map((d,i)=>{
              if (d==null) return <div key={i} />;
              const ds = `${vy}-${pad(vm)}-${pad(d)}`;
              const off = (max && ds>max) || (min && ds<min);
              const sel = ds===value, today = ds===todayStr();
              return (
                <button key={i} type="button" className={"cal-day"+(off?" cal-off":"")+(sel?" cal-sel":"")}
                  disabled={off} onClick={()=>pick(d)} style={{
                    height:34, borderRadius:99, background: sel?T.green:"transparent",
                    color: off?T.line : sel?"#000" : today?T.green : T.ink,
                    border: today&&!sel?`1.5px solid ${T.green}`:"1.5px solid transparent",
                    fontWeight: sel||today?800:600, fontSize:13.5,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    opacity: off?0.45:1, cursor: off?"default":"pointer",
                  }}>{d}</button>
              );
            })}
          </div>
          <button type="button" onClick={()=>{ const t=todayStr(); if ((!max||t<=max)&&(!min||t>=min)) onChange(t); setOpen(false); }}
            style={{ width:"100%", marginTop:10, padding:"9px", background:T.mint, color:T.green, fontWeight:800, fontSize:13, borderRadius:10 }}>
            Jump to today
          </button>
        </div>
      )}
    </div>
  );
}
const saveSm = { background:T.green, color:"#000", fontWeight:700, padding:"9px 18px", fontSize:13.5 };
const cancelSm = { background:"none", border:`1px solid ${T.line}`, color:T.sub, padding:"9px 14px", fontSize:13.5 };
const editBox = { background:T.cream, border:`1px solid ${T.creamLine}`, borderRadius:10, padding:12 };
const noteInput = { display:"block", width:"100%", marginTop:5, resize:"vertical", minHeight:44,
  background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"9px 11px",
  fontSize:14, fontFamily:"inherit", lineHeight:1.4, boxSizing:"border-box" };
const noteBox = { display:"flex", gap:9, alignItems:"flex-start",
  background:"rgba(0,200,5,.06)", border:`1px solid ${T.creamLine}`,
  borderLeft:`3px solid ${T.green}`, borderRadius:10, padding:"10px 12px" };

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
  /* per-bodyweight-exercise chart mode: "reps" (volume) or "strength" (est. 1RM) */
  const [bwMode, setBwMode] = useState({});
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
    /* bodyweight lifts: "total" reps per day (volume) or "best" single set (strength/progress) */
    const best = isBWex && bwMode[exName]==="best";

    /* 1D: the latest session set-by-set — one dot per set */
    if (range === "1D") {
      const lastDate = entries.reduce((a,b)=>a.date>b.date?a:b).date;
      const day = entries.filter(e=>e.date===lastDate).sort((a,b)=>(a.id||0)-(b.id||0));
      if (isBWex && best) {
        let top = 0;
        return day.map((e,i) => (top = Math.max(top, e.reps), { date:lastDate, label:`Set ${e.set ?? i+1}`, value:e.reps, sub:`${e.reps} reps${e.reps>=top?" · best so far":""}` }));
      }
      if (isBWex) {
        let run = 0;
        return day.map((e,i) => (run += e.reps, { date:lastDate, label:`Set ${e.set ?? i+1}`, value:run, sub:`+${e.reps} reps (total ${run})` }));
      }
      return day.map((e,i) => ({ date:lastDate, label:`Set ${e.set ?? i+1}`, value:dispW(e1rm(e.weight||0, e.reps), units), sub:`${dispW(e.weight,units)} ${uLabel(units)} × ${e.reps}` }));
    }

    /* longer ranges: one point per day */
    const byDate = {};
    for (const e of entries) {
      const b = byDate[e.date] || (byDate[e.date] = { reps:0, sets:0, bestSet:0, best1rm:0 });
      b.sets++; b.reps += e.reps; b.bestSet = Math.max(b.bestSet, e.reps);
      if (!isBWex) b.best1rm = Math.max(b.best1rm, dispW(e1rm(e.weight||0, e.reps), units));
    }
    let pts = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([d,b])=>{
        const setTxt = `${b.sets} set${b.sets>1?"s":""}`;
        if (isBWex && best) return { date:d, label:fmtDate(d),
          value: b.bestSet, sub: `${setTxt} · ${b.reps} total reps` };
        if (isBWex) return { date:d, label:fmtDate(d),
          value: b.reps, sub: `${setTxt} · best set ${b.bestSet} reps` };
        return { date:d, label:fmtDate(d),
          value: Math.round(b.best1rm*10)/10,
          sub: `${b.reps} total reps · ${setTxt}` };
      });
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
      const isBW = exMap[p]?.type==="Bodyweight";
      const bestMode = isBW && bwMode[p]==="best";
      return (
      <div className="card" key={p}>
        <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:6, flexWrap:"wrap"}}>
          <select value={p} onChange={e=>changePick(i, e.target.value)}
            style={{flex:"1 1 120px", minWidth:0, background:T.cream, fontWeight:600}}>
            {!chartOpts.includes(p) && <option key={p}>{p}</option>}
            {chartOpts.map(x=><option key={x}>{x}</option>)}
          </select>
          {isBW && (
            <div style={{display:"inline-flex", flexShrink:0, background:T.input, border:`1px solid ${T.line}`, borderRadius:99, padding:2}}
              title="Total reps per day, or your best single set">
              {[["total","Total"],["best","Best"]].map(([m,lbl])=>{
                const on = (bwMode[p]||"total")===m;
                return (
                  <button key={m} onClick={()=>setBwMode(s=>({...s,[p]:m}))} style={{
                    minHeight:32, padding:"4px 12px", fontSize:12, fontWeight:700, borderRadius:99, border:"none", cursor:"pointer",
                    background: on ? T.green : "transparent", color: on ? "#fff" : T.sub, transition:"background .15s, color .15s",
                  }}>{lbl}</button>
                );
              })}
            </div>
          )}
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
            : !isBW ? `Tracked by est. 1RM (${uLabel(units)})`
            : bestMode ? "Best set — top reps in a single set" : "Volume — total reps per day"}
        </div>
        {pts.length
          ? <Suspense fallback={<ChartFallback h={210} />}><TrendChart pts={pts} dots={range==="1D"} unit={isBW ? " reps" : " "+uLabel(units)} /></Suspense>
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
function GoalCard({ data, setData, current, rows, readOnly = false, who = "They" }) {
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

  // read-only (someone else's profile): show their goal, or a subtle "no goal" line
  if (readOnly) {
    if (!goal) return (
      <div className="card" style={{color:T.sub, fontSize:13.5}}>🎯 {who} set a goal weight yet.</div>
    );
  } else if (!goal || editing) return (
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
        {!readOnly && (
          <div style={{display:"flex", gap:4, alignItems:"center"}}>
            <PencilBtn onClick={()=>{setEditing(true); setInp(String(dispW(goal, units)));}} />
            <ConfirmX onConfirm={clear} />
          </div>
        )}
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
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(null); // date of the weigh-in whose note is expanded
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
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==date), { date, weight:toLb(parseFloat(weight), units), creatine, note:note.trim() }] }));
    setWeight(""); setNote("");
  };

  const [edit, setEdit] = useState(null); // { orig (original date), date, weight, creatine, note }
  const saveEdit = () => {
    if (!edit.weight) return;
    // drop the old row plus any row already on the new date, then add the edited one
    setData(d=>({ ...d, bodyweight:[...d.bodyweight.filter(r=>r.date!==edit.orig && r.date!==edit.date),
      { date:edit.date, weight:toLb(parseFloat(edit.weight), units), creatine:edit.creatine, note:(edit.note||"").trim() }] }));
    setEdit(null);
  };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:10}}>⚖️ Log a weigh-in</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
        <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
        <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} /></label>
        <label style={lbl}>Creatine today?<select value={creatine} onChange={e=>setCreatine(e.target.value)}><option>No</option><option>Yes</option></select></label>
      </div>
      <label style={{...lbl, marginBottom:12}}>Note <span style={{color:T.sub, fontWeight:500}}>(optional)</span>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
          placeholder="How'd you feel? e.g. felt full, big water day, slept great, sore…"
          style={noteInput} />
      </label>
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
        <tbody>{[...rows].reverse().map(r=>{
          const hasNote = !!(r.note && r.note.trim());
          const open = noteOpen === r.date;
          return (<Fragment key={r.date}>
          <tr><td style={{whiteSpace:"nowrap"}}>{fmtDate(r.date)}</td><td>{dispW(r.weight,units)}</td><td>{r.creatine}</td>
            <td style={{whiteSpace:"nowrap", textAlign:"right"}}>
              {hasNote && (
                <button className="note-btn" onClick={()=>setNoteOpen(open?null:r.date)}
                  title={open?"Hide note":"Show note"}
                  style={{ background:"none", color:open?T.green:T.sub, fontSize:12.5, fontWeight:700, padding:"2px 7px" }}>
                  <span className={"note-caret"+(open?" open":"")}>▸</span> Note
                </button>
              )}
              <PencilBtn onClick={()=>setEdit({ orig:r.date, date:r.date, weight:dispW(r.weight,units), creatine:r.creatine||"No", note:r.note||"" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, bodyweight:d.bodyweight.filter(x=>x.date!==r.date)}))} />
            </td></tr>
          {hasNote && open && (
            <tr><td colSpan={4} style={{padding:"2px 4px 8px"}}>
              <div className="note-reveal" style={noteBox}>
                <span style={{fontSize:15, lineHeight:1, flexShrink:0}}>📝</span>
                <span style={{fontSize:13.5, color:T.ink, lineHeight:1.45, whiteSpace:"pre-wrap"}}>{r.note}</span>
              </div>
            </td></tr>
          )}
          {edit?.orig === r.date && (
            <tr><td colSpan={4} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10}}>
                  <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                  <label style={lbl}>Weight ({uLabel(units)})<input type="number" inputMode="decimal" value={edit.weight} onChange={ev=>setEdit(s=>({...s, weight:ev.target.value}))} /></label>
                  <label style={lbl}>Creatine<select value={edit.creatine} onChange={ev=>setEdit(s=>({...s, creatine:ev.target.value}))}><option>No</option><option>Yes</option></select></label>
                </div>
                <label style={{...lbl, marginBottom:10}}>Note <span style={{color:T.sub, fontWeight:500}}>(optional)</span>
                  <textarea value={edit.note||""} rows={2} onChange={ev=>setEdit(s=>({...s, note:ev.target.value}))}
                    placeholder="How'd you feel?" style={noteInput} />
                </label>
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.weight} style={{...saveSm, opacity:edit.weight?1:0.45}}>Save changes</button>
                  <button onClick={()=>setEdit(null)} style={cancelSm}>Cancel</button>
                </div>
              </div>
            </td></tr>
          )}
        </Fragment>);})}</tbody></table>
    </div>
  </>);
}

/* ================= CARDIO ================= */
/* ---- step helpers (module-level so the tab and member popups share them) ---- */
const dAdd = (ds,n)=>{ const d=new Date(ds+"T00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const stepAvg = (a)=> a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : 0;
/* "just now" / "5 min ago" / "3h ago" / "2d ago" from an ISO timestamp. */
const stepRel = (iso) => { if (!iso) return null; const ms = Date.now() - new Date(iso).getTime();
  return ms<60000 ? "just now" : ms<3600000 ? `${Math.floor(ms/60000)} min ago` : ms<86400000 ? `${Math.floor(ms/3600000)}h ago` : `${Math.floor(ms/86400000)}d ago`; };

/* Merge auto-synced steps (steps table) with manually-logged cardio "Steps" entries into
   one day->count map, plus a day->source map ("auto" | "manual" | "both"). */
function mergeSteps(autoMap, cardio) {
  const map = { ...(autoMap || {}) };
  const meta = {};
  for (const d in map) meta[d] = "auto";
  for (const c of (cardio || [])) {
    if (!c.steps || !c.date) continue;
    // If Apple Health already synced this day, that number is the source of truth —
    // keep it and DROP the manual entry so the day isn't double-counted. Manual only
    // fills days Health never synced.
    if (map[c.date] != null) { meta[c.date] = "both"; }   // synced value wins; no add
    else { map[c.date] = c.steps; meta[c.date] = "manual"; }
  }
  return { map, meta };
}

/* Build 1D/W/M/6M/Y/5Y bars from a day->count map. Pure — reused by the tab and popups. */
function computeStepChart(m, range) {
  const today = todayStr(); const yStr = dAdd(today,-1); let bars=[]; let every=1; const isAvg = !(range==="W"||range==="M"||range==="1D");
  if (range==="1D") {
    // "Yesterday" — the last few finished days so yesterday has a little context, totals not averages
    every=1;
    for (let i=4;i>=1;i--){ const d=dAdd(today,-i); const dt=new Date(d+"T00:00");
      bars.push({ label: dt.toLocaleDateString("en-US",{weekday:"short"}),
        full: d===yStr ? "Yesterday" : dt.toLocaleDateString("en-US",{weekday:"long", month:"short", day:"numeric"}),
        day: d, value: m[d]||0, has: m[d]!=null, mark: d===yStr }); }
  } else if (range==="W" || range==="M") {
    const n = range==="W"?7:30; every = range==="W"?1:5;
    for (let i=n-1;i>=0;i--){ const d=dAdd(today,-i); const dt=new Date(d+"T00:00");
      bars.push({ label: range==="W" ? dt.toLocaleDateString("en-US",{weekday:"narrow"}) : String(dt.getDate()),
        full: d===yStr ? "Yesterday" : d===today ? "Today" : dt.toLocaleDateString("en-US",{weekday:"short", month:"short", day:"numeric"}),
        day: d, value: m[d]||0, has: m[d]!=null, mark: d===yStr }); }
  } else if (range==="6M") {
    every = 4; const ws = weekStart(today);
    for (let i=25;i>=0;i--){ const start=dAdd(ws,-7*i); const days=[]; for(let k=0;k<7;k++){ const d=dAdd(start,k); if(m[d]!=null) days.push(m[d]); }
      bars.push({ label: new Date(start+"T00:00").toLocaleDateString("en-US",{month:"short"}),
        full: "Week of " + new Date(start+"T00:00").toLocaleDateString("en-US",{month:"short", day:"numeric"}),
        value: stepAvg(days), has: days.length>0 }); }
  } else if (range==="Y") {
    every = 1; const [yy,mm] = today.split("-").map(Number);
    for (let i=11;i>=0;i--){ const dt=new Date(yy, mm-1-i, 1); const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
      const days=Object.keys(m).filter(d=>d.startsWith(key)).map(d=>m[d]);
      bars.push({ label: dt.toLocaleDateString("en-US",{month:"narrow"}), full: dt.toLocaleDateString("en-US",{month:"long", year:"numeric"}), value: stepAvg(days), has: days.length>0 }); }
  } else { // 5Y
    every=1; const yy=Number(today.slice(0,4));
    for (let i=4;i>=0;i--){ const year=yy-i; const days=Object.keys(m).filter(d=>d.startsWith(String(year))).map(d=>m[d]);
      bars.push({ label:String(year), full:String(year), value: stepAvg(days), has: days.length>0 }); }
  }
  const wd = bars.filter(b=>b.has);
  return { bars, avg: stepAvg(wd.map(b=>b.value)), max: Math.max(1, ...bars.map(b=>b.value)), every, isAvg };
}

/* Shared loader: returns everyone's step maps (yourself + groupmates) plus a yesterday
   leaderboard and the all-logged-today flag. Reads the `steps` table (RLS-scoped). */
function useSteps(user, sinceDays) {
  const yStr = dAdd(todayStr(), -1);
  const [mine, setMine] = useState(undefined);
  const [all, setAll] = useState({});
  const [nameOf, setNameOf] = useState({});
  const [board, setBoard] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const reloadRef = useRef(() => {});
  useEffect(()=>{
    let alive = true;
    const load = async () => {
      try {
        const since = dAdd(todayStr(), -sinceDays);
        let groups=[]; try { groups = await listMyGroups(); } catch {}
        const nm = {}; const gm = [];
        for (const g of groups) { try {
          const mems = await listMembers(g.id);
          gm.push({ name:g.name, ids: mems.map(m=>m.user_id) });
          mems.forEach(m => { nm[m.user_id] = m.username; });
        } catch {} }
        const myName = user.user_metadata?.username || "you";
        nm[user.id] = nm[user.id] || myName;
        const ids = Array.from(new Set([user.id, ...Object.keys(nm)]));
        const s = await stepsFor(ids, since);
        if (!alive) return;
        setMine(s[user.id] || {}); setAll(s); setNameOf(nm);
        const bd = ids.map(id => ({ id, name: id===user.id ? myName : (nm[id]||"?"), me: id===user.id, steps: s[id]?.[yStr] ?? null }))
          .filter(r => r.steps != null).sort((a,b)=> b.steps - a.steps);
        setBoard(bd);
        lastStepSync(user.id).then(t => { if (alive) setLastSync(t); }).catch(()=>{});
        for (const g of gm) {
          if (g.ids.length >= 2 && g.ids.every(id => s[id]?.[yStr] != null)) {
            if (localStorage.getItem(`lt-allin-${yStr}`) !== "1") setCelebrate(g.name);
            break;
          }
        }
      } catch { if (alive) setMine(prev => prev === undefined ? {} : prev); }
    };
    reloadRef.current = load;
    load();
    // re-fetch when the app regains focus (e.g. after running the Sync shortcut and returning)
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [user.id, sinceDays]);
  const dismiss = () => { localStorage.setItem(`lt-allin-${yStr}`, "1"); setCelebrate(null); };
  return { mine, all, nameOf, board, celebrate, dismiss, yStr, myId: user.id, lastSync, reload: () => reloadRef.current() };
}

/* One reliable "Sync now" launcher — runs the phone shortcut via its URL scheme.
   Works only while the phone is unlocked (Apple's Health rule), which it is when you tap. */
function SyncNowButton({ block, small }) {
  const href = `shortcuts://run-shortcut?name=${encodeURIComponent("The Lab: Steps")}`;
  return (
    <a href={href} style={{ display: block ? "flex" : "inline-flex", width: block ? "100%" : "auto",
      alignItems:"center", justifyContent:"center", gap:7, background:T.green, color:"#000", fontWeight:800,
      fontSize: small?12.5:14.5, padding: small?"7px 13px":"12px 16px", borderRadius: small?99:11, textDecoration:"none" }}>
      🔄 Sync now
    </a>
  );
}

/* Reusable goal ring + Apple-Health-style ranged chart for a single person's step map.
   Powers both your own tab and the tap-to-view popup for any groupmate. */
function StepRingChart({ map, goal, meta }) {
  const [range, setRange] = useState("M");
  const [sel, setSel] = useState(null);
  const plotRef = useRef(null);
  const hasManual = meta && Object.values(meta).some(v => v !== "auto");
  const srcLabel = { manual:"✍️ manual entry", both:"Apple Health + manual", auto:"Apple Health" };
  const m = map || {};
  const yStr = dAdd(todayStr(), -1);
  const yCount = m[yStr] || 0;
  const pct = Math.min(1, yCount/goal);
  const R=52, C=2*Math.PI*R;
  const hero = useMemo(()=>{ const seven=[]; for(let i=1;i<=7;i++){ const v=m[dAdd(todayStr(),-i)]; if(v!=null) seven.push(v); }
    const vals=Object.values(m); return { avg:stepAvg(seven), best:vals.length?Math.max(...vals):0 }; }, [map]);
  const chart = useMemo(()=>computeStepChart(m, range), [map, range]);
  const scrub = (x)=>{ const el=plotRef.current; if(!el) return; const r=el.getBoundingClientRect();
    const n=chart.bars.length; if(!n) return; const idx=Math.floor((x-r.left)/r.width*n); setSel(Math.max(0,Math.min(n-1,idx))); };
  const rangeSub = { "1D":"Yesterday", W:"Past week", M:"Past 30 days", "6M":"Past 6 months", Y:"Past year", "5Y":"Past 5 years" };
  const goalK = goal % 1000 === 0 ? `${goal/1000}k` : goal.toLocaleString();

  return (<>
    <div className="card">
      <div style={{display:"flex", alignItems:"center", gap:20}}>
        <div style={{position:"relative", width:120, height:120, flexShrink:0}}>
          <svg width="120" height="120">
            <circle cx="60" cy="60" r={R} fill="none" stroke={T.line} strokeWidth="10" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={T.green} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C*(1-pct)} transform="rotate(-90 60 60)" style={{transition:"stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)"}} />
          </svg>
          <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center"}}>
            <div style={{fontSize:22, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1}}>{yCount.toLocaleString()}</div>
            <div style={{fontSize:10.5, color:T.sub, marginTop:3}}>{Math.round(pct*100)}% of {goalK}</div>
          </div>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12.5, color:T.sub}}>Yesterday</div>
          <div style={{fontSize:15, fontWeight:700, color:T.ink, marginBottom:12}}>{yCount>=goal ? "Goal smashed 💪" : yCount>0 ? "Keep it moving" : "No steps yet"}</div>
          <div style={{display:"flex", gap:18}}>
            <div><div style={{fontSize:17, fontWeight:800, color:T.ink}}>{hero.avg.toLocaleString()}</div><div style={{fontSize:10.5, color:T.sub}}>7-day avg</div></div>
            <div><div style={{fontSize:17, fontWeight:800, color:T.ink}}>{hero.best.toLocaleString()}</div><div style={{fontSize:10.5, color:T.sub}}>best day</div></div>
          </div>
        </div>
      </div>
    </div>

    <div className="card">
      <div style={{display:"flex", background:T.input, borderRadius:10, padding:3, gap:2, marginBottom:14}}>
        {["1D","W","M","6M","Y","5Y"].map(r=>(
          <button key={r} onClick={()=>{setRange(r); setSel(null);}} style={{flex:1, padding:"7px 0", borderRadius:8, fontSize:12, fontWeight:800,
            background: range===r?T.green:"none", color: range===r?"#000":T.sub}}>{r}</button>
        ))}
      </div>

      {sel!=null && chart.bars[sel] ? (<>
        <div style={{fontSize:11, fontWeight:800, color:T.green, textTransform:"uppercase", letterSpacing:.6}}>
          {chart.bars[sel].full}
          {(() => { const s = meta && chart.bars[sel].day && chart.bars[sel].has ? meta[chart.bars[sel].day] : null;
            return s ? <span style={{color: s==="manual"?T.down:T.sub, marginLeft:6}}>· {srcLabel[s]}</span> : null; })()}
        </div>
        <div style={{display:"flex", alignItems:"baseline", gap:6}}>
          <span style={{fontSize:27, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{chart.bars[sel].has ? chart.bars[sel].value.toLocaleString() : "—"}</span>
          <span style={{fontSize:13, color:T.sub}}>{chart.bars[sel].has ? (chart.isAvg ? "steps/day" : "steps") : "no data"}</span>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>{rangeSub[range]}</div>
      </>) : (<>
        <div style={{fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.6}}>Daily average</div>
        <div style={{display:"flex", alignItems:"baseline", gap:6}}>
          <span style={{fontSize:27, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{chart.avg.toLocaleString()}</span>
          <span style={{fontSize:13, color:T.sub}}>steps/day</span>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>{rangeSub[range]} · <span style={{color:T.green}}>tap a bar for details</span></div>
      </>)}

      <div ref={plotRef}
        onPointerDown={e=>scrub(e.clientX)} onPointerMove={e=>{ if (e.pointerType==="mouse" || e.buttons) scrub(e.clientX); }}
        onMouseLeave={()=>setSel(null)}
        style={{display:"flex", alignItems:"flex-end", gap: range==="W"?8:3, height:130, touchAction:"pan-y", cursor:"crosshair"}}>
        {chart.bars.map((b,i)=>(
          <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5, minWidth:0, pointerEvents:"none"}}>
            <div className="vbar" style={{width:"100%", maxWidth: range==="W"?30:14, borderRadius:"4px 4px 2px 2px",
              height: b.has&&b.value>0 ? Math.max(4, (b.value/chart.max)*100) : 3,
              background: sel===i ? "#fff" : (meta && b.day && meta[b.day]==="manual") ? T.down : b.mark ? T.green : b.has ? "rgba(0,200,5,.6)" : T.line,
              animationDelay:`${i*0.02}s`, transition:"background .12s ease"}} />
            <span style={{fontSize:9, color: (sel===i||b.mark)?T.green:T.sub, fontWeight: (sel===i||b.mark)?800:400, whiteSpace:"nowrap"}}>{(i%chart.every===0 || i===chart.bars.length-1) ? b.label : ""}</span>
          </div>
        ))}
      </div>
      {hasManual && (
        <div style={{display:"flex", gap:14, marginTop:10, fontSize:11, color:T.sub, flexWrap:"wrap"}}>
          <span style={{display:"flex", alignItems:"center", gap:5}}><span style={{width:9, height:9, borderRadius:2, background:T.green}} /> Apple Health (auto)</span>
          <span style={{display:"flex", alignItems:"center", gap:5}}><span style={{width:9, height:9, borderRadius:2, background:T.down}} /> manually entered</span>
          <span>· hover a bar to check</span>
        </div>
      )}
    </div>
  </>);
}

/* Head-to-head step duels: instant-start, custom length, most total steps wins.
   Standings are summed from each person's step map over the duel window. */
function DuelsCard({ user, all, nameOf, myId, myName }) {
  const [duels, setDuels] = useState([]);
  const [open, setOpen] = useState(false);
  const [oppId, setOppId] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => { try { setDuels(await listDuels()); } catch {} };
  useEffect(()=>{ load(); }, []);

  const today = todayStr();
  const opps = Object.entries(nameOf).filter(([id])=>id!==myId);
  const sumRange = (map, s, e)=>{ let t=0; const m=map||{}; for (const d in m) if (d>=s && d<=e) t+=m[d]; return t; };
  const mine = duels.filter(d => d.a_id===myId || d.b_id===myId);

  const create = async () => {
    if (!oppId) return;
    const n = Math.max(1, Math.min(365, parseInt(days)||7));
    setBusy(true); setErr("");
    try { await createDuel(oppId, myName, nameOf[oppId]||"?", today, dAdd(today, n-1), n); setOpen(false); setOppId(""); setDays("7"); await load(); }
    catch(e){ setErr(String(e?.message||e)); }
    finally { setBusy(false); }
  };
  const remove  = async (id) => { try { await deleteDuel(id); await load(); } catch {} };
  const accept  = async (d)  => { const n = Math.max(1, Math.min(365, d.days||7)); try { await acceptDuel(d.id, today, dAdd(today, n-1)); await load(); } catch(e){ setErr(String(e?.message||e)); } };
  const decline = async (id) => { try { await declineDuel(id); await load(); } catch {} };

  return (
    <div className="card">
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: (mine.length||open)?10:0}}>
        <div className="h" style={{fontSize:16, color:T.tealDk}}>⚔️ Step duels</div>
        {!open && <button onClick={()=>setOpen(true)} style={{background:T.green, color:"#000", fontWeight:800, fontSize:12.5, padding:"6px 13px", borderRadius:99}}>+ New</button>}
      </div>

      {open && (
        <div style={{background:T.input, border:`1px solid ${T.line}`, borderRadius:12, padding:12, marginBottom:12}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 92px", gap:8, marginBottom:8}}>
            <label style={lbl}>Opponent
              <select value={oppId} onChange={e=>setOppId(e.target.value)}>
                <option value="">— pick —</option>
                {opps.map(([id,name])=><option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label style={lbl}>Days<input type="number" inputMode="numeric" value={days} onChange={e=>setDays(e.target.value)} /></label>
          </div>
          {!opps.length && <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Join a group with friends to duel them.</div>}
          {err && <div style={{color:T.danger, fontSize:12.5, marginBottom:8}}>{err}</div>}
          <div style={{display:"flex", gap:8}}>
            <button onClick={create} disabled={!oppId||busy} style={{flex:1, background:T.green, color:"#000", fontWeight:800, padding:"9px", opacity:(!oppId||busy)?0.5:1}}>{busy?"Sending…":"Send challenge ⚔️"}</button>
            <button onClick={()=>setOpen(false)} style={{background:T.card, color:T.sub, padding:"9px 14px"}}>Cancel</button>
          </div>
        </div>
      )}

      {!mine.length && !open && <div style={{fontSize:13, color:T.sub, marginTop:10}}>No duels yet — challenge a groupmate to a step battle 👊</div>}

      {mine.map(d=>{
        const meA = d.a_id===myId;
        const oId = meA ? d.b_id : d.a_id;
        const oName = meA ? d.b_name : d.a_name;

        // ---- pending: waiting on the opponent to accept ----
        if (d.status === "pending") {
          const iOwe = !meA; // I'm the one who needs to accept
          return (
            <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"12px 0"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom: iOwe?9:0}}>
                <span style={{fontSize:13.5, fontWeight:800, color:T.ink}}>
                  {iOwe ? <>⚔️ {oName} challenged you</> : <>⏳ Waiting for {oName}…</>}
                </span>
                <span style={{fontSize:11.5, fontWeight:700, color:T.sub, background:T.input, padding:"3px 9px", borderRadius:99}}>{d.days||7}-day duel</span>
              </div>
              {iOwe ? (
                <div style={{display:"flex", gap:8}}>
                  <button onClick={()=>accept(d)} style={{flex:1, background:T.green, color:"#000", fontWeight:800, fontSize:13, padding:"9px", borderRadius:10}}>Accept ⚔️</button>
                  <button onClick={()=>decline(d.id)} style={{background:T.card, color:T.sub, fontWeight:700, fontSize:13, padding:"9px 16px", borderRadius:10}}>Decline</button>
                </div>
              ) : (
                <div style={{display:"flex", justifyContent:"flex-end", marginTop:4}}><ConfirmX label="Cancel" onConfirm={()=>remove(d.id)} /></div>
              )}
            </div>
          );
        }

        // ---- declined ----
        if (d.status === "declined") {
          return (
            <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"11px 0", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:13, color:T.sub}}>{meA ? `${oName} declined the duel` : `You declined ${oName}'s duel`}</span>
              <ConfirmX label="Remove" onConfirm={()=>remove(d.id)} />
            </div>
          );
        }

        // ---- active / finished: live standings ----
        const mySum = sumRange(all[myId] || all[user.id], d.start_day, d.end_day);
        const oppSum = sumRange(all[oId], d.start_day, d.end_day);
        const mx = Math.max(mySum, oppSum, 1);
        const finished = today > d.end_day;
        const daysLeft = finished ? 0 : Math.round((new Date(d.end_day+"T00:00") - new Date(today+"T00:00"))/86400000) + 1;
        const status = finished
          ? (mySum>oppSum ? "🏆 You won!" : oppSum>mySum ? `${oName} won` : "Tie — dead heat")
          : `${daysLeft} day${daysLeft===1?"":"s"} left`;
        const statusColor = finished ? (mySum>oppSum?T.green:oppSum>mySum?T.danger:T.sub) : T.sub;
        return (
          <div key={d.id} style={{borderTop:`1px solid ${T.creamLine}`, padding:"11px 0"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <span style={{fontSize:13.5, fontWeight:800, color:T.ink}}>You vs {oName}</span>
              <span style={{fontSize:12.5, fontWeight:800, color:statusColor}}>{status}</span>
            </div>
            {[["You", mySum, true],[oName, oppSum, false]].map(([nm,val,me])=>(
              <div key={nm+String(me)} style={{display:"flex", alignItems:"center", gap:8, marginBottom:5}}>
                <span style={{width:66, fontSize:12.5, fontWeight: me?800:600, color: me?T.green:T.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{nm}</span>
                <span style={{flex:1, height:8, background:T.input, borderRadius:99, overflow:"hidden"}}>
                  <span style={{display:"block", width:`${val/mx*100}%`, height:"100%", background: me?T.green:"rgba(0,200,5,.5)", borderRadius:99, transition:"width .5s ease"}} />
                </span>
                <b style={{fontSize:12.5, color:T.ink, minWidth:54, textAlign:"right", fontVariantNumeric:"tabular-nums"}}>{val.toLocaleString()}</b>
              </div>
            ))}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:4}}>
              <span style={{fontSize:11, color:T.sub}}>{fmtDate(d.start_day)} – {fmtDate(d.end_day)}</span>
              <ConfirmX label={finished?"Remove":"Cancel"} onConfirm={()=>remove(d.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Full Steps tab: editable daily goal, your ring+chart, a weekly race, step duels,
   and a once-a-day whole-group celebration. */
function StepsTab({ user, data, setData }) {
  const goal = (data.profile?.stepGoal) || 10000;
  const { mine, all, nameOf, board, celebrate, dismiss, yStr, myId, lastSync } = useSteps(user, 5*365 + 40);
  const myName = nameOf[myId] || (user.user_metadata?.username || "you");
  const merged = useMemo(() => mergeSteps(mine || {}, data.cardio), [mine, data.cardio]);
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal));
  const [view, setView] = useState(null); // { id, name } groupmate graph popup
  const dayLabel = (d) => d===yStr ? "yesterday" : d===todayStr() ? "today" : new Date(d+"T00:00").toLocaleDateString("en-US",{weekday:"short"});

  const race = useMemo(()=>{
    const ws = weekStart(todayStr());
    return Object.keys(all).map(id => {
      const mm = all[id]||{}; let sum=0;
      for (const d in mm) if (weekStart(d)===ws) sum += mm[d];
      return { id, name: nameOf[id] || (id===myId?"you":"?"), me:id===myId, sum };
    }).filter(r=>r.sum>0).sort((a,b)=>b.sum-a.sum);
  }, [all, nameOf, myId]);

  const saveGoal = () => {
    const g = Math.max(1000, Math.min(100000, parseInt(goalInput)||10000));
    setData(d=>({ ...d, profile:{ ...(d.profile||{}), stepGoal:g } }));
    setEditGoal(false);
  };

  const Row = ({ r, i, value }) => (
    <button onClick={()=>setView({ id:r.id, name:r.name })} style={{width:"100%", textAlign:"left", background:"none", display:"flex", alignItems:"center", gap:10, padding:"9px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
      <span style={{width:24, textAlign:"center", fontWeight:800, color: i===0?T.green:T.sub, fontSize:14}}>{i===0?"👑":i+1}</span>
      <span style={{flex:1, fontWeight: r.me?800:600, color: r.me?T.green:T.ink, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.name}{r.me?" (you)":""}</span>
      <span style={{fontSize:14, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>{value.toLocaleString()}</span>
      <span style={{color:T.sub, fontSize:15}}>›</span>
    </button>
  );

  if (mine === undefined) return <div className="card"><div className="skeleton" style={{height:220, borderRadius:12}} /></div>;

  if (!Object.keys(merged.map).length) {
    return (
      <div className="card" style={{textAlign:"center"}}>
        <div style={{fontSize:40, marginBottom:8}}>👟</div>
        <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:6}}>No steps yet</div>
        <div style={{fontSize:13, color:T.sub, lineHeight:1.55, maxWidth:340, margin:"0 auto"}}>
          Your steps sync automatically once you finish the one-time setup in <b style={{color:T.ink}}>Settings → 🚶 Apple Health steps</b>.
          After the first sync your ring, charts, and group board fill in here.
        </div>
      </div>
    );
  }

  return (<>
    {celebrate && (
      <div onClick={dismiss} style={{position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:24, animation:"fadeSwap .2s ease-out both"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.card, border:`1px solid ${T.green}`, borderRadius:18, padding:"26px 22px", maxWidth:340, textAlign:"center", animation:"calPop .28s cubic-bezier(.34,1.56,.64,1) both"}}>
          <div style={{fontSize:44, marginBottom:8}}>🎉</div>
          <div className="h" style={{fontSize:20, color:T.green, marginBottom:6}}>Whole squad logged!</div>
          <div style={{fontSize:13.5, color:T.sub, lineHeight:1.55, marginBottom:16}}>Everyone in <b style={{color:T.ink}}>{celebrate}</b> got their steps in for {dayLabel(yStr)}. Momentum. 🔥</div>
          <button onClick={dismiss} style={{background:T.green, color:"#000", fontWeight:800, fontSize:15, padding:"11px 20px", borderRadius:10, width:"100%"}}>Let's go</button>
        </div>
      </div>
    )}

    {/* header + editable goal + reliable Sync now */}
    <div className="card">
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:12}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>👟 Steps</div>
        {!editGoal ? (
          <button onClick={()=>{ setGoalInput(String(goal)); setEditGoal(true); }} style={{background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:99, padding:"7px 13px", fontSize:12.5, fontWeight:700}}>🎯 Goal {goal.toLocaleString()} · Edit</button>
        ) : (
          <div style={{display:"flex", gap:6, alignItems:"center"}}>
            <input type="number" inputMode="numeric" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{width:96}} />
            <button onClick={saveGoal} style={{background:T.green, color:"#000", fontWeight:700, padding:"8px 13px", fontSize:13}}>Save</button>
            <button onClick={()=>setEditGoal(false)} style={{background:T.input, color:T.sub, padding:"8px 11px", fontSize:13}}>✕</button>
          </div>
        )}
      </div>
      {IS_MOBILE && <SyncNowButton block />}
      {(() => {
        if (lastSync) {
          const ms = Date.now() - new Date(lastSync).getTime();
          const recent = ms < 120000;
          const rel = ms<60000 ? "just now" : ms<3600000 ? `${Math.floor(ms/60000)} min ago` : ms<86400000 ? `${Math.floor(ms/3600000)}h ago` : `${Math.floor(ms/86400000)}d ago`;
          return (
            <div style={{textAlign:"center", marginTop: IS_MOBILE?9:0, fontSize:12.5, fontWeight:800, color: recent?T.green:T.sub,
              background: recent?"rgba(0,200,5,.10)":"transparent", borderRadius:99, padding:recent?"6px 0":"2px 0", transition:"all .2s ease"}}>
              {recent ? "✓ Synced " : "🕐 Last synced "}{rel}
            </div>
          );
        }
        if (IS_MOBILE) return <div style={{fontSize:11, color:T.sub, textAlign:"center", marginTop:7, lineHeight:1.5}}>Runs your <b style={{color:T.ink}}>“The Lab: Steps”</b> shortcut — this page updates the moment you come back.</div>;
        return <div style={{fontSize:11.5, color:T.sub, textAlign:"center", lineHeight:1.5}}>Steps sync from your iPhone — open The Lab on your phone and tap <b style={{color:T.ink}}>🔄 Sync now</b>.</div>;
      })()}
    </div>

    <StepRingChart map={merged.map} goal={goal} meta={merged.meta} />

    <DuelsCard user={user} all={all} nameOf={nameOf} myId={myId} myName={myName} />

    {race.length > 1 && (
      <div className="card" style={{display:"flex", alignItems:"center", gap:11, padding:"13px 15px"}}>
        <span style={{fontSize:22}}>🏁</span>
        <div style={{flex:1, minWidth:0, fontSize:12.5, color:T.sub, lineHeight:1.5}}>
          <b style={{color:T.ink}}>Weekly step race</b> lives in your <b style={{color:T.green}}>Groups</b> tab now — open a group to see everyone's steps this week.
        </div>
      </div>
    )}

    {/* groupmate graph popup */}
    {view && (
      <div onClick={()=>setView(null)} style={{position:"fixed", inset:0, zIndex:55, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeSwap .18s ease-out both"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bg, borderTop:`1px solid ${T.line}`, borderRadius:"18px 18px 0 0", width:"100%", maxWidth:520, maxHeight:"88dvh", overflowY:"auto", overscrollBehavior:"contain", padding:"16px 14px calc(20px + env(safe-area-inset-bottom))", animation:"sheetUp .26s cubic-bezier(.22,1,.36,1) both"}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
            <div className="h" style={{fontSize:18, color:T.tealDk}}>👟 {view.name}{view.id===myId?" (you)":""}</div>
            <button onClick={()=>setView(null)} style={{background:T.input, color:T.sub, width:32, height:32, borderRadius:99, fontSize:15}}>✕</button>
          </div>
          <StepRingChart map={all[view.id] || {}} goal={goal} />
        </div>
      </div>
    )}
  </>);
}

/* One-line steps recap shown on the Cardio tab (only when the Steps feature is on). */
function CardioStepsRecap({ user }) {
  const { mine, yStr } = useSteps(user, 8);
  if (!mine || !Object.keys(mine).length) return null;
  const y = mine[yStr]; const t = mine[todayStr()];
  const show = t != null ? { n:t, when:"today" } : y != null ? { n:y, when:"yesterday" } : null;
  if (!show) return null;
  return (
    <div className="card" style={{display:"flex", alignItems:"center", gap:12, padding:"12px 16px"}}>
      <span style={{fontSize:24}}>👟</span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:18, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums"}}>{show.n.toLocaleString()} <span style={{fontSize:12.5, color:T.sub, fontWeight:600}}>steps {show.when}</span></div>
        <div style={{fontSize:11.5, color:T.sub}}>Auto-tracked from Apple Health · full charts in the Steps tab</div>
      </div>
    </div>
  );
}

function CardioTab({ data, setData, latestBW, user, stepsOn }) {
  const units = useUnit();
  const [date, setDate] = useState(todayStr());
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("");
  const [machineCal, setMachineCal] = useState("");
  const [steps, setSteps] = useState("");
  const [newAct, setNewAct] = useState(""); const [newType, setNewType] = useState("Sport");

  const actMap = Object.fromEntries(data.cardioActivities.map(a=>[a.name,a.type]));
  const isMachine = actMap[activity]==="Machine";
  const isSteps = actMap[activity]==="Steps";
  const kg = latestBW * 0.453592;

  const estCal = isSteps ? stepsCal(parseInt(steps)||0, kg)
    : (!isMachine && duration && intensity) ? Math.round(MET[intensity]*kg*(duration/60)) : null;
  const canSave = activity && (isSteps ? steps : duration);

  const add = () => {
    if (!canSave) return;
    const calories = isMachine ? (machineCal?parseInt(machineCal):null) : estCal;
    setData(d=>({ ...d, cardio:[...d.cardio, {
      id:Date.now(), date, activity,
      duration: duration ? parseInt(duration) : 0,
      steps: isSteps ? (parseInt(steps)||0) : null,
      intensity: (isMachine||isSteps) ? null : intensity, calories,
    }] }));
    setDuration(""); setMachineCal(""); setSteps("");
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

  const stepStats = useMemo(() => {
    const wk = weekStart(todayStr());
    let today = 0, week = 0, total = 0, any = false;
    for (const c of data.cardio) {
      if (!c.steps) continue;
      any = true; total += c.steps;
      if (weekStart(c.date) === wk) week += c.steps;
      if (c.date === todayStr()) today += c.steps;
    }
    return { any, today, week, total };
  }, [data.cardio]);

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

  const [edit, setEdit] = useState(null); // { id, date, activity, duration, intensity, machineCal, steps }
  const editIsMachine = edit ? actMap[edit.activity]==="Machine" : false;
  const editIsSteps = edit ? actMap[edit.activity]==="Steps" : false;
  const saveEdit = () => {
    if (!edit.activity || (editIsSteps ? !edit.steps : !edit.duration)) return;
    const dur = edit.duration ? parseInt(edit.duration) : 0;
    const stp = editIsSteps ? (parseInt(edit.steps)||0) : null;
    const calories = editIsSteps ? stepsCal(stp, kg)
      : editIsMachine ? (edit.machineCal ? parseInt(edit.machineCal) : null)
      : (edit.intensity ? Math.round(MET[edit.intensity]*kg*(dur/60)) : null);
    setData(d=>({ ...d, cardio: d.cardio.map(x => x.id===edit.id ? {
      ...x, date:edit.date, activity:edit.activity, duration:dur, steps:stp,
      intensity: (editIsMachine||editIsSteps) ? null : (edit.intensity || null), calories,
    } : x) }));
    setEdit(null);
  };

  return (<>
    {stepsOn && <CardioStepsRecap user={user} />}

    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>🏃 Log cardio</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>
        Sports get an automatic calorie estimate from duration × intensity × your tracked bodyweight ({showW(latestBW, units)}).
        Machines: type in what the display says.
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <DateField label="Date" value={date} max={todayStr()} onChange={setDate} />
        <label style={lbl}>Activity
          <select value={activity} onChange={e=>setActivity(e.target.value)}>
            <option value="">— pick —</option>
            {data.cardioActivities.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
        {isSteps
          ? <>
              <label style={lbl}>Steps<input type="number" inputMode="numeric" value={steps} onChange={e=>setSteps(e.target.value)} placeholder="e.g. 8500" /></label>
              <label style={lbl}>Duration (min, optional)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
            </>
          : <>
              <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
              {isMachine
                ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={machineCal} onChange={e=>setMachineCal(e.target.value)} placeholder="from the display" /></label>
                : <label style={lbl}>Intensity
                    <select value={intensity} onChange={e=>setIntensity(e.target.value)}>
                      <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
                    </select>
                  </label>}
            </>}
      </div>
      {isSteps && stepsOn && (
        <div style={{display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"9px 12px", marginBottom:10, fontSize:12.5, color:T.sub, lineHeight:1.5}}>
          <span style={{flexShrink:0}}>⚠️</span>
          <span>Your steps are already <b style={{color:T.ink}}>auto-tracked in the Steps tab</b> from Apple Health. Logging a step count here too will double-count — skip it unless you specifically want a separate manual entry.</span>
        </div>
      )}
      {estCal!=null && <div style={{background:T.cream, borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:14}}>Estimated: <b>{estCal} cal</b>{isSteps && steps && <span style={{color:T.sub}}> · about {stepsMiles(parseInt(steps)||0)} mi</span>}</div>}
      <button onClick={add} disabled={!canSave} style={{width:"100%", padding:"12px", background:T.green, color:"#000", fontWeight:700, fontSize:16, opacity:canSave?1:0.45}}>Save session</button>
    </div>

    {stepStats.any && (
      <div className="card" style={{display:"flex", justifyContent:"space-around", textAlign:"center", gap:8}}>
        <div><div style={{fontSize:20, fontWeight:800, color:T.green}}>{stepStats.today.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>👣 today</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{stepStats.week.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>this week</div></div>
        <div><div style={{fontSize:20, fontWeight:800, color:T.ink}}>{stepStats.total.toLocaleString()}</div><div style={{fontSize:11.5, color:T.sub}}>all-time</div></div>
      </div>
    )}

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
      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>Add your own (Basketball, Elliptical, whatever you do). Sport = we estimate calories. Machine = you type them in. Steps = enter a step count (calories estimated from your bodyweight).</div>
      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Activity name" />
        <select value={newType} onChange={e=>setNewType(e.target.value)} style={{width:120}}><option>Sport</option><option>Machine</option><option>Steps</option></select>
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
            <select value={editAct.type} onChange={ev=>setEditAct(s=>({...s, type:ev.target.value}))} style={{width:120}}><option>Sport</option><option>Machine</option><option>Steps</option></select>
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
          <tr><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td>{e.duration||"—"}</td><td>{e.steps ? `${e.steps.toLocaleString()} steps` : (e.intensity||"machine")}</td><td>{e.calories??"—"}</td>
            <td style={{whiteSpace:"nowrap"}}>
              <PencilBtn onClick={()=>setEdit({ id:e.id, date:e.date, activity:e.activity, duration:e.duration, intensity:e.intensity||"", machineCal:e.calories ?? "", steps:e.steps ?? "" })} />
              <ConfirmX onConfirm={()=>setData(d=>({...d, cardio:d.cardio.filter(x=>x.id!==e.id)}))} />
            </td></tr>
          {edit?.id === e.id && (
            <tr><td colSpan={6} style={{padding:"6px 4px"}}>
              <div style={editBox}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8}}>
                  <DateField label="Date" value={edit.date} max={todayStr()} onChange={v=>setEdit(s=>({...s, date:v}))} />
                  <label style={lbl}>Activity
                    <select value={edit.activity} onChange={ev=>setEdit(s=>({...s, activity:ev.target.value}))}>
                      {data.cardioActivities.map(a=><option key={a.name}>{a.name}</option>)}
                      {!data.cardioActivities.some(a=>a.name===edit.activity) && <option>{edit.activity}</option>}
                    </select>
                  </label>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                  {editIsSteps
                    ? <>
                        <label style={lbl}>Steps<input type="number" inputMode="numeric" value={edit.steps} onChange={ev=>setEdit(s=>({...s, steps:ev.target.value}))} /></label>
                        <label style={lbl}>Duration (min, optional)<input type="number" inputMode="numeric" value={edit.duration} onChange={ev=>setEdit(s=>({...s, duration:ev.target.value}))} /></label>
                      </>
                    : <>
                        <label style={lbl}>Duration (min)<input type="number" inputMode="numeric" value={edit.duration} onChange={ev=>setEdit(s=>({...s, duration:ev.target.value}))} /></label>
                        {editIsMachine
                          ? <label style={lbl}>Machine calories<input type="number" inputMode="numeric" value={edit.machineCal} onChange={ev=>setEdit(s=>({...s, machineCal:ev.target.value}))} /></label>
                          : <label style={lbl}>Intensity
                              <select value={edit.intensity} onChange={ev=>setEdit(s=>({...s, intensity:ev.target.value}))}>
                                <option value="">—</option>{Object.keys(MET).map(k=><option key={k}>{k}</option>)}
                              </select>
                            </label>}
                      </>}
                </div>
                {!editIsMachine && <div style={{fontSize:12, color:T.sub, marginBottom:10}}>Calories re-estimate automatically when you save.</div>}
                <div style={{display:"flex", gap:8}}>
                  <button onClick={saveEdit} disabled={!edit.activity||(editIsSteps?!edit.steps:!edit.duration)} style={{...saveSm, opacity:(edit.activity&&(editIsSteps?edit.steps:edit.duration))?1:0.45}}>Save changes</button>
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

/* "ez bar curl" -> "Ez Bar Curl" — words typed all-lowercase get capitalized (after
   spaces, hyphens, and parens); words the user already capitalized (EZ, RDL) are kept. */
const properCase = (s) => s.trim().replace(/\s+/g, " ").split(" ")
  .map(w => w === w.toLowerCase() ? w.replace(/(^|[-(/])([a-z])/g, (m, p, c) => p + c.toUpperCase()) : w).join(" ");

function ExercisesTab({ data, setData }) {
  const [name, setName] = useState(""); const [muscles, setMuscles] = useState([]);
  const [muscles2, setMuscles2] = useState([]); const [equip, setEquip] = useState("Barbell (plates)");
  const [addMsg, setAddMsg] = useState(null); // "already in your library" notice
  const [libQ, setLibQ] = useState(""); const [libM, setLibM] = useState("All");
  const shownEx = useMemo(() => {
    const q = libQ.trim().toLowerCase();
    return data.exercises.filter(x =>
      (!q || x.name.toLowerCase().includes(q)) &&
      (libM === "All" || musclesOf(x).includes(libM) || secondariesOf(x).includes(libM)));
  }, [data.exercises, libQ, libM]);

  const [edit, setEdit] = useState(null); // { orig, name, muscles, muscles2, equip }
  const [mergeTo, setMergeTo] = useState(""); // fold this exercise into another one
  const editValid = edit && edit.name.trim() && edit.muscles.length > 0 &&
    !data.exercises.some(x => x.name.toLowerCase() === edit.name.trim().toLowerCase() && x.name !== edit.orig);
  const saveEdit = () => {
    if (!editValid) return;
    const nn = properCase(edit.name);
    setData(d=>({ ...d,
      exercises: d.exercises.map(x => x.name===edit.orig ? { name:nn, muscle:edit.muscles[0], muscles:edit.muscles, muscles2:edit.muscles2, ...fromEquip(edit.equip) } : x),
      log: nn !== edit.orig ? d.log.map(e => e.exercise===edit.orig ? { ...e, exercise:nn } : e) : d.log,
      routines: nn !== edit.orig ? (d.routines||[]).map(r => ({ ...r, items:(r.items||[]).map(it => it.exercise===edit.orig ? { ...it, exercise:nn } : it) })) : d.routines,
    }));
    setEdit(null);
  };
  // merge: every logged set (and routine slot) moves to the picked exercise, then this one is deleted
  const doMerge = () => {
    if (!mergeTo || !edit) return;
    setData(d=>({ ...d,
      log: d.log.map(e => e.exercise===edit.orig ? { ...e, exercise:mergeTo } : e),
      routines: (d.routines||[]).map(r => ({ ...r, items:(r.items||[]).map(it => it.exercise===edit.orig ? { ...it, exercise:mergeTo } : it) })),
      exercises: d.exercises.filter(x => x.name !== edit.orig),
    }));
    setEdit(null); setMergeTo("");
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
  const exportAll = () => download(`the-lab-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  const outBtn = { background:"none", border:`1px solid ${T.line}`, color:T.ink, padding:"9px 14px", fontSize:13.5, fontWeight:600 };

  return (<>
    <div className="card">
      <div className="h" style={{fontSize:19, color:T.tealDk, marginBottom:4}}>📚 Exercise library</div>
      <div style={{fontSize:12.5, color:T.sub, marginBottom:10}}>Add your own moves (e.g. Decline Push-Up). Pick <b>Barbell</b> to get the plate helper when logging; <b>Bodyweight</b> moves auto-track by reps.</div>
      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <input value={name} onChange={e=>{setName(e.target.value); setAddMsg(null);}} placeholder="Exercise name" style={{flex:2, minWidth:150}} />
        <select value={equip} onChange={e=>setEquip(e.target.value)} style={{flex:1, minWidth:150}}>{EQUIP_OPTS.map(o=><option key={o}>{o}</option>)}</select>
      </div>
      <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Muscle groups: tap once = <b style={{color:T.green}}>✓ main</b> (full set credit) · tap again = <b style={{color:AMBER}}>½ secondary</b> (half credit) · third tap clears. First main pick decides where it sorts.</div>
      <MuscleChips prim={muscles} sec={muscles2} onChange={(p,s)=>{setMuscles(p);setMuscles2(s);}} />
      {name.trim() && !muscles.length && <div style={{fontSize:12, color:AMBER, marginTop:6}}>Pick at least one main muscle group to add this exercise.</div>}
      {addMsg && <div style={{fontSize:12.5, color:AMBER, marginTop:6}}>{addMsg}</div>}
      <button onClick={()=>{
          if(!name.trim()||!muscles.length)return;
          const nn = properCase(name); // capitalization fixes itself — "cable fly" becomes "Cable Fly"
          const dupe = data.exercises.find(x => x.name.toLowerCase() === nn.toLowerCase());
          if (dupe) { setAddMsg(`“${dupe.name}” is already in your library — no duplicate added. (To fold one exercise into another, open it with ✏️ and use Merge.)`); return; }
          setData(d=>({...d, exercises:[...d.exercises, {name:nn, muscle:muscles[0], muscles, muscles2, ...fromEquip(equip)}]}));
          setName(""); setMuscles([]); setMuscles2([]); setAddMsg(null);
        }}
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
                <PencilBtn onClick={()=>{ setEdit({ orig:x.name, name:x.name, muscles:musclesOf(x), muscles2:secondariesOf(x), equip:equipOf(x) }); setMergeTo(""); }} />
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
                  {data.exercises.length > 1 && (
                    <div style={{marginTop:12, paddingTop:12, borderTop:`1px solid ${T.line}`}}>
                      <div style={{fontSize:12.5, color:T.sub, marginBottom:8}}>
                        Added this by accident and it already exists? <b style={{color:T.ink}}>Merge it:</b> every set logged
                        under “{edit.orig}” moves to the exercise you pick, then “{edit.orig}” is deleted. History stays intact.
                      </div>
                      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                        <select value={mergeTo} onChange={ev=>setMergeTo(ev.target.value)} style={{flex:1, minWidth:170}}>
                          <option value="">— merge into… —</option>
                          {data.exercises.filter(z=>z.name!==edit.orig).map(z=><option key={z.name}>{z.name}</option>)}
                        </select>
                        {mergeTo && (
                          <button onClick={doMerge} style={{background:AMBER, color:"#000", padding:"9px 16px", fontWeight:700, fontSize:13.5}}>
                            Merge &amp; delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
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
  if (!IS_MOBILE || IS_STANDALONE) return null;
  if (done) return <div style={{ fontSize:13, color:T.green, fontWeight:700, padding:"4px 2px" }}>✅ Marked as installed — this guide disappears next time you open Settings.</div>;
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

/* ===== JOURNAL: dead-simple daily notes, one per day ===== */
function JournalTab({ data, setData }) {
  const [sel, setSel] = useState(todayStr());
  // desktop (mouse) auto-focuses the note so you can just type; on phones we DON'T,
  // so opening the tab doesn't yank up the keyboard — you tap the box when ready.
  const isDesktop = typeof window !== "undefined" && window.matchMedia?.("(hover:hover) and (pointer:fine)").matches;
  const journal = data.journal || {};
  const text = (journal[sel] && journal[sel].text) || "";
  const shift = (n) => { const d = new Date(sel+"T00:00"); d.setDate(d.getDate()+n); setSel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); };
  const setText = (v) => setData(d => {
    const j = { ...(d.journal||{}) };
    if (v.trim()) j[sel] = { text: v }; else delete j[sel];
    return { ...d, journal: j };
  });
  const recent = useMemo(() => Object.entries(journal)
    .filter(([,e]) => String(e && e.text || "").trim())
    .sort((a,b) => b[0].localeCompare(a[0])).slice(0, 60), [journal]);
  const prettyDay = (dstr) => new Date(dstr+"T00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });

  return (<>
    <div className="card" style={{ padding:18 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <button onClick={()=>shift(-1)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"7px 13px", fontSize:15 }}>‹</button>
        <div style={{ textAlign:"center", cursor:"pointer" }} onClick={()=>setSel(todayStr())}>
          <div style={{ fontSize:18, fontWeight:800, color:T.tealDk }}>{sel===todayStr() ? "Today" : prettyDay(sel)}</div>
          {sel!==todayStr() && <div style={{ fontSize:11.5, color:T.green, fontWeight:700 }}>tap for today</div>}
        </div>
        <button onClick={()=>shift(1)} disabled={sel>=todayStr()} style={{ background:T.input, color: sel>=todayStr()?T.line:T.ink, border:`1px solid ${T.line}`, borderRadius:10, padding:"7px 13px", fontSize:15 }}>›</button>
      </div>

      <textarea autoFocus={isDesktop && sel===todayStr()} value={text} onChange={e=>setText(e.target.value)}
        placeholder="How was the session? Soreness, energy, PRs, what to try next time…"
        rows={7} style={{ width:"100%", border:`1px solid ${T.line}`, borderRadius:12, padding:"14px 15px", background:T.input, color:T.ink, fontFamily:"inherit", fontSize:15.5, lineHeight:1.5, resize:"vertical" }} />
      <div style={{ fontSize:11.5, color:T.sub, marginTop:8, textAlign:"right" }}>{text.trim() ? "✓ Saved automatically" : "Saves as you type"}</div>
    </div>

    {recent.length > 0 && (
      <div className="card">
        <div className="h" style={{ fontSize:17, color:T.tealDk, marginBottom:6 }}>📓 Past entries</div>
        {recent.map(([d,e])=>(
          <button key={d} onClick={()=>setSel(d)} style={{ display:"flex", gap:12, width:"100%", textAlign:"left", background: d===sel?T.mint:"none", border:"none", borderTop:`1px solid ${T.line}`, padding:"11px 4px", cursor:"pointer", alignItems:"baseline" }}>
            <span style={{ fontSize:12.5, fontWeight:800, color: d===sel?T.green:T.ink, whiteSpace:"nowrap", flexShrink:0, minWidth:96 }}>{prettyDay(d)}{d===todayStr()?" ·":""}</span>
            <span style={{ fontSize:13, color:T.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.text}</span>
          </button>
        ))}
      </div>
    )}
  </>);
}

function SectionHead({ icon, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 2px 10px" }}>
      <span style={{ fontSize:12, fontWeight:800, color:T.green, textTransform:"uppercase", letterSpacing:"1.2px" }}>{icon} {label}</span>
      <div style={{ flex:1, height:1, background:T.line }} />
    </div>
  );
}

function SettingsModal({ user, username, data, setData, startTab, setStartTab, tabs, units, setUnits, hunit, setHunit, routinesOn, setRoutinesOn, stepsOn, setStepsOn, streaksOn, setStreaksOn, waterOn, setWaterOn, nutritionOn, isPro, onClose }) {
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const totalSets = (data.log||[]).length;

  // close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // freeze the page behind the sheet — otherwise iOS "scroll chains" to the app
  // underneath when the sheet's scroll hits an edge, which feels like broken scrolling
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // swipe DOWN on the grab handle to dismiss (the sheet follows your finger)
  const sheetRef = useRef(null);
  const dragY = useRef(null);
  const grab = {
    onTouchStart: (e) => {
      dragY.current = { y0: e.touches[0].clientY, dy: 0 };
      if (sheetRef.current) sheetRef.current.style.animation = "none"; // let transform take over
    },
    onTouchMove: (e) => {
      if (!dragY.current) return;
      const dy = Math.max(0, e.touches[0].clientY - dragY.current.y0);
      dragY.current.dy = dy;
      if (sheetRef.current) { sheetRef.current.style.transition = "none"; sheetRef.current.style.transform = `translateY(${dy}px)`; }
    },
    onTouchEnd: () => {
      const dy = dragY.current?.dy || 0; dragY.current = null;
      const el = sheetRef.current; if (!el) return;
      if (dy > 90) { onClose(); return; }
      el.style.transition = "transform .25s cubic-bezier(.22,1,.36,1)"; el.style.transform = "translateY(0)";
    },
  };

  return (
    <div onClick={onClose} className="sheet-wrap" style={{
      position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center", touchAction:"none",
      animation:"fadeSwap .18s ease-out both",
    }}>
      <div ref={sheetRef} onClick={e=>e.stopPropagation()} className="sheet" style={{
        background:T.card, borderTop:`1px solid ${T.line}`, borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:520, maxHeight:"88dvh", overflowY:"auto",
        overscrollBehavior:"contain", WebkitOverflowScrolling:"touch", touchAction:"pan-y",
        padding:"18px 16px calc(20px + env(safe-area-inset-bottom))",
        animation:"sheetUp .26s cubic-bezier(.22,1,.36,1) both",
      }}>
        <div {...grab} style={{ touchAction:"none", cursor:"grab", padding:"6px 0 12px", margin:"-8px 0 2px" }}>
          <div style={{ width:38, height:4, background:T.line, borderRadius:99, margin:"0 auto" }} />
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div className="h" style={{ fontSize:22, color:T.tealDk }}>💪 {username}</div>
            <div style={{ fontSize:12.5, color:T.sub, marginTop:2 }}>Member since {memberSince} · {totalSets} sets logged</div>
          </div>
          <button onClick={onClose} style={{ background:T.input, color:T.sub, width:34, height:34, borderRadius:99, fontSize:16, flexShrink:0 }}>✕</button>
        </div>

        <SettingsSection icon="✨" title={isPro ? "The Lab Pro — active" : "Go Pro"} desc={isPro ? "You're a Pro member 🎉" : "Nutrition, themes & an AI coach"} defaultOpen={!isPro}>
          <ProCard isPro={isPro} />
        </SettingsSection>

        {/* the install guide only exists on a phone browser that hasn't installed yet */}
        {IS_MOBILE && !IS_STANDALONE && localStorage.getItem("lt-a2hs-done") !== "1" && (
          <SettingsSection icon="📲" title="Get the app" desc="Put The Lab on your home screen" defaultOpen>
            <DownloadAppCard />
          </SettingsSection>
        )}

        <SettingsSection icon="🎛" title="Display & units" desc="Pounds or kilos, height, and your start tab">
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

          <div style={{ ...sCard, marginBottom:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Open the app on</div>
            <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>Pick the tab you land on each time — set it to Log for the fastest gym start.</div>
            <select value={startTab} onChange={e=>setStartTab(e.target.value)}>
              {tabs.map(([id,label,icon])=><option key={id} value={id}>{icon} {label}</option>)}
              <option value="last">📍 Wherever I left off</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection icon="🕐" title="Time & dates" desc="Your time zone, and when your day starts">
          <TimeZoneCard data={data} setData={setData} />
          <DayStartCard data={data} setData={setData} />
        </SettingsSection>

        <SettingsSection icon="🧩" title="Features" desc="Optional parts of the app — on or off">
          <FeatureToggle label="Workout routines" on={routinesOn} setOn={setRoutinesOn}
            desc="Adds a Routines section to the Log tab: build templates like “Push Day,” then tap Start to log them exercise-by-exercise. Off by default. Turning it off just hides it — your saved routines stay." />
          {/* Water + Streaks toggles belong to the Macros feature — shown only when it's unlocked */}
          {nutritionOn && (<>
            <FeatureToggle label="Workout streaks" on={streaksOn} setOn={setStreaksOn}
              desc="Shows your weekly streak (🔥) on the dashboard and in groups. Turning it off just hides the streak counters." />
            <FeatureToggle label="Water tracking" on={waterOn} setOn={setWaterOn}
              desc="Adds a daily water-intake tracker to the Macros tab. Turning it off just hides it — anything you logged stays." />
          </>)}
        </SettingsSection>

        <SettingsSection icon="🚶" title="Apple Health steps" desc="Auto-log your daily steps from your iPhone">
          <FeatureToggle label="Show the Steps tab" on={stepsOn} setOn={setStepsOn}
            desc="Adds a 👟 Steps tab (goal ring, W/M/6M/Y/5Y charts, group leaderboard) and a steps recap on the Cardio tab. Flip this on once you've set up syncing below." />
          <StepsCard user={user} />
        </SettingsSection>

        <SettingsSection icon="🛟" title="Data safety" desc="Automatic backups — in the cloud and on this device">
          <CloudBackupsCard username={username} setData={setData} />
          <BackupsCard user={user} username={username} setData={setData} />
        </SettingsSection>

        <SettingsSection icon="🔐" title="Account & security" desc="Password and your reset question">
          <ChangePasswordCard />
          <SecurityCard username={username} />
        </SettingsSection>

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
export const __SettingsTest = SettingsModal; // harness.html renders the sheet standalone for testing

/* Short, popular-first time-zone list — Auto covers almost everyone; the full IANA
   list (~400 zones) hides behind a "show every time zone" tap for the rare case. */
const TZ_POPULAR = [
  ["United States & Canada", [
    ["America/New_York", "Eastern — New York"],
    ["America/Chicago", "Central — Chicago"],
    ["America/Denver", "Mountain — Denver"],
    ["America/Phoenix", "Arizona — Phoenix"],
    ["America/Los_Angeles", "Pacific — Los Angeles"],
    ["America/Anchorage", "Alaska"],
    ["Pacific/Honolulu", "Hawaii"],
    ["America/Toronto", "Eastern — Toronto"],
  ]],
  ["Europe", [
    ["Europe/London", "UK & Ireland — London"],
    ["Europe/Paris", "Central Europe — Paris, Berlin"],
    ["Europe/Sarajevo", "Central Europe — Sarajevo"],
    ["Europe/Athens", "Eastern Europe — Athens"],
  ]],
  ["Rest of the world", [
    ["America/Mexico_City", "Mexico — Mexico City"],
    ["America/Sao_Paulo", "Brazil — São Paulo"],
    ["Asia/Dubai", "UAE — Dubai"],
    ["Asia/Kolkata", "India"],
    ["Asia/Shanghai", "China"],
    ["Asia/Tokyo", "Japan"],
    ["Australia/Sydney", "Australia — Sydney"],
    ["UTC", "UTC"],
  ]],
];
const TZ_POPULAR_IDS = new Set(TZ_POPULAR.flatMap(([, zs]) => zs.map(([id]) => id)));

/* Collapsible Settings section: icon + title + one-line description, tap to expand. */
function SettingsSection({ icon, title, desc, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:`1px solid ${open ? T.green : T.line}`, borderRadius:14, marginBottom:10, overflow:"hidden",
      background:T.card, transition:"border-color .2s ease" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
        padding:"14px", background:"none", borderRadius:0, textAlign:"left" }}>
        <span style={{ fontSize:21, width:28, textAlign:"center", flexShrink:0 }}>{icon}</span>
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ display:"block", fontSize:15, fontWeight:800, color:T.ink }}>{title}</span>
          <span style={{ display:"block", fontSize:12, color:T.sub, marginTop:1 }}>{desc}</span>
        </span>
        <span style={{ color: open ? T.green : T.sub, fontSize:15, flexShrink:0,
          display:"inline-block", transform: open ? "rotate(90deg)" : "none", transition:"transform .22s cubic-bezier(.34,1.56,.64,1)" }}>▸</span>
      </button>
      {open && <div style={{ padding:"2px 14px 14px", animation:"secIn .22s ease-out both" }}>{children}</div>}
    </div>
  );
}

/* Time zone: Auto (detected from the device) is the default and right for almost
   everyone; the dropdown offers the popular zones, full list on request. */
function TimeZoneCard({ data, setData }) {
  const [showAll, setShowAll] = useState(false);
  const tzVal = data.profile?.tz || "auto";
  const setTz = (z) => setData(d => ({ ...d, profile: { ...(d.profile||{}), tz: z } }));
  const allZones = showAll && typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>Time zone</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        Decides when “today” starts for your logs. <b>Auto detects it from your phone</b> — right for
        almost everyone, and it follows you when you travel. Only pick one manually if your device's
        clock is set to a different place than where you lift.
      </div>
      <select value={tzVal} onChange={e=>setTz(e.target.value)}>
        <option value="auto">🌐 Auto — detected: {detectedTZ().replace(/_/g," ")}</option>
        {TZ_POPULAR.map(([g, zs]) => (
          <optgroup key={g} label={g}>
            {zs.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </optgroup>
        ))}
        {/* a manually-set zone outside the short list still shows correctly */}
        {tzVal !== "auto" && !TZ_POPULAR_IDS.has(tzVal) && !showAll && <option value={tzVal}>{tzVal.replace(/_/g," ")}</option>}
        {showAll && (
          <optgroup label="Every time zone">
            {allZones.filter(z => !TZ_POPULAR_IDS.has(z)).map(z => <option key={z} value={z}>{z.replace(/_/g," ")}</option>)}
          </optgroup>
        )}
      </select>
      {!showAll && (
        <button onClick={()=>setShowAll(true)} style={{ background:"none", color:T.sub, fontSize:12, textDecoration:"underline", padding:"6px 2px 0" }}>
          Can't find yours? Show every time zone
        </button>
      )}
    </div>
  );
}

/* "My day starts at" — slider from Midnight to 8 AM with a live readout. Sets logged
   before this hour are dated the night before (stored as profile.dayStart). */
function DayStartCard({ data, setData }) {
  const v = data.profile?.dayStart ?? 4;
  const set = (n) => setData(d => ({ ...d, profile: { ...(d.profile||{}), dayStart: n } }));
  const fmtH = (h) => h === 0 ? "Midnight" : `${h}:00 AM`;
  const pct = v / 8 * 100;
  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8, marginBottom:2 }}>
        <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>🌙 My day starts at</div>
        <div style={{ fontSize:19, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums" }}>{fmtH(v)}</div>
      </div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10, lineHeight:1.55 }}>
        {v === 0
          ? "The date flips exactly at midnight — a 12:30 AM set counts as the new day."
          : `Sets logged between midnight and ${fmtH(v)} still count as the night before, so a late session stays on one date.`}
        {" "}This only changes the pre-filled date when logging — tapping the date always overrides it.
      </div>
      <input type="range" min="0" max="8" step="1" value={v} onChange={e=>set(+e.target.value)}
        className="lab-range" aria-label="Hour your day starts"
        style={{ background:`linear-gradient(to right, ${T.green} ${pct}%, ${T.input} ${pct}%)` }} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10.5, color:T.sub, margin:"2px 3px 12px" }}>
        {["12","1","2","3","4","5","6","7","8 AM"].map(t=><span key={t}>{t}</span>)}
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {[[0,"🌅 Midnight — early bird"],[4,"🦉 4 AM — night owl"]].map(([n,l])=>(
          <button key={n} onClick={()=>set(n)} style={{
            padding:"7px 13px", borderRadius:99, fontSize:12.5, fontWeight:700,
            background: v===n ? "rgba(0,200,5,.14)" : T.input, color: v===n ? T.green : T.sub,
            border:`1px solid ${v===n ? T.green : T.line}`,
          }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/* Small visual bits that make the walkthrough look like the Shortcuts app. */
const STEP_BLUE = "#4C9BFF", STEP_BLUEBG = "rgba(76,155,255,.16)";
/* a word you tap in Shortcuts */
function Tap({ children }) {
  return <span style={{ display:"inline-block", color:STEP_BLUE, background:STEP_BLUEBG, borderRadius:6, padding:"1px 7px", fontWeight:700, whiteSpace:"nowrap" }}>{children}</span>;
}
/* a Shortcuts "magic variable" chip — blue text on a blue tint with a small app-icon
   square, matching how variables actually render in the Shortcuts editor. */
function Var({ children, icon, iconBg }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, color:STEP_BLUE, background:"rgba(76,155,255,.18)", borderRadius:6, padding:"2px 8px 2px 4px", fontWeight:700, fontSize:12.5, whiteSpace:"nowrap" }}>
      <span style={{ width:16, height:16, borderRadius:4, flexShrink:0, background:iconBg || "#3B7BEF", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9.5, lineHeight:1 }}>{icon || "◈"}</span>
      {children}
    </span>
  );
}
/* a mock of one action block as it appears on the phone */
function MockCard({ glyph, glyphBg, title, rows }) {
  return (
    <div style={{ background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"11px 12px", margin:"8px 0 10px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ width:27, height:27, borderRadius:7, flexShrink:0, background:glyphBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>{glyph}</span>
        <span style={{ fontSize:13.5, fontWeight:600, color:T.ink, lineHeight:1.4 }}>{title}</span>
      </div>
      {rows && rows.length > 0 && (
        <div style={{ marginTop:9, borderTop:`1px solid ${T.line}`, paddingTop:9, display:"flex", flexDirection:"column", gap:8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", fontSize:13 }}>
              <span style={{ color:T.sub }}>{r[0]}</span>
              <span style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center" }}>{r[1]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/* the "Search Actions" bar at the bottom of the Shortcuts editor — how you add
   every action. Shown big at the top of each step so it can't be missed. */
function SearchBar({ text }) {
  return (
    <div style={{ margin:"2px 0 12px" }}>
      <div style={{ fontSize:12, color:STEP_BLUE, fontWeight:700, marginBottom:6 }}>Tap “Search Actions” at the very bottom, then type:</div>
      <div style={{ display:"flex", alignItems:"center", gap:10, background:T.input, border:`1.5px solid ${STEP_BLUE}`, borderRadius:99, padding:"11px 16px" }}>
        <span style={{ fontSize:15, color:T.sub }}>🔍</span>
        <span style={{ fontSize:14.5, color:T.ink, fontWeight:700 }}>{text}</span>
      </div>
      <div style={{ fontSize:11.5, color:T.sub, marginTop:6 }}>…then tap it in the results to add it. It looks like this:</div>
    </div>
  );
}

/* numbered wrapper: big number + title, then the search bar + card + notes */
function StepBlock({ n, title, children }) {
  return (
    <div style={{ marginBottom:20, paddingTop:14, borderTop:`1px solid ${T.line}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <span style={{ width:26, height:26, borderRadius:8, flexShrink:0, background:T.green, color:"#000", fontWeight:800, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>{n}</span>
        <span style={{ fontSize:16.5, fontWeight:800, color:T.ink }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* Apple Health steps: a website can't read Health directly (Apple only allows native
   apps), so an iPhone Shortcut reads today's steps and POSTs them to log_steps() using
   this user's secret code. The card generates that code, shows every setup value as a
   copy button, walks the whole Shortcut with mock action cards, and shows today's count. */
function StepsCard({ user }) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState("");
  const [latest, setLatest] = useState(undefined); // undefined = loading, null = none, else { day, count }
  const url = (import.meta.env.VITE_SUPABASE_URL || "") + "/rest/v1/rpc/log_steps";
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  const addDays = (ds, n) => { const d = new Date(ds + "T00:00"); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const yStr = addDays(todayStr(), -1);
  const dayLabel = (day) => day === todayStr() ? "today" : day === yStr ? "yesterday" : fmtDate(day);

  // show the most recent day that has synced steps (the Shortcut logs the finished previous day)
  useEffect(() => { (async () => {
    try {
      const s = await stepsFor([user.id], addDays(todayStr(), -4));
      const mine = s[user.id] || {};
      const days = Object.keys(mine).sort();
      const last = days[days.length - 1];
      setLatest(last ? { day: last, count: mine[last] } : null);
    } catch { setLatest(null); }
  })(); }, [user.id]);

  const connect = async () => {
    setBusy(true); setErr(null);
    try { setToken(await getStepToken()); }
    catch { setErr("Couldn't set this up right now — check your connection and try again."); }
    finally { setBusy(false); }
  };
  const copy = (text, label) => {
    try { navigator.clipboard.writeText(text); } catch {}
    setCopied(label); setTimeout(() => setCopied(c => c === label ? "" : c), 1400);
  };

  // one copyable value (the whole box is tappable to copy)
  const Copy = ({ label, value, id, secret }) => (
    <div style={{ marginBottom:9 }}>
      <div style={{ fontSize:10.5, fontWeight:700, color: secret ? T.green : T.sub, marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>{label}</div>
      <button onClick={()=>copy(value, id)} style={{ display:"flex", gap:8, alignItems:"center", width:"100%", textAlign:"left",
        background:T.input, border:`1px solid ${copied===id ? T.green : (secret ? T.green : T.line)}`, borderRadius:9, padding:"9px 11px" }}>
        <code style={{ flex:1, minWidth:0, fontSize:12, color:T.ink, overflowWrap:"anywhere", fontFamily:"ui-monospace, Menlo, monospace" }}>{value}</code>
        <span style={{ flexShrink:0, fontSize:12, fontWeight:700, color: copied===id ? T.green : STEP_BLUE }}>{copied===id ? "Copied ✓" : "Copy"}</span>
      </button>
    </div>
  );

  // a tap-to-copy chip used inline inside the mock pictures. `block` = full width,
  // `wrap` = let a long value wrap so nothing (incl. the Copy button) gets cut off.
  const CopyChip = ({ value, id, label, secret, block, wrap }) => {
    const on = copied === id;
    return (
      <button onClick={()=>copy(value, id)} title="Tap to copy" style={{
        display: block ? "flex" : "inline-flex", width: block ? "100%" : "auto",
        alignItems: wrap ? "flex-start" : "center", gap:8, textAlign:"left", verticalAlign:"middle",
        background: on ? T.green : T.input, border:`1px solid ${on ? T.green : (secret ? T.green : T.line)}`,
        borderRadius:7, padding: block ? "9px 11px" : "4px 9px", fontSize:12, fontWeight:700,
        color: on ? "#000" : STEP_BLUE, fontFamily:"ui-monospace, Menlo, monospace", maxWidth:"100%", overflow:"hidden" }}>
        <span style={{ flex: block ? 1 : "0 1 auto", minWidth:0,
          overflow: wrap ? "visible" : "hidden", textOverflow: wrap ? "clip" : "ellipsis",
          whiteSpace: wrap ? "normal" : "nowrap", overflowWrap: wrap ? "anywhere" : "normal", wordBreak: wrap ? "break-all" : "normal" }}>{label ?? value}</span>
        <span style={{ flexShrink:0, fontSize:11, fontWeight:800, color: on ? "#000" : STEP_BLUE }}>{on ? "Copied ✓" : "Copy"}</span>
      </button>
    );
  };

  // one JSON body field, stacked so the Value + its Copy button always get full width
  const JField = ({ type, name, nameId, valueCopy, valueId, valueNote, valuePick, secret }) => (
    <div style={{ background:T.input, border:`1px solid ${secret ? T.green : T.line}`, borderRadius:10, overflow:"hidden", marginBottom:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.6, padding:"6px 11px", borderBottom:`1px solid ${T.line}`, background:T.cardAlt }}>Field type: {type}</div>
      <div style={{ padding:"9px 11px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:9.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5 }}>Key</span>
          <CopyChip value={name} id={nameId} />
        </div>
        <div style={{ fontSize:9.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>Value</div>
        {valueCopy != null ? (<>
          <CopyChip value={valueCopy} id={valueId} secret={secret} block wrap />
          {valueNote && <div style={{ fontSize:11, fontWeight:800, color: secret ? T.danger : T.sub, marginTop:6 }}>{valueNote}</div>}
        </>) : (
          <div style={{ display:"flex", gap:8, alignItems:"flex-start", background:STEP_BLUEBG, border:`1px solid ${STEP_BLUE}`, borderRadius:8, padding:"9px 11px" }}>
            <span style={{ flexShrink:0, fontSize:14 }}>👆</span>
            <span style={{ fontSize:12, color:T.ink, lineHeight:1.5 }}>{valuePick}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>🚶 Steps from Apple Health</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10, lineHeight:1.55 }}>
        A website can't read Apple Health on its own, so this uses a free <b>Apple Shortcut</b> on your
        iPhone to send your daily steps in — refreshing each time you open The Lab. A one-time, ~2-minute setup.
      </div>

      {latest !== undefined && latest !== null && (
        <div style={{ display:"flex", alignItems:"baseline", gap:8, background:"rgba(0,200,5,.10)", border:`1px solid ${T.green}`,
          borderRadius:10, padding:"9px 12px", marginBottom:10 }}>
          <span style={{ fontSize:22, fontWeight:800, color:T.green, fontVariantNumeric:"tabular-nums" }}>{latest.count.toLocaleString()}</span>
          <span style={{ fontSize:12.5, color:T.sub }}>steps · {dayLabel(latest.day)} ✓</span>
        </div>
      )}

      {err && <div style={{ fontSize:12.5, color:T.danger, marginBottom:8 }}>{err}</div>}

      {!token ? (
        <button onClick={connect} disabled={busy} style={{ background:T.green, color:"#000", fontWeight:800,
          padding:"11px 16px", borderRadius:10, fontSize:14, width:"100%", opacity:busy?0.6:1 }}>
          {busy ? "Setting up…" : "Connect Apple Health"}
        </button>
      ) : (<>
        {/* how it works + the 14-day loop */}
        <div style={{ display:"flex", gap:11, alignItems:"flex-start", background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"12px 13px", margin:"4px 0 12px" }}>
          <span style={{ fontSize:20, flexShrink:0, lineHeight:1.1 }}>💡</span>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55 }}>
            Open the <b style={{ color:T.ink }}>Shortcuts</b> app → <b style={{ color:T.ink }}>+</b>, then add the actions below from the search bar (blue words = things you tap).
            This shortcut <b style={{ color:T.ink }}>loops over the last 14 days</b> and sends each one, so a single <b>🔄 Sync now</b> fills any gaps.
          </div>
        </div>
        <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(0,200,5,.08)", border:`1px solid ${T.green}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:16 }}>
          <span style={{ flexShrink:0 }}>🎯</span>
          <span>It logs <b style={{ color:T.ink }}>finished days</b> (yesterday going back 14), so your numbers always <b style={{ color:T.ink }}>match Health exactly</b> —
            and re-syncing never double-counts, because each day just overwrites itself.</span>
        </div>

        {/* the one setting that unblocks Health sending — do this FIRST */}
        <div style={{ background:"rgba(64,156,255,.10)", border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"13px 14px", marginBottom:16 }}>
          <div style={{ fontSize:13.5, fontWeight:800, color:T.ink, marginBottom:6 }}>⚙️ First — flip one iPhone setting (required)</div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.6, marginBottom:8 }}>
            Apple blocks shortcuts from sending Health data until you allow it. Turn this on once, or the sync fails with a “can't share Health items” error:
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, background:T.input, borderRadius:10, padding:"11px 13px" }}>
            {[["1","Open the iPhone", "Settings app"],["2","Tap", "Shortcuts"],["3","Tap", "Advanced"],["4","Turn ON", "Allow Sharing Large Amounts of Data"]].map(([n,pre,bold])=>(
              <div key={n} style={{ display:"flex", gap:8, alignItems:"baseline", fontSize:13, lineHeight:1.5 }}>
                <span style={{ color:STEP_BLUE, fontWeight:800, minWidth:14 }}>{n}.</span>
                <span style={{ color:T.sub }}>{pre} <b style={{ color:T.ink }}>{bold}</b></span>
              </div>
            ))}
          </div>
        </div>

        <StepBlock n="1" title="Repeat  (the 14-day loop)">
          <SearchBar text="Repeat" />
          <MockCard glyph="🔁" glyphBg="#8E8E93" title={<>Repeat <Tap>14</Tap> times</>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:10 }}>
            Add <b>Repeat</b>, then tap its number and change it to <b style={{ color:T.ink }}>14</b>. It drops in a <b>Repeat 14 Times</b> line and an <b>End Repeat</b> line.
          </div>
          {/* target structure — what the finished shortcut should look like */}
          <div style={{ fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Your shortcut should end up like this:</div>
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px 14px", marginBottom:10, fontSize:12.5, fontFamily:"ui-monospace, Menlo, monospace", lineHeight:1.85 }}>
            <div style={{ color:STEP_BLUE, fontWeight:700 }}>🔁 Repeat 14 Times</div>
            {["Adjust Date","Find Health Samples","Calculate Statistics","Text  (Sum)","Format Date","Get Contents of URL"].map((t,i)=>(
              <div key={t} style={{ paddingLeft:16, color:T.ink }}><span style={{ color:T.sub }}>{i+2}.</span> {t}</div>
            ))}
            <div style={{ color:STEP_BLUE, fontWeight:700 }}>End Repeat</div>
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"11px 13px", fontSize:12, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:15 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>Every action must end up ABOVE the “End Repeat” line.</b> When you add steps 2–7 they'll appear <b>below</b> “End Repeat” by default —
              press-and-hold the <b>≡</b> grip on the right of each one and <b>drag it up above “End Repeat”</b> so it's inside the loop. Nothing should sit below End Repeat.</span>
          </div>
        </StepBlock>

        <StepBlock n="2" title="Adjust Date  (inside the loop)">
          <SearchBar text="Adjust Date" />
          <MockCard glyph="🗓" glyphBg="#E64637" title={<><Tap>Subtract</Tap> <Var icon="🔁" iconBg="#8E8E93">Repeat Index</Var> <Tap>days</Tap> from <Var icon="📅" iconBg="#3B7BEF">Current Date</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:8 }}>Do these 4 taps, in order:</div>
          <ol style={{ fontSize:12.5, color:T.sub, lineHeight:1.6, paddingLeft:18, margin:"0 0 10px" }}>
            <li>It starts as “<b>Add 1 Days to …</b>”. Tap <b>Add</b> → choose <b>Subtract</b>.</li>
            <li>Tap the empty <b>date</b> slot (the “from ___” part) → pick <b style={{ color:STEP_BLUE }}>Current Date</b>.</li>
            <li>Tap the number <b>1</b> and delete it. A row of <b style={{ color:T.ink }}>blue chips</b> appears right above the keyboard — that's the <b>Variables bar</b>.</li>
            <li><b style={{ color:T.ink }}>Swipe that blue bar sideways</b> and tap <b style={{ color:STEP_BLUE }}>Repeat Index</b>. (Don't tap “Select Variable” — it's not in there.)</li>
          </ol>
          <div style={{ fontSize:12, color:T.sub, lineHeight:1.5, marginBottom:9 }}>Done right, it reads <b>Subtract Repeat Index Days from Current Date</b>, and its result is called <b>Adjusted Date</b>.</div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>No “Repeat Index” in the blue bar?</b> Then this Adjust Date action isn't inside the loop yet — go to step 1 and drag it up between “Repeat 14 Times” and “End Repeat,” then try again.</span>
          </div>
        </StepBlock>

        <StepBlock n="3" title="Find Health Samples  (inside the loop)">
          <SearchBar text="Find Health Samples" />
          {/* mock: the action with its two filter rows (Start Date is on yesterday) */}
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px", margin:"0 0 10px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ width:29, height:29, borderRadius:8, flexShrink:0, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>❤️</span>
              <span style={{ fontSize:14, fontWeight:600, color:T.ink, lineHeight:1.5 }}>Find <Tap>Health Samples</Tap> where <Tap>All</Tap> of the following are true</span>
            </div>
            <div style={{ marginTop:11, borderTop:`1px solid ${T.line}`, paddingTop:10 }}>
              <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", paddingBottom:10 }}>
                <span style={{ color:T.ink, fontSize:14, fontWeight:600 }}>Type</span><Tap>is</Tap><Tap>Steps</Tap>
              </div>
              <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", padding:"10px 0", borderTop:`1px solid ${T.line}` }}>
                <span style={{ color:T.ink, fontSize:14, fontWeight:600 }}>Start Date</span><Tap>is on</Tap><Var icon="🗓" iconBg="#E64637">Adjusted Date</Var>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, borderTop:`1px solid ${T.line}`, padding:"10px 0", color:STEP_BLUE, fontSize:13.5, fontWeight:600 }}><span style={{ fontSize:16 }}>⊕</span> Add Filter</div>
              {[["Unit","count"],["Group by","None"],["Sort by","None"]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${T.line}`, padding:"10px 0", fontSize:14 }}>
                  <span style={{ color:T.ink }}>{k}</span><span style={{ color:STEP_BLUE, fontWeight:600 }}>{v}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${T.line}`, paddingTop:10, fontSize:14 }}>
                <span style={{ color:T.ink }}>Limit</span>
                <span style={{ width:34, height:20, borderRadius:99, background:T.line, position:"relative", flexShrink:0 }}><span style={{ position:"absolute", top:2, left:2, width:16, height:16, borderRadius:99, background:"#fff" }} /></span>
              </div>
            </div>
          </div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            Two rows: <b>Type is Steps</b>, and <b>Start Date is on Adjusted Date</b>.
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span>Tapping the <b>Date</b> opens a calendar — you don't want that. <b style={{ color:T.ink }}>Long-press (tap &amp; hold)</b> it → <b>Select Variable</b> → <b style={{ color:STEP_BLUE }}>Adjusted Date</b>.</span>
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(0,200,5,.08)", borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0 }}>🔒</span>
            <span>The Lab <b style={{ color:T.ink }}>only writes to the one date you send</b>, so nobody can flood your history with old logs.</span>
          </div>
        </StepBlock>

        <StepBlock n="4" title="Calculate Statistics  (inside the loop)">
          <SearchBar text="Calculate Statistics" />
          <MockCard glyph="📊" glyphBg="#8E8E93" title={<>Calculate the <Tap>Sum</Tap> of <Var icon="❤️" iconBg="#fff">Health Samples</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>It starts as “<b>Average</b> of <b>Input</b>.” Tap <b>Average</b> → pick <b>Sum</b>. Tap <b>Input</b> → pick <b>Health Samples</b>. That adds that day's steps into one number.</div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(76,155,255,.10)", border:`1px solid ${STEP_BLUE}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            <span style={{ flexShrink:0 }}>ℹ️</span>
            <span>Don't see <b style={{ color:T.ink }}>Health Samples</b> when you tap Input? Then step 3 isn't <b style={{ color:T.ink }}>above</b> this one — drag it up so it's <b>Find first, then Calculate</b>.</span>
          </div>
        </StepBlock>

        <StepBlock n="5" title="Text  (the Health-privacy fix)">
          <SearchBar text="Text" />
          <MockCard glyph="📝" glyphBg="#EAB308" title={<>Text: <Var icon="📊" iconBg="#8E8E93">Sum</Var></>} />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            Add a <b>Text</b> action. Tap the empty text box → insert <b>only the <span style={{ color:STEP_BLUE }}>Sum</span></b> variable (don't type anything).
            This turns the Health number into plain text so iOS will let you send it. In the next steps, <b>p_count</b> uses this <b>Text</b> — not Sum.
          </div>
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>🔒</span>
            <span><b style={{ color:T.ink }}>Why this step:</b> without it you'd get <i>“trying to share N Health items.”</i> Sending plain text instead of raw Health data is the free workaround.</span>
          </div>
        </StepBlock>

        <StepBlock n="6" title="Format Date  (inside the loop)">
          <SearchBar text="Format Date" />
          <MockCard glyph="🗓" glyphBg="#E64637" title={<>Format <Var icon="🗓" iconBg="#E64637">Adjusted Date</Var></>}
            rows={[
              ["Date Format", <span key="a" style={{ color:STEP_BLUE, fontWeight:600 }}>Custom</span>],
              ["Format String", <code key="b" style={{ fontFamily:"ui-monospace, Menlo, monospace", color:T.ink }}>yyyy-MM-dd</code>],
              ["Locale", <span key="c" style={{ color:STEP_BLUE, fontWeight:600 }}>Default</span>],
            ]} />
          <div style={{ display:"flex", gap:9, alignItems:"flex-start", background:"rgba(255,80,0,.10)", border:`1px solid ${T.danger}`, borderRadius:10, padding:"10px 12px", fontSize:11.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
            <span style={{ flexShrink:0, fontSize:14 }}>⚠️</span>
            <span><b style={{ color:T.ink }}>#1 mistake:</b> the date here must say <b style={{ color:STEP_BLUE }}>Adjusted Date</b> — not a greyed-out <b>“Date”</b>. If it's greyed,
              <b style={{ color:T.ink }}> tap it and pick Adjusted Date</b>, or your steps won't save.</span>
          </div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:8 }}>
            Tap the date slot → pick <b style={{ color:STEP_BLUE }}>Adjusted Date</b>. Tap <b>Short</b> next to Date Format → pick <b>Custom</b>.
            A <b>Format String</b> box appears — tap <b>Copy</b> below and paste it in there:
          </div>
          <Copy label="Paste into the Format String box" value="yyyy-MM-dd" id="fmt" />
        </StepBlock>

        <StepBlock n="7" title="Get Contents of URL  (inside the loop)">
          <SearchBar text="Get Contents of URL" />
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:10 }}>
            Everything here is <b style={{ color:T.ink }}>tap-to-copy right in place</b> — no scrolling around. A blue box = copy it. A grey note = tap that box on your phone and pick a variable.
          </div>
          {/* the whole expanded action, with every value copyable in place */}
          <div style={{ background:T.cardAlt, border:`1px solid ${STEP_BLUE}`, borderRadius:12, padding:"12px", margin:"0 0 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ width:29, height:29, borderRadius:8, flexShrink:0, background:STEP_BLUE, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>🌐</span>
              <span style={{ fontSize:14.5, fontWeight:700, color:T.ink }}>Get Contents of <Tap>URL</Tap></span>
            </div>

            {/* URL */}
            <div style={{ marginTop:11, borderTop:`1px solid ${T.line}`, paddingTop:11 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>URL — paste this in the top box, then tap “Show More”</div>
              <CopyChip value={url} id="url" block />
            </div>

            {/* Method */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Method — tap POST</div>
              <div style={{ display:"inline-flex", background:T.input, borderRadius:8, padding:3, gap:3 }}>
                <span style={{ padding:"5px 14px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>GET</span>
                <span style={{ padding:"5px 14px", borderRadius:6, fontSize:12.5, fontWeight:800, background:T.green, color:"#000" }}>POST</span>
              </div>
            </div>

            {/* Headers — both key and value copyable */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:7 }}>Headers — tap “Add new header” twice</div>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8, flexWrap:"nowrap" }}>
                <CopyChip value="apikey" id="k-api" />
                <span style={{ color:T.sub, flexShrink:0 }}>→</span>
                <div style={{ flex:1, minWidth:0 }}><CopyChip value={apikey} id="v-api" block /></div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"nowrap" }}>
                <CopyChip value="Content-Type" id="k-ct" />
                <span style={{ color:T.sub, flexShrink:0 }}>→</span>
                <div style={{ flex:1, minWidth:0 }}><CopyChip value="application/json" id="v-ct" block /></div>
              </div>
              <div style={{ fontSize:10.5, color:T.sub, marginTop:6 }}>Left chip = the header’s <b style={{ color:T.ink }}>Key</b>, right chip = its <b style={{ color:T.ink }}>Value</b>.</div>
            </div>

            {/* Request Body */}
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:.5, marginBottom:7 }}>Request Body — tap JSON, then “Add new field” ×3</div>
              <div style={{ display:"inline-flex", background:T.input, borderRadius:8, padding:3, gap:3, marginBottom:9 }}>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>Form</span>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:800, background:T.green, color:"#000" }}>JSON</span>
                <span style={{ padding:"5px 12px", borderRadius:6, fontSize:12.5, fontWeight:700, color:T.sub }}>File</span>
              </div>
              <JField type="Text" name="p_token" nameId="k-tok" valueCopy={token} valueId="tok" secret valueNote="🔒 Don’t share this with anyone" />
              <JField type="Text" name="p_day" nameId="k-day" valuePick={<>Tap this Value box. In the bar <b>above the keyboard</b>, tap <b>Formatted Date</b> (from step 6). When it's set it looks like this: <span style={{ display:"inline-block", verticalAlign:"middle" }}><Var icon="📅" iconBg="#3B7BEF">Formatted Date</Var></span></>} />
              <JField type="Number" name="p_count" nameId="k-cnt" valuePick={<>Tap this Value box → pick the <b>Text</b> variable (from step 5). When it's set it looks like this: <span style={{ display:"inline-block", verticalAlign:"middle" }}><Var icon="📝" iconBg="#EAB308">Text</Var></span> <b style={{ color:T.danger }}>Not Sum directly</b> — that triggers the "share Health items" block.</>} />
              <div style={{ fontSize:10.5, color:T.sub, marginTop:2, lineHeight:1.5 }}>
                Only <b style={{ color:T.ink }}>p_token</b>’s value is copied. For <b>p_day</b> and <b>p_count</b> the value is a blue variable you <b>pick</b>, not type — they should end up looking exactly like the chips above.
              </div>
            </div>
          </div>
        </StepBlock>

        <StepBlock n="8" title="Name it & save">
          <div style={{ background:"rgba(0,200,5,.08)", border:`1px solid ${T.green}`, borderRadius:12, padding:"13px 14px" }}>
            <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginBottom:9 }}>
              At the top of the shortcut, tap its <b style={{ color:T.ink }}>name</b> (or the <b>⌄</b> next to it → <b>Rename</b>), erase what's there,
              and paste this <b style={{ color:T.ink }}>exact</b> name — it must match, or the Sync button and automations can't find it:
            </div>
            <Copy label="Shortcut name — tap Copy, then paste it" value="The Lab: Steps" id="name" />
            <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55, marginTop:8 }}>Then tap <b style={{ color:T.ink }}>Done</b> (top-right). Your shortcut is built. ✅</div>
          </div>
        </StepBlock>

        {/* test it — do this first, before automating */}
        <div style={{ display:"flex", gap:11, alignItems:"flex-start", background:T.cardAlt, border:`1px solid ${T.line}`, borderRadius:12, padding:"12px 13px", marginBottom:14 }}>
          <span style={{ width:30, height:30, borderRadius:99, background:T.green, color:"#000", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, paddingLeft:2 }}>▶</span>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.55 }}>
            <b style={{ color:T.ink }}>Test it first:</b> open the shortcut and tap its <b style={{ color:T.ink }}>play button</b> once. iPhone will ask to read
            Health and send data — tap <b style={{ color:T.ink }}>Allow</b>. Then come back here and you'll see
            <b style={{ color:T.green }}> yesterday's step total</b> appear at the top ✓.
          </div>
        </div>

        {/* one-tap manual refresh from inside the app (iOS shortcuts:// scheme) */}
        <a href={`shortcuts://run-shortcut?name=${encodeURIComponent("The Lab: Steps")}`} style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:T.green, color:"#000",
          fontWeight:800, fontSize:14, padding:"12px 16px", borderRadius:10, textDecoration:"none", marginBottom:6 }}>
          🔄 Sync my steps now
        </a>
        <div style={{ fontSize:11, color:T.sub, textAlign:"center", lineHeight:1.5, marginBottom:16 }}>
          Tap this anytime to refresh (iPhone only). It runs the shortcut you built, so it must be named exactly <b>The Lab: Steps</b>.
        </div>

        {/* how you keep it updated — Sync now is the only reliable path */}
        <div style={{ background:"rgba(0,200,5,.08)", borderRadius:12, padding:"14px 15px", margin:"0 0 14px" }}>
          <div style={{ fontSize:14.5, fontWeight:800, color:T.ink, marginBottom:6 }}>Keeping it updated 🔄</div>
          <div style={{ fontSize:12, color:T.sub, lineHeight:1.6 }}>
            Apple only lets apps read Health while your iPhone is <b style={{ color:T.ink }}>unlocked</b>, so there's no reliable way to sync in the
            background. Just tap <b style={{ color:T.ink }}>🔄 Sync now</b> whenever you open The Lab — it refills the <b style={{ color:T.ink }}>last 14 days</b> each
            time, so you never get gaps (and it never double-counts).
          </div>
        </div>
      </>)}
    </div>
  );
}

/* The Lab Pro upsell / status card. Payments are a later phase; for now it showcases
   the plan and reflects whether the account already has Pro (server-granted). */
function ProCard({ isPro }) {
  const feats = [
    ["🥗", "Nutrition & macros", "Full food log, macro goals, water tracking", true],
    ["🤖", "AI coach", "Auto weight progression + plateau alerts", false],
    ["🎨", "Themes & Pro badge", "Custom colors, app icon, and a PRO badge in groups", false],
  ];
  return (
    <div style={{ ...sCard, marginBottom:0 }}>
      {isPro ? (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <span style={{ fontSize:26 }}>✨</span>
          <div><div style={{ fontSize:15, fontWeight:800, color:T.green }}>You're a Pro member</div><div style={{ fontSize:12, color:T.sub }}>Thanks for supporting The Lab 🙏</div></div>
        </div>
      ) : (
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:16, fontWeight:800, color:T.ink, marginBottom:2 }}>✨ The Lab Pro</div>
          <div style={{ fontSize:12.5, color:T.sub, lineHeight:1.5 }}>Level up your training with premium tools.</div>
        </div>
      )}
      {feats.map(([ic,t,d,live])=>(
        <div key={t} style={{ display:"flex", gap:11, alignItems:"flex-start", padding:"9px 0", borderTop:`1px solid ${T.creamLine}` }}>
          <span style={{ fontSize:19, flexShrink:0 }}>{ic}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{t}
              {live ? <span style={{ fontSize:10, color:T.green, fontWeight:800, marginLeft:6, letterSpacing:.4 }}>{isPro?"UNLOCKED":"INCLUDED"}</span>
                    : <span style={{ fontSize:10, color:T.sub, fontWeight:800, marginLeft:6, letterSpacing:.4 }}>SOON</span>}
            </div>
            <div style={{ fontSize:12, color:T.sub, lineHeight:1.45 }}>{d}</div>
          </div>
        </div>
      ))}
      {!isPro && (<>
        <div style={{ display:"flex", gap:8, marginTop:14, marginBottom:10 }}>
          <div style={{ flex:1, background:T.input, border:`1px solid ${T.line}`, borderRadius:12, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:800, color:T.ink }}>$4<span style={{fontSize:12, color:T.sub, fontWeight:600}}>/mo</span></div>
            <div style={{ fontSize:11, color:T.sub }}>monthly</div>
          </div>
          <div style={{ flex:1, background:"rgba(0,200,5,.08)", border:`1px solid ${T.green}`, borderRadius:12, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:800, color:T.green }}>$25<span style={{fontSize:12, color:T.sub, fontWeight:600}}>/yr</span></div>
            <div style={{ fontSize:11, color:T.green, fontWeight:700 }}>save ~48%</div>
          </div>
        </div>
        <button disabled style={{ width:"100%", background:T.input, color:T.sub, border:`1px solid ${T.line}`, fontWeight:700, padding:"11px", borderRadius:10, fontSize:13.5 }}>
          💳 Payments coming soon
        </button>
      </>)}
    </div>
  );
}

/* Cloud backups: Supabase keeps a snapshot of each day's starting state (~30 days,
   written by a database trigger — no app code can forget to do it). Works from ANY
   device, so a lost phone can't take your history with it. */
function CloudBackupsCard({ username, setData }) {
  const [rows, setRows] = useState(null); // null = loading
  const [err, setErr] = useState(null);
  const [confirmDay, setConfirmDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { (async () => {
    try { setRows(await listCloudBackups()); }
    catch (e) { setErr("Couldn't reach the cloud — check your connection."); setRows([]); }
  })(); }, []);
  const restore = async (day) => {
    setBusy(true); setErr(null);
    try {
      const v = await getCloudBackup(day);
      if (!v) throw new Error("empty");
      setData({ ...defaultData, ...migrateData(v, (username || "").toLowerCase()) });
      setConfirmDay(null); setDone(true);
    } catch { setErr("Couldn't load that backup — try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>☁️ In the cloud</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        A copy of each day's data, kept for 30 days — reachable from <b>any</b> device, even if
        this one is lost or wiped. Saved automatically; nothing for you to do.
      </div>
      {done && <div style={{ fontSize:12.5, color:T.green, fontWeight:700, marginBottom:8 }}>✅ Restored — check your log, then just keep using the app to save it.</div>}
      {err && <div style={{ fontSize:12.5, color:T.danger, marginBottom:8 }}>{err}</div>}
      {rows === null && <div className="skeleton" style={{ height:44, borderRadius:10 }} />}
      {rows !== null && !rows.length && !err && (
        <div style={{ fontSize:12.5, color:T.sub }}>No cloud backups yet — your first one appears after tomorrow's first change.</div>
      )}
      {(rows || []).map(r => (
        <div key={String(r.day)} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:`1px solid ${T.creamLine}`, fontSize:13 }}>
          <span style={{ fontWeight:700, minWidth:88 }}>{fmtDate(String(r.day))}</span>
          <span style={{ color:T.sub, flex:1 }}>{(r.sets||0) + (r.weighins||0) + (r.cardio||0)} entries</span>
          {confirmDay === r.day ? (<>
            <button disabled={busy} onClick={()=>restore(r.day)} style={{ background:T.dangerBg, color:T.danger, padding:"6px 12px", fontSize:12.5, fontWeight:700, opacity:busy?0.6:1 }}>{busy ? "Restoring…" : "Yes, restore this"}</button>
            <button disabled={busy} onClick={()=>setConfirmDay(null)} style={{ background:T.input, color:T.sub, padding:"6px 10px", fontSize:12.5, fontWeight:600 }}>Cancel</button>
          </>) : (
            <button onClick={()=>setConfirmDay(r.day)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Restore</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* Automatic on-device backups: the first save of each day snapshots your data (last 7
   days kept). Restoring loads that snapshot — and still goes through the big-delete
   guard, so a bad restore can't silently nuke anything either. */
function BackupsCard({ user, username, setData }) {
  const scan = () => {
    const pre = `lt-bk-${user.id}-`;
    return Object.keys(localStorage).filter(k => k.startsWith(pre)).sort().reverse()
      .map(k => { try { const d = JSON.parse(localStorage.getItem(k)); return { key:k, day:k.slice(pre.length),
        n:(d.log||[]).length + (d.bodyweight||[]).length + (d.cardio||[]).length }; } catch { return null; } })
      .filter(Boolean);
  };
  const [list] = useState(scan);
  const [confirmKey, setConfirmKey] = useState(null);
  const [done, setDone] = useState(false);
  const restore = (k) => {
    try {
      const raw = localStorage.getItem(k); if (!raw) return;
      setData({ ...defaultData, ...migrateData(JSON.parse(raw), (username||"").toLowerCase()) });
      setConfirmKey(null); setDone(true);
    } catch {}
  };
  return (
    <div style={{ ...sCard }}>
      <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:2 }}>📱 On this device</div>
      <div style={{ fontSize:12, color:T.sub, marginBottom:10 }}>
        The last 7 days you used the app here — works even offline. Restoring replaces what's
        loaded now (a big shrink still asks first). For a copy you keep yourself, the 📚 Library
        tab has full downloads under “Your data.”
      </div>
      {done && <div style={{ fontSize:12.5, color:T.green, fontWeight:700, marginBottom:8 }}>✅ Restored — check your log, then just keep using the app to save it.</div>}
      {!list.length && <div style={{ fontSize:12.5, color:T.sub }}>No snapshots yet — one is kept automatically the next time you log something.</div>}
      {list.map(b => (
        <div key={b.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:`1px solid ${T.creamLine}`, fontSize:13 }}>
          <span style={{ fontWeight:700, minWidth:88 }}>{fmtDate(b.day)}</span>
          <span style={{ color:T.sub, flex:1 }}>{b.n} entries</span>
          {confirmKey === b.key ? (<>
            <button onClick={()=>restore(b.key)} style={{ background:T.dangerBg, color:T.danger, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Yes, restore this</button>
            <button onClick={()=>setConfirmKey(null)} style={{ background:T.input, color:T.sub, padding:"6px 10px", fontSize:12.5, fontWeight:600 }}>Cancel</button>
          </>) : (
            <button onClick={()=>setConfirmKey(b.key)} style={{ background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"6px 12px", fontSize:12.5, fontWeight:700 }}>Restore</button>
          )}
        </div>
      ))}
    </div>
  );
}

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
const BIG_LIFTS = ["Bench Press","Incline Bench Press","Incline Dumbbell Press","Back Squat","Deadlift","Overhead Press"];
const LIFT_SHORT = { "Bench Press":"Bench", "Incline Bench Press":"Inc Bench", "Incline Dumbbell Press":"Inc DB", "Back Squat":"Squat", "Deadlift":"Dead", "Overhead Press":"OHP" };
const BIG_LIFT_SET = new Set(BIG_LIFTS);
/* High-rep sets don't give a trustworthy estimated 1RM. Cap the reps that count:
   the competitive "big lifts" cut off at 12, everything else is more lenient at 15. */
const REP_CAP = (exercise) => (BIG_LIFT_SET.has(exercise) ? 12 : 15);
/* Best estimated 1RM for one exercise from its logged entries, ignoring sets whose
   reps exceed the cap (a 30-rep set shouldn't crown anyone). null if nothing qualifies. */
const bestEst1RM = (exercise, entries) => {
  const cap = REP_CAP(exercise);
  const vals = (entries || [])
    .filter(e => e.weight != null && (e.reps || 0) >= 1 && (e.reps || 0) <= cap)
    .map(e => e1rm(e.weight, e.reps));
  return vals.length ? Math.max(...vals) : null;
};

/* End-of-month recap: pops up once per group each month with everyone's
   average weigh-in for the month that just finished (+ their goal). */
function MonthlyRecapModal({ recap, groupName, emoji, onClose }) {
  const units = useUnit();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // you first, then heaviest movers-toward-goal feel natural — but keep it simple & friendly: you first, then alphabetical
  const rows = [...recap.rows].sort((a, b) =>
    a.isYou ? -1 : b.isYou ? 1 : a.username.localeCompare(b.username));

  const CONF = ["#00C805", "#E9C46A", "#F4D58D", "#FFFFFF", "#8fe3a0"];
  const confetti = Array.from({ length: 16 }, (_, i) => ({
    left: `${(i * 6.3 + 4) % 100}%`,
    bg: CONF[i % CONF.length],
    delay: `${(i % 6) * 0.15}s`,
    dur: `${1.5 + (i % 5) * 0.35}s`,
  }));

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.72)", backdropFilter:"blur(3px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
      animation:"fadeSwap .2s ease-out both",
    }}>
      <div onClick={e=>e.stopPropagation()} className="recap-card" style={{
        position:"relative", overflow:"hidden", width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto",
        background:T.card, border:`1px solid ${T.creamLine}`, borderRadius:20,
        padding:"0 0 18px", boxShadow:"0 24px 70px rgba(0,0,0,.6)",
      }}>
        {/* confetti burst */}
        <div style={{position:"absolute", inset:"0 0 auto 0", height:150, pointerEvents:"none", overflow:"hidden"}}>
          {confetti.map((c, i) => (
            <span key={i} className="conf" style={{ left:c.left, background:c.bg, animationDelay:c.delay, animationDuration:c.dur }} />
          ))}
        </div>

        {/* header with gradient strip */}
        <div style={{
          padding:"22px 20px 16px", textAlign:"center", position:"relative",
          background:"linear-gradient(180deg, rgba(0,200,5,.10), rgba(233,196,106,.05) 60%, transparent)",
          borderBottom:`1px solid ${T.line}`,
        }}>
          <div style={{fontSize:34, lineHeight:1, marginBottom:8}}>📊</div>
          <div className="recap-title" style={{fontSize:25, fontWeight:800, letterSpacing:".2px"}}>{recap.monthLabel} Recap</div>
          <div style={{fontSize:12.5, color:T.sub, marginTop:5}}>
            {emoji ? emoji + " " : ""}{groupName} · everyone's monthly weigh-in average
          </div>
        </div>

        {/* member rows */}
        <div style={{padding:"12px 14px 4px", display:"flex", flexDirection:"column", gap:9}}>
          {rows.map((r, i) => {
            const avg = dispW(r.avgLb, units);
            const change = r.prevLb != null ? dispW(r.avgLb - r.prevLb, units) : null;
            const goal = r.goalLb != null ? dispW(r.goalLb, units) : null;
            // direction relative to their goal (toward = good). No goal → neutral.
            let chDir = "neutral";
            if (change != null && r.goalLb != null) {
              const wantUp = r.goalLb > r.avgLb; // still need to gain
              chDir = change === 0 ? "neutral" : (change > 0) === wantUp ? "toward" : "away";
            }
            const chColor = chDir === "toward" ? T.green : chDir === "away" ? T.down : T.sub;
            const remain = goal != null ? Math.abs(dispW(r.goalLb - r.avgLb, units)) : null;
            const reached = goal != null && Math.abs(r.goalLb - r.avgLb) < 0.5;
            // progress toward goal for the mini bar (0..1) — needs a reference; use 8% band as "close"
            return (
              <div key={r.uid} className="recap-row" style={{
                animationDelay:`${0.12 + i * 0.07}s`,
                background:r.isYou ? "rgba(0,200,5,.08)" : T.input,
                border:`1px solid ${r.isYou ? "rgba(0,200,5,.35)" : T.line}`,
                borderRadius:14, padding:"11px 13px",
              }}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <div style={{
                    width:34, height:34, borderRadius:99, flexShrink:0,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background:r.isYou ? T.green : "rgba(255,255,255,.08)",
                    color:r.isYou ? "#000" : T.ink, fontWeight:800, fontSize:15,
                  }}>{r.username.slice(0,1).toUpperCase()}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14.5, fontWeight:700, color:T.ink, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                      {r.username}{r.isYou && <span style={{color:T.green, fontWeight:700}}> · you</span>}
                    </div>
                    <div style={{fontSize:11.5, color:T.sub, marginTop:1}}>monthly average</div>
                  </div>
                  <div style={{textAlign:"right", flexShrink:0}}>
                    <div style={{fontSize:20, fontWeight:800, color:T.ink, lineHeight:1.1}}>{avg}<span style={{fontSize:11.5, color:T.sub, fontWeight:600}}> {uLabel(units)}</span></div>
                    {change != null && (
                      <div style={{fontSize:12, fontWeight:700, color:chColor, marginTop:1}}>
                        {change > 0 ? "▲ +" : change < 0 ? "▼ " : "•  "}{change === 0 ? "0" : Math.abs(change)} vs prev
                      </div>
                    )}
                  </div>
                </div>
                {goal != null && (
                  <div style={{marginTop:9, display:"flex", alignItems:"center", gap:8}}>
                    <span className="chip" style={{background:reached ? T.green : T.mint, color:reached ? "#000" : T.green, fontSize:11.5, whiteSpace:"nowrap"}}>
                      🎯 {reached ? "Goal reached!" : `Goal ${goal} ${uLabel(units)}`}
                    </span>
                    {!reached && <span style={{fontSize:11.5, color:T.sub}}>{remain} {uLabel(units)} to go</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{padding:"10px 16px 0"}}>
          <button onClick={onClose} style={{width:"100%", padding:"13px", background:T.green, color:"#000", fontWeight:800, fontSize:15.5, borderRadius:12}}>
            Let's go 💪
          </button>
        </div>
      </div>
    </div>
  );
}

/* Read-only set history for a group member's profile — their FULL log (the data is
   already downloaded for the group screens, so this costs nothing extra). */
function MemberLog({ pdata, who }) {
  const units = useUnit();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  const full = useMemo(() => {
    const sortedL = [...(pdata.log || [])].sort((a,b)=>a.date.localeCompare(b.date)||(a.id||0)-(b.id||0)).reverse();
    const qq = q.trim().toLowerCase();
    return qq ? sortedL.filter(e => e.exercise.toLowerCase().includes(qq)) : sortedL;
  }, [pdata.log, q]);
  const searching = q.trim() !== "";
  const shown = searching ? full : full.slice(0, limit);
  if (!(pdata.log || []).length) return null;
  return (
    <div className="card">
      <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>📝 {who}'s set history</div>
      <input value={q} onChange={e=>{setQ(e.target.value); setLimit(30);}} placeholder="🔍 Filter by exercise…"
        autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{marginBottom:10}} />
      <div style={{overflowX:"auto"}}>
        <table><thead><tr><th>Date</th><th>Exercise</th><th>Set</th><th>Weight ({uLabel(units)})</th><th>Reps</th><th>Effort</th></tr></thead>
          <tbody>{shown.map(e => (
            <tr key={e.id || `${e.date}-${e.exercise}-${e.set}`}>
              <td>{e.date === todayStr() ? <span style={{color:"#00A804", fontWeight:800}}>Today</span> : fmtDate(e.date)}</td>
              <td>{e.exercise}</td><td>{e.set}</td>
              <td>{e.weight==null ? "BW" : dispW(e.weight, units)}{e.drops?.length ? <span style={{color:T.sub}}>{" ↘ "}{e.drops.map(dr=>dispW(dr.weight, units)).join(" ↘ ")}</span> : null}</td>
              <td>{e.reps}{e.drops?.length ? <span style={{color:T.sub}}>{" / "}{e.drops.map(dr=>dr.reps).join(" / ")}</span> : null}</td>
              <td style={{color:T.sub}}>{e.effort||""}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} style={{color:T.sub}}>No sets match that exercise.</td></tr>}
          </tbody></table>
      </div>
      {!searching && full.length > shown.length && (
        <div style={{display:"flex", gap:8, marginTop:12}}>
          <button onClick={()=>setLimit(l=>l+50)} style={{flex:1, background:T.input, color:T.ink, border:`1px solid ${T.line}`, padding:"10px", fontWeight:700, fontSize:13, borderRadius:10}}>
            Show more ({full.length - shown.length} older)
          </button>
          <button onClick={()=>setLimit(full.length)} style={{background:"none", color:T.sub, padding:"10px 14px", fontWeight:700, fontSize:13}}>Show all</button>
        </div>
      )}
    </div>
  );
}

/* Quick "cool facts" popup for a member's steps (opened from the group Steps board). */
function StepFactsModal({ name, isMe, map, rank, onClose }) {
  const m = map || {};
  const today = todayStr();
  const days = Object.keys(m);
  const total = days.reduce((s,d)=>s+m[d],0);
  let best=null; for (const d of days) if (!best || m[d]>best.count) best={date:d,count:m[d]};
  const thisWk = weekStart(today);
  let wkTotal=0, wkDays=0; for (const d of days) if (weekStart(d)===thisWk){ wkTotal+=m[d]; wkDays++; }
  const wkAvg = wkDays ? Math.round(wkTotal/wkDays) : 0;
  const last7=[]; for(let i=1;i<=7;i++){ const d=dAdd(today,-i); if(m[d]!=null) last7.push(m[d]); }
  const avg7 = last7.length ? Math.round(last7.reduce((a,b)=>a+b,0)/last7.length) : 0;
  const goalDays = days.filter(d=>m[d]>=10000).length;
  let streak=0; for(let i=1;i<400;i++){ const d=dAdd(today,-i); if(m[d]!=null && m[d]>=10000) streak++; else break; }
  const tiles = [
    [rank?`#${rank}`:"—", "this week's rank", rank===1],
    [wkTotal.toLocaleString(), "steps this week"],
    [wkAvg.toLocaleString(), "avg/day this week"],
    [avg7.toLocaleString(), "7-day average"],
    [best?best.count.toLocaleString():"—", best?`best day · ${fmtDate(best.date)}`:"best day"],
    [String(streak), "🔥 day 10k streak", streak>0],
    [goalDays.toLocaleString(), "days over 10k"],
    [stepsMiles(total), "miles logged (total)"],
  ];
  return (
    <div onClick={onClose} style={{position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeSwap .18s ease-out both"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.card, border:`1px solid ${T.line}`, borderRadius:18, padding:"20px 18px", maxWidth:380, width:"100%", animation:"calPop .26s cubic-bezier(.34,1.56,.64,1) both"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3}}>
          <div className="h" style={{fontSize:19, color:T.tealDk}}>👟 {name}{isMe?" (you)":""}</div>
          <button onClick={onClose} style={{background:T.input, color:T.sub, width:30, height:30, borderRadius:99, fontSize:14}}>✕</button>
        </div>
        <div style={{fontSize:12, color:T.sub, marginBottom:14}}>Step stats{rank===1?" — leading the group 👑":""}</div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          {tiles.map(([n,l,hot],i)=>(
            <div key={i} style={{background:T.input, borderRadius:12, padding:"11px 12px", border:`1px solid ${hot?T.green:T.line}`}}>
              <div style={{fontSize:19, fontWeight:800, color: hot?T.green:T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1.1}}>{n}</div>
              <div style={{fontSize:11, color:T.sub, marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [stepRange, setStepRange] = useState("W"); // group step board window: W | 1M | 6M | YTD | 1Y
  const [duels, setDuels] = useState([]); // all visible duels — for each member's profile duel record
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [feedN, setFeedN] = useState(null); // null = auto (3, or the whole latest day if bigger)
  const [recap, setRecap] = useState(null); // end-of-month recap popup: { pmKey, monthLabel, rows } | null
  const [profileTab, setProfileTab] = useState("lifting"); // sub-tab inside a member profile
  const [profileSteps, setProfileSteps] = useState(undefined); // open profile's step map (separate steps table)
  const [profileLastSync, setProfileLastSync] = useState(null); // open profile's last step sync time
  const [memberSteps, setMemberSteps] = useState({}); // user_id -> {day->count} auto steps (~1yr) for board + facts
  const [facts, setFacts] = useState(null); // steps "cool facts" popup: { uid, name } | null
  const savedActiveId = useRef(localStorage.getItem("lt-active-group")); // reopen last group after refresh
  const restoredGroup = useRef(false);
  const [dueling, setDueling] = useState(false); // challenge form open on a profile
  const [duelDays, setDuelDays] = useState("7");
  const [duelMsg, setDuelMsg] = useState("");
  const myName = user.user_metadata?.username || "you";
  const isOwner = active?.created_by === user.id;

  const startDuel = async () => {
    if (!profile) return;
    const n = Math.max(1, Math.min(365, parseInt(duelDays)||7));
    try { await createDuel(profile.user_id, myName, profile.username, todayStr(), dAdd(todayStr(), n-1));
      setDueling(false); setDuelMsg(`Duel started — ${n} day${n===1?"":"s"}! Track it in the 👟 Steps tab.`); }
    catch(e){ setDuelMsg("Couldn't start: " + String(e?.message||e)); }
  };

  // load the open profile's steps (they live in the `steps` table, not user_state)
  useEffect(() => {
    if (!profile) { setProfileSteps(undefined); setProfileLastSync(null); setProfileTab("lifting"); return; }
    setDueling(false); setDuelMsg("");
    let alive = true;
    (async () => {
      try { const s = await stepsFor([profile.user_id], dAdd(todayStr(), -5*365 - 40)); if (alive) setProfileSteps(s[profile.user_id] || {}); }
      catch { if (alive) setProfileSteps({}); }
      try { const t = await lastStepSync(profile.user_id); if (alive) setProfileLastSync(t); } catch {}
    })();
    return () => { alive = false; };
  }, [profile?.user_id]);

  // members' auto-synced steps for the group "this week" board
  useEffect(() => {
    if (!members?.length) { setMemberSteps({}); return; }
    let alive = true;
    (async () => {
      try { const s = await stepsFor(members.map(m=>m.user_id), dAdd(todayStr(), -5*365 - 40)); if (alive) setMemberSteps(s); }
      catch { if (alive) setMemberSteps({}); }
    })();
    return () => { alive = false; };
  }, [members]);

  // all duels involving anyone you can see — used for each person's duel record on their profile
  useEffect(() => {
    let alive = true;
    (async () => { try { const d = await listDuels(); if (alive) setDuels(d); } catch { /* table may be empty */ } })();
    return () => { alive = false; };
  }, [members]);

  /* A member's finished-duel record (wins–losses–ties), computed from step totals. */
  const duelRecord = (uid) => {
    const today = todayStr();
    let w=0, l=0, t=0;
    const sumRange = (map,s,e)=>{ let x=0; const m=map||{}; for (const d in m) if (d>=s && d<=e) x+=m[d]; return x; };
    for (const d of duels) {
      if (d.status !== "active") continue;          // pending/declined don't count
      if (d.a_id!==uid && d.b_id!==uid) continue;
      if (today <= d.end_day) continue; // only finished duels count toward the record
      const mine = sumRange(memberSteps[uid], d.start_day, d.end_day);
      const oId = d.a_id===uid ? d.b_id : d.a_id;
      const opp = sumRange(memberSteps[oId], d.start_day, d.end_day);
      if (mine>opp) w++; else if (opp>mine) l++; else t++;
    }
    return { w, l, t, total: w+l+t };
  };

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

  // remember which group you're in, and reopen it after a refresh
  useEffect(() => {
    if (active) localStorage.setItem("lt-active-group", active.id);
    else localStorage.removeItem("lt-active-group");
  }, [active]);
  useEffect(() => {
    if (restoredGroup.current || !groups?.length) return;
    restoredGroup.current = true;
    const id = savedActiveId.current;
    if (id) { const g = groups.find(x => x.id === id); if (g) setActive(g); }
  }, [groups]);

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
          p[g.id] = ms.map(m => ({ uid: m.user_id, username: m.username, last: la[m.user_id] || null }))
            .sort((a, b) => {
              if (a.uid === user.id) return -1;   // you always first
              if (b.uid === user.id) return 1;
              return (b.last || "").localeCompare(a.last || "");
            });
        }));
        setPreviews(p);
      } catch { /* previews are a bonus — group list works without them */ }
    })();
  }, [groups]);
  const agoTxt = (ts) => {
    if (!ts) return null;
    const mins = (Date.now() - new Date(ts).getTime()) / 6e4;
    if (mins < 1) return "now";
    if (mins < 60) return `${Math.floor(mins)}m`;
    const h = mins / 60;
    if (h < 24) return `${Math.floor(h)}h`;      // 23h, then rolls to 1d
    const d = h / 24;
    if (d < 7) return `${Math.floor(d)}d`;
    if (d < 30) return `${Math.floor(d / 7)}w`;
    return `${Math.floor(d / 30)}mo`;
  };

  useEffect(() => {
    if (!active) return;
    (async () => {
      setMembers(null); setStates({}); setReactions({}); setEmojiOpen(false); setFeedN(null); setRecap(null);
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

  /* end-of-month recap: once per group each month, everyone's avg weigh-in for the month that just ended */
  useEffect(() => {
    if (!active || !members || !members.length) return;
    const now = new Date();
    const km = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;      // month key for a JS (year, 0-based month)
    const pmKey = km(now.getFullYear(), now.getMonth() - 1);            // month that just finished
    const bmDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);  // one before that (for the ▲▼ change)
    const bmKey = km(bmDate.getFullYear(), bmDate.getMonth());
    let seen = false;
    try { seen = !!localStorage.getItem(`recap-${active.id}-${pmKey}`); } catch { /* private mode */ }
    if (seen) return;
    const avgFor = (bw, key) => { const rs = (bw || []).filter(r => monthKey(r.date) === key); return rs.length ? rs.reduce((s, r) => s + r.weight, 0) / rs.length : null; };
    const rows = members.map(m => {
      const st = states[m.user_id]; if (!st) return null;
      const avgLb = avgFor(st.bodyweight, pmKey);
      if (avgLb == null) return null; // no weigh-in that month → skip them
      return { uid: m.user_id, username: m.username, avgLb, prevLb: avgFor(st.bodyweight, bmKey), goalLb: st.profile?.goalWeight || null, isYou: m.user_id === user.id };
    }).filter(Boolean);
    if (!rows.length) return;
    setRecap({ pmKey, monthLabel: monthLabel(pmKey), rows });
  }, [active?.id, members, states, user.id]);

  const closeRecap = () => {
    if (recap && active) { try { localStorage.setItem(`recap-${active.id}-${recap.pmKey}`, "1"); } catch { /* ignore */ } }
    setRecap(null);
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
      const bestSoFar = {}; const prsByDate = {}; const byDate = {}; const seenCount = {};
      for (const e of sorted) {
        (byDate[e.date] ||= []).push(e);
        const isBW = exType[e.exercise] === "Bodyweight";
        const score = isBW ? e.reps : e1rm(e.weight || 0, e.reps);
        // PRs only get celebrated once a lift is established (first 5 sets don't count —
        // otherwise every early session is a "PR" and the chip means nothing)
        if (bestSoFar[e.exercise] != null && score > bestSoFar[e.exercise] && (seenCount[e.exercise] || 0) >= 5) {
          (prsByDate[e.date] ||= []).push(isBW ? `${e.exercise} ${e.reps} reps` : `${e.exercise} ${dispW(e.weight,units)}×${e.reps}`);
        }
        bestSoFar[e.exercise] = Math.max(bestSoFar[e.exercise] ?? -1, score);
        seenCount[e.exercise] = (seenCount[e.exercise] || 0) + 1;
      }
      for (const [date, entries] of Object.entries(byDate)) {
        const names = [...new Set(entries.map(e=>e.exercise))];
        evs.push({ key:`${m.user_id}-${date}-lift`, date, user:m.username, kind:"lift",
          sets: entries.length, names: names.slice(0,3), more: Math.max(0, names.length-3),
          prs: [...new Set(prsByDate[date] || [])] });
      }
      for (const c of (st.cardio || [])) {
        const txt = c.steps ? `${c.steps.toLocaleString()} steps — ${c.activity}` : `${c.duration} min ${c.activity}`;
        evs.push({ key:`${m.user_id}-${c.id}-cardio`, date:c.date, user:m.username, kind:"cardio",
          icon: c.steps ? "👣" : "🏃", text: txt });
      }
    }
    // step moments (from the steps table): new record (>10k only), goal hit, whole-squad
    const syncedPerDay = {};
    for (const m of members) {
      const mp = memberSteps[m.user_id] || {}; const days = Object.keys(mp); if (!days.length) continue;
      let best = -1, bestDate = null;
      for (const d of days) { syncedPerDay[d] = (syncedPerDay[d] || 0) + 1; if (mp[d] > best) { best = mp[d]; bestDate = d; } }
      if (best >= 10000 && bestDate)
        evs.push({ key:`${m.user_id}-${bestDate}-rec`, date:bestDate, user:m.username, kind:"step", icon:"🔥", text:`set a new step record — ${best.toLocaleString()} steps` });
      let latestGoal = null;
      for (const d of days) if (mp[d] >= 10000 && (!latestGoal || d > latestGoal)) latestGoal = d;
      if (latestGoal && latestGoal !== bestDate)
        evs.push({ key:`${m.user_id}-${latestGoal}-goal`, date:latestGoal, user:m.username, kind:"step", icon:"🎯", text:`hit their 10k goal — ${mp[latestGoal].toLocaleString()} steps` });
    }
    if (members.length >= 2) {
      const full = Object.keys(syncedPerDay).filter(d => syncedPerDay[d] === members.length).sort();
      const d = full[full.length - 1];
      if (d) evs.push({ key:`squad-${d}`, date:d, kind:"step", squad:true, icon:"🎉", user:"", text:"Everyone in the group logged their steps" });
    }
    return evs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 25);
  }, [members, states, memberSteps, units]);

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

  /* steps leaderboard — this week's total per member (only shown if anyone logged steps) */
  const stepBoard = useMemo(() => {
    if (!members) return { rows: [], total: 0, since: "", label: "", sub: "" };
    const today = todayStr();
    let since, label, sub;
    if      (stepRange === "W")   { since = weekStart(today);          label = "This week";  sub = "since Monday"; }
    else if (stepRange === "1M")  { since = dAdd(today, -29);          label = "Past month"; sub = "last 30 days"; }
    else if (stepRange === "6M")  { since = dAdd(today, -181);         label = "6 months";   sub = "last 6 months"; }
    else if (stepRange === "YTD") { since = today.slice(0,4)+"-01-01"; label = "This year";  sub = "since Jan 1"; }
    else if (stepRange === "1Y")  { since = dAdd(today, -364);         label = "Past year";  sub = "last 12 months"; }
    else                          { since = dAdd(today, -5*365);       label = "Past 5 years"; sub = "last 5 years"; }
    const rows = members.map(m => {
      const mp = memberSteps[m.user_id] || {};
      let total = 0, days = 0;
      for (const d in mp) if (d >= since && d <= today) { total += mp[d]; days++; }
      return { user: m.username, uid: m.user_id, total, avg: days ? Math.round(total/days) : 0 };
    }).filter(r => r.total > 0).sort((a,b)=>b.total - a.total);
    const total = rows.reduce((s,r)=>s+r.total, 0);
    // fun "group journey": combined miles walked + a playful real-world equivalent.
    const miles = total * 0.762 / 1609.34; // ~0.762 m per step
    const eq = miles >= 500 ? `≈ ${(miles/2789).toFixed(miles/2789>=1?1:2)}× across the USA 🇺🇸`
      : miles >= 26.2 ? `≈ ${Math.round(miles/26.2)} marathon${Math.round(miles/26.2)===1?"":"s"} 🏅`
      : miles >= 1 ? `${Math.round(total*0.762)} m together` : "";
    return { rows, total, since, label, sub, miles, eq };
  }, [members, memberSteps, stepRange]);

  const strength = useMemo(() => {
    if (!members) return { rows: [], best: {} };
    const rows = members.map(m => {
      const st = states[m.user_id] || {};
      const lifts = {};
      for (const lift of BIG_LIFTS) {
        const entries = (st.log || []).filter(e => e.exercise === lift);
        const best = bestEst1RM(lift, entries);
        lifts[lift] = best != null ? Math.round(best) : null;
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
    let sessionsBest=null, setsBest=null, prBest=null, streakBest=null, weekMost=null, cardioLong=null;
    for (const m of members) {
      const st = states[m.user_id]; if (!st) continue;
      const trainDays = new Set([...(st.log||[]).map(e=>e.date), ...(st.cardio||[]).map(e=>e.date)]);
      if (trainDays.size > 0 && (!sessionsBest || trainDays.size > sessionsBest.v))
        sessionsBest = { v:trainDays.size, text:`${trainDays.size} sessions`, who:m.username };
      const setCount = (st.log || []).length;
      if (setCount > 0 && (!setsBest || setCount > setsBest.v))
        setsBest = { v:setCount, text:`${setCount.toLocaleString()} sets`, who:m.username };
      // biggest all-time estimated-1RM across the big lifts (progress, not just who's heaviest today).
      // Uses the rep cap so a 30-rep burnout set can't fake a huge 1RM.
      let top1rm = 0, top1rmLift = "";
      for (const lift of BIG_LIFTS) {
        const est = bestEst1RM(lift, (st.log || []).filter(e => e.exercise === lift));
        if (est != null && est > top1rm) { top1rm = est; top1rmLift = lift; }
      }
      if (top1rm > 0 && (!prBest || top1rm > prBest.v))
        prBest = { v:top1rm, text:`${Math.round(dispW(top1rm,units)).toLocaleString()} ${uLabel(units)} ${LIFT_SHORT[top1rmLift]||top1rmLift}`, who:m.username };
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
      sessionsBest && { icon:"📈", label:"Most sessions logged", ...sessionsBest },
      setsBest     && { icon:"🧱", label:"Most sets logged", ...setsBest },
      prBest       && { icon:"🏆", label:"Top estimated 1RM", ...prBest },
      streakBest   && { icon:"🔥", label:"Longest streak", ...streakBest },
      weekMost     && { icon:"📅", label:"Most workout days in a week", ...weekMost },
      cardioLong   && { icon:"🏃", label:"Longest cardio", ...cardioLong },
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
      {/* always-reachable floating back button, so you don't have to scroll up */}
      <button className="profile-back-fab" onClick={()=>setProfile(null)} title="Back to group" style={{
        background:T.green, color:"#000", fontWeight:800, fontSize:14, padding:"11px 18px", borderRadius:99,
        border:"none", boxShadow:"0 8px 24px rgba(0,0,0,.5)",
      }}>← Back</button>
      <div className="card" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div className="h" style={{fontSize:19, color:T.tealDk}}>💪 {profile.username}</div>
        <span className="chip" style={{background:T.mint, color:T.green}}>read-only</span>
      </div>
      {!pdata ? (
        <div className="card" style={{color:T.sub}}>They haven't logged anything yet.</div>
      ) : (() => {
        // Sub-tabs: Lifting + Steps always; Macros only when nutrition is unlocked (built,
        // hidden for everyone else — the layout already accounts for it).
        const ptabs = [["lifting","Lifting","🏋️"], ["steps","Steps","👟"], ...(nutritionOn ? [["macros","Macros","🥗"]] : [])];
        const tab = ptabs.some(t=>t[0]===profileTab) ? profileTab : "lifting";
        return (<>
          <div className="card" style={{padding:6, marginBottom:14}}>
            <div style={{display:"flex", gap:4}}>
              {ptabs.map(([id,label,icon])=>(
                <button key={id} onClick={()=>setProfileTab(id)} style={{flex:1, padding:"9px 0", borderRadius:8, fontWeight:800, fontSize:13,
                  background: tab===id?T.green:"none", color: tab===id?"#000":T.sub}}>{icon} {label}</button>
              ))}
            </div>
          </div>

          {tab==="lifting" && (<>
            <Dashboard data={pdata} exMap={pexMap} setData={()=>{}} own={false} />
            <RecordsTab data={pdata} exMap={pexMap} />
            <MemberLog pdata={pdata} who={profile.username} />
            <GoalCard data={pdata} setData={()=>{}} current={bw.length ? bw[bw.length-1] : null} rows={bw}
              readOnly who={`${profile.username} hasn't`} />
            <div className="card" style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center"}}>
              <div><div style={kpiN}>{bw.length ? dispW(bw[bw.length-1].weight, units) : "—"}</div><div style={kpiL}>Body wt ({uLabel(units)})</div></div>
              <div><div style={kpiN}>{bw.length ? (b=>{const c=dispW(bw[bw.length-1].weight-bw[0].weight, units); return (c>0?"+":"")+c;})() : "—"}</div><div style={kpiL}>Change ({uLabel(units)})</div></div>
              <div><div style={kpiN}>{pdata.cardio.length}</div><div style={kpiL}>Cardio sessions</div></div>
            </div>
            {recentCardio.length > 0 && (
              <div className="card">
                <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:8}}>Recent cardio</div>
                <table><thead><tr><th>Date</th><th>Activity</th><th style={{textAlign:"center"}}>Min</th><th style={{textAlign:"center"}}>Cal</th></tr></thead>
                  <tbody>{recentCardio.map(e=>(
                    <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.activity}</td><td style={{textAlign:"center"}}>{e.duration}</td><td style={{textAlign:"center"}}>{e.calories ?? "—"}</td></tr>
                  ))}</tbody></table>
              </div>
            )}
          </>)}

          {tab==="steps" && (<>
            {profile.user_id !== user.id && (
              <div className="card">
                {!dueling && !duelMsg && (
                  <button onClick={()=>{ setDuelDays("7"); setDueling(true); }} style={{width:"100%", background:T.green, color:"#000", fontWeight:800, padding:"11px", borderRadius:10, fontSize:14}}>⚔️ Challenge {profile.username} to a step duel</button>
                )}
                {dueling && (
                  <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap"}}>
                    <label style={{...lbl, flex:1, minWidth:120}}>Length (days)<input type="number" inputMode="numeric" value={duelDays} onChange={e=>setDuelDays(e.target.value)} /></label>
                    <button onClick={startDuel} style={{background:T.green, color:"#000", fontWeight:800, padding:"11px 16px"}}>Start ⚔️</button>
                    <button onClick={()=>setDueling(false)} style={{background:T.input, color:T.sub, padding:"11px 13px"}}>Cancel</button>
                  </div>
                )}
                {duelMsg && <div style={{fontSize:13, color:T.green, fontWeight:700}}>{duelMsg}</div>}
              </div>
            )}
            {profileLastSync && (
              <div className="card" style={{display:"flex", alignItems:"center", gap:9, padding:"11px 14px"}}>
                <span style={{fontSize:16}}>🕐</span>
                <span style={{fontSize:13, color:T.sub}}>Last synced <b style={{color:T.ink}}>{stepRel(profileLastSync)}</b></span>
              </div>
            )}
            {(() => {
              const rec = duelRecord(profile.user_id);
              if (!rec.total) return null;
              const wr = Math.round(rec.w / rec.total * 100);
              return (
                <div className="card" style={{display:"flex", alignItems:"center", gap:12, padding:"12px 15px"}}>
                  <span style={{fontSize:22}}>⚔️</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, color:T.sub, fontWeight:600}}>Step duel record</div>
                    <div style={{fontSize:17, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums"}}>
                      {rec.w}<span style={{color:T.sub, fontWeight:600}}>W</span> – {rec.l}<span style={{color:T.sub, fontWeight:600}}>L</span>{rec.t ? <> – {rec.t}<span style={{color:T.sub, fontWeight:600}}>T</span></> : null}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:20, fontWeight:800, color: wr>=50?T.green:T.sub}}>{wr}%</div>
                    <div style={{fontSize:10.5, color:T.sub}}>win rate</div>
                  </div>
                </div>
              );
            })()}
            {profileSteps === undefined ? <div className="card"><div className="skeleton" style={{height:220, borderRadius:12}} /></div>
            : (() => {
                const mg = mergeSteps(profileSteps, pdata.cardio);
                return Object.keys(mg.map).length
                  ? <StepRingChart map={mg.map} goal={10000} meta={mg.meta} />
                  : <div className="card" style={{textAlign:"center", color:T.sub, padding:"26px 16px"}}><div style={{fontSize:34, marginBottom:8}}>👟</div>{profile.username} hasn't logged any steps yet.</div>;
              })()}
          </>)}

          {tab==="macros" && nutritionOn && (
            (pdata.foods || []).length > 0
              ? <MacroCalendar data={pdata} title={`🥗 ${profile.username}'s nutrition`} />
              : <div className="card" style={{color:T.sub}}>No nutrition logged yet.</div>
          )}
        </>);
      })()}
    </>);
  }

  /* ---- group view ---- */
  if (active) {
    return (<>
      {recap && <MonthlyRecapModal recap={recap} groupName={active.name} emoji={active.emoji} onClose={closeRecap} />}
      {facts && <StepFactsModal name={facts.name} isMe={facts.uid===user.id} map={memberSteps[facts.uid]} rank={(stepBoard.rows.findIndex(r=>r.uid===facts.uid)+1) || null} onClose={()=>setFacts(null)} />}
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
      {!members && (
        <div className="card">
          <div className="skeleton" style={{height:16, width:"45%", borderRadius:6, marginBottom:12}} />
          <div className="skeleton" style={{height:52, borderRadius:10, marginBottom:9}} />
          <div className="skeleton" style={{height:52, borderRadius:10, marginBottom:9}} />
          <div className="skeleton" style={{height:52, borderRadius:10}} />
        </div>
      )}

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
                {ev.kind==="step" && ev.squad
                  ? <><b style={{color:T.green}}>{ev.icon} {ev.text}</b></>
                  : <><b>{ev.user}</b>{" "}
                      {ev.kind==="step" ? <>{ev.icon} {ev.text}</>
                        : ev.kind==="cardio" ? <>{ev.icon||"🏃"} {ev.text}</>
                        : <>logged {ev.sets} set{ev.sets===1?"":"s"} — {ev.names.join(", ")}{ev.more>0?` +${ev.more} more`:""}</>}
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
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏁 This week</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:6}}>Workouts Mon–Sun{streaksOn ? " · 🔥 = week streak" : ""}.</div>
          {consistency.map((r,i)=>{
            const isMe = r.uid===user.id;
            return (
              <div key={r.uid} style={{display:"flex", alignItems:"center", gap:9, padding:"10px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
                <span style={{width:22, textAlign:"center", fontWeight:800, fontSize:14, color: i===0&&r.workouts>0?T.green:T.sub}}>{i===0&&r.workouts>0?"👑":i+1}</span>
                <span style={{flex:1, minWidth:0, fontWeight:isMe?800:600, color:isMe?T.green:T.ink, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.user}{isMe?" (you)":""}</span>
                <span style={{width:70, display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
                  <span style={{flex:1, height:6, background:T.input, borderRadius:99, overflow:"hidden"}}>
                    <span style={{display:"block", width:`${Math.min(r.workouts,7)/7*100}%`, height:"100%", background:T.green, borderRadius:99}} />
                  </span>
                  <b style={{color: r.workouts>0?T.green:T.sub, fontSize:13, width:12, textAlign:"right"}}>{r.workouts}</b>
                </span>
                {streaksOn && <span style={{width:38, textAlign:"center", fontSize:13, fontWeight:700, color: r.streak>0?T.ink:T.sub, flexShrink:0}}>{r.streak>0?`🔥${r.streak}`:"—"}</span>}
                <button onClick={()=>setProfile(members.find(m=>m.user_id===r.uid))} style={{background:"none", color:T.green, fontSize:12.5, fontWeight:700, padding:"4px 4px", whiteSpace:"nowrap", flexShrink:0}}>View ›</button>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:10}}>
            <div className="h" style={{fontSize:17, color:T.tealDk}}>👣 Group steps</div>
            <div style={{display:"flex", gap:2, background:T.input, borderRadius:99, padding:3, flexShrink:0}}>
              {["W","1M","6M","YTD","1Y","5Y"].map(rg=>(
                <button key={rg} onClick={()=>setStepRange(rg)} style={{
                  border:"none", cursor:"pointer", fontSize:11, fontWeight:700, padding:"4px 7px", borderRadius:99,
                  background: stepRange===rg ? T.green : "transparent", color: stepRange===rg ? "#000" : T.sub }}>{rg}</button>
              ))}
            </div>
          </div>

          {/* group "journey" — everyone's steps combined into one fun number */}
          {stepBoard.total > 0 && (
            <div style={{display:"flex", alignItems:"center", gap:11, background:"linear-gradient(100deg,rgba(0,200,5,.10),rgba(0,200,5,.02))",
              border:`1px solid ${T.line}`, borderRadius:14, padding:"11px 14px", marginBottom:10}}>
              <span style={{fontSize:24}}>🌍</span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:18, fontWeight:800, color:T.ink, fontVariantNumeric:"tabular-nums", lineHeight:1.1}}>{stepBoard.total.toLocaleString()} <span style={{fontSize:12, fontWeight:600, color:T.sub}}>steps together</span></div>
                <div style={{fontSize:12, color:T.green, fontWeight:700}}>{Math.round(stepBoard.miles).toLocaleString()} mi {stepBoard.eq ? `· ${stepBoard.eq}` : ""}</div>
              </div>
            </div>
          )}

          {stepBoard.rows.length === 0 ? (
            <div style={{fontSize:13, color:T.sub, padding:"6px 2px"}}>No steps logged in this range yet.</div>
          ) : stepBoard.rows.map((r,i)=>{
            const top = stepBoard.rows[0].total || 1;
            const isMe = r.uid===user.id;
            return (
              <button key={r.uid} onClick={()=>setFacts({ uid:r.uid, name:r.user })} title={`${r.avg.toLocaleString()} steps/day average`}
                style={{width:"100%", textAlign:"left", background:"none", display:"flex", alignItems:"center", gap:9, padding:"9px 2px", borderTop: i===0?"none":`1px solid ${T.creamLine}`}}>
                <span style={{width:20, textAlign:"center", fontWeight:800, fontSize:13, color: i===0?T.green:T.sub}}>{i===0?"👑":i+1}</span>
                <span style={{width:82, flexShrink:0, fontSize:13.5, fontWeight: isMe?800:600, color: isMe?T.green:T.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.user}{isMe?" (you)":""}</span>
                <span style={{flex:1, height:8, background:T.input, borderRadius:99, overflow:"hidden"}}>
                  <span style={{display:"block", width:`${r.total/top*100}%`, height:"100%", background:T.green, borderRadius:99, transition:"width .5s ease"}} />
                </span>
                <span style={{textAlign:"right", flexShrink:0, minWidth:64}}>
                  <b style={{fontSize:13, color:T.ink, display:"block", fontVariantNumeric:"tabular-nums"}}>{r.total.toLocaleString()}</b>
                  <span style={{fontSize:10.5, color:T.sub}}>{r.avg.toLocaleString()}/day</span>
                </span>
              </button>
            );
          })}
        </div>

        <DuelsCard user={user} all={memberSteps} nameOf={Object.fromEntries((members||[]).map(m=>[m.user_id,m.username]))} myId={user.id} myName={myName} />

        <div className="card">
          <div className="h" style={{fontSize:17, color:T.tealDk, marginBottom:2}}>🏋️ Strength — best est. 1RM ({uLabel(units)})</div>
          <div style={{fontSize:12, color:T.sub, marginBottom:8}}>Green = group best.</div>
          <div style={{overflowX:"auto"}}>
            <table><thead><tr><th>Member</th>{BIG_LIFTS.map(l=><th key={l} style={{textAlign:"center"}}>{LIFT_SHORT[l]}</th>)}</tr></thead>
              <tbody>{strength.rows.map(r=>(
                <tr key={r.uid}>
                  <td style={{fontWeight: r.uid===user.id?700:400}}>{r.user}</td>
                  {BIG_LIFTS.map(l=>(
                    <td key={l} style={{ textAlign:"center", color: r.lifts[l] && r.lifts[l]===strength.best[l] ? T.green : T.ink, fontWeight: r.lifts[l] && r.lifts[l]===strength.best[l] ? 700 : 400 }}>
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
      {groups === null && (
        <div style={{display:"flex", flexDirection:"column", gap:9}}>
          <div className="skeleton" style={{height:64, borderRadius:12}} />
          <div className="skeleton" style={{height:64, borderRadius:12}} />
        </div>
      )}
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
                {mem.slice(0,4).map(m=>`${m.uid===user.id?"you":m.username}${agoTxt(m.last)?` (${agoTxt(m.last)})`:""}`).join(", ")}
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




