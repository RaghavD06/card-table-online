const players = [
  { name: "You", balance: 980, active: true },
  { name: "Maya", balance: 1_020, active: false },
  { name: "Jon", balance: 1_000, active: false },
];

export default function PotPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Card Table</div>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>In-Between</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs">FJ7Q2K</span>
        </div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.25em] text-gold">Pot table</p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Play between the cards</h1>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>Ace high · 1:1 payout</div>
            <div className="mt-1 text-gold">Your turn · choose a wager or pass</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-emerald-950/60 p-5 shadow-glow md:p-10">
          <div className="absolute inset-8 rounded-[1.5rem] border border-white/10 bg-emerald-900/40" />
          <div className="relative z-10 flex min-h-[30rem] flex-col justify-between">
            <div className="flex justify-center gap-3"><PotSeat {...players[1]!} /></div>
            <div className="flex items-center justify-center gap-4">
              <PlayingCard value="5♣" />
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">strictly between</div>
              <PlayingCard value="10♦" />
            </div>
            <div className="flex justify-center"><PotSeat {...players[0]!} /></div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <button className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink">Bet 10</button>
              <button className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200">Pass</button>
            </div>
            <div className="text-sm text-slate-400">Min 1 · max 100 · server-authoritative settlement</div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {players.map((player) => (
              <PotSeat key={player.name} {...player} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function PotSeat({ name, balance, active = false }: { name: string; balance: number; active?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? "border-gold/70 bg-gold/10" : "border-white/10 bg-ink/60"}`}>
      <div className="font-semibold">{name}</div>
      <div className="mt-1 text-xs text-slate-400">{balance} chips</div>
    </div>
  );
}

function PlayingCard({ value }: { value: string }) {
  return <div className="flex h-24 w-16 items-center justify-center rounded-lg border border-white/20 bg-[#f7f5ef] text-xl font-semibold text-ink">{value}</div>;
}
