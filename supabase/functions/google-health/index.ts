import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_HEALTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET") || "";
const CRYPTO_SECRET = Deno.env.get("GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY") || "";
const APP_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://reprepz.github.io/lifting-tracker/";
const REDIRECT_URI = Deno.env.get("GOOGLE_HEALTH_REDIRECT_URI") || `${SUPABASE_URL}/functions/v1/google-health?callback=1`;
const SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
const HEART_SCOPE = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly";
const allowedOrigins = new Set(["https://reprepz.github.io", "http://localhost:4173", "http://localhost:5173"]);
const enc = new TextEncoder(), dec = new TextDecoder();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
const b64u = (v:Uint8Array) => btoa(String.fromCharCode(...v)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const unb64u = (v:string) => Uint8Array.from(atob(v.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(v.length/4)*4,"=")), c=>c.charCodeAt(0));
async function key(kind:"hmac"|"aes") { const raw=await crypto.subtle.digest("SHA-256",enc.encode(`${kind}:${CRYPTO_SECRET}`)); return crypto.subtle.importKey("raw",raw,{name:kind==="hmac"?"HMAC":"AES-GCM",hash:"SHA-256"} as any,false,kind==="hmac"?["sign","verify"]:["encrypt","decrypt"]); }
async function sign(payload:string) { return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",await key("hmac"),enc.encode(payload)))); }
async function seal(value:unknown) { const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key("aes"),enc.encode(JSON.stringify(value))); return `${b64u(iv)}.${b64u(new Uint8Array(ct))}`; }
async function open(value:string) {
  const [i,c]=value.split(".");
  const params={name:"AES-GCM",iv:unb64u(i)};
  try {
    return JSON.parse(dec.decode(await crypto.subtle.decrypt(params,await key("aes"),unb64u(c))));
  } catch {
    // The first dashboard deployment used SHA-256(secret) without a key prefix.
    const legacy=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",enc.encode(CRYPTO_SECRET)),"AES-GCM",false,["decrypt"]);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt(params,legacy,unb64u(c))));
  }
}
function json(origin:string, body:unknown, status=200) { return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}}); }
function go(result:string,message="") { const u=new URL(APP_URL); u.searchParams.set("google_health",result); if(message)u.searchParams.set("message",message); return Response.redirect(u.toString(),302); }
function configured() { return !!(CLIENT_ID&&CLIENT_SECRET&&CRYPTO_SECRET); }
function dayObject(s:string) { const [year,month,day]=s.split("-").map(Number); return {year,month,day}; }
function addDays(s:string,n:number) { const d=new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
async function tokenRequest(body:URLSearchParams) { const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}); const value=await r.json(); if(!r.ok)throw new Error(value.error_description||"Google token exchange failed."); return value; }
async function freshTokens(row:any) { let t=await open(row.encrypted_tokens); if(Date.now() < Number(t.expires_at||0)-60_000)return t; if(!t.refresh_token)throw new Error("Google access expired. Reconnect Google/Fitbit."); const next=await tokenRequest(new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:t.refresh_token,grant_type:"refresh_token"})); t={...t,...next,refresh_token:next.refresh_token||t.refresh_token,expires_at:Date.now()+Number(next.expires_in||3600)*1000}; await admin.from("google_health_connections").update({encrypted_tokens:await seal(t),updated_at:new Date().toISOString()}).eq("user_id",row.user_id); return t; }

