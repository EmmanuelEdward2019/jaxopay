import { formatCurrency, formatDateTime, formatTransactionType } from './formatters';

/**
 * The single definition of "what a JAXOPAY receipt shows".
 *
 * This used to be copy-pasted twice inside the customer's Transactions page (once for the
 * on-screen detail modal, once for the PNG export) and not at all in the admin panel — which is
 * exactly how the admin's copy of a receipt ended up thinner than the customer's, missing the
 * NIBSS session ID and the on-chain hash, the two fields support actually needs when someone
 * calls about a transfer that hasn't landed. One definition, three renderers.
 */

// Block explorer for a given network, so the on-chain hash can be tapped straight through to
// independent verification — the whole point of showing a hash at all. Mirrors RN's
// TransactionsScreen.tsx EXPLORER_BASE exactly, keep both in sync if a network is added.
// Keys must cover every networkCode Obiex can emit (GET /currencies/networks/active currently
// returns ARBITRUM, AVAXC, BACC, BASE, BCH, BSC, BTC, DOGE, ETH, LTC, MATIC, MOMO, SOL, SUI, TON,
// TRX) plus the aliases our own code writes. A network that isn't here simply shows the hash as
// plain text with no link.
// BACC and MOMO are deliberately absent: they're account/mobile-money rails, not chains.
export const EXPLORER_BASE = {
    ETH: 'https://etherscan.io/tx/', ETHEREUM: 'https://etherscan.io/tx/', ERC20: 'https://etherscan.io/tx/',
    BSC: 'https://bscscan.com/tx/', BEP20: 'https://bscscan.com/tx/',
    POLYGON: 'https://polygonscan.com/tx/', MATIC: 'https://polygonscan.com/tx/',
    ARBITRUM: 'https://arbiscan.io/tx/',
    OPTIMISM: 'https://optimistic.etherscan.io/tx/',
    BASE: 'https://basescan.org/tx/',
    AVAXC: 'https://snowtrace.io/tx/', AVALANCHE: 'https://snowtrace.io/tx/',
    TRC20: 'https://tronscan.org/#/transaction/', TRON: 'https://tronscan.org/#/transaction/',
    TRX: 'https://tronscan.org/#/transaction/',
    SOL: 'https://solscan.io/tx/', SOLANA: 'https://solscan.io/tx/',
    CELO: 'https://celoscan.io/tx/',
    BTC: 'https://mempool.space/tx/', BITCOIN: 'https://mempool.space/tx/',
    BCH: 'https://blockchair.com/bitcoin-cash/transaction/',
    LTC: 'https://blockchair.com/litecoin/transaction/',
    DOGE: 'https://blockchair.com/dogecoin/transaction/',
    SUI: 'https://suiscan.xyz/mainnet/tx/',
    TON: 'https://tonviewer.com/transaction/',
};

export const explorerUrlFor = (network, hash) => {
    if (!network || !hash) return null;
    const base = EXPLORER_BASE[String(network).toUpperCase()];
    return base ? `${base}${hash}` : null;
};

// What the number a bill was paid to is actually called, per bill type — a meter number isn't an
// "Account", and showing it as one makes a receipt harder to check against the biller's own record.
export const BILL_ACCOUNT_LABELS = {
    airtime: 'Phone Number',
    data: 'Phone Number',
    electricity: 'Meter Number',
    cable: 'Smart Card Number',
    tv: 'Smart Card Number',
    internet: 'Account Number',
    water: 'Account Number',
};

/**
 * Receipt rows that come out of a transaction's metadata blob.
 * @param {object} meta
 * @param {boolean} copyable  true for interactive views (modals), false for the static PNG export
 */
