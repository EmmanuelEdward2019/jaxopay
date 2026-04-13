import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send, Building2, Check, ChevronRight, RefreshCw,
    AlertCircle, X, Search, Clock, CheckCircle,
    ArrowRight, ShieldCheck, Star, StarOff, UserPlus,
    Users, ChevronDown, Trash2, Bookmark,
} from 'lucide-react';
import apiClient from '../../lib/apiClient';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const BENEFICIARY_KEY = 'jaxopay_beneficiaries';

// ── Helpers ──────────────────────────────────────────────────────────────────
const loadBeneficiaries = () => {
    try { return JSON.parse(localStorage.getItem(BENEFICIARY_KEY) || '[]'); }
    catch { return []; }
};
const saveBeneficiaries = (list) =>
    localStorage.setItem(BENEFICIARY_KEY, JSON.stringify(list));

const statusStyle = (status) => {
    const s = status?.toLowerCase();
    if (['completed', 'successful', 'success'].includes(s))
        return 'bg-success/10 text-success';
    if (s === 'failed')
        return 'bg-danger/10 text-danger';
    return 'bg-warning/10 text-yellow-700';
};

// ── BankSelect component ──────────────────────────────────────────────────────
const BankSelect = ({ banks, selectedBank, onSelect, loading }) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = search
        ? banks.filter(b => b.name?.toLowerCase().includes(search.toLowerCase()) || b.code?.includes(search))
        : banks;

    return (
        <div className="relative" ref={ref}>
            <label className="block text-sm font-medium text-foreground mb-2">
                Bank Name <span className="text-muted-foreground font-normal">({banks.length} banks available)</span>
            </label>

            {/* Trigger button */}
            <button
                type="button"
                onClick={() => { setOpen(!open); setSearch(''); }}
                disabled={loading || banks.length === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none transition-all disabled:opacity-50"
            >
                <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    {selectedBank ? (
                        <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{selectedBank.name}</p>
                            <p className="text-xs text-muted-foreground">Code: {selectedBank.code}</p>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">
                            {loading ? 'Loading banks...' : banks.length === 0 ? 'Failed to load banks — retry' : 'Select your bank'}
                        </span>
                    )}
                </div>
                {loading
                    ? <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                    : <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                }
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scaleY: 0.9 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -8, scaleY: 0.9 }}
                        style={{ transformOrigin: 'top' }}
                        className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl"
                    >
                        {/* Search inside dropdown */}
                        <div className="p-3 border-b border-border">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Type to search banks..."
                                    className="w-full pl-9 pr-4 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">{filtered.length} of {banks.length} banks</p>
                        </div>

                        {/* Bank list */}
                        <div className="max-h-64 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground py-6">No banks match "{search}"</p>
                            ) : (
                                filtered.map((bank) => (
                                    <button
                                        key={bank.code}
                                        onClick={() => { onSelect(bank); setOpen(false); setSearch(''); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/10 text-left transition-colors ${selectedBank?.code === bank.code ? 'bg-primary/10' : ''}`}
                                    >
                                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 text-primary font-bold text-xs">
                                            {bank.name?.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{bank.name}</p>
                                            <p className="text-xs text-muted-foreground">Bank code: {bank.code}</p>
                                        </div>
                                        {selectedBank?.code === bank.code && (
                                            <Check className="w-4 h-4 text-primary shrink-0" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Main Transfer component ───────────────────────────────────────────────────
const Transfer = () => {
    const [step, setStep] = useState(1);
    const [banks, setBanks] = useState([]);
    const [banksLoading, setBanksLoading] = useState(true);
    const [selectedBank, setSelectedBank] = useState(null);
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    const [amount, setAmount] = useState('');
    const [narration, setNarration] = useState('');
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState('');
    const [history, setHistory] = useState([]);
    const [beneficiaries, setBeneficiaries] = useState(loadBeneficiaries());
    const [addingBeneficiary, setAddingBeneficiary] = useState(false);
    const [beneficiaryLabel, setBeneficiaryLabel] = useState('');
    const [showBeneficiaries, setShowBeneficiaries] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        fetchBanks();
        fetchWallets();
        fetchHistory();
    }, []);

    // Auto-resolve when bank + 10-digit account are ready
    useEffect(() => {
        if (selectedBank && accountNumber.length === 10) {
            resolveAccount();
        } else if (accountNumber.length < 10) {
            setAccountName('');
        }
    }, [accountNumber, selectedBank]);

    const fetchBanks = async () => {
        setBanksLoading(true);
        setError(null);
        try {
            const body = await apiClient.get('/transfers/banks?currency=NGN');
            const list = body?.data || [];
            // Sort alphabetically
            list.sort((a, b) => a.name?.localeCompare(b.name));
            setBanks(list);
        } catch (e) {
            // If session expired, the apiClient will redirect to login — don't show confusing error
            if (e?.status === 401) return;
            setError(e?.message || `Could not load bank list. Please check your connection and try again.`);
        } finally {
            setBanksLoading(false);
        }
    };

    const fetchWallets = async () => {
        const res = await walletService.getWallets();
        if (res.success) {
            const arr = Array.isArray(res.data) ? res.data : (res.data?.wallets || []);
            const active = arr.filter(w => w.is_active !== false && w.currency === 'NGN');
            setWallets(active);
            if (active.length > 0) setSelectedWallet(active[0].id);
        }
    };

    const fetchHistory = async () => {
        try {
            const body = await apiClient.get('/transfers/history');
            setHistory(body?.data?.transfers || []);
        } catch { /* silent */ }
    };

    const resolveAccount = async () => {
        if (!selectedBank || accountNumber.length !== 10) return;
        setResolving(true);
        setError(null);
        try {
            const body = await apiClient.post('/transfers/resolve', {
                bank_code: selectedBank.code,
                account_number: accountNumber,
                currency: 'NGN',
            });
            setAccountName(body?.data?.account_name || '');
        } catch (e) {
            setError(e.message || 'Could not verify account. Check number and try again.');
            setAccountName('');
        }
        setResolving(false);
    };

    const handleSend = async () => {
        if (!selectedBank || !accountNumber || !accountName || !amount || !selectedWallet) return;
        setLoading(true);
        setError(null);
        try {
            const body = await apiClient.post('/transfers/send', {
                wallet_id: selectedWallet,
                bank_code: selectedBank.code,
                bank_name: selectedBank.name,
                account_number: accountNumber,
                account_name: accountName,
                amount: parseFloat(amount),
                currency: 'NGN',
                narration: narration || `Transfer to ${accountName}`,
            });
            setResult(body?.data);
            setStep(4);
            fetchHistory();
        } catch (e) {
            setError(e.message || 'Transfer failed. Please try again.');
        }
        setLoading(false);
    };

    const handleAddBeneficiary = () => {
        if (!accountName || !selectedBank) return;
        const label = beneficiaryLabel.trim() || accountName;
        const entry = {
            id: `${Date.now()}`,
            label,
            account_name: accountName,
            account_number: accountNumber,
            bank_code: selectedBank.code,
            bank_name: selectedBank.name,
            added_at: new Date().toISOString(),
        };
        const updated = [entry, ...beneficiaries.filter(b => b.account_number !== accountNumber)];
        saveBeneficiaries(updated);
        setBeneficiaries(updated);
        setAddingBeneficiary(false);
        setBeneficiaryLabel('');
    };

    const handleUseBeneficiary = (b) => {
        const bank = banks.find(bk => bk.code === b.bank_code);
        if (bank) {
            setSelectedBank(bank);
            setAccountNumber(b.account_number);
            setAccountName(b.account_name);
            setShowBeneficiaries(false);
        }
    };

    const handleDeleteBeneficiary = (id) => {
        const updated = beneficiaries.filter(b => b.id !== id);
        saveBeneficiaries(updated);
        setBeneficiaries(updated);
    };

    // Recent banks from transfer history
    const recentBanks = (() => {
        const seen = new Set();
        return history
            .filter(t => t.metadata?.bank_code)
            .filter(t => { const k = t.metadata.bank_code; if (seen.has(k)) return false; seen.add(k); return true; })
            .slice(0, 5)
            .map(t => ({ code: t.metadata.bank_code, name: t.metadata.bank_name, account_name: t.metadata.account_name, account_number: t.metadata.account_number }));
    })();

    const selectedWalletData = wallets.find(w => w.id === selectedWallet);
    const canProceed = selectedBank && accountNumber.length === 10 && accountName && amount && parseFloat(amount) >= 100;
    const alreadySaved = beneficiaries.some(b => b.account_number === accountNumber);

    const resetForm = () => {
        setStep(1); setSelectedBank(null); setAccountNumber(''); setAccountName('');
        setAmount(''); setNarration(''); setResult(null); setError(null);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Bank Transfer</h1>
                <p className="text-muted-foreground">Send money directly to any Nigerian bank account</p>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-start gap-3"
                    >
                        <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-danger text-sm">{error}</p>
                        </div>
                        <button onClick={() => setError(null)}><X className="w-4 h-4 text-danger" /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Transfer Form ── */}
                <div className="lg:col-span-2 space-y-4">

                    {/* Beneficiaries Quick-Select Panel */}
                    {(beneficiaries.length > 0 || recentBanks.length > 0) && step === 1 && (
                        <div className="card">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-primary" />
                                    <h3 className="text-sm font-semibold text-foreground">Quick Select</h3>
                                </div>
                                <div className="flex gap-2 text-xs">
                                    <button
                                        onClick={() => setShowBeneficiaries(!showBeneficiaries)}
                                        className={`px-3 py-1 rounded-full font-medium transition-colors ${showBeneficiaries ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        <Star className="w-3 h-3 inline mr-1" />Saved ({beneficiaries.length})
                                    </button>
                                </div>
                            </div>

                            {/* Saved Beneficiaries */}
                            {showBeneficiaries && beneficiaries.length > 0 && (
                                <div className="space-y-2 mb-3">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved Contacts</p>
                                    {beneficiaries.map((b) => (
                                        <div key={b.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl group">
                                            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                                <span className="text-primary font-bold text-sm">
                                                    {b.label?.slice(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{b.label}</p>
                                                <p className="text-xs text-muted-foreground truncate">{b.account_number} · {b.bank_name}</p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleUseBeneficiary(b)}
                                                    className="px-2.5 py-1 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90"
                                                >
                                                    Use
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteBeneficiary(b.id)}
                                                    className="p-1.5 text-danger hover:text-danger hover:bg-danger/10 rounded-lg"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Recent Banks */}
                            {recentBanks.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Recent</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {recentBanks.map((b) => (
                                            <button
                                                key={b.code + b.account_number}
                                                onClick={() => {
                                                    const bank = banks.find(bk => bk.code === b.code);
                                                    if (bank) { setSelectedBank(bank); setAccountNumber(b.account_number || ''); setAccountName(b.account_name || ''); }
                                                }}
                                                className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl hover:border-primary hover:bg-primary/10 transition-all text-left"
                                            >
                                                <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground">
                                                    {b.name?.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-foreground">{b.name?.replace(/ Bank| PLC/gi, '')}</p>
                                                    {b.account_number && <p className="text-xs text-muted-foreground">{b.account_number}</p>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Main Form Card */}
                    <div className="card">
                        {/* Step indicators */}
                        <div className="flex items-center gap-2 mb-6">
                            {['Details', 'Confirm', 'Done'].map((label, index) => (
                                <div key={label} className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${step > index + 1 ? 'bg-primary text-white' : step === index + 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                                        {step > index + 1 ? <Check className="w-4 h-4" /> : index + 1}
                                    </div>
                                    <span className={`hidden sm:block ml-1.5 text-xs font-medium mr-3 ${step === index + 1 ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
                                    {index < 2 && <div className={`w-8 h-0.5 ${step > index + 1 ? 'bg-primary' : 'bg-muted'}`} />}
                                </div>
                            ))}
                        </div>

                        {/* ── Step 1: Enter Details ── */}
                        {step === 1 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                                <h2 className="text-lg font-semibold text-foreground">Recipient Details</h2>

                                {/* Bank Dropdown */}
                                <BankSelect
                                    banks={banks}
                                    selectedBank={selectedBank}
                                    loading={banksLoading}
                                    onSelect={(bank) => { setSelectedBank(bank); setAccountName(''); }}
                                />

                                {/* Account Number */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Account Number
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={10}
                                        value={accountNumber}
                                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                                        placeholder="10-digit NUBAN account number"
                                        className="w-full px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none font-mono tracking-widest"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {accountNumber.length}/10 digits
                                        {selectedBank && accountNumber.length === 10 && !accountName && !resolving && (
                                            <button onClick={resolveAccount} className="ml-2 text-primary underline">Verify manually</button>
                                        )}
                                    </p>
                                </div>

                                {/* Account name resolved */}
                                <AnimatePresence mode="wait">
                                    {resolving && (
                                        <motion.div key="resolving"
                                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3"
                                        >
                                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                            Verifying account with bank...
                                        </motion.div>
                                    )}
                                    {accountName && !resolving && (
                                        <motion.div key="resolved"
                                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                            className="bg-primary/10 border border-primary/20 rounded-xl p-4"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Account Verified</p>
                                                        <p className="font-bold text-foreground">{accountName}</p>
                                                        <p className="text-xs text-primary">{selectedBank?.name}</p>
                                                    </div>
                                                </div>
                                                {/* Add to beneficiaries button */}
                                                {!alreadySaved && !addingBeneficiary && (
                                                    <button
                                                        onClick={() => setAddingBeneficiary(true)}
                                                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5" /> Save
                                                    </button>
                                                )}
                                                {alreadySaved && (
                                                    <span className="flex items-center gap-1 text-xs text-success font-medium">
                                                        <Bookmark className="w-3.5 h-3.5" /> Saved
                                                    </span>
                                                )}
                                            </div>

                                            {/* Beneficiary label input */}
                                            <AnimatePresence>
                                                {addingBeneficiary && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="mt-3 flex gap-2"
                                                    >
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={beneficiaryLabel}
                                                            onChange={(e) => setBeneficiaryLabel(e.target.value)}
                                                            placeholder={`Label (e.g. "${accountName.split(' ')[0]}")`}
                                                            className="flex-1 px-3 py-2 text-sm bg-card border border-accent-300 rounded-lg focus:ring-2 focus:ring-ring outline-none"
                                                        />
                                                        <button
                                                            onClick={handleAddBeneficiary}
                                                            className="px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => { setAddingBeneficiary(false); setBeneficiaryLabel(''); }}
                                                            className="px-3 py-2 bg-muted text-muted-foreground text-sm rounded-lg"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Amount */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Amount (₦) <span className="text-muted-foreground font-normal">— minimum ₦100</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-lg">₦</span>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            min="100"
                                            className="w-full pl-9 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none text-xl font-bold"
                                        />
                                    </div>
                                    {selectedWalletData && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Available: <strong className="text-foreground">{formatCurrency(selectedWalletData.available_balance || selectedWalletData.balance || 0, 'NGN')}</strong>
                                        </p>
                                    )}
                                </div>

                                {/* Narration */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Narration <span className="text-muted-foreground font-normal">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={narration}
                                        onChange={(e) => setNarration(e.target.value)}
                                        maxLength={100}
                                        placeholder="What is this transfer for?"
                                        className="w-full px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none"
                                    />
                                </div>

                                {/* Source wallet (show if multiple NGN wallets) */}
                                {wallets.length > 1 && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Pay From</label>
                                        <select
                                            value={selectedWallet}
                                            onChange={(e) => setSelectedWallet(e.target.value)}
                                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                                        >
                                            {wallets.map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    NGN Wallet — {formatCurrency(w.balance || 0, 'NGN')}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button
                                    onClick={() => setStep(2)}
                                    disabled={!canProceed}
                                    className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-base"
                                >
                                    Review Transfer <ArrowRight className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}

                        {/* ── Step 2: Confirm ── */}
                        {step === 2 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-center gap-2 mb-5">
                                    <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-lg">
                                        <ChevronRight className="w-5 h-5 rotate-180 text-muted-foreground" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-foreground">Confirm Transfer</h2>
                                </div>

                                <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 mb-5">
                                    <div className="text-center mb-6">
                                        <p className="text-sm text-muted-foreground mb-1">Transfer Amount</p>
                                        <p className="text-4xl font-bold text-foreground">
                                            {formatCurrency(parseFloat(amount), 'NGN')}
                                        </p>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        {[
                                            { label: 'Recipient Name', value: accountName },
                                            { label: 'Account Number', value: accountNumber },
                                            { label: 'Bank', value: selectedBank?.name },
                                            { label: 'Narration', value: narration || `Transfer to ${accountName}` },
                                            { label: 'Source Wallet', value: 'NGN Wallet' },
                                        ].map((row) => (
                                            <div key={row.label} className="flex justify-between gap-4">
                                                <span className="text-muted-foreground">{row.label}</span>
                                                <span className="font-medium text-foreground text-right">{row.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2 mb-5 text-xs text-yellow-700">
                                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>Please verify the recipient details before confirming. Bank transfers are processed instantly and cannot be reversed.</span>
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => setStep(1)} className="flex-1 py-3 bg-muted text-foreground font-semibold rounded-xl">
                                        Back
                                    </button>
                                    <button
                                        onClick={handleSend}
                                        disabled={loading}
                                        className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send Now</>}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Step 4: Success ── */}
                        {step === 4 && result && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                                <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle className="w-10 h-10 text-success" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground mb-2">Transfer Initiated!</h2>
                                <p className="text-muted-foreground mb-6">
                                    {formatCurrency(result.amount, 'NGN')} is being sent to <strong>{result.recipient?.account_name}</strong>
                                </p>
                                <div className="bg-muted/50 rounded-xl p-4 mb-6 space-y-2 text-sm text-left">
                                    {[
                                        { label: 'Reference', value: result.reference, mono: true },
                                        { label: 'Recipient', value: result.recipient?.account_name },
                                        { label: 'Account', value: result.recipient?.account_number },
                                        { label: 'Bank', value: result.recipient?.bank_name },
                                        { label: 'Status', value: result.status, badge: true },
                                    ].map((row) => (
                                        <div key={row.label} className="flex justify-between items-center">
                                            <span className="text-muted-foreground">{row.label}</span>
                                            {row.badge ? (
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle(row.value)}`}>{row.value}</span>
                                            ) : (
                                                <span className={`font-medium text-foreground ${row.mono ? 'font-mono text-xs' : ''}`}>{row.value}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button onClick={resetForm} className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-colors">
                                    Make Another Transfer
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* ── Sidebar: Recent Transfers + Beneficiaries ── */}
                <div className="space-y-4">
                    {/* Saved Beneficiaries card */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-warning" />
                                <h3 className="font-semibold text-foreground text-sm">Saved Contacts</h3>
                            </div>
                            <span className="text-xs text-muted-foreground">{beneficiaries.length}</span>
                        </div>
                        {beneficiaries.length === 0 ? (
                            <div className="text-center py-6">
                                <StarOff className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                                <p className="text-xs text-muted-foreground">No saved contacts yet.<br />Verify an account and tap <strong>Save</strong>.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {beneficiaries.slice(0, 6).map((b) => (
                                    <button
                                        key={b.id}
                                        onClick={() => handleUseBeneficiary(b)}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/10 transition-colors text-left group"
                                    >
                                        <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                            <span className="text-primary font-bold text-xs">{b.label?.slice(0, 2).toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{b.label}</p>
                                            <p className="text-xs text-muted-foreground truncate">{b.bank_name}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Transfers */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                <h3 className="font-semibold text-foreground text-sm">Recent Transfers</h3>
                            </div>
                            <button onClick={fetchHistory} className="p-1.5 hover:bg-muted rounded-lg">
                                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                        </div>
                        {history.length === 0 ? (
                            <div className="text-center py-6">
                                <Send className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                                <p className="text-xs text-muted-foreground">No transfers yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {history.map((txn) => {
                                    const meta = txn.metadata || {};
                                    return (
                                        <div key={txn.id} className="p-3 bg-muted/50 rounded-xl">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-foreground text-sm truncate">
                                                        {meta.account_name || txn.description || '—'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">{meta.bank_name || ''}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-bold text-foreground text-sm">
                                                        {formatCurrency(txn.from_amount, txn.from_currency)}
                                                    </p>
                                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusStyle(txn.status)}`}>
                                                        {txn.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(txn.created_at)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Transfer;
