import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    Trash2,
    DollarSign,
    Copy,
    Check,
    X,
    RefreshCw,
    Settings,
    AlertTriangle,
} from 'lucide-react';
import cardService from '../../services/cardService';
import walletService from '../../services/walletService';
import PinModal from '../../components/common/PinModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import CardFaceMockup, { CARD_DESIGNS, CARD_DESIGN_ORDER, defaultDesignFor } from '../../components/CardFaceMockup';

// Compute a card fee from the { fee_type, flat, percent, cap } config returned by /cards/fees.
// Mirrors the backend's computeFee (feeConfig.service.js) — must branch on fee_type, since an
// admin can switch card_creation/card_funding to 'fixed' or 'percentage' in Rates & Fees at any
// time, and a flat_plus_percent-only formula would silently show the wrong preview if they did.
const computeCardFee = (cfg, amount) => {
    if (!cfg) return 0;
    const amt = parseFloat(amount) || 0;
    const flat = Number(cfg.flat) || 0;
    const percent = Number(cfg.percent) || 0;
    const cap = Number(cfg.cap) || 0;
    let fee = 0;
    switch (cfg.fee_type) {
        case 'fixed':
            fee = flat;
            break;
        case 'percentage':
            fee = (amt * percent) / 100;
            if (flat) fee = Math.max(fee, flat);
            break;
        case 'flat_plus_percent':
        default:
            fee = flat + (amt * percent) / 100;
            break;
    }
    if (cap > 0) fee = Math.min(fee, cap);
    return Math.round((fee + Number.EPSILON) * 100) / 100;
};

const SampleCardCarousel = () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const CARD_STEP = 290 + 16; // card width + gap-4

    return (
        <div className="mb-2">
            <div
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onScroll={(e) => setActiveIndex(Math.round(e.currentTarget.scrollLeft / CARD_STEP))}
            >
                {CARD_DESIGN_ORDER.map((id) => (
                    <CardFaceMockup key={id} designId={id} sample formatCurrency={formatCurrency} className="w-[290px] h-[220px] shrink-0 snap-center" />
                ))}
            </div>
            <div className="flex justify-center gap-1.5 mt-3">
                {CARD_DESIGN_ORDER.map((id, i) => (
                    <div key={id} className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
                ))}
            </div>
        </div>
    );
};

// Compact swatch picker for CreateCardModal — a small gradient chip per design, ring highlight on
// the selected one.
const DesignPicker = ({ selected, onSelect }) => (
    <div className="flex justify-between">
        {CARD_DESIGN_ORDER.map((id) => {
            const d = CARD_DESIGNS[id];
            const isSelected = selected === id;
            return (
                <button
                    key={id}
                    type="button"
                    onClick={() => onSelect(id)}
                    className="flex flex-col items-center gap-1.5"
                >
                    <span
                        className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'border-primary' : 'border-transparent'}`}
                        style={{ background: d.gradient }}
                    >
                        {isSelected && <Check className={`w-4 h-4 ${d.textDark ? 'text-slate-800' : 'text-white'}`} strokeWidth={3} />}
                    </span>
                    <span className={`text-[11px] font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{d.label}</span>
                </button>
            );
        })}
    </div>
);

