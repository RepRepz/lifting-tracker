import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://reprepz.github.io/lifting-tracker/";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("DELETE_EMAIL_FROM") || "";
const allowedOrigins = new Set(["https://reprepz.github.io", "http://localhost:4173", "http://localhost:5173"]);

function response(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function rawToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "https://reprepz.github.io";
  if (!allowedOrigins.has(origin)) return response("https://reprepz.github.io", { error:"Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return response(origin, { ok:true });
  if (req.method !== "POST") return response(origin, { error:"Method not allowed." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global:{ headers:{ Authorization:authorization } } });
  const { data:{ user }, error:userError } = await userClient.auth.getUser();
  if (userError || !user) return response(origin, { error:"Sign in again first." }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });
  const body = await req.json().catch(() => ({}));

  if (body.action === "request") {
    if (!RESEND_KEY || !FROM_EMAIL) return response(origin, { error:"Deletion email is not configured yet." }, 503);
    if (!user.email || user.email.endsWith("@lifting.local")) return response(origin, { error:"This account does not have a verified delivery email." }, 400);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data:recent } = await admin.from("account_deletion_requests").select("requested_at")
      .eq("user_id", user.id).gt("requested_at", fiveMinutesAgo).maybeSingle();
    if (recent) return response(origin, { error:"A confirmation was already sent. Wait five minutes before requesting another." }, 429);

    const token = rawToken();
    const hash = await tokenHash(token);
    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    const { error:storeError } = await admin.from("account_deletion_requests").upsert({
      user_id:user.id, token_hash:hash, requested_at:new Date().toISOString(), expires_at:expires,
    });
    if (storeError) return response(origin, { error:"Could not create a deletion request." }, 500);

    const link = `${APP_URL}?delete_account=${encodeURIComponent(token)}`;
    const mail = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{ Authorization:`Bearer ${RESEND_KEY}`, "Content-Type":"application/json" },
      body:JSON.stringify({
        from:FROM_EMAIL,
        to:[user.email],
        subject:"Confirm deletion of your The Lab account",
        html:`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>Delete your The Lab account?</h2><p>This request permanently removes your login and app data. If you did not request it, ignore this email.</p><p><a href="${link}" style="display:inline-block;background:#d93636;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Review and confirm deletion</a></p><p style="color:#666;font-size:13px">The link expires in 30 minutes and still requires you to sign in.</p></div>`,
      }),
    });
    if (!mail.ok) {
      await admin.from("account_deletion_requests").delete().eq("user_id", user.id);
      return response(origin, { error:"The confirmation email could not be sent." }, 502);
    }
    return response(origin, { ok:true });
  }

  if (body.action === "confirm") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return response(origin, { error:"That deletion link is invalid." }, 400);
    const hash = await tokenHash(token);
    const { data:requestRow } = await admin.from("account_deletion_requests").select("user_id,expires_at")
      .eq("user_id", user.id).eq("token_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!requestRow) return response(origin, { error:"That deletion link is invalid or expired." }, 400);
    const { error:deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) return response(origin, { error:"Account deletion failed. Please try again." }, 500);
    return response(origin, { ok:true });
  }

  return response(origin, { error:"Unknown action." }, 400);
});
