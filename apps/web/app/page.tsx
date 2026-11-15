const games = [
  ["Texas Hold'em", "A focused table for strategic hands and friendly competition.", "2–9 players"],
  ["Indian Rummy", "Arrange, draw, and declare with your own private table.", "2–6 players"],
  ["Pot", "A fast, social in-between game with configurable table rules.", "2+ players"],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Card Table</div>
        <div className="flex gap-3 text-sm text-slate-300">
          <button className="rounded-full border border-white/10 px-4 py-2 hover:border-gold/60">Sign in</button>
          <button className="rounded-full bg-gold px-4 py-2 font-semibold text-ink">Enter as guest</button>
        </div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm uppercase tracking-[0.25em] text-gold">Private tables. Real-time play.</p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Gather your people around the table.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">A premium home for friendly card games. Create a private room, share the link, and keep every hand in sync.</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <button className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-ink">Create a room</button>
            <button className="rounded-full border border-white/15 px-6 py-3 font-semibold">Join with a code</button>
          </div>
        </div>
        <div className="mt-24 grid gap-4 md:grid-cols-3">
          {games.map(([name, description, players]) => (
            <article key={name} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-glow">
              <div className="mb-14 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-gold"><span>Coming in phases</span><span>{players}</span></div>
              <h2 className="text-2xl font-semibold">{name}</h2>
              <p className="mt-3 leading-7 text-slate-400">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
