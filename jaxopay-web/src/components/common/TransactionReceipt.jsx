import { formatCurrency } from '../../utils/formatters';
import { buildReceiptFields } from '../../utils/receiptFields';

/**
 * The printable JAXOPAY receipt, rendered off-screen and exported to PNG.
 *
 * Shared between the customer's Transactions page and the admin Transaction Monitor, so an admin
 * downloading a receipt for a support ticket gets byte-for-byte the same document the customer is
 * looking at — including the NIBSS session ID and on-chain hash. It previously lived only in the
 * customer page, which is why the admin panel had no receipt at all, just a raw metadata dump.
 *
 * Inline styles (not Tailwind classes) throughout: html-to-image rasterises computed styles, and
 * a utility class that resolves against a dark-mode root would export a dark receipt.
 */
const TransactionReceipt = ({ transaction, receiptRef }) => {
    const isCredit = transaction.direction === 'credit' || transaction.transaction_type === 'deposit';
    const displayAmount = Math.abs(transaction.amount || transaction.from_amount || 0);
    const displayCurrency = transaction.currency || transaction.from_currency;

    // Static PNG export: no copy buttons, no Converted row.
    const fields = buildReceiptFields(transaction);

    const statusKey = (transaction.status || '').toLowerCase();
    const statusColor = statusKey === 'completed' ? '#16a34a'
        : (statusKey === 'pending' || statusKey === 'processing') ? '#d97706'
            : '#dc2626';
    const statusBg = statusKey === 'completed' ? '#dcfce7'
        : (statusKey === 'pending' || statusKey === 'processing') ? '#fef3c7'
            : '#fee2e2';

    return (
        <div
            ref={receiptRef}
            style={{ fontFamily: "'Segoe UI', Roboto, system-ui, -apple-system, sans-serif", backgroundColor: '#ffffff' }}
            className="w-[420px] rounded-3xl overflow-hidden"
        >
            {/* Green brand accent bar */}
            <div style={{ height: 6, background: 'linear-gradient(90deg, #15803d 0%, #16a34a 50%, #22c55e 100%)' }} />

            {/* Header */}
            <div style={{ padding: '30px 32px 24px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                <img src="/logo.png" alt="JAXOPAY" style={{ height: 42, width: 'auto', display: 'block', margin: '0 auto 18px' }} />
                <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Proof of Transaction
                </p>
                <p style={{
                    color: isCredit ? '#16a34a' : '#0f172a',
                    fontSize: 38,
                    fontWeight: 800,
                    marginBottom: 12,
                    letterSpacing: '-0.02em',
                }}>
                    {isCredit ? '+' : '-'}{formatCurrency(displayAmount, displayCurrency)}
                </p>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 16px', borderRadius: 999, backgroundColor: statusBg,
                }}>
                    <span style={{ color: statusColor, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.03em' }}>
                        {transaction.status?.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Details */}
            <div style={{ padding: '0 24px 6px', backgroundColor: '#ffffff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f8fafc', borderRadius: 14, overflow: 'hidden', border: '1px solid #eef2f6' }}>
                    <tbody>
                        {fields.map((field, i) => (
                            <tr key={i} style={{ borderBottom: i < fields.length - 1 ? '1px solid #eef2f6' : 'none' }}>
                                <td style={{ color: '#64748b', fontSize: 13, padding: '13px 18px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{field.label}</td>
                                <td style={{
                                    color: field.label === 'Status' ? statusColor : '#0f172a',
                                    fontSize: 13, fontWeight: 600, padding: '13px 18px',
                                    textAlign: 'right', wordBreak: 'break-word', overflowWrap: 'anywhere',
                                }}>
                                    {field.value}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '20px 32px 28px', backgroundColor: '#ffffff' }}>
                <p style={{ color: '#16a34a', fontSize: 11.5, letterSpacing: '0.05em', fontWeight: 700 }}>
                    POWERED BY JAXOPAY · jaxopay.com
                </p>
                <p style={{ color: '#94a3b8', fontSize: 10.5, marginTop: 5 }}>
                    Receipt Ref: {transaction.id?.slice(0, 8).toUpperCase()}
                </p>
            </div>
        </div>
    );
};

export default TransactionReceipt;
