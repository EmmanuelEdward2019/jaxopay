import { isNibssSessionId } from './payoutSession.service.js';

/**
 * Everything a fiat deposit receipt should carry, normalised out of whatever the collection
 * provider happened to send.
 *
 * Fiat deposits used to store `metadata: null` — the INSERTs simply omitted the column — so a
 * deposit receipt could only ever show the amount, the date and our own reference. Who sent the
 * money, from which bank, and the NIBSS session ID that identifies the transfer at the bank were
 * all present in the provider payload and thrown away on arrival.
 *
 * Providers disagree on names for the same thing (Glyde vs Korapay, and Glyde's webhook vs its
 * own transactions endpoint), and some fields are undocumented, so every field is looked up
 * across the plausible spellings and nesting rather than assuming one shape. The complete raw
 * payload is kept under `provider_payload` as well: it costs nothing, it is the only way to learn
 * what a provider actually sends without a live capture, and support can read it when a customer
 * disputes a deposit.
 */

/** First non-empty value among several possible key spellings, searched across nested objects. */
function pick(sources, keys) {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      const v = src[key];
      if (v == null) continue;
      const s = typeof v === 'object' ? '' : String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

/**
 * @param {object} payload  the provider's transaction/webhook object, as received
 * @param {object} opts
 * @param {string} opts.provider  'glyde' | 'korapay' | …
 * @param {string} [opts.reference] our own reference for the deposit
 * @returns {object} metadata to store on the `transactions` row
 */
export function buildDepositMetadata(payload, { provider, reference } = {}) {
  const d = payload || {};
  // Providers nest the interesting parts inconsistently — a deposit's payer can live at the top
  // level, under `data`, or under any of these sub-objects depending on provider and endpoint.
  const sources = [
    d, d.data, d.payer, d.data?.payer, d.sender, d.data?.sender,
    d.source, d.data?.source, d.originator, d.data?.originator,
    d.customer, d.data?.customer, d.account, d.data?.account,
    d.meta, d.data?.meta,
  ];

  const senderName = pick(sources, [
    'payerName', 'payer_name', 'senderName', 'sender_name', 'originatorName', 'originator_name',
    'accountName', 'account_name', 'sourceAccountName', 'source_account_name', 'name',
  ]);
  const senderBank = pick(sources, [
    'payerBank', 'payer_bank', 'senderBank', 'sender_bank', 'originatorBank', 'originator_bank',
    'sourceBankName', 'source_bank_name', 'bankName', 'bank_name', 'bank',
  ]);
  const senderAccount = pick(sources, [
    'payerAccountNumber', 'payer_account_number', 'senderAccountNumber', 'sender_account_number',
    'originatorAccountNumber', 'originator_account_number', 'sourceAccountNumber',
    'source_account_number', 'accountNumber', 'account_number',
  ]);

  // The NIBSS session ID for an incoming transfer. Glyde returns it as `merchant_reference` on
  // /virtual-accounts/{id}/transactions — confirmed against a real response, and NOT the
  // customer reference we set at account-creation time despite the name. Shape-checked before
  // being labelled a session ID so a UUID reference can never be shown as one.
  const sessionCandidate = pick(sources, [
    'sessionId', 'session_id', 'nibssSessionId', 'nibss_session_id', 'sessionID',
    'merchant_reference', 'merchantReference',
  ]);

  const narration = pick(sources, ['narration', 'description', 'remark', 'remarks', 'note']);
  const paymentMethod = pick(sources, ['payment_method', 'paymentMethod', 'channel', 'method']);
  const providerReference = pick(sources, ['reference', 'transactionReference', 'transaction_reference', 'id']);

  const metadata = {
    provider: provider || null,
    // The deposit's own destination — useful when a user has more than one virtual account.
    deposit_reference: reference || null,
    provider_reference: providerReference,
    // Kept whole so a field we haven't mapped is still recoverable, and so the first real payload
    // from a provider tells us definitively what they send.
    provider_payload: payload ?? null,
  };

  if (senderName) metadata.sender_name = senderName;
  if (senderBank) metadata.sender_bank = senderBank;
  if (senderAccount) metadata.sender_account = senderAccount;
  if (narration) metadata.narration = narration;
  if (paymentMethod) metadata.payment_method = paymentMethod;

  if (sessionCandidate) {
    if (isNibssSessionId(sessionCandidate)) metadata.session_id = sessionCandidate;
    // Not NIBSS-shaped: still worth keeping, just not under a label that says "quote this to
    // your bank".
    else metadata.provider_external_reference = sessionCandidate;
  }

  // Strip nulls so a receipt never renders an empty row for a field this provider doesn't send.
  return Object.fromEntries(Object.entries(metadata).filter(([, v]) => v != null));
}

/**
 * The subset of the above that belongs in an email or push notification — the raw payload and our
 * internal plumbing stay out of anything customer-facing.
 */
export function depositNotificationDetails(metadata) {
  const m = metadata || {};
  return {
    senderName: m.sender_name || null,
    senderBank: m.sender_bank || null,
    senderAccount: m.sender_account || null,
    sessionId: m.session_id || null,
    narration: m.narration || null,
    paymentMethod: m.payment_method || null,
  };
}
