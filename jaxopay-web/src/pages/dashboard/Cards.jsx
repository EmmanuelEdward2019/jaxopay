import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CreditCard,
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
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const Cards = () => {
    const [cards, setCards] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showFundModal, setShowFundModal] = useState(false);
    const [showDetails, setShowDetails] = useState({});
    const [copiedField, setCopiedField] = useState(null);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

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
    }, []);

    const fetchCards = async () => {
        const result = await cardService.getCards();
        if (result.success) {
            // Backend returns data as array directly or as data.cards
            const cardsData = Array.isArray(result.data) ? result.data : (result.data?.cards || []);
            setCards(cardsData);
        } else {
            setError(result.error);
        }
    };

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const walletsData = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
            // Filter for USD wallets that are active (is_active=true)
            setWallets(walletsData.filter(w => w.currency === 'USD' && w.is_active !== false) || []);
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

    const handleCreateCard = async (cardData) => {
        setActionLoading(true);
        const result = await cardService.createCard(cardData);
        if (result.success) {
            await fetchCards();
            setShowCreateModal(false);
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleFundCard = async (cardId, amount, walletId) => {
        setActionLoading(true);
        const result = await cardService.fundCard(cardId, amount, walletId);
        if (result.success) {
            await fetchCards();
            if (selectedCard?.id === cardId) {
                await fetchCardTransactions(cardId);
            }
            setShowFundModal(false);
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleFreezeCard = async (cardId) => {
        setActionLoading(true);
        const result = await cardService.freezeCard(cardId);
        if (result.success) {
            await fetchCards();
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleUnfreezeCard = async (cardId) => {
        setActionLoading(true);
        const result = await cardService.unfreezeCard(cardId);
        if (result.success) {
            await fetchCards();
        } else {
            setError(result.error);
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
            setError(result.error);
        }
        setActionLoading(false);
    };

    const toggleShowDetails = (cardId) => {
        setShowDetails(prev => ({ ...prev, [cardId]: !prev[cardId] }));
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Virtual Cards</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage your USD virtual cards for online payments</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-accent-500/20"
                >
                    <Plus className="w-5 h-5" />
                    Create Card
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            {/* KYC Notice */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                    <p className="text-amber-800 dark:text-amber-200 font-medium">KYC Tier 2 Required</p>
                    <p className="text-amber-700 dark:text-amber-300 text-sm">Virtual cards require KYC Tier 2 verification. Complete your verification to create cards.</p>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cards.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No virtual cards yet</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Create your first USD virtual card for secure online payments
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            Create Your First Card
                        </button>
                    </div>
                ) : (
                    cards.map((card) => (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`relative overflow-hidden rounded-2xl cursor-pointer transition-all ${selectedCard?.id === card.id ? 'ring-2 ring-accent-500' : ''
                                }`}
                            onClick={() => handleSelectCard(card)}
                        >
                            {/* Card Visual */}
                            <div className={`p-6 bg-gradient-to-br ${card.card_type === 'single_use'
                                ? 'from-slate-700 to-slate-900'
                                : 'from-accent-600 to-accent-800 shadow-lg shadow-accent-500/20'
                                } text-white`}>
                                <div className="flex items-start justify-between mb-8">
                                    <div>
                                        <p className="text-white/70 text-sm mb-1">
                                            {card.card_type === 'single_use' ? 'Single Use' : 'Multi-Use'} Card
                                        </p>
                                        <p className="text-2xl font-bold">
                                            {showDetails[card.id]
                                                ? formatCurrency(card.balance || 0, 'USD')
                                                : '•••••'
                                            }
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {card.card_status === 'frozen' && (
                                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium rounded-full flex items-center gap-1 border border-gray-200 dark:border-gray-700">
                                                <Lock className="w-3 h-3" />
                                                Frozen
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleShowDetails(card.id);
                                            }}
                                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            {showDetails[card.id] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Card Number */}
                                <div className="mb-6">
                                    <p className="text-white/50 text-xs mb-1">Card Number</p>
                                    <div className="flex items-center gap-2">
                                        <p className="font-mono text-lg tracking-wider">
                                            {showDetails[card.id]
                                                ? maskCardNumber(card.card_number)
                                                : '•••• •••• •••• ' + (card.last_four || '••••')
                                            }
                                        </p>
                                        {showDetails[card.id] && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(card.card_number, `number-${card.id}`);
                                                }}
                                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                            >
                                                {copiedField === `number-${card.id}` ? (
                                                    <Check className="w-4 h-4 text-accent-400" />
                                                ) : (
                                                    <Copy className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Card Details */}
                                <div className="flex gap-8">
                                    <div>
                                        <p className="text-white/50 text-xs mb-1">Expiry</p>
                                        <p className="font-mono">
                                            {showDetails[card.id] ? card.expiry_date : '••/••'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-white/50 text-xs mb-1">CVV</p>
                                        <div className="flex items-center gap-1">
                                            <p className="font-mono">
                                                {showDetails[card.id] ? card.cvv : '•••'}
                                            </p>
                                            {showDetails[card.id] && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyToClipboard(card.cvv, `cvv-${card.id}`);
                                                    }}
                                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                                >
                                                    {copiedField === `cvv-${card.id}` ? (
                                                        <Check className="w-3 h-3 text-accent-400" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="ml-auto">
                                        <p className="text-white/50 text-xs mb-1">Brand</p>
                                        <p className="font-bold uppercase">{card.brand || 'VISA'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Card Actions */}
                            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCard(card);
                                            setShowFundModal(true);
                                        }}
                                        disabled={card.card_status === 'frozen' || card.card_type === 'single_use'}
                                        className="flex-1 py-2 px-3 bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium rounded-lg hover:bg-accent-100 dark:hover:bg-accent-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                            ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 hover:bg-accent-100 dark:hover:bg-accent-900/40'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                    >
                                        {card.card_status === 'frozen' ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleTerminateCard(card.id);
                                        }}
                                        className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Selected Card Transactions */}
            {selectedCard && (
                <div className="card">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Card Transactions (*{selectedCard.last_four})
                        </h3>
                        <button
                            onClick={() => {
                                setSelectedCard(null);
                                setTransactions([]);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <p>No transactions yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {tx.merchant || tx.description || 'Card Transaction'}
                                        </p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {formatDateTime(tx.created_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            -{formatCurrency(tx.amount, 'USD')}
                                        </p>
                                        <p className={`text-sm ${tx.status === 'completed' ? 'text-accent-600' : 'text-yellow-600'
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
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Create Card Modal Component
const CreateCardModal = ({ onClose, onCreate, loading }) => {
    const [cardType, setCardType] = useState('multi_use');
    const [brand, setBrand] = useState('visa');

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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Virtual Card</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Card Type Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Card Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setCardType('multi_use')}
                            className={`p-4 rounded-xl border-2 text-left transition-colors ${cardType === 'multi_use'
                                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <CreditCard className={`w-8 h-8 mb-2 ${cardType === 'multi_use' ? 'text-accent-600' : 'text-gray-400'}`} />
                            <p className="font-semibold text-gray-900 dark:text-white">Multi-Use</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Reloadable card for recurring payments</p>
                        </button>
                        <button
                            onClick={() => setCardType('single_use')}
                            className={`p-4 rounded-xl border-2 text-left transition-colors ${cardType === 'single_use'
                                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <CreditCard className={`w-8 h-8 mb-2 ${cardType === 'single_use' ? 'text-accent-600' : 'text-gray-400'}`} />
                            <p className="font-semibold text-gray-900 dark:text-white">Single-Use</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">One-time use for secure payments</p>
                        </button>
                    </div>
                </div>

                {/* Card Brand Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Card Brand
                    </label>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setBrand('visa')}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold text-lg transition-colors ${brand === 'visa'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}
                        >
                            VISA
                        </button>
                        <button
                            onClick={() => setBrand('mastercard')}
                            className={`flex-1 py-3 px-4 rounded-lg font-bold text-lg transition-colors ${brand === 'mastercard'
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}
                        >
                            Mastercard
                        </button>
                    </div>
                </div>

                {/* Info */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Note:</strong> Virtual cards are denominated in USD and can be used for online payments worldwide.
                        {cardType === 'single_use' && ' Single-use cards are automatically terminated after one transaction.'}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onCreate({ card_type: cardType, currency: 'USD', brand })}
                        disabled={loading}
                        className="flex-1 py-3 px-4 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating...' : 'Create Card'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Fund Card Modal Component
const FundCardModal = ({ card, wallets, onClose, onFund, loading }) => {
    const [amount, setAmount] = useState('');
    const [selectedWallet, setSelectedWallet] = useState(wallets[0]?.id || '');

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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fund Card</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Card Info */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Card ending in</p>
                    <p className="text-lg font-mono font-bold text-gray-900 dark:text-white">
                        •••• {card.last_four}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Current balance: {formatCurrency(card.balance || 0, 'USD')}
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Wallet Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            From Wallet
                        </label>
                        <select
                            value={selectedWallet}
                            onChange={(e) => setSelectedWallet(e.target.value)}
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500"
                        >
                            {wallets.map((w) => (
                                <option key={w.id} value={w.id}>
                                    USD Wallet - {formatCurrency(w.balance || 0, 'USD')}
                                </option>
                            ))}
                        </select>
                        {wallet && (
                            <p className="text-sm text-gray-500 mt-1">
                                Available: {formatCurrency(wallet.balance || 0, 'USD')}
                            </p>
                        )}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Amount
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-8 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onFund(card.id, parseFloat(amount), selectedWallet)}
                        disabled={!amount || parseFloat(amount) <= 0 || loading}
                        className="flex-1 py-3 px-4 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Funding...' : 'Fund Card'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Cards;
