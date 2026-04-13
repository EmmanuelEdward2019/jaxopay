import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Gift,
    Search,
    ShoppingCart,
    ArrowUpRight,
    Tag,
    X,
    Check,
    RefreshCw,
    Filter,
    Copy,
    Eye,
    EyeOff,
} from 'lucide-react';
import giftCardService from '../../services/giftCardService';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const CATEGORIES = [
    { id: 'all', name: 'All', icon: '🎁' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'food', name: 'Food & Dining', icon: '🍔' },
    { id: 'travel', name: 'Travel', icon: '✈️' },
];

const GiftCards = () => {
    const [tab, setTab] = useState('buy'); // 'buy', 'sell', 'my-cards'
    const [giftCards, setGiftCards] = useState([]);
    const [myCards, setMyCards] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [countries, setCountries] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState('US');
    const [selectedWallet, setSelectedWallet] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCard, setSelectedCard] = useState(null);
    const [showBuyModal, setShowBuyModal] = useState(false);
    const [showSellModal, setShowSellModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [revealedCodes, setRevealedCodes] = useState({});

    // Single mount effect — load gift cards + supporting data in parallel
    useEffect(() => {
        loadPage();
    }, []);

    // Re-fetch cards when country or search changes (debounced by user action)
    useEffect(() => {
        fetchGiftCards();
    }, [searchQuery, selectedCountry]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadPage = async () => {
        // Fire non-critical requests in parallel; they don't block gift card display
        Promise.allSettled([
            giftCardService.getCountries().then(r => { if (r.success) setCountries(r.data || []); }),
            giftCardService.getMyGiftCards().then(r => { if (r.success) setMyCards(r.data?.gift_cards || []); }),
            walletService.getWallets().then(r => {
                if (r.success) {
                    const arr = Array.isArray(r.data) ? r.data : (r.data?.wallets || []);
                    const active = arr.filter(w => w.is_active !== false && w.status !== 'frozen');
                    setWallets(active);
                    if (active.length > 0) setSelectedWallet(active[0].id);
                }
            }),
        ]);
        // Gift cards are the primary content — fetch separately so loading state is correct
        await fetchGiftCards();
    };

    const fetchGiftCards = async () => {
        setLoading(true);
        setError(null);
        const params = { country: selectedCountry, size: 50 };
        if (searchQuery) params.search = searchQuery;

        const result = await giftCardService.getGiftCards(params);
        if (result.success) {
            const data = result.data?.data || result.data;
            setGiftCards(data?.gift_cards || []);
            // Show API-level error if gift cards are empty but service still returned success
            if (result.data?.error || data?.error) {
                setError(result.data?.error || data?.error);
            }
        } else {
            setError(result.error || 'Failed to load gift cards');
        }
        setLoading(false);
    };

    const handleBuyCard = async (card, amount) => {
        setLoading(true);
        setError(null);
        const wallet = wallets.find(w => w.id === selectedWallet);
        const result = await giftCardService.buyGiftCard({
            productId: card.productId,
            amount: amount,
            currency: wallet?.currency || 'USD',
            cardCurrency: card.currency || 'USD',
            countryCode: card.countryCode,
        });
        if (result.success) {
            setSuccess('Gift card purchased successfully!');
            setShowBuyModal(false);
            // Refresh my cards and wallets inline
            giftCardService.getMyGiftCards().then(r => { if (r.success) setMyCards(r.data?.gift_cards || []); });
            walletService.getWallets().then(r => {
                if (r.success) {
                    const arr = Array.isArray(r.data) ? r.data : (r.data?.wallets || []);
                    const active = arr.filter(w => w.is_active !== false && w.status !== 'frozen');
                    setWallets(active);
                    if (active.length > 0 && !selectedWallet) setSelectedWallet(active[0].id);
                }
            });
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const handleRevealCode = async (transactionRef) => {
        if (revealedCodes[transactionRef]) {
            // toggle off
            setRevealedCodes(prev => {
                const newCodes = { ...prev };
                delete newCodes[transactionRef];
                return newCodes;
            });
            return;
        }

        const result = await giftCardService.redeemGiftCard(transactionRef);
        if (result.success) {
            setRevealedCodes(prev => ({
                ...prev,
                [transactionRef]: result.data
            }));
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Gift Cards</h1>
                    <p className="text-muted-foreground">Buy, sell, and manage gift cards from global brands</p>
                </div>
                <button
                    onClick={() => setShowSellModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
                >
                    <ArrowUpRight className="w-5 h-5" />
                    Sell Gift Card
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
                    <p className="text-danger">{error}</p>
                    <button onClick={() => setError(null)} className="text-danger underline text-sm mt-1">Dismiss</button>
                </div>
            )}
            {success && (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                    <p className="text-primary-700">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-primary-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                {[
                    { id: 'buy', label: 'Browse Cards', icon: ShoppingCart },
                    { id: 'my-cards', label: 'My Cards', icon: Gift },
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${tab === t.id
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground'
                            }`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Browse Cards Tab */}
            {tab === 'buy' && (
                <>
                    {/* Search and Categories */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search gift cards..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg"
                            />
                        </div>
                        <div className="sm:w-48">
                            <select
                                value={selectedCountry}
                                onChange={(e) => setSelectedCountry(e.target.value)}
                                className="w-full px-4 py-2.5 bg-card border border-border rounded-lg appearance-none cursor-pointer"
                            >
                                {countries.map((c) => (
                                    <option key={c.isoName} value={c.isoName}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={fetchGiftCards}
                            className="p-2.5 bg-muted rounded-lg hover:bg-muted transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Category Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium whitespace-nowrap transition-all ${selectedCategory === cat.id
                                    ? 'bg-primary-600 text-white shadow-md scale-105'
                                    : 'bg-muted text-foreground hover:bg-muted'
                                    }`}
                            >
                                <span>{cat.icon}</span>
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    {/* Gift Cards Grid */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                    ) : giftCards.length === 0 ? (
                        <div className="text-center py-12">
                            <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground mb-2">No gift cards found</h3>
                            <p className="text-muted-foreground">Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {giftCards
                                .filter(card => {
                                    if (selectedCategory === 'all') return true;
                                    const name = card.productName.toLowerCase();
                                    const catMap = {
                                        shopping: ['amazon', 'walmart', 'ebay', 'target', 'best buy', 'nike', 'adidas', 'shopping', 'retail'],
                                        entertainment: ['netflix', 'spotify', 'hulu', 'itunes', 'google play', 'streaming', 'showtime', 'paramount'],
                                        gaming: ['xbox', 'playstation', 'psn', 'nintendo', 'steam', 'roblox', 'pubg', 'fortnite', 'gaming', 'razer'],
                                        food: ['uber eats', 'door dash', 'starbucks', 'domino', 'restaurant', 'food', 'dining'],
                                        travel: ['uber', 'airbnb', 'hotel', 'flight', 'travel', 'expedia'],
                                    };
                                    const keywords = catMap[selectedCategory] || [selectedCategory];
                                    return keywords.some(k => name.includes(k));
                                })
                                .map((card) => (
                                    <motion.div
                                        key={card.productId}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="card overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                                        onClick={() => {
                                            setSelectedCard(card);
                                            setShowBuyModal(true);
                                        }}
                                    >
                                        <div className="aspect-[3/2] bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                                            {card.image_url ? (
                                                <img src={card.image_url} alt={card.productName} className="w-full h-full object-contain bg-card" />
                                            ) : (
                                                <Gift className="w-12 h-12 text-white/50" />
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary-600 transition-colors line-clamp-1 text-sm">
                                            {card.productName}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mb-2">{card.countryCode} • {card.currency}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-primary-600">
                                                {card.denominationType === 'FIXED'
                                                    ? `From ${formatCurrency(card.fixedDenominations[0] || card.minAmount, card.currency)}`
                                                    : `Up to ${formatCurrency(card.maxAmount, card.currency)}`
                                                }
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                        </div>
                    )}
                </>
            )}

            {/* My Cards Tab */}
            {tab === 'my-cards' && (
                <div>
                    {myCards.length === 0 ? (
                        <div className="text-center py-12">
                            <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground mb-2">No gift cards yet</h3>
                            <p className="text-muted-foreground mb-4">Purchase a gift card to get started</p>
                            <button
                                onClick={() => setTab('buy')}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                            >
                                Browse Gift Cards
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {myCards.map((card) => {
                                const revealData = revealedCodes[card.transaction_ref];
                                return (
                                    <div key={card.id} className="card">
                                        <div className="flex gap-4">
                                            <div className="w-24 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shrink-0">
                                                <Gift className="w-8 h-8 text-white/50" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-foreground">{card.product_name || card.brand_name}</h3>
                                                <p className="text-xl font-bold text-primary-600 mt-1">
                                                    {formatCurrency(card.amount, card.currency)}
                                                </p>

                                                <div className="mt-2">
                                                    {revealData ? (
                                                        <div className="bg-muted p-2 rounded border border-border">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="text-xs text-muted-foreground">Card Code</span>
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => {
                                                                        navigator.clipboard.writeText(revealData.code);
                                                                        setSuccess('Code copied to clipboard!');
                                                                    }} className="p-1 hover:bg-muted rounded">
                                                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                                                    </button>
                                                                    <button onClick={() => handleRevealCode(card.transaction_ref)} className="p-1 hover:bg-muted rounded">
                                                                        <EyeOff className="w-3 h-3 text-muted-foreground" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <code className="text-sm font-mono text-foreground break-all">
                                                                {revealData.code}
                                                            </code>
                                                            {revealData.pin && (
                                                                <div className="mt-2 pt-2 border-t border-border">
                                                                    <span className="text-xs text-muted-foreground block mb-1">PIN</span>
                                                                    <code className="text-sm font-mono text-foreground break-all">
                                                                        {revealData.pin}
                                                                    </code>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleRevealCode(card.transaction_ref)}
                                                            className="text-sm flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                                                        >
                                                            <Eye className="w-4 h-4" /> Reveal Code
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Purchased {formatDateTime(card.created_at)}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${card.status === 'completed' ? 'bg-primary-100 text-primary-700' :
                                                card.status === 'failed' ? 'bg-danger/10 text-danger' :
                                                    'bg-warning/10 text-yellow-700'
                                                }`}>
                                                {card.status}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Buy Modal */}
            <AnimatePresence>
                {showBuyModal && selectedCard && (
                    <BuyGiftCardModal
                        card={selectedCard}
                        wallets={wallets}
                        selectedWallet={selectedWallet}
                        setSelectedWallet={setSelectedWallet}
                        onClose={() => {
                            setShowBuyModal(false);
                            setSelectedCard(null);
                        }}
                        onBuy={handleBuyCard}
                        loading={loading}
                    />
                )}
            </AnimatePresence>

            {/* Sell Modal */}
            <AnimatePresence>
                {showSellModal && (
                    <SellGiftCardModal
                        onClose={() => setShowSellModal(false)}
                        onSuccess={() => {
                            setSuccess('Gift card submitted for review!');
                            setShowSellModal(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Buy Gift Card Modal
const BuyGiftCardModal = ({ card, wallets, selectedWallet, setSelectedWallet, onClose, onBuy, loading }) => {
    // If FIXED, show dropdown. If RANGE, show input.
    const isFixed = card.denominationType === 'FIXED';
    const denominations = isFixed ? card.fixedDenominations : [];

    // Default selected amount
    const [amount, setAmount] = useState(
        isFixed
            ? (denominations[0] || card.minAmount || 25)
            : (card.minAmount || 25)
    );

    const wallet = wallets.find(w => w.id === selectedWallet);

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
                    <h2 className="text-xl font-bold text-foreground">Buy Gift Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Card Preview */}
                <div className="aspect-[3/2] bg-card border border-border rounded-xl mb-6 flex items-center justify-center overflow-hidden p-4">
                    {card.image_url ? (
                        <img src={card.image_url} alt={card.productName} className="object-contain max-h-full" />
                    ) : (
                        <div className="text-center text-muted-foreground">
                            <Gift className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p className="font-bold text-sm text-muted-foreground">{card.productName}</p>
                        </div>
                    )}
                </div>

                {/* Denomination Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-foreground mb-3">
                        Select Amount ({card.currency})
                    </label>
                    {isFixed ? (
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {denominations.map((denom) => (
                                <button
                                    key={denom}
                                    onClick={() => setAmount(denom)}
                                    className={`py-3 rounded-lg font-semibold transition-colors ${amount === denom
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-muted text-foreground'
                                        }`}
                                >
                                    {formatCurrency(denom, card.currency)}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div>
                            <input
                                type="number"
                                min={card.minAmount}
                                max={card.maxAmount}
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-lg font-medium"
                                placeholder={`Enter amount (${card.minAmount} - ${card.maxAmount})`}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Specify an amount between {formatCurrency(card.minAmount, card.currency)} - {formatCurrency(card.maxAmount, card.currency)}</p>
                        </div>
                    )}
                </div>

                {/* Wallet Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Pay From Wallet
                    </label>
                    <select
                        value={selectedWallet}
                        onChange={(e) => setSelectedWallet(e.target.value)}
                        className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                    >
                        {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                                {w.currency} Wallet - {formatCurrency(w.balance || 0, w.currency)}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-muted text-foreground font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={() => onBuy(card, amount)}
                        disabled={
                            loading ||
                            !wallet ||
                            !amount ||
                            (wallet.currency !== card.currency ? false : (wallet.balance || 0) < amount)
                        }
                        className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : `Buy for ${formatCurrency(amount, card.currency)}`}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Sell Gift Card Modal
const SellGiftCardModal = ({ onClose, onSuccess }) => {
    const [brand, setBrand] = useState('');
    const [value, setValue] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setLoading(true);
        const result = await giftCardService.sellGiftCard({
            brand,
            value: parseFloat(value),
            code,
        });
        if (result.success) {
            onSuccess();
        }
        setLoading(false);
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
                    <h2 className="text-xl font-bold text-foreground">Sell Gift Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Brand</label>
                        <input
                            type="text"
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            placeholder="e.g. Amazon, iTunes, Steam"
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Value (USD)</label>
                        <input
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="Card value"
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Gift Card Code</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Enter gift card code"
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                        />
                    </div>
                </div>

                <p className="text-sm text-muted-foreground mt-4 mb-6">
                    We'll verify your card and credit your wallet within 24 hours. You'll receive 80-90% of the card value.
                </p>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-muted text-foreground font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!brand || !value || !code || loading}
                        className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : 'Submit for Review'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default GiftCards;
