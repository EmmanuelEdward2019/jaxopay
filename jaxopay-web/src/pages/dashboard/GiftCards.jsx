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
    const [selectedWallet, setSelectedWallet] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCard, setSelectedCard] = useState(null);
    const [showBuyModal, setShowBuyModal] = useState(false);
    const [showSellModal, setShowSellModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        fetchGiftCards();
        fetchMyCards();
        fetchWallets();
    }, []);

    const fetchGiftCards = async () => {
        setLoading(true);
        const result = await giftCardService.getGiftCards();
        if (result.success) {
            setGiftCards(result.data.gift_cards || []);
        }
        setLoading(false);
    };

    const fetchMyCards = async () => {
        const result = await giftCardService.getMyGiftCards();
        if (result.success) {
            setMyCards(result.data.gift_cards || []);
        }
    };

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const activeWallets = result.data.wallets?.filter(w => w.status !== 'frozen') || [];
            setWallets(activeWallets);
            if (activeWallets.length > 0) {
                setSelectedWallet(activeWallets[0].id);
            }
        }
    };

    const handleBuyCard = async (cardId, denomination) => {
        setLoading(true);
        setError(null);
        const result = await giftCardService.buyGiftCard({
            gift_card_id: cardId,
            denomination,
            wallet_id: selectedWallet,
        });
        if (result.success) {
            setSuccess('Gift card purchased successfully!');
            setShowBuyModal(false);
            fetchMyCards();
            fetchWallets();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const filteredCards = giftCards.filter(card => {
        const matchesCategory = selectedCategory === 'all' || card.category === selectedCategory;
        const matchesSearch = !searchQuery ||
            card.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            card.brand?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gift Cards</h1>
                    <p className="text-gray-600 dark:text-gray-400">Buy, sell, and manage gift cards</p>
                </div>
                <button
                    onClick={() => setShowSellModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg"
                >
                    <ArrowUpRight className="w-5 h-5" />
                    Sell Gift Card
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-700 dark:text-green-300">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-green-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                {[
                    { id: 'buy', label: 'Browse Cards', icon: ShoppingCart },
                    { id: 'my-cards', label: 'My Cards', icon: Gift },
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${tab === t.id
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-600 dark:text-gray-400'
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
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search gift cards..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                            />
                        </div>
                        <button
                            onClick={fetchGiftCards}
                            className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-lg"
                        >
                            <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>

                    {/* Category Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.id
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
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
                    ) : filteredCards.length === 0 ? (
                        <div className="text-center py-12">
                            <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No gift cards found</h3>
                            <p className="text-gray-600 dark:text-gray-400">Try adjusting your search or filters</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {filteredCards.map((card) => (
                                <motion.div
                                    key={card.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="card overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                                    onClick={() => {
                                        setSelectedCard(card);
                                        setShowBuyModal(true);
                                    }}
                                >
                                    <div className="aspect-[3/2] bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                                        {card.image ? (
                                            <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Gift className="w-12 h-12 text-white/50" />
                                        )}
                                    </div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-primary-600 transition-colors">
                                        {card.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-2">{card.brand}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-primary-600">
                                            From {formatCurrency(card.min_amount || 10, 'USD')}
                                        </span>
                                        <Tag className="w-4 h-4 text-gray-400" />
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
                            <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No gift cards yet</h3>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">Purchase a gift card to get started</p>
                            <button
                                onClick={() => setTab('buy')}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                            >
                                Browse Gift Cards
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {myCards.map((card) => (
                                <div key={card.id} className="card">
                                    <div className="flex gap-4">
                                        <div className="w-24 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shrink-0">
                                            <Gift className="w-8 h-8 text-white/50" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">{card.name}</h3>
                                            <p className="text-xl font-bold text-primary-600 mt-1">
                                                {formatCurrency(card.balance || card.amount, 'USD')}
                                            </p>
                                            {card.code && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">
                                                        {card.show_code ? card.code : '•••• •••• ••••'}
                                                    </code>
                                                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                                        <Copy className="w-4 h-4 text-gray-500" />
                                                    </button>
                                                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                                        <Eye className="w-4 h-4 text-gray-500" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Purchased {formatDateTime(card.created_at)}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${card.status === 'active' ? 'bg-green-100 text-green-700' :
                                                card.status === 'redeemed' ? 'bg-gray-100 text-gray-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {card.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
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
    const [denomination, setDenomination] = useState(card.denominations?.[0] || card.min_amount || 25);
    const wallet = wallets.find(w => w.id === selectedWallet);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Buy Gift Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Card Preview */}
                <div className="aspect-[3/2] bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl mb-6 flex items-center justify-center">
                    <div className="text-center text-white">
                        <Gift className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="font-bold text-lg">{card.name}</p>
                    </div>
                </div>

                {/* Denomination Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Select Amount
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {(card.denominations || [25, 50, 100, 200, 500]).map((amount) => (
                            <button
                                key={amount}
                                onClick={() => setDenomination(amount)}
                                className={`py-3 rounded-lg font-semibold transition-colors ${denomination === amount
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                {formatCurrency(amount, 'USD')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Wallet Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Pay From
                    </label>
                    <select
                        value={selectedWallet}
                        onChange={(e) => setSelectedWallet(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
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
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={() => onBuy(card.id, denomination)}
                        disabled={loading || !wallet || (wallet.balance || 0) < denomination}
                        className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : `Buy for ${formatCurrency(denomination, 'USD')}`}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sell Gift Card</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Brand</label>
                        <input
                            type="text"
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            placeholder="e.g. Amazon, iTunes, Steam"
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Value (USD)</label>
                        <input
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="Card value"
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Gift Card Code</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Enter gift card code"
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>
                </div>

                <p className="text-sm text-gray-500 mt-4 mb-6">
                    We'll verify your card and credit your wallet within 24 hours. You'll receive 80-90% of the card value.
                </p>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!brand || !value || !code || loading}
                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : 'Submit for Review'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default GiftCards;
