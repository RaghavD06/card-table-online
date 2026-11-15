"use client";

import { useState } from "react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register" | "guest">("login");
  const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    const endpoint = mode === "guest" ? "/api/auth/guest" : mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body = mode === "guest" ? { displayName: form.get("displayName") } : { email: form.get("email"), password: form.get("password"), displayName: form.get("displayName") };
    const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_ORIGIN ?? "http://localhost:4000"}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.message ?? "Authentication failed"); return; }
    if (result.token) localStorage.setItem("card-table-session", result.token);
    setMessage(`Signed in as ${result.username}`);
  }
  return <main className="min-h-screen bg-ink px-6 py-16"><div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8">
    <p className="text-sm uppercase tracking-[0.25em] text-gold">Card Table</p><h1 className="mt-3 text-3xl font-semibold">Your table, your circle</h1>
    <div className="mt-8 flex gap-2 text-sm"><button onClick={() => setMode("login")} className="rounded-full border border-white/15 px-3 py-2">Sign in</button><button onClick={() => setMode("register")} className="rounded-full border border-white/15 px-3 py-2">Create account</button><button onClick={() => setMode("guest")} className="rounded-full border border-white/15 px-3 py-2">Guest</button></div>
    <form action={submit} className="mt-6 space-y-4">{mode !== "guest" && <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl bg-black/20 px-4 py-3" />}<input name="displayName" required={mode === "guest" || mode === "register"} placeholder="Display name" className="w-full rounded-xl bg-black/20 px-4 py-3" />{mode !== "guest" && <input name="password" type="password" minLength={8} required placeholder="Password (8+ characters)" className="w-full rounded-xl bg-black/20 px-4 py-3" />}<button className="w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink">{mode === "guest" ? "Enter as guest" : mode === "register" ? "Create account" : "Sign in"}</button></form>
    {message && <p className="mt-4 text-sm text-slate-300">{message}</p>}<p className="mt-8 text-xs text-slate-500">Google sign-in is enabled only when the server has configured provider credentials.</p>
  </div></main>;
}
