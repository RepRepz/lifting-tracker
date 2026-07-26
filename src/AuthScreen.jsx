import { useEffect, useRef, useState } from "react";
import { supabase, resetPasswordWithBackupCode } from "./lib/storage.js";
import { LegalModal } from "./Legal.jsx";

const C = {
  teal: "#00C805", btn: "#00C805", head: "#FFFFFF",
  bg: "#000000", card: "#0C0D0D", input: "#111213",
  ink: "#FFFFFF", sub: "#8C8F90", line: "#222527",
  danger: "#FF5000", dangerBg: "#2A1105",
};
const MIN_PASSWORD = 10;
const USER_RE = /^[a-z0-9_]{3,20}$/;
const CAPTCHA_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
const PUBLIC_SIGNUPS_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === "true";
const legacyEmailFor = (username) => `${username}@lifting.local`;
const authEmailFor = (identifier) => identifier.includes("@") ? identifier : legacyEmailFor(identifier);
const lbl = { display:"block", fontSize:12.5, fontWeight:600, color:"#A9BDBA", marginBottom:4 };
const inp = { width:"100%", border:`1px solid ${C.line}`, borderRadius:8, padding:"11px 12px", fontSize:16,
  minHeight:44, background:C.input, color:C.ink, boxSizing:"border-box", WebkitAppearance:"none", appearance:"none" };

