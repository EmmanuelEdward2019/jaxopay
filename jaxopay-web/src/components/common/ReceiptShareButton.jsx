import { useState } from 'react';
import { Share2, RefreshCw, MessageCircle, Send, Mail, MessageSquare, Facebook, Twitter, Copy, Check } from 'lucide-react';
import { buildReceiptFile } from '../../utils/receiptFile';

/**
 * "Share Receipt" button.
 *  - On mobile (Web Share with files): opens the device share sheet so the user can
 *    pick an app (WhatsApp, Telegram, Instagram, Email, SMS…) and a contact, and the
 *    actual receipt IMAGE is sent — exactly like other apps.
 *  - On desktop / unsupported: shows a menu of platform links (text + link).
 *
 * Props: targetRef, baseName, shareText, className, label, menuPosition ('top'|'bottom')
 */
const ReceiptShareButton = ({ targetRef, baseName, shareText = '', className = '', label = 'Share Receipt', menuPosition = 'top' }) => {
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://jaxopay.com';

    // Try to share the actual receipt image through the OS share sheet.
    const tryNativeImageShare = async () => {
        if (!targetRef?.current || !(navigator.share && navigator.canShare)) return false;
        try {
            const file = await buildReceiptFile(targetRef.current, 'png', baseName);
            if (!navigator.canShare({ files: [file] })) return false;
            await navigator.share({ files: [file], title: 'JAXOPAY Receipt', text: shareText });
            return true; // shared (or user opened the sheet)
        } catch (e) {
            if (e?.name === 'AbortError') return true; // user cancelled — don't fall back to menu
            return false;
        }
    };

    const handleClick = async () => {
        setBusy(true);
        const shared = await tryNativeImageShare();
        setBusy(false);
        if (!shared) setOpen(true); // desktop / unsupported → platform link menu
    };

    const openChannel = (channel) => {
        const text = encodeURIComponent(shareText);
        const url = encodeURIComponent(shareUrl);
        const withLink = encodeURIComponent(`${shareText} ${shareUrl}`);
        const links = {
            whatsapp: `https://wa.me/?text=${withLink}`,
            telegram: `https://t.me/share/url?url=${url}&text=${text}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
            twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
            email: `mailto:?subject=${encodeURIComponent('JAXOPAY Receipt')}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
            sms: `sms:?&body=${withLink}`,
        };
        if (channel === 'copy') {
            navigator.clipboard?.writeText(`${shareText} ${shareUrl}`).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            });
            return;
        }
        if (channel === 'email' || channel === 'sms') window.location.href = links[channel];
        else window.open(links[channel], '_blank', 'noopener,noreferrer');
        setOpen(false);
    };

    const channels = [
        { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-500' },
        { id: 'telegram', label: 'Telegram', icon: Send, color: 'text-sky-500' },
        { id: 'email', label: 'Email', icon: Mail, color: 'text-amber-500' },
        { id: 'sms', label: 'SMS', icon: MessageSquare, color: 'text-blue-500' },
        { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600' },
        { id: 'twitter', label: 'X (Twitter)', icon: Twitter, color: 'text-foreground' },
    ];

    const menuPos = menuPosition === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';

    return (
        <div className="relative inline-block">
            <button type="button" onClick={handleClick} disabled={busy} className={className}>
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {label}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className={`absolute ${menuPos} right-0 z-50 w-56 bg-card border border-border rounded-xl shadow-2xl overflow-hidden py-1`}>
                        <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Share to</p>
                        {channels.map((c) => (
                            <button key={c.id} onClick={() => openChannel(c.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                                <c.icon className={`w-4 h-4 ${c.color}`} /> {c.label}
                            </button>
                        ))}
                        <button onClick={() => openChannel('copy')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-t border-border">
                            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                            {copied ? 'Copied!' : 'Copy details'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ReceiptShareButton;
