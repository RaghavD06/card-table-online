import Link from "next/link";

export default function LobbyPage() {
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16] px-6 py-12"><div className="mx-auto max-w-5xl">
    <nav className="flex items-center justify-between"><span className="font-semibold uppercase tracking-[0.3em] text-gold">Card Table</span><Link href="/auth" className="rounded-full border border-white/15 px-4 py-2 text-sm">Sign in</Link></nav>
    <section className="mt-20 max-w-2xl"><p className="text-sm uppercase tracking-[0.25em] text-gold">Private multiplayer tables</p><h1 className="mt-4 text-5xl font-semibold tracking-tight">Play with your people.</h1><p className="mt-5 text-lg text-slate-300">Create a room, share its invite code, and let the server keep every turn, balance, and seat authoritative.</p><div className="mt-8 flex gap-3"><Link href="/auth" className="rounded-xl bg-gold px-5 py-3 font-semibold text-ink">Create a table</Link><Link href="/profile" className="rounded-xl border border-white/15 px-5 py-3">Your profile</Link></div></section>
    <div className="mt-20 grid gap-4 md:grid-cols-4">{[["/profile", "Profile", "Identity and presence"], ["/friends", "Friends", "Requests and online friends"], ["/history", "History", "Stats and completed games"], ["/settings", "Settings", "Account and provider options"]].map(([href, title, detail]) => <Link key={href} href={href!} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:border-gold/50"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-400">{detail}</p></Link>)}</div>
  </div></main>;
}
