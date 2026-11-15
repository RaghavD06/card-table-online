import Link from "next/link";

export default function FriendsPage() {
  return <main className="min-h-screen bg-ink px-6 py-12"><div className="mx-auto max-w-3xl"><Link href="/lobby" className="text-sm text-gold">← Lobby</Link><h1 className="mt-8 text-4xl font-semibold">Friends</h1><p className="mt-3 text-slate-400">Send requests by player id, accept them here, and invite accepted friends into a room.</p><div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6"><label className="text-sm text-slate-300">Player id</label><div className="mt-2 flex gap-3"><input placeholder="Paste a player id" className="flex-1 rounded-xl bg-black/20 px-4 py-3" /><button className="rounded-xl bg-gold px-5 font-semibold text-ink">Send request</button></div></div></div></main>;
}