function Turnstile({ onToken }) {
  const host = useRef(null);
  useEffect(() => {
    if (!CAPTCHA_SITE_KEY) return;
    let widget;
    const render = () => {
      if (!host.current || !window.turnstile) return;
      widget = window.turnstile.render(host.current, {
        sitekey: CAPTCHA_SITE_KEY,
        theme: "dark",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    const existing = document.querySelector('script[data-the-lab-turnstile]');
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render, { once:true });
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; script.dataset.theLabTurnstile = "1";
      script.addEventListener("load", render, { once:true });
      document.head.appendChild(script);
    }
    return () => { if (widget != null && window.turnstile) window.turnstile.remove(widget); };
  }, [onToken]);
  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={host} style={{minHeight:66, marginTop:12, display:"grid", placeItems:"center"}} />;
}

function PasswordFields({ password, setPassword, confirm, setConfirm, show, setShow, label="Password" }) {
  return <>
    <label style={{...lbl, marginTop:12}}>{label}
      <div style={{display:"flex", gap:8}}>
        <input style={{...inp, flex:1}} type={show?"text":"password"} value={password}
          onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder={`${MIN_PASSWORD}+ characters`} />
        <button type="button" onClick={()=>setShow(v=>!v)} style={{border:`1px solid ${C.line}`, borderRadius:8, background:C.input, padding:"0 12px", color:C.sub}}>{show?"Hide":"Show"}</button>
      </div>
    </label>
    {setConfirm && <label style={{...lbl, marginTop:12}}>Confirm password
      <input style={inp} type={show?"text":"password"} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" />
    </label>}
  </>;
}

export function PasswordRecoveryScreen({ onDone }) {
  const [pw,setPw]=useState(""); const [pw2,setPw2]=useState(""); const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const save=async(e)=>{ e.preventDefault(); setError("");
    if(pw.length<MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if(pw!==pw2) return setError("The passwords don't match.");
    setBusy(true); try { const {error:err}=await supabase.auth.updateUser({password:pw}); if(err) throw err; onDone(); }
    catch(err){setError(String(err?.message||err));} finally{setBusy(false);} };
  return <AuthShell legal={null}><form onSubmit={save} style={cardStyle}>
    <div style={titleStyle}>Choose a new password</div>
    <div style={{fontSize:13,color:C.sub,lineHeight:1.5}}>Your email link was verified. Set the new password below.</div>
    <PasswordFields password={pw} setPassword={setPw} confirm={pw2} setConfirm={setPw2} show={show} setShow={setShow} label="New password" />
    {error&&<ErrorBox>{error}</ErrorBox>}
    <Submit busy={busy} label="Update password" />
  </form></AuthShell>;
}

function ErrorBox({children}) { return <div style={{background:C.dangerBg,color:C.danger,borderRadius:8,padding:"9px 12px",fontSize:13.5,marginTop:12}}>{children}</div>; }
function Submit({busy,label}) { return <button type="submit" disabled={busy} style={{width:"100%",marginTop:14,padding:12,border:0,borderRadius:24,background:C.btn,color:"#000",fontWeight:800,fontSize:16,opacity:busy ? 0.6 : 1}}>{busy?"One sec…":label}</button>; }
const cardStyle={background:C.card,border:`1px solid ${C.line}`,borderRadius:14,padding:22,width:"100%",maxWidth:400};
const titleStyle={fontSize:19,fontWeight:800,color:C.head,marginBottom:14};

function AuthShell({children,legal,setLegal}) {
  return <div style={{fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",background:C.bg,minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"calc(20px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))",color:C.ink}}>
    <div style={{fontWeight:900,fontSize:26,color:C.head,marginBottom:18}}>🏋️ THE LAB</div>
    {children}
    <div style={{marginTop:14,fontSize:12.5,color:C.sub,maxWidth:400,textAlign:"center",lineHeight:1.55}}>
      🔒 Your private account data stays private. Group sharing is controlled in Settings.
      {setLegal&&<div style={{marginTop:7}}><button onClick={()=>setLegal("privacy")} style={legalLink}>Privacy</button><span> · </span><button onClick={()=>setLegal("terms")} style={legalLink}>Terms</button></div>}
    </div>
    {legal&&<LegalModal page={legal} onClose={()=>setLegal(null)} />}
  </div>;
}
const legalLink={background:"none",padding:0,color:C.teal,textDecoration:"underline",fontSize:12.5};

export default function AuthScreen() {
  const [mode,setMode]=useState("signin");
  const [identifier,setIdentifier]=useState(""); const [username,setUsername]=useState(""); const [email,setEmail]=useState("");
  const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [backup,setBackup]=useState("");
  const [show,setShow]=useState(false); const [accepted,setAccepted]=useState(false); const [captcha,setCaptcha]=useState("");
  const [error,setError]=useState(""); const [info,setInfo]=useState(""); const [busy,setBusy]=useState(false); const [legal,setLegal]=useState(null);
  const switchMode=(next)=>{setMode(next);setError("");setInfo("");setPassword("");setConfirm("");setBackup("");setCaptcha("");};

  const submit=async(e)=>{e.preventDefault();setError("");setInfo("");setBusy(true);
    try {
      if(mode==="signin"){
        const id=identifier.trim().toLowerCase();
        if(!id.includes("@")&&!USER_RE.test(id)) throw new Error("Enter your email, or your existing username.");
        const {error:err}=await supabase.auth.signInWithPassword({email:authEmailFor(id),password,options:captcha?{captchaToken:captcha}:undefined});
        if(err) throw err;
      } else if(mode==="signup") {
        if(!PUBLIC_SIGNUPS_ENABLED) throw new Error("Secure email signup is being activated. Existing members can still sign in.");
        const u=username.trim().toLowerCase(), mail=email.trim().toLowerCase();
        if(!USER_RE.test(u)) throw new Error("Username must be 3–20 lowercase letters, numbers, or underscores.");
        if(!/^\S+@\S+\.\S+$/.test(mail)||mail.endsWith("@lifting.local")) throw new Error("Enter a real email address.");
        if(password.length<MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
        if(password!==confirm) throw new Error("The passwords don't match.");
        if(!accepted) throw new Error("Read and accept the Privacy Policy and Terms first.");
        const {data,error:err}=await supabase.auth.signUp({email:mail,password,options:{data:{username:u},...(captcha?{captchaToken:captcha}:{})}});
        if(err) throw err;
        if(!data.session){switchMode("signin");setInfo("Check your email and tap the verification link, then sign in.");}
      } else if(mode==="forgot") {
        const id=identifier.trim().toLowerCase();
        if(id.includes("@")){
          const redirectTo=`${location.origin}${import.meta.env.BASE_URL}`;
          const {error:err}=await supabase.auth.resetPasswordForEmail(id,{redirectTo,...(captcha?{captchaToken:captcha}:{})});
          if(err) throw err;
          setInfo("If that email belongs to an account, a reset link is on the way.");
        } else {
          if(!USER_RE.test(id)) throw new Error("Enter your email, or your existing username.");
          setUsername(id); switchMode("backup");
        }
      } else if(mode==="backup") {
        if(password.length<MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
        if(password!==confirm) throw new Error("The passwords don't match.");
        const result=await resetPasswordWithBackupCode(username.trim().toLowerCase(),backup,password);
        if(!result.ok){
          if(result.code==="slow_down") throw new Error(`Too many attempts. Try again in about ${Math.max(1,Math.ceil((result.retry_after||30)/60))} minute(s).`);
          throw new Error("That username or backup code is not valid.");
        }
        switchMode("signin");setIdentifier(username);setInfo("Password updated. That backup code has been permanently used.");
      }
    } catch(err){const msg=String(err?.message||err);setError(/invalid login credentials/i.test(msg)?"Wrong sign-in details.":msg);}
    finally{setBusy(false);}
  };

  const title=mode==="signin"?"Sign in":mode==="signup"?"Create your profile":mode==="forgot"?"Forgot password":mode==="backup"?"Use a backup code":"Account";
  return <AuthShell legal={legal} setLegal={setLegal}><form onSubmit={submit} style={cardStyle}>
    <div style={titleStyle}>{title}</div>
    {info&&<div style={{background:"rgba(0,200,5,.12)",color:C.teal,borderRadius:8,padding:"9px 12px",fontSize:13.5,marginBottom:12,fontWeight:700}}>{info}</div>}

    {(mode==="signin"||mode==="forgot")&&<label style={lbl}>Email or existing username
      <input style={inp} value={identifier} onChange={e=>setIdentifier(e.target.value)} autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="you@email.com or dimi" />
    </label>}
    {mode==="signup"&&<>
      <label style={lbl}>Public username<input style={inp} value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="e.g. mike" /></label>
      <label style={{...lbl,marginTop:12}}>Email<input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="you@email.com" /></label>
    </>}
    {mode==="backup"&&<>
      <label style={lbl}>Existing username<input style={inp} value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} /></label>
      <label style={{...lbl,marginTop:12}}>Unused backup code<input style={inp} value={backup} onChange={e=>setBackup(e.target.value)} autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" /></label>
    </>}
    {(mode==="signin"||mode==="signup"||mode==="backup")&&<PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={mode==="signup"||mode==="backup"?setConfirm:null} show={show} setShow={setShow} label={mode==="backup"?"New password":"Password"} />}
    {mode==="signup"&&<label style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:12.5,color:C.sub,lineHeight:1.45,marginTop:13}}>
      <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} style={{marginTop:3}} />
      <span>I agree to the <button type="button" onClick={()=>setLegal("privacy")} style={legalLink}>Privacy Policy</button> and <button type="button" onClick={()=>setLegal("terms")} style={legalLink}>Terms</button>.</span>
    </label>}
    <Turnstile onToken={setCaptcha} />
    {error&&<ErrorBox>{error}</ErrorBox>}
    <Submit busy={busy} label={mode==="signin"?"Sign in":mode==="signup"?"Create profile":mode==="forgot"?"Continue":"Reset password"} />
    <div style={{marginTop:14,fontSize:13.5,color:C.sub,textAlign:"center",lineHeight:1.6}}>
      {mode==="signin"&&<>{PUBLIC_SIGNUPS_ENABLED?<>New here? <button type="button" onClick={()=>switchMode("signup")} style={legalLink}>Create a profile</button><span> · </span></>:<span style={{fontSize:12}}>Secure email signup is being activated · </span>}<button type="button" onClick={()=>switchMode("forgot")} style={legalLink}>Forgot password?</button></>}
      {mode==="forgot"&&<div style={{fontSize:12,marginBottom:8}}>Email accounts receive a private reset link. Existing username-only accounts use a saved one-time backup code.</div>}
      {mode!=="signin"&&<button type="button" onClick={()=>switchMode("signin")} style={legalLink}>Back to sign in</button>}
    </div>
  </form></AuthShell>;
}
