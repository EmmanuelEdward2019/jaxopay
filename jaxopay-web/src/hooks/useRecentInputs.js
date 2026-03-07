import { useState, useEffect } from 'react';

/**
 * Custom hook to manage recent input history in localStorage
 * @param {string} key - Unique key for the localStorage item
 * @param {number} maxItems - Maximum number of items to keep in history
 */
export function useRecentInputs(key, maxItems = 5) {
    const [recentInputs, setRecentInputs] = useState([]);

    // Load from localStorage on mount or key change
    useEffect(() => {
        if (!key) return;
        try {
            const stored = localStorage.getItem(`jaxopay_recent_${key}`);
            if (stored) {
                setRecentInputs(JSON.parse(stored));
            } else {
                setRecentInputs([]);
            }
        } catch (e) {
            console.error('Failed to load recent inputs', e);
        }
    }, [key]);

    // Add a new item to the recent list
    const addRecentInput = (value) => {
        if (!key || !value || typeof value !== 'string') return;

        setRecentInputs(prev => {
            // Remove duplicates, add to front, limit to maxItems
            const filtered = prev.filter(item => item !== value);
            const updated = [value, ...filtered].slice(0, maxItems);

            try {
                localStorage.setItem(`jaxopay_recent_${key}`, JSON.stringify(updated));
            } catch (e) {
                console.error('Failed to save recent input', e);
            }

            return updated;
        });
    };

    return { recentInputs, addRecentInput };
}