Deno.serve(async req => {
  const url=new URL(req.url);
  if(url.searchParams.get("callback")==="1") {
    if(!configured())return go("error","Google Health is not configured.");
    try {
      const state=url.searchParams.get("state")||"", code=url.searchParams.get("code")||""; const [payload,sig]=state.split(".");
      if(!payload||!sig||!code||!(await crypto.subtle.verify("HMAC",await key("hmac"),unb64u(sig),enc.encode(payload))))throw new Error("Invalid Google sign-in state.");
      const value=JSON.parse(dec.decode(unb64u(payload))); if(value.exp<Date.now())throw new Error("Google sign-in expired. Try again.");
      const {data:row}=await admin.from("google_health_connections").select("state_nonce,state_expires_at").eq("user_id",value.uid).maybeSingle();
      if(!row||row.state_nonce!==value.nonce||new Date(row.state_expires_at).getTime()<Date.now())throw new Error("Google sign-in state was already used or expired.");
      const t=await tokenRequest(new URLSearchParams({code,client_id:CLIENT_ID,client_secret:CLIENT_SECRET,redirect_uri:REDIRECT_URI,grant_type:"authorization_code"}));
      if (!t.access_token) throw new Error("Google did not return an access token.");
      t.expires_at=Date.now()+Number(t.expires_in||3600)*1000;
      await admin.from("google_health_connections").update({encrypted_tokens:await seal(t),state_nonce:null,state_expires_at:null,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",value.uid);
      return go("connected");
    } catch(e) { return go("error",e instanceof Error?e.message:"Google connection failed."); }
  }
  const origin=req.headers.get("Origin")||"https://reprepz.github.io";
  if(!allowedOrigins.has(origin))return json("https://reprepz.github.io",{error:"Origin not allowed."},403);
  if(req.method==="OPTIONS")return json(origin,{ok:true}); if(req.method!=="POST")return json(origin,{error:"Method not allowed."},405);
  const auth=req.headers.get("Authorization")||""; const client=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await client.auth.getUser(); if(!user)return json(origin,{error:"Sign in again first."},401);
  const {action, historyDays, heart}=await req.json().catch(()=>({}));
  const {data:pro}=await client.rpc("my_pro_active");
  if(pro!==true)return json(origin,{error:"Pro required."},403);
  if(action==="status") {
    const {data,error}=await admin.from("google_health_connections").select("connected_at,last_sync_at").eq("user_id",user.id).maybeSingle();
    if(error)return json(origin,{error:"Connection status temporarily unavailable."},503);
    return json(origin,{configured:configured(),historyRanges:[30,90],heartAvailable:true,connected:!!data?.connected_at,lastSync:data?.last_sync_at||null});
  }
  if(!configured())return json(origin,{error:"Google Health is not configured yet."},503);
  if(action==="start") { const nonce=b64u(crypto.getRandomValues(new Uint8Array(24))), exp=Date.now()+10*60_000; await admin.from("google_health_connections").upsert({user_id:user.id,state_nonce:nonce,state_expires_at:new Date(exp).toISOString(),updated_at:new Date().toISOString()}); const payload=b64u(enc.encode(JSON.stringify({uid:user.id,nonce,exp}))); const state=`${payload}.${await sign(payload)}`; const q=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:"code",scope:heart===true?`${SCOPE} ${HEART_SCOPE}`:SCOPE,access_type:"offline",prompt:"consent",state}); return json(origin,{url:`https://accounts.google.com/o/oauth2/v2/auth?${q}`}); }
  if(action==="disconnect") {
    const {data:row}=await admin.from("google_health_connections").select("encrypted_tokens").eq("user_id",user.id).maybeSingle();
    if(row?.encrypted_tokens)try { const t=await open(row.encrypted_tokens); const token=t.refresh_token||t.access_token; if(token)await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"}}); } catch { /* local deletion still revokes The Lab's access */ }
    await admin.from("google_health_connections").delete().eq("user_id",user.id); return json(origin,{ok:true});
  }
  if(action==="heart") {
    const {data:row}=await admin.from("google_health_connections").select("*").eq("user_id",user.id).maybeSingle();
    if(!row?.encrypted_tokens)return json(origin,{permission:false});
    try {
      const saved=await open(row.encrypted_tokens);
      if(!String(saved.scope||"").split(/\s+/).includes(HEART_SCOPE))return json(origin,{permission:false});
      const t=await freshTokens(row);
      const today=new Date().toISOString().slice(0,10);
      const body={range:{start:{date:dayObject(addDays(today,-13)),time:{}},end:{date:dayObject(addDays(today,1)),time:{}}},windowSizeDays:1};
      const r=await fetch("https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints:dailyRollUp",{method:"POST",headers:{Authorization:`Bearer ${t.access_token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!r.ok)return json(origin,{error:"Heart rate could not be refreshed."},502);
      const value=await r.json();
      const points=(value.rollupDataPoints||[]).flatMap((p:any)=>{
        const d=p.civilStartTime?.date, bpm=Number(p.heartRate?.beatsPerMinuteAvg);
        if(!d || !Number.isFinite(bpm) || bpm<=0)return [];
        return [{day:[d.year,String(d.month).padStart(2,"0"),String(d.day).padStart(2,"0")].join("-"),bpm:Math.round(bpm)}];
      }).sort((a:any,b:any)=>a.day.localeCompare(b.day));
      return json(origin,{permission:true,points});
    } catch { return json(origin,{error:"Heart rate could not be refreshed."},502); }
  }
  if(action==="sync") {
    const {data:row}=await admin.from("google_health_connections").select("*").eq("user_id",user.id).maybeSingle(); if(!row?.encrypted_tokens)return json(origin,{error:"Connect Google/Fitbit first."},409);
    try { const t=await freshTokens(row); const today=new Date().toISOString().slice(0,10), start=addDays(today,1-([30,90].includes(historyDays)?historyDays:14)), end=addDays(today,1); const body={range:{start:{date:dayObject(start),time:{hours:0,minutes:0,seconds:0,nanos:0}},end:{date:dayObject(end),time:{hours:0,minutes:0,seconds:0,nanos:0}}},windowSizeDays:1}; const r=await fetch("https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp",{method:"POST",headers:{Authorization:`Bearer ${t.access_token}`,"Content-Type":"application/json"},body:JSON.stringify(body)}); const value=await r.json(); if(!r.ok)throw new Error(value?.error?.message||"Google Health sync failed."); const rows=(value.rollupDataPoints||[]).filter((p:any)=>p.steps).map((p:any)=>({user_id:user.id,day:`${p.civilStartTime.date.year}-${String(p.civilStartTime.date.month).padStart(2,"0")}-${String(p.civilStartTime.date.day).padStart(2,"0")}`,count:Number(p.steps.countSum||0),source:"google",updated_at:new Date().toISOString()})); if(rows.length){const {error}=await admin.from("steps").upsert(rows,{onConflict:"user_id,day"});if(error)throw error;} const now=new Date().toISOString(); await admin.from("google_health_connections").update({last_sync_at:now,updated_at:now}).eq("user_id",user.id); return json(origin,{ok:true,days:rows.length,lastSync:now}); } catch(e){return json(origin,{error:e instanceof Error?e.message:"Google Health sync failed."},502);}
  }
  return json(origin,{error:"Unknown action."},400);
});
