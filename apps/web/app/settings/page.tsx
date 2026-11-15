import Link from "next/link";

export default function SettingsPage() {
  return <main className="min-h-screen bg-ink px-6 py-12"><div className="mx-auto max-w-3xl"><Link href="/lobby" className="text-sm text-gold">← Lobby</Link><h1 className="mt-8 text-4xl font-semibold">Settings</h1><div className="mt-8 space-y-4"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="font-semibold">Authentication</h2><p className="mt-2 text-sm text-slate-400">Email/password and guest sessions are available. Google appears only when provider credentials are configured on the server.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="font-semibold">Safety</h2><p className="mt-2 text-sm text-slate-400">Room membership, input lengths, wallet limits, and game actions are validated on the server.</p></div></div></div></main>;
}
