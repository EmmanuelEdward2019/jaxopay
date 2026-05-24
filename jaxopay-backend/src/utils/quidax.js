export function buildQuidaxWithdrawalBody({
    currency,
    amount,
    fund_uid,
    fund_uid2 = '',
    network = '',
    reference,
    transaction_note,
    narration,
}) {
    if (!currency) throw new Error('Quidax withdrawal currency is required');
    if (amount === undefined || amount === null) throw new Error('Quidax withdrawal amount is required');
    if (!fund_uid) throw new Error('Quidax withdrawal fund_uid is required');
    if (!reference) throw new Error('Quidax withdrawal reference is required');

    const body = {
        currency: currency.toLowerCase(),
        amount: String(amount),
        fund_uid,
        reference,
    };

    if (fund_uid2) body.fund_uid2 = fund_uid2;
    if (network) body.network = network.toLowerCase();
    if (transaction_note) body.transaction_note = transaction_note;
    if (narration) body.narration = narration;

    return body;
}

export function getQuidaxErrorMessage(error) {
    const raw = error?.response?.data;
    return raw?.message
        || raw?.data?.message
        || raw?.error?.message
        || raw?.error
        || error?.message
        || 'Unknown Quidax error';
}

export function mapQuidaxWalletToCurrency(wallet) {
    const code = String(wallet?.currency || wallet?.code || wallet?.name || '').toUpperCase();
    return {
        code,
        name: wallet?.name || code,
        type: wallet?.is_crypto === false || wallet?.is_crypto === '0' ? 'fiat' : 'coin',
        min_deposit_amount: wallet?.min_deposit_amount || '0',
        precision: wallet?.precision || 8,
        networks: Array.isArray(wallet?.networks) ? wallet.networks : [],
        withdraw_fee: wallet?.withdraw_fee || '0',
    };
}