export const getReceiptMetadataFields = (meta, { copyable = false } = {}) => {
    if (!meta || typeof meta !== 'object') return [];
    const result = [];
    // Bank transfers/crypto withdrawals store snake_case keys; international transfer and
    // crypto ramp (fx_transactions.recipient_details) store camelCase keys instead — check both.
    const bankName = meta.bank_name || meta.networkName || meta.bank;
    const acctNumber = meta.account_number || meta.accountNumber || meta.account;
    const acctName = meta.account_name || meta.recipientName || meta.name;
    const network = meta.network || meta.cryptoNetwork;
    const address = meta.address || meta.walletAddress;
    if (bankName) result.push({ label: 'Bank', value: bankName });
    if (acctNumber) result.push({ label: 'Account', value: acctNumber });
    if (acctName) result.push({ label: 'Account Name', value: acctName });
    // Incoming fiat deposits: who paid, from where. Captured from the collection provider's
    // payload (see depositDetails.service.js) — a deposit receipt that shows only an amount and a
    // reference is useless when a customer is asking "did my transfer from GTB arrive?".
    if (meta.sender_name) result.push({ label: 'Sender', value: meta.sender_name });
    if (meta.sender_bank) result.push({ label: 'Sender Bank', value: meta.sender_bank });
    if (meta.sender_account) result.push({ label: 'Sender Account', value: meta.sender_account, copyable });
    if (meta.payment_method) result.push({ label: 'Payment Method', value: meta.payment_method });
    if (meta.narration) result.push({ label: 'Narration', value: meta.narration });
    if (meta.package || meta.plan) result.push({ label: 'Package', value: meta.package || meta.plan });
    // Bill payments — the biller and the thing being paid for. What the account number is
    // called depends entirely on the bill type, and "Account" for a meter reads as wrong.
    if (meta.biller) result.push({ label: 'Biller', value: formatTransactionType(meta.biller) });
    if (meta.bill_account) result.push({ label: BILL_ACCOUNT_LABELS[meta.service_type] || 'Account', value: meta.bill_account });
    if (meta.customer_name) result.push({ label: 'Customer Name', value: meta.customer_name });
    if (meta.units) result.push({ label: 'Units', value: meta.units });
    if (network) result.push({ label: 'Network', value: network });
    if (address) result.push({ label: 'Address', value: address });
    if (meta.country) result.push({ label: 'Country', value: meta.country });
    // NIBSS session ID — what a Nigerian bank asks for when tracing a transfer, so it's the
    // single most useful thing on a NGN receipt, incoming or outgoing. On a withdrawal the
    // backend fetches it from Obiex once the payout settles (payoutSession.service.js); on a
    // deposit it comes from the collection provider's own payload (depositDetails.service.js).
    // Absent rather than blank until one exists.
    if (meta.session_id) result.push({ label: 'Session ID', value: meta.session_id, copyable });
    if (meta.recipient_email) result.push({ label: 'Recipient', value: meta.recipient_email });
    if (meta.sender_email) result.push({ label: 'Sender', value: meta.sender_email });
    if (meta.token) result.push({ label: 'Token/PIN', value: meta.token });
    // On-chain proof — populated for crypto deposits/withdrawals (see obiexWebhook.service.js).
    // In interactive views the actual "go verify it" action is the dedicated Verify on Blockchain
    // button, not this text — a labeled button reads as an obvious action, an underlined value
    // easily doesn't.
    if (meta.hash) result.push({ label: 'Hash', value: meta.hash, copyable });
    return result;
};

/**
 * Every row on a receipt, in display order, for any transaction shape the combined transaction
 * query can produce (fiat, bill payment, crypto wallet, FX). Works off the customer-facing field
 * names; `amount`/`currency`/`fee` fall back to the admin query's own column names so both
 * callers can pass their row straight in.
 *
 * @param {object} transaction
 * @param {boolean} copyable   true for interactive views, false for the static PNG export
 * @param {boolean} detailed   true to include the extra "Converted" row shown in modals
 */
export const buildReceiptFields = (transaction, { copyable = false, detailed = false } = {}) => {
    if (!transaction) return [];
    const currency = transaction.currency || transaction.from_currency;
    const fee = transaction.fee ?? transaction.fee_amount;

    return [
        { label: 'Transaction Type', value: formatTransactionType(transaction.transaction_type || transaction.type) },
        {
            label: 'Status',
            value: transaction.status
                ? transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)
                : '—',
        },
        { label: 'Date & Time', value: formatDateTime(transaction.created_at) },
        // Yellow Card's own dashboard (and Quidax/Obiex for crypto) calls this same value
        // "Transaction ID" — matching that avoids a support back-and-forth over what "Reference"
        // means when a user is cross-checking against the provider's own records.
        transaction.reference && { label: 'Transaction ID', value: transaction.reference, copyable },
        transaction.description && { label: 'Description', value: transaction.description },
        fee && parseFloat(fee) > 0 && { label: 'Fee', value: formatCurrency(fee, currency) },
        transaction.exchange_rate && {
            label: 'Exchange Rate',
            value: `1 ${transaction.from_currency || ''} = ${transaction.exchange_rate} ${transaction.to_currency || ''}`,
        },
        detailed && transaction.from_amount && transaction.to_amount && {
            label: 'Converted',
            value: `${formatCurrency(transaction.from_amount, transaction.from_currency)} → ${formatCurrency(transaction.to_amount, transaction.to_currency)}`,
        },
        ...getReceiptMetadataFields(transaction.metadata, { copyable }),
    ].filter(Boolean);
};
