import kycService from '../services/kycService';

// Smile ID's hosted Web SDK (v12) — capture AND submission both happen inside its own modal
// iframe, so there's no local camera UI to wire up on our side at all. Not published to npm —
// the script tag is the only supported install path. Loaded lazily and cached at module scope
// so no caller ever injects it twice. Extracted out of KYC.jsx so the BVN/NIN ramp gate
// (NigerianIdGate.jsx) can launch the exact same biometric_kyc flow without duplicating the
// script-loading boilerplate — KYC.jsx's own launch logic (handleOpenSmileVerification) is
// untouched, only its import of this loader changed.
const SMILE_V12_SCRIPT_URL = 'https://cdn.usesmileid.com/inline/v12/js/script.min.js';
let smileV12ScriptPromise = null;
export function loadSmileV12Script() {
    if (window.SmileIdentity) return Promise.resolve();
    if (!smileV12ScriptPromise) {
        smileV12ScriptPromise = new Promise((resolve, reject) => {
            // A script tag left over from an earlier attempt (e.g. a previous call's promise was
            // reset by the .catch below, but the <script> element itself was never removed) may
            // already have fired its own 'load'/'error' event before this listener attaches —
            // browsers don't replay past events, so those listeners would sit forever and the
            // caller's promise would never settle. The timeout below is the backstop for exactly
            // that: without it, a stuck load leaves the button showing "Starting verification…"
            // indefinitely with no error, which looks identical to "the button does nothing".
            const timer = setTimeout(() => reject(new Error('Verification script timed out loading. Please try again.')), 15000);
            const settle = (fn) => (...args) => { clearTimeout(timer); fn(...args); };
            const existing = document.querySelector(`script[src="${SMILE_V12_SCRIPT_URL}"]`);
            if (existing) {
                existing.addEventListener('load', settle(resolve));
                existing.addEventListener('error', settle(() => reject(new Error('Could not load the verification script.'))));
                return;
            }
            const script = document.createElement('script');
            script.src = SMILE_V12_SCRIPT_URL;
            script.async = true;
            script.onload = settle(resolve);
            script.onerror = settle(() => reject(new Error('Could not load the verification script.')));
            document.head.appendChild(script);
        }).catch((err) => {
            smileV12ScriptPromise = null; // let a retry re-attempt instead of caching a failure forever
            throw err;
        });
    }
    return smileV12ScriptPromise;
}

// Smile's id_info key per BVN/NIN gate id_type -> the NG id_type value it expects (confirmed
// against smileKycOptions.js's NG_ID_TYPES, the same mapping the rest of this codebase uses).
export const RAMP_ID_TYPE_TO_SMILE = { bvn: 'BVN', nin: 'NIN_V2' };

/**
 * Launches the same hosted Web SDK biometric_kyc flow KYC.jsx's Tier 2 form uses. Approval lands
 * via the same webhook path (processSmileIdentity matches on internal_user_id, not the id number),
 * so completing this produces the identical tier-2 ("Tier 1") bump as the main KYC flow — which is
 * what lets a user who only ever verified BVN/NIN through a deposit-page gate still pass
 * requireKYCTier(2) afterward, same as someone who verified through the KYC page.
 *
 * `idNumber` is optional: when the caller has it (e.g. the number just typed into the gate),
 * Smile's modal skips straight to camera; when omitted, Smile's own modal collects it inline
 * before the camera step (same graceful fallback KYC.jsx already relies on for a wrong/missing key).
 */
export async function openSmileBiometricVerification({ idType, idNumber, country, firstName, lastName, email, phone, onSuccess, onClose, onError }) {
    await loadSmileV12Script();
    if (typeof window.SmileIdentity !== 'function') {
        throw new Error('Could not start verification — please refresh the page and try again.');
    }
    const tokenRes = await kycService.getSmileV3Token('biometric_kyc');
    if (!tokenRes.success || !tokenRes.data?.token) {
        throw new Error(tokenRes.error || 'Could not start verification session.');
    }
    const e164Phone = /^\+[1-9]\d{6,14}$/.test(phone || '') ? phone : null;
    const hasContact = !!(email || e164Phone);
    const smileIdType = idType ? RAMP_ID_TYPE_TO_SMILE[idType] : null;

    window.SmileIdentity({
        token: tokenRes.data.token,
        product: 'biometric_kyc',
        callback_url: tokenRes.data.callback_url,
        environment: tokenRes.data.environment === 'production' ? 'production' : 'sandbox',
        partner_details: {
            partner_id: tokenRes.data.partnerId,
            name: 'JAXOPAY',
            logo_url: `${window.location.origin}/logo-icon.png`,
            policy_url: `${window.location.origin}/privacy`,
            theme_color: '#1FAD6B',
        },
        ...(hasContact ? {
            user_details: {
                ...(firstName ? { given_names: firstName } : {}),
                ...(lastName ? { last_name: lastName } : {}),
                ...(email ? { email } : {}),
                ...(e164Phone ? { phone_number: e164Phone } : {}),
            },
        } : {}),
        ...(smileIdType && idNumber ? {
            id_info: {
                [(country || 'NG').toUpperCase()]: { [smileIdType]: { id_number: idNumber } },
            },
        } : {}),
        partner_params: {
            internal_reference: `kyc-ramp-${Date.now()}`,
        },
        onSuccess: () => onSuccess?.(),
        onClose: () => onClose?.(),
        onError: (message) => onError?.(message),
    });
}
