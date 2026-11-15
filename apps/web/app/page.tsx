const players = [
  { name: "You", cards: 13, score: 0, position: "bottom", active: true },
  { name: "Maya", cards: 13, score: 18, position: "left", active: false },
  { name: "Jon", cards: 13, score: 24, position: "right", active: false },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Card Table</div>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>Indian Rummy</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs">FJ7Q2K</span>
        </div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.25em] text-gold">13-card table</p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Friday night rummy</h1>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>Wild joker: 7</div>
            <div className="mt-1 text-gold">Your turn · draw a card</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-emerald-950/60 p-5 shadow-glow md:p-10">
          <div className="absolute inset-8 rounded-[1.5rem] border border-white/10 bg-emerald-900/40" />
          <div className="relative z-10 flex min-h-[32rem] flex-col justify-between">
            <div className="flex justify-center gap-3"><RummySeat {...players[1]!} /></div>
            <div className="flex items-center justify-between gap-4">
              <RummySeat {...players[2]!} />
              <div className="flex flex-col items-center">
                <div className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">Draw pile · 77</div>
                <div className="flex gap-2">
                  <PlayingCard value="?" muted />
                  <PlayingCard value="7♦" />
                </div>
                <div className="mt-3 text-xs text-slate-400">Discard pile</div>
              </div>
              <div className="w-28" />
            </div>
            <div className="flex justify-center"><RummySeat {...players[0]!} /></div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <button className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200">Draw stock</button>
              <button className="rounded-full border border-white/15 px-5 py-2 text-sm text-slate-200">Draw discard</button>
              <button className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink">Declare</button>
            </div>
            <div className="text-sm text-slate-400">Server-authoritative turns · private hands are only sent to their owner</div>
          </div>
          <div className="mt-5 flex justify-center gap-2">
            {["3♣", "4♣", "5♣", "7♥", "8♥", "9♥", "Q♠", "Q♦", "Q♣", "2♦", "6♠", "10♣", "K♥"].map((card) =>
              <PlayingCard key={card} value={card} compact />)}
          </div>
        </div>
      </section>
    </main>
  );
}

function RummySeat({ name, cards, score, active = false }: { name: string; cards: number; score: number; active?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? "border-gold/70 bg-gold/10" : "border-white/10 bg-ink/60"}`}>
      <div className="flex items-center justify-between gap-8">
        <div><div className="font-semibold">{name}</div><div className="mt-1 text-xs text-slate-400">{cards} cards · {score} points</div></div>
        <div className="flex gap-1">{Array.from({ length: Math.min(cards, 5) }, (_, index) => <PlayingCard key={index} value="?" muted compact />)}</div>
      </div>
    </div>
  );
}

function PlayingCard({ value, muted = false, compact = false }: { value: string; muted?: boolean; compact?: boolean }) {
  return <div className={`${compact ? "h-12 w-9 text-sm" : "h-20 w-14 text-lg"} flex items-center justify-center rounded-lg border font-semibold ${muted ? "border-white/10 bg-slate-800 text-slate-500" : "border-white/20 bg-[#f7f5ef] text-ink"}`}>{value}</div>;
}
