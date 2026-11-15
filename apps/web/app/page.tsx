const seats = [
  { name: "You", chips: "1,000", cards: ["A♠", "K♠"], position: "bottom" },
  { name: "Maya", chips: "760", cards: ["?", "?"], position: "left" },
  { name: "Jon", chips: "1,240", cards: ["?", "?"], position: "right" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Card Table</div>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>Private table</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs">FJ7Q2K</span>
        </div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.25em] text-gold">Texas Hold&apos;em</p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Friday night table</h1>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>Blinds 5 / 10</div>
            <div className="mt-1 text-gold">Your turn · call 10</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-emerald-950/60 p-5 shadow-glow md:p-10">
          <div className="absolute inset-8 rounded-[1.5rem] border border-white/10 bg-emerald-900/40" />
          <div className="relative z-10 flex min-h-[32rem] flex-col justify-between">
            <div className="flex justify-center gap-3">
              <Seat {...seats[1]!} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Seat {...seats[2]!} />
              <div className="flex flex-col items-center">
                <div className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">Pot 35</div>
                <div className="flex gap-2">
                  {["A♣", "10♦", "7♠", "?", "?"].map((card, index) => (
                    <PlayingCard key={`${card}-${index}`} value={card} muted={card === "?"} />
                  ))}
                </div>
              </div>
              <div className="w-28" />
            </div>
            <div className="flex justify-center">
              <Seat {...seats[0]!} active />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex gap-2">
            <button className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200">Fold</button>
            <button className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200">Check</button>
            <button className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink">Call 10</button>
          </div>
          <div className="text-sm text-slate-400">Server-authoritative actions · private cards are only sent to their owner</div>
        </div>
      </section>
    </main>
  );
}

function Seat({ name, chips, cards, active = false }: { name: string; chips: string; cards: string[]; active?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? "border-gold/70 bg-gold/10" : "border-white/10 bg-ink/60"}`}>
      <div className="flex items-center justify-between gap-8">
        <div>
          <div className="font-semibold">{name}</div>
          <div className="mt-1 text-xs text-slate-400">{chips} chips</div>
        </div>
        <div className="flex gap-1">
          {cards.map((card, index) => <PlayingCard key={`${card}-${index}`} value={card} muted={card === "?"} compact />)}
        </div>
      </div>
    </div>
  );
}

function PlayingCard({ value, muted = false, compact = false }: { value: string; muted?: boolean; compact?: boolean }) {
  return (
    <div className={`${compact ? "h-12 w-9 text-sm" : "h-20 w-14 text-lg"} flex items-center justify-center rounded-lg border font-semibold ${muted ? "border-white/10 bg-slate-800 text-slate-500" : "border-white/20 bg-[#f7f5ef] text-ink"}`}>
      {value}
    </div>
  );
}