const Cards = () => {
    const navigate = useNavigate();
    const [cards, setCards] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showFundModal, setShowFundModal] = useState(false);
    const [showDetails, setShowDetails] = useState({});
    const [secureData, setSecureData] = useState({});   // cardId -> { card_number, cvv, expiry_date, billing_address }
    const [secureLoading, setSecureLoading] = useState({});   // cardId -> bool
    const [copiedField, setCopiedField] = useState(null);
    const [error, setError] = useState(null);
    const [errorCode, setErrorCode] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    // Transaction PIN flow (shared by create + fund)
    const [pinFlow, setPinFlow] = useState(null); // { kind: 'create'|'fund', payload }
    const [pinError, setPinError] = useState('');
    const [pinProcessing, setPinProcessing] = useState(false);
    const [cardFees, setCardFees] = useState(null); // { card_creation, card_funding }

    // Fetch cards and wallets on mount - run in parallel for speed
    // Fetch cards and wallets on mount
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await fetchCards();
            setLoading(false);
            // Fetch wallets in background as they are only needed for funding
            fetchWallets();
        };
        loadData();
        cardService.getFees().then((r) => { if (r.success) setCardFees(r.data); });
    }, []);

    const fetchCards = async () => {
        const result = await cardService.getCards();
        if (result.success) {
            // Backend wraps in { success, data: [...] } → apiClient returns data portion
            const cardsData = Array.isArray(result.data)
                ? result.data
                : (result.data?.cards || result.data?.data || []);
            setCards(cardsData);
        } else {
            setError(result.error || 'Failed to load cards');
        }
    };

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const walletsArr = Array.isArray(result.data)
                ? result.data
                : (result.data?.wallets || []);
            setWallets(walletsArr.filter(w => w.currency === 'USD' && w.is_active !== false));
        }
    };

    const fetchCardTransactions = async (cardId) => {
        const result = await cardService.getCardTransactions(cardId);
        if (result.success) {
            const txData = result.data?.transactions || (Array.isArray(result.data) ? result.data : []);
            setTransactions(txData);
        }
    };

    const handleSelectCard = async (card) => {
        setSelectedCard(card);
        await fetchCardTransactions(card.id);
    };

    // Both create and fund move money out of the USD wallet → require the transaction PIN.
    const handleCreateCard = (cardData) => {
        setError(null);
        setErrorCode(null);
        setPinError('');
        setPinFlow({ kind: 'create', payload: cardData });
    };

    const handleFundCard = (cardId, amount) => {
        setError(null);
        setErrorCode(null);
        setPinError('');
        setPinFlow({ kind: 'fund', payload: { cardId, amount } });
    };

    // Runs once the user enters their PIN in the shared PinModal.
    const runPinFlow = async (pin) => {
        if (!pinFlow) return;
        setPinProcessing(true);
        setPinError('');
        let result;
        if (pinFlow.kind === 'create') {
            result = await cardService.createCard({ ...pinFlow.payload, pin });
        } else {
            result = await cardService.fundCard(pinFlow.payload.cardId, pinFlow.payload.amount, pin);
        }

        if (result.success) {
            setPinFlow(null);
            await fetchCards();
            if (pinFlow.kind === 'create') {
                setShowCreateModal(false);
            } else {
                if (selectedCard?.id === pinFlow.payload.cardId) await fetchCardTransactions(pinFlow.payload.cardId);
                setShowFundModal(false);
            }
        } else if (['PIN_INCORRECT', 'PIN_LOCKED', 'PIN_NOT_SET', 'PIN_REQUIRED'].includes(result.code)) {
            setPinError(result.error || 'Incorrect PIN. Please try again.');
        } else {
            setPinFlow(null);
            setError(result.message || result.error || (pinFlow.kind === 'create' ? 'Failed to create card.' : 'Failed to fund card.'));
            setErrorCode(result.code || null);
        }
        setPinProcessing(false);
    };

    const handleFreezeCard = async (cardId) => {
        setActionLoading(true);
        const result = await cardService.freezeCard(cardId);
        if (result.success) {
            await fetchCards();
        } else {
            setError(result.message || result.error || 'Failed to freeze card');
        }
        setActionLoading(false);
    };

    const handleUnfreezeCard = async (cardId) => {
        setActionLoading(true);
        const result = await cardService.unfreezeCard(cardId);
        if (result.success) {
            await fetchCards();
        } else {
            setError(result.message || result.error || 'Failed to unfreeze card');
        }
        setActionLoading(false);
    };

    const handleTerminateCard = async (cardId) => {
        if (!window.confirm('Are you sure you want to terminate this card? Any remaining balance will be refunded to your wallet.')) {
            return;
        }
        setActionLoading(true);
        const result = await cardService.terminateCard(cardId);
        if (result.success) {
            await fetchCards();
            if (selectedCard?.id === cardId) {
                setSelectedCard(null);
                setTransactions([]);
            }
        } else {
            setError(result.message || result.error || 'Failed to terminate card');
        }
        setActionLoading(false);
    };

    const toggleShowDetails = async (cardId) => {
        const nowShowing = !showDetails[cardId];
        setShowDetails(prev => ({ ...prev, [cardId]: nowShowing }));
        // Fetch secure data from API when revealing for the first time
        if (nowShowing && !secureData[cardId]) {
            setSecureLoading(prev => ({ ...prev, [cardId]: true }));
            const result = await cardService.getCardSecureData(cardId);
            if (result.success) {
                setSecureData(prev => ({ ...prev, [cardId]: result.data }));
            }
            setSecureLoading(prev => ({ ...prev, [cardId]: false }));
        }
    };

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const maskCardNumber = (number) => {
        if (!number) return '•••• •••• •••• ••••';
        return number.replace(/(\d{4})/g, '$1 ').trim();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Virtual Cards</h1>
                    <p className="text-muted-foreground">Manage your USD virtual cards for online payments</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                    Create Card
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
                    <p className="text-danger">{error}</p>
                    <div className="flex items-center gap-4 mt-1">
                        {errorCode === 'CARD_KYC_INCOMPLETE' && (
                            <button onClick={() => navigate('/dashboard/profile')} className="text-danger underline text-sm font-semibold">
                                Complete your profile
                            </button>
                        )}
                        <button onClick={() => { setError(null); setErrorCode(null); }} className="text-danger underline text-sm">
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* KYC Notice */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                    <p className="text-primary font-medium">USD Virtual Cards</p>
                    <p className="text-blue-700 text-sm">
                        Create reloadable USD virtual cards accepted worldwide for online payments. Each card is funded from and linked to your USD wallet.
                    </p>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cards.length === 0 ? (
                    <div className="col-span-full text-center py-8">
                        <SampleCardCarousel />
                        <h3 className="text-lg font-medium text-foreground mb-2 mt-4">Your USD Virtual Card</h3>
                        <p className="text-muted-foreground mb-4">
                            Swipe to preview the design — spend online anywhere Visa is accepted, funded instantly from your USD wallet.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            Create Your First Card
                        </button>
                    </div>
                ) : (
                    cards.map((card) => {
                        const designId = card.card_design && CARD_DESIGNS[card.card_design] ? card.card_design : defaultDesignFor(card);
                        const d = CARD_DESIGNS[designId];
                        const fg = d.textDark ? 'text-slate-800' : 'text-white';
                        const fgDim70 = d.textDark ? 'text-slate-800/70' : 'text-white/70';
                        const fgDim60 = d.textDark ? 'text-slate-800/60' : 'text-white/60';
                        const fgDim55 = d.textDark ? 'text-slate-800/55' : 'text-white/55';
                        const fgDim50 = d.textDark ? 'text-slate-800/50' : 'text-white/50';
                        const hoverBg = d.textDark ? 'hover:bg-black/5' : 'hover:bg-white/10';
                        const badgeBg = d.textDark ? 'bg-black/10' : 'bg-white/15';
                        const glowBg = d.textDark ? 'bg-slate-900/5' : 'bg-white/10';
                        const glossOpacity = d.textDark ? 0.5 : 0.32;
                        const borderTop = d.textDark ? 'border-slate-800/20' : 'border-white/20';
                        const addressColor = d.textDark ? 'text-slate-800/80' : 'text-white/80';

                        return (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`group relative overflow-hidden rounded-2xl cursor-pointer transition-all ${selectedCard?.id === card.id ? 'ring-2 ring-primary' : ''
                                }`}
                            onClick={() => handleSelectCard(card)}
                        >
                            {/* Card Visual — modern 3D */}
                            <div className="[perspective:1600px]">
                                <div
                                    className={`relative p-6 ${fg} overflow-hidden transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.015] group-hover:-translate-y-0.5 ${card.card_status === 'frozen' ? 'saturate-[0.6]' : ''}`}
                                    style={{
                                        background: d.gradient,
                                        boxShadow: '0 22px 45px -14px rgba(5,95,70,0.55), inset 0 1px 0 rgba(255,255,255,0.28)',
                                    }}
                                >
                                    {/* gloss + glow overlays */}
                                    <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,${glossOpacity}), transparent 55%)` }} />
                                    <div className={`pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full ${glowBg} blur-2xl`} />
                                    <div className={`pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 rotate-12 ${glowBg} blur-md transition-transform duration-700 group-hover:translate-x-[260%]`} />

                                    {/* Top: brand + EMV chip */}
                                    <div className="relative flex items-start justify-between mb-4">
                                        <div className="flex flex-col">
                                            <img src="/logo-crest.png" alt="JAXOPAY" className="h-5 w-5 object-contain opacity-60 drop-shadow-sm" />
                                            <span className={`text-[10px] uppercase tracking-[0.15em] ${fgDim60} mt-1.5`}>Virtual · USD</span>
                                        </div>
                                        <div className="w-11 h-8 rounded-md bg-gradient-to-br from-yellow-100 via-yellow-300 to-yellow-500 shadow-inner relative overflow-hidden">
                                            <div className="absolute inset-[3px] grid grid-cols-3 grid-rows-3 gap-[2px] opacity-50">
                                                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="bg-yellow-800/40 rounded-[1px]" />)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contactless mark + status/reveal */}
                                    <div className="relative flex items-center justify-between mb-4">
                                        <svg viewBox="0 0 24 24" className={`w-5 h-6 ${fgDim70}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                                            <path d="M8 7a8 8 0 0 1 0 10" /><path d="M11.5 5a12 12 0 0 1 0 14" /><path d="M15 3a16 16 0 0 1 0 18" />
                                        </svg>
                                        <div className="flex items-center gap-2">
                                            {card.card_status === 'frozen' && (
                                                <span className={`px-2 py-1 ${badgeBg} backdrop-blur text-[10px] font-semibold rounded-full flex items-center gap-1`}>
                                                    <Lock className="w-3 h-3" /> Frozen
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleShowDetails(card.id); }}
                                                className={`p-2 ${hoverBg} rounded-lg transition-colors`}
                                                title={showDetails[card.id] ? 'Hide card details' : 'Reveal card details'}
                                            >
                                                {secureLoading[card.id]
                                                    ? <RefreshCw className="w-5 h-5 animate-spin" />
                                                    : showDetails[card.id] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Balance */}
                                    <div className="relative mb-4">
                                        <p className={`${fgDim55} text-[11px] mb-0.5`}>Balance</p>
                                        <p className="text-2xl font-bold drop-shadow-sm">
                                            {showDetails[card.id] ? formatCurrency(card.balance || 0, 'USD') : '••••••'}
                                        </p>
                                    </div>

                                    {/* Card number */}
                                    <div className="relative mb-4 flex items-center gap-2">
                                        <p className="font-mono text-lg tracking-[0.18em] flex-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">
                                            {showDetails[card.id] && secureData[card.id]?.card_number
                                                ? maskCardNumber(secureData[card.id].card_number)
                                                : `•••• •••• •••• ${card.last_four || '••••'}`}
                                        </p>
                                        {showDetails[card.id] && secureData[card.id]?.card_number && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(secureData[card.id].card_number, `number-${card.id}`); }}
                                                className={`p-1 ${hoverBg} rounded transition-colors`}
                                            >
                                                {copiedField === `number-${card.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>

                                    {/* Expiry / CVV / Brand */}
                                    <div className="relative flex items-end gap-6">
                                        <div>
                                            <p className={`${fgDim50} text-[10px] uppercase tracking-wide mb-0.5`}>Valid thru</p>
                                            <p className="font-mono text-sm">
                                                {showDetails[card.id] ? (secureData[card.id]?.expiry_date || card.expiry_date || '••/••') : '••/••'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`${fgDim50} text-[10px] uppercase tracking-wide mb-0.5`}>CVV</p>
                                            <div className="flex items-center gap-1">
                                                <p className="font-mono text-sm">
                                                    {showDetails[card.id] ? (secureData[card.id]?.cvv || card.cvv || '•••') : '•••'}
                                                </p>
                                                {showDetails[card.id] && (secureData[card.id]?.cvv || card.cvv) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); copyToClipboard(secureData[card.id]?.cvv || card.cvv, `cvv-${card.id}`); }}
                                                        className={`p-1 ${hoverBg} rounded transition-colors`}
                                                    >
                                                        {copiedField === `cvv-${card.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="ml-auto italic font-black text-2xl tracking-tighter drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">VISA</div>
                                    </div>

                                    {/* Billing address — show when revealed */}
                                    {showDetails[card.id] && (secureData[card.id]?.billing_address || card.billing_address) && (
                                        <div className={`relative mt-4 pt-4 border-t ${borderTop}`}>
                                            <p className={`${fgDim50} text-[10px] uppercase tracking-wide mb-1`}>Billing address</p>
                                            {(() => {
                                                const ba = secureData[card.id]?.billing_address || card.billing_address;
                                                return (
                                                    <p className={`${addressColor} text-xs`}>
                                                        {ba.line1 && `${ba.line1}, `}{ba.city && `${ba.city}, `}{ba.state && `${ba.state} `}{ba.postal_code && `${ba.postal_code}, `}{ba.country}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card Actions */}
                            <div className="p-4 bg-card border-t border-border">
                                <div className="flex gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCard(card);
                                            setShowFundModal(true);
                                        }}
                                        disabled={card.card_status === 'frozen'}
                                        className="flex-1 py-2 px-3 bg-primary/10 text-primary font-medium rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <DollarSign className="w-4 h-4" />
                                        Fund
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            card.card_status === 'frozen' ? handleUnfreezeCard(card.id) : handleFreezeCard(card.id);
                                        }}
                                        className={`px-3 py-2 rounded-lg transition-colors ${card.card_status === 'frozen'
                                            ? 'bg-primary/10 text-primary hover:bg-primary/10'
                                            : 'bg-muted text-muted-foreground hover:bg-muted'
                                            }`}
                                    >
                                        {card.card_status === 'frozen' ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleTerminateCard(card.id);
                                        }}
                                        className="px-3 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/10 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                        );
                    })
                )}
            </div>

            {/* Selected Card Transactions */}
            {selectedCard && (
                <div className="card">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-foreground">
                            Card Transactions (*{selectedCard.last_four})
                        </h3>
                        <button
                            onClick={() => {
                                setSelectedCard(null);
                                setTransactions([]);
                            }}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No transactions yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-foreground">
                                            {tx.merchant || tx.description || 'Card Transaction'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {formatDateTime(tx.created_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-foreground">
                                            -{formatCurrency(tx.amount, 'USD')}
                                        </p>
                                        <p className={`text-sm ${tx.status === 'completed' ? 'text-primary' : 'text-warning'
                                            }`}>
                                            {tx.status}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Card Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <CreateCardModal
                        onClose={() => setShowCreateModal(false)}
                        onCreate={handleCreateCard}
                        loading={actionLoading}
                        wallets={wallets}
                        feeConfig={cardFees?.card_creation}
                    />
                )}
            </AnimatePresence>

            {/* Fund Card Modal */}
            <AnimatePresence>
                {showFundModal && selectedCard && (
                    <FundCardModal
                        card={selectedCard}
                        wallets={wallets}
                        onClose={() => setShowFundModal(false)}
                        onFund={handleFundCard}
                        loading={actionLoading}
                        feeConfig={cardFees?.card_funding}
                    />
                )}
            </AnimatePresence>

            <PinModal
                open={!!pinFlow}
                onClose={() => { setPinFlow(null); setPinError(''); }}
                onConfirm={runPinFlow}
                processing={pinProcessing}
                errorMessage={pinError}
                title={pinFlow?.kind === 'create' ? 'Authorize Card Creation' : 'Authorize Card Funding'}
                description={pinFlow?.kind === 'create'
                    ? `Enter your 4-digit PIN to create and fund this card with $${parseFloat(pinFlow?.payload?.amount_usd || 0).toFixed(2)}.`
                    : `Enter your 4-digit PIN to fund this card with $${parseFloat(pinFlow?.payload?.amount || 0).toFixed(2)}.`}
            />
        </div>
    );
};

// Create Card Modal Component
const CreateCardModal = ({ onClose, onCreate, loading, wallets = [], feeConfig }) => {
    const [amountUsd, setAmountUsd] = useState('5');
    const [spendingLimit, setSpendingLimit] = useState('');
    const [cardDesign, setCardDesign] = useState('emerald');
    const [error, setError] = useState(null);

    const usdWallet = wallets.find(w => w.currency === 'USD') || wallets[0];
    const usdBalance = parseFloat(usdWallet?.available_balance ?? usdWallet?.balance ?? 0);

    const amt = parseFloat(amountUsd) || 0;
    const fee = computeCardFee(feeConfig, amt);
    const total = Math.round((amt + fee + Number.EPSILON) * 100) / 100;

    const handleSubmit = () => {
        setError(null);
        if (!amt || amt < 1) { setError('Enter an initial funding amount of at least $1.'); return; }
        if (total > usdBalance) { setError(`Insufficient USD balance. You need $${total.toFixed(2)} (incl. $${fee.toFixed(2)} fee). Available: $${usdBalance.toFixed(2)}.`); return; }
        onCreate({
            card_type: 'multi_use',
            card_design: cardDesign,
            amount_usd: amt,
            ...(spendingLimit && parseFloat(spendingLimit) > 0 ? { spending_limit: parseFloat(spendingLimit) } : {}),
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Create Virtual Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                        <p className="text-danger text-sm">{error}</p>
                    </div>
                )}

                {/* Card design */}
                <div className="mb-5">
                    <label className="block text-sm font-medium text-foreground mb-2">Card Design</label>
                    <DesignPicker selected={cardDesign} onSelect={setCardDesign} />
                </div>

                {/* Initial funding amount */}
                <div className="mb-5">
                    <label className="block text-sm font-medium text-foreground mb-2">Initial Funding (USD)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <input
                            type="number"
                            value={amountUsd}
                            onChange={e => setAmountUsd(e.target.value)}
                            min="1"
                            className="w-full pl-8 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">Loaded onto the card and debited from your USD wallet.</p>
                        <p className="text-xs font-medium text-foreground">Bal: ${usdBalance.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                        {[5, 10, 25, 50].map(v => (
                            <button key={v} type="button" onClick={() => setAmountUsd(String(v))}
                                className="px-3 py-1 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                ${v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Spending limit (optional) */}
                <div className="mb-5">
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Spending Limit (USD) <span className="text-muted-foreground font-normal">— optional</span>
                    </label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <input
                            type="number"
                            value={spendingLimit}
                            onChange={e => setSpendingLimit(e.target.value)}
                            min="1"
                            placeholder="No limit"
                            className="w-full pl-8 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Fee breakdown */}
                <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Card funding</span><span className="text-foreground">${amt.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Creation fee</span><span className="text-foreground">${fee.toFixed(2)}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-border font-semibold"><span className="text-foreground">Total debited</span><span className="text-foreground">${total.toFixed(2)}</span></div>
                </div>

                {/* KYC note */}
                <div className="bg-primary/5 border border-primary/15 rounded-lg p-4 mb-5">
                    <p className="text-sm text-foreground font-medium mb-1">USD Virtual Card · accepted worldwide</p>
                    <p className="text-xs text-muted-foreground">
                        We'll use your verified name, date of birth, ID and billing address from your profile & KYC to issue the card.
                        Make sure your KYC is complete, or card creation will be declined.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 px-4 bg-muted text-foreground font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating...' : `Create Card · $${total.toFixed(2)}`}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Fund Card Modal Component
const FundCardModal = ({ card, wallets, onClose, onFund, loading, feeConfig }) => {
    const [amount, setAmount] = useState('');
    const [selectedWallet, setSelectedWallet] = useState(wallets[0]?.id || '');

    const wallet = wallets.find(w => w.id === selectedWallet);
    const amt = parseFloat(amount) || 0;
    const fee = computeCardFee(feeConfig, amt);
    const total = Math.round((amt + fee + Number.EPSILON) * 100) / 100;
    const balance = parseFloat(wallet?.available_balance ?? wallet?.balance ?? 0);
    const insufficient = amt > 0 && total > balance;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Fund Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {wallets.length === 0 && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-amber-700 text-sm">No USD wallet found. Please create a USD wallet first.</p>
                    </div>
                )}

                {/* Card Info */}
                <div className="bg-muted/50 rounded-lg p-4 mb-6">
                    <p className="text-sm text-muted-foreground">Card ending in</p>
                    <p className="text-lg font-mono font-bold text-foreground">
                        •••• {card.last_four || card.card_last_four || '****'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Current balance: {formatCurrency(card.balance || 0, 'USD')}
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Wallet Selection */}
                    {wallets.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">From Wallet</label>
                            <select
                                value={selectedWallet}
                                onChange={(e) => setSelectedWallet(e.target.value)}
                                className="w-full px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring"
                            >
                                {wallets.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        USD Wallet — {formatCurrency(w.balance || 0, 'USD')}
                                    </option>
                                ))}
                            </select>
                            {wallet && (
                                <p className="text-sm text-muted-foreground mt-1">Available: {formatCurrency(wallet.balance || 0, 'USD')}</p>
                            )}
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Amount (USD)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0.01"
                                className="w-full pl-8 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>
                </div>

                {/* Fee breakdown */}
                {amt > 0 && (
                    <div className="bg-muted/50 rounded-lg p-4 mt-4 space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Funding amount</span><span className="text-foreground">${amt.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Funding fee</span><span className="text-foreground">${fee.toFixed(2)}</span></div>
                        <div className="flex justify-between pt-1.5 border-t border-border font-semibold"><span className="text-foreground">Total debited</span><span className="text-foreground">${total.toFixed(2)}</span></div>
                        {insufficient && <p className="text-xs text-danger pt-1">Insufficient balance — available ${balance.toFixed(2)}.</p>}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 py-3 px-4 bg-muted text-foreground font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={() => onFund(card.id, amt)}
                        disabled={!amount || amt <= 0 || loading || wallets.length === 0 || insufficient}
                        className="flex-1 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Funding...' : (amt > 0 ? `Fund · $${total.toFixed(2)}` : 'Fund Card')}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Cards;
