/** Smile-compatible country (ISO2) and id_type options for Smart Camera / Basic KYC. */

export const SMILE_ISO2_COUNTRIES = [
    { code: 'NG', name: 'Nigeria' },
    { code: 'GH', name: 'Ghana' },
    { code: 'KE', name: 'Kenya' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'UG', name: 'Uganda' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IN', name: 'India' },
].sort((a, b) => a.name.localeCompare(b.name));

const NG_ID_TYPES = [
    { value: 'NIN_V2', label: 'NIN — National Identification Number' },
    { value: 'BVN', label: 'BVN — Bank Verification Number' },
    { value: 'PASSPORT', label: 'International passport' },
    { value: 'DRIVERS_LICENSE', label: "Driver's license" },
    { value: 'VOTER_ID', label: "Voter's card" },
];

const GENERIC_ID_TYPES = [
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'NATIONAL_ID', label: 'National ID' },
    { value: 'DRIVERS_LICENSE', label: "Driver's license" },
    { value: 'VOTER_ID', label: 'Voter ID' },
];

/** Smile job id_info.id_type values; varies by country — NG uses NIN_V2, BVN, etc. */
export function getSmileIdTypeOptions(countryCode) {
    const c = String(countryCode || '')
        .trim()
        .toUpperCase();
    if (c === 'NG') return NG_ID_TYPES;
    return GENERIC_ID_TYPES;
}
