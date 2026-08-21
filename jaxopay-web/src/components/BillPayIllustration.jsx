// Hand-drawn flat-style illustration (not a stock icon) — a person confirming a bill payment on
// their phone, with a small "paid" receipt floating beside them. Used on the "Pay Bills" promo
// banner in place of a plain icon, per explicit design feedback asking for something more
// humanized/relatable than a symbol-in-a-circle. Mirrors src/components/BillPayIllustration.tsx
// in the RN app so both platforms show the same graphic.
export default function BillPayIllustration({ size = 88, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 180 180" fill="none" className={className}>
            <defs>
                <clipPath id="billPayClip">
                    <circle cx="90" cy="90" r="82" />
                </clipPath>
            </defs>

            <circle cx="90" cy="90" r="82" fill="#FFFFFF" fillOpacity="0.1" />
            <circle cx="90" cy="90" r="82" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="1.5" />

            <g clipPath="url(#billPayClip)">
                <path d="M40 190 Q40 122 90 122 Q140 122 140 190 Z" fill="#0A4F30" />
                <path d="M74 128 Q90 140 106 128 L106 122 Q90 116 74 122 Z" fill="#EAF6EF" />

                <path d="M56 150 Q40 156 38 172 Q37 182 46 184 Q54 185 56 176 Q58 164 64 154 Z" fill="#0A4F30" />
                <circle cx="45" cy="179" r="9" fill="#F2B591" />

                <path d="M112 148 Q126 128 121 104 Q118 94 108 97 Q100 99 102 109 Q105 124 98 142 Z" fill="#0A4F30" />

                <rect x="82" y="106" width="16" height="16" rx="6" fill="#F2B591" />

                <circle cx="90" cy="86" r="27" fill="#F6C39B" />
                <path d="M63 82 Q60 54 90 52 Q120 54 117 82 Q117 66 90 64 Q63 66 63 82 Z" fill="#3B2A20" />
                <path d="M63 78 Q61 68 68 61" stroke="#3B2A20" strokeWidth="6" strokeLinecap="round" fill="none" />
                <path d="M117 78 Q119 68 112 61" stroke="#3B2A20" strokeWidth="6" strokeLinecap="round" fill="none" />

                <circle cx="80" cy="88" r="3.2" fill="#2C1B12" />
                <circle cx="100" cy="88" r="3.2" fill="#2C1B12" />
                <path d="M79 99 Q90 107 101 99" stroke="#2C1B12" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                <ellipse cx="72" cy="94" rx="4.5" ry="3.2" fill="#F0A57E" opacity="0.55" />
                <ellipse cx="108" cy="94" rx="4.5" ry="3.2" fill="#F0A57E" opacity="0.55" />

                <circle cx="112" cy="100" r="10" fill="#F2B591" />
                <rect x="96" y="60" width="32" height="50" rx="9" fill="#FFFFFF" />
                <rect x="100.5" y="66" width="23" height="34" rx="3" fill="#1FAD6B" />
                <path d="M107 83 L113.5 89.5 L122 76" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="112" cy="104.5" r="2.1" fill="#D8E6DE" />
            </g>

            <g transform="translate(6,18) rotate(-10)">
                <rect x="0" y="0" width="36" height="44" rx="5" fill="#FFFFFF" />
                <rect x="7" y="9" width="22" height="3" rx="1.5" fill="#0C6B40" opacity="0.45" />
                <rect x="7" y="16" width="22" height="3" rx="1.5" fill="#0C6B40" opacity="0.28" />
                <rect x="7" y="23" width="14" height="3" rx="1.5" fill="#0C6B40" opacity="0.28" />
                <circle cx="25" cy="33" r="6.5" fill="#1FAD6B" />
                <path d="M22 33 L24.5 35.5 L29 30" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>

            <circle cx="155" cy="34" r="3" fill="#FFFFFF" opacity="0.5" />
            <circle cx="164" cy="50" r="1.8" fill="#FFFFFF" opacity="0.4" />
        </svg>
    );
}
