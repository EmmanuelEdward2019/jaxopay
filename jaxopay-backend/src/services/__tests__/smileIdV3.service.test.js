import { getVerificationStatusV3, submitEnhancedKycV3 } from '../smileId.service.js';

/**
 * Guards on the V3 path that must hold without touching the network.
 *
 * Context: every server-side Smile submission used to go to the V1/V2 API signed with
 * SMILE_ID_API_KEY, which this account rejects with 2205 "You are not authorized to do that" —
 * so no job was ever created and no verdict webhook could ever arrive, leaving verifications
 * pending forever. The V3 path replaces it; these pin the two ways a caller can get it wrong
 * before a request is ever sent.
 */
describe('Smile ID v3 guards', () => {
  test('status lookup rejects anything that is not a Smile TypeID', async () => {
    // GET /v3/status/{jobId} accepts ONLY Smile's own TypeID (job_ + 26 chars). Our partner-chosen
    // UUIDs are not valid there, and sending one would be a wasted round trip that 400s.
    await expect(getVerificationStatusV3('d97f83d4-01dd-4ce7-998e-b830ae3f3637')).rejects.toThrow(/TypeID/i);
    await expect(getVerificationStatusV3('')).rejects.toThrow(/TypeID/i);
    await expect(getVerificationStatusV3(null)).rejects.toThrow(/TypeID/i);
    await expect(getVerificationStatusV3('job_TOOSHORT')).rejects.toThrow(/TypeID/i);
  });

  test('a well-formed TypeID passes validation (and only then attempts the network)', async () => {
    // Not asserting success — no credentials in the test env — only that it gets past the format
    // guard rather than being rejected for shape.
    await expect(getVerificationStatusV3('job_01h8x9y2z3a4b5c6d7e8f9g0h1'))
      .rejects.not.toThrow(/Not a valid Smile ID job TypeID/i);
  });

  test('submission refuses when neither email nor phone is available', async () => {
    // user_details requires email OR phone_number (anyOf in the V3 schema). Catching it here gives
    // the caller a 400 with a usable message instead of Smile returning an opaque validation error.
    await expect(submitEnhancedKycV3({
      userId: 'u1', jobId: 'j1', callbackUrl: 'https://console.jaxopay.com/api/v1/webhooks/smile_identity',
      country: 'NG', idType: 'NIN', idNumber: '12345678901',
      givenNames: 'Ada', lastName: 'Okafor',
      email: null, phoneNumber: null,
    })).rejects.toThrow(/email address or phone number/i);
  });

  test('an unusable phone alone is not treated as satisfying the email-or-phone rule', async () => {
    // '0803...' is not E.164 and Smile rejects it outright; the normalizer returns null for
    // anything it cannot confidently convert, so this must fall through to the same guard.
    await expect(submitEnhancedKycV3({
      userId: 'u1', jobId: 'j1', callbackUrl: 'https://console.jaxopay.com/api/v1/webhooks/smile_identity',
      country: 'GB', idType: 'NIN', idNumber: '12345678901',
      givenNames: 'Ada', lastName: 'Okafor',
      email: null, phoneNumber: '0803',
    })).rejects.toThrow(/email address or phone number/i);
  });
});
