// Single source of truth for every JAXOPAY virtual card design — used by the dashboard's real
// cards, its empty-state sample carousel and design picker, AND the public homepage's marketing
// mockups. Shared as one component (not hand-copied JSX per surface) specifically so "the card
// design" can't quietly drift between where a user actually gets a card and where they're shown
// what it looks like before they have one.
export const CARD_DESIGNS = {
    midnight: { label: 'Midnight', gradient: 'linear-gradient(135deg,#334155 0%,#1e293b 55%,#020617 100%)' },
    emerald: { label: 'Emerald', gradient: 'linear-gradient(135deg,#34d399 0%,#10b981 30%,#0d9488 60%,#065f46 100%)' },
    violet: { label: 'Violet', gradient: 'linear-gradient(135deg,#a78bfa 0%,#7c3aed 40%,#4c1d95 100%)' },
    sunset: { label: 'Sunset', gradient: 'linear-gradient(135deg,#fbbf24 0%,#f59e0b 40%,#b45309 100%)' },
    // Brushed-steel shimmer matching the metallic card in the pre-login onboarding illustration —
    // needs dark text/icons, unlike every other design.
    silver: { label: 'Silver', gradient: 'linear-gradient(135deg,#F8FAFC 0%,#CBD5E1 25%,#94A3B8 50%,#CBD5E1 75%,#F8FAFC 100%)', textDark: true },
};
export const CARD_DESIGN_ORDER = ['midnight', 'emerald', 'violet', 'sunset', 'silver'];
// card_type-based fallback for cards created before card_design existed server-side.
export const defaultDesignFor = (card) => (card?.card_type === 'single_use' ? 'midnight' : 'emerald');

// designId: one of CARD_DESIGN_ORDER. sample=true skips the reveal/frozen controls (nothing to
// reveal on a placeholder) and shows masked placeholder content instead of real values.
// className lets callers set width/aspect-ratio — the face itself doesn't assume a size.
const CardFaceMockup = ({ designId, frozen, sample, balance, revealed, cardNumber, validThru, cvv, onToggleReveal, revealing, formatCurrency, className = '' }) => {
    const d = CARD_DESIGNS[designId] || CARD_DESIGNS.emerald;
    const fg = d.textDark ? 'text-slate-800' : 'text-white';
    const fgDim = d.textDark ? 'text-slate-800/65' : 'text-white/70';
    const fgFaint = d.textDark ? 'text-slate-800/50' : 'text-white/50';
    const glossOpacity = d.textDark ? 0.5 : 0.32;
    const glowClass = d.textDark ? 'bg-slate-900/5' : 'bg-white/10';

    return (
        <div
            className={`relative rounded-2xl p-5 ${fg} overflow-hidden ${frozen ? 'saturate-[0.6]' : ''} ${className}`}
            style={{ background: d.gradient, boxShadow: '0 22px 45px -14px rgba(5,95,70,0.4), inset 0 1px 0 rgba(255,255,255,0.28)' }}
        >
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,${glossOpacity}), transparent 55%)` }} />
            <div className={`pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full ${glowClass} blur-2xl`} />

            {/* Chip + contactless mark now share a column on the right, wave stacked directly
                under the gold chip, instead of the wave getting its own full-width row — that
                row used to render (and cost height) even on sample cards with nothing else in
                it. Collapsing the two is what actually shortens the card into looking rectangular
                rather than square, not just a different aspect-ratio number. */}
            <div className="relative flex items-start justify-between mb-3">
                <div className="flex flex-col">
                    {/* logo-crest.png: logo-icon.png's icon mark cropped out from the wordmark that
                        sits below it in that source file — it's the only asset with a real alpha
                        channel; every other logo file is opaque with a baked-in white background.
                        Lower opacity gives an embossed-into-the-card look, not a flat sticker. */}
                    <img src="/logo-crest.png" alt="JAXOPAY" className="h-4 w-4 object-contain opacity-60 drop-shadow-sm" />
                    <span className={`text-[8px] uppercase tracking-[0.15em] ${fgDim} mt-1`}>Virtual · USD</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="w-9 h-6 rounded-md bg-gradient-to-br from-yellow-100 via-yellow-300 to-yellow-500 shadow-inner relative overflow-hidden">
                        <div className="absolute inset-[3px] grid grid-cols-3 grid-rows-3 gap-[1px] opacity-50">
                            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="bg-yellow-800/40 rounded-[1px]" />)}
                        </div>
                    </div>
                    <svg viewBox="0 0 24 24" className={`w-4 h-5 ${fgDim}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M8 7a8 8 0 0 1 0 10" /><path d="M11.5 5a12 12 0 0 1 0 14" /><path d="M15 3a16 16 0 0 1 0 18" />
                    </svg>
                </div>
            </div>

            {/* Frozen badge / reveal toggle only ever apply to a real card, never a sample one —
                this row no longer renders (and no longer costs height) when there's nothing to
                put in it, instead of always reserving space for an empty wrapper. */}
            {!sample && (frozen || onToggleReveal) && (
                <div className="relative flex items-center justify-end gap-2 mb-3">
                    {frozen && (
                        <span className={`px-2 py-1 ${d.textDark ? 'bg-black/10' : 'bg-white/15'} backdrop-blur text-[10px] font-semibold rounded-full`}>
                            Frozen
                        </span>
                    )}
                    {onToggleReveal && (
                        <button onClick={onToggleReveal} className={`p-1 ${d.textDark ? 'hover:bg-black/5' : 'hover:bg-white/10'} rounded-lg transition-colors text-xs`}>
                            {revealing ? '···' : revealed ? 'Hide' : 'Show'}
                        </button>
                    )}
                </div>
            )}

            <div className="relative mb-2">
                <p className={`${fgFaint} text-[9px] mb-0.5`}>Balance</p>
                <p className="text-base font-bold drop-shadow-sm">
                    {sample || !revealed ? '••••••' : (formatCurrency ? formatCurrency(balance || 0, 'USD') : balance)}
                </p>
            </div>

            <p className="relative font-mono text-sm tracking-[0.14em] mb-3 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)] whitespace-nowrap">
                {sample ? '•••• •••• •••• 4242' : cardNumber}
            </p>

            <div className="relative flex items-end gap-4">
                <div>
                    <p className={`${fgFaint} text-[8px] uppercase tracking-wide mb-0.5`}>Valid thru</p>
                    <p className="font-mono text-xs">{sample ? '••/••' : validThru}</p>
                </div>
                <div>
                    <p className={`${fgFaint} text-[8px] uppercase tracking-wide mb-0.5`}>CVV</p>
                    <p className="font-mono text-xs">{sample ? '•••' : cvv}</p>
                </div>
                <div className="ml-auto italic font-black text-lg tracking-tighter drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">VISA</div>
            </div>
        </div>
    );
};

export default CardFaceMockup;
