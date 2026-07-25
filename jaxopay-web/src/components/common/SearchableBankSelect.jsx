import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Check, ChevronDown, RefreshCw, Search, X } from 'lucide-react';

/**
 * Searchable dropdown for long bank/network lists — avoids making users scroll through
 * hundreds of native <option> entries. Generic over the item shape via getId/getLabel so it
 * works for both banks ({code, name}) and cross-border payout networks ({id, name}).
 */
const SearchableBankSelect = ({
    items = [],
    selected,
    onSelect,
    loading = false,
    label = 'Bank',
    placeholder = 'Select your bank',
    getId = (item) => item.code,
    getLabel = (item) => item.name,
    getSubLabel = (item) => item.code,
}) => {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = search
        ? items.filter((item) => {
            const q = search.toLowerCase();
            return getLabel(item)?.toLowerCase().includes(q) || String(getSubLabel(item) || '').toLowerCase().includes(q);
        })
        : items;

    return (
        <div className="relative" ref={ref}>
            <label className="block text-sm font-medium text-foreground mb-2">
                {label} <span className="text-muted-foreground font-normal">({items.length} available)</span>
            </label>

            <button
                type="button"
                onClick={() => { setOpen(!open); setSearch(''); }}
                disabled={loading || items.length === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none transition-all disabled:opacity-50"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    {selected ? (
                        <div className="text-left min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{getLabel(selected)}</p>
                            <p className="text-xs text-muted-foreground truncate">{getSubLabel(selected)}</p>
                        </div>
                    ) : (
                        <span className="text-muted-foreground text-sm">
                            {loading ? 'Loading...' : items.length === 0 ? 'Failed to load — retry' : placeholder}
                        </span>
                    )}
                </div>
                {loading
                    ? <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    : <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
                }
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scaleY: 0.9 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -8, scaleY: 0.9 }}
                        style={{ transformOrigin: 'top' }}
                        className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl"
                    >
                        <div className="p-3 border-b border-border">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Type to search..."
                                    className="w-full pl-9 pr-4 py-2 text-sm bg-muted border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none"
                                />
                                {search && (
                                    <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">{filtered.length} of {items.length}</p>
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground py-6">No matches for "{search}"</p>
                            ) : (
                                filtered.map((item) => {
                                    const id = getId(item);
                                    const isSelected = selected && getId(selected) === id;
                                    return (
                                        <button
                                            type="button"
                                            key={id}
                                            onClick={() => { onSelect(item); setOpen(false); setSearch(''); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/10 text-left transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                                        >
                                            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 text-primary font-bold text-xs">
                                                {getLabel(item)?.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{getLabel(item)}</p>
                                                <p className="text-xs text-muted-foreground truncate">{getSubLabel(item)}</p>
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchableBankSelect;
