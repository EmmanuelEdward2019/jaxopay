import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Smartphone, Monitor, Mail, CheckCircle, AlertTriangle, FileEdit, Download, Eraser } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import apiClient from '../../lib/apiClient';

// Public account deletion page (jaxopay.com/delete-account). Google Play requires a web link where
// someone can request deletion without the app installed, and the App Store reviews for the same
// thing; this is the URL to give both. It files the same super_admin-reviewed request as the
// in-app and dashboard flows — see requestAccountDeletionPublic on the backend.

const inputClass =
  'w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

const DELETED = [
  'Your name, date of birth, gender and address',
  'Your email address, phone number and username (removed so they can no longer be used to sign in)',
  'Your password, transaction PIN and two-factor authentication secrets',
  'Your ID document numbers, document images and selfie',
  'Virtual card details (the card is terminated)',
  'Saved beneficiaries, notifications, notification settings, login sessions and registered devices',
];

const RETAINED = [
  'Transaction history and wallet records',
  'KYC review records (verification status and tier, without the document images or ID numbers)',
  'Virtual bank account numbers (deactivated), so a late incoming payment can still be traced',
  'Audit and compliance logs',
];

export default function DeleteAccount() {
  const [form, setForm] = useState({ email: '', password: '', reason: '' });
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/account-deletion-request', {
        email: form.email.trim(),
        password: form.password,
        reason: form.reason.trim() || undefined,
      });
      setDoneMessage(res?.message || 'Your account deletion request has been received.');
      setForm({ email: '', password: '', reason: '' });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Delete Your JAXOPAY Account</h1>
            <p className="text-xl text-primary-100">
              How to request deletion of your JAXOPAY account and personal data, and what happens to it.
              JAXOPAY is operated by Jaxopay Technologies.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          {/* Before you start */}
          <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 flex gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-gray-700 dark:text-gray-300">
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Before you request deletion</p>
              <p>
                Withdraw all your funds first. We can't close an account that still holds a balance in any
                wallet. Deletion is permanent and can't be undone once it is processed.
              </p>
            </div>
          </div>

          {/* Ways to request */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">How to request deletion</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <Smartphone className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">In the mobile app</h3>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                  <li>Open the JAXOPAY app and sign in</li>
                  <li>Go to <strong>Profile</strong></li>
                  <li>Tap <strong>Delete Account</strong></li>
                  <li>Enter your password, type <strong>DELETE</strong> and submit</li>
                </ol>
              </div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <Monitor className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">On the website</h3>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                  <li><Link to="/login" className="text-accent-600 dark:text-accent-400 hover:underline">Sign in</Link> at jaxopay.com</li>
                  <li>Go to <strong>Settings → Security</strong></li>
                  <li>Click <strong>Delete Account</strong></li>
                </ol>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  Or use the form below. You don't need the app.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <Mail className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">By email</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Can't sign in? Email{' '}
                  <a href="mailto:support@jaxopay.com?subject=Account%20deletion%20request" className="text-accent-600 dark:text-accent-400 hover:underline">
                    support@jaxopay.com
                  </a>{' '}
                  from the email address on your account with the subject "Account deletion request". We may ask you
                  to confirm your identity before we act on it.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Request deletion here</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Sign in with your JAXOPAY email and password to confirm the request is yours.
            </p>

            {doneMessage ? (
              <div className="p-6 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 flex gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <div className="text-gray-700 dark:text-gray-300">
                  <p className="font-semibold text-gray-900 dark:text-white mb-1">Request received</p>
                  <p>{doneMessage}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input type="email" id="email" name="email" autoComplete="email" value={form.email} onChange={handleChange} required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password
                  </label>
                  <input type="password" id="password" name="password" autoComplete="current-password" value={form.password} onChange={handleChange} required className={inputClass} />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Forgot it?{' '}
                    <Link to="/forgot-password" className="text-accent-600 dark:text-accent-400 hover:underline">Reset your password</Link>{' '}
                    first, or email us instead.
                  </p>
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Reason (optional)
                  </label>
                  <textarea id="reason" name="reason" rows={3} maxLength={500} value={form.reason} onChange={handleChange} className={`${inputClass} resize-none`} />
                </div>
                <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
                  <span>I understand that deleting my account is permanent, and that I have withdrawn my funds.</span>
                </label>
                <button
                  type="submit"
                  disabled={submitting || !acknowledged}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  {submitting ? 'Submitting...' : 'Request Account Deletion'}
                </button>
              </form>
            )}
          </div>

          {/* What happens next */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">What happens next</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
              <li>We email you to confirm we received your request.</li>
              <li>Our team reviews every request. Your account stays active until then, so you can still sign in and withdraw funds.</li>
              <li>We email you again once your account has been deleted.</li>
            </ul>
          </div>

          {/* Data */}
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Data we delete</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
                {DELETED.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Data we keep</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                As a regulated financial service, we have to keep some records after an account is closed:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
                {RETAINED.map((d) => <li key={d}>{d}</li>)}
              </ul>
              <p className="text-gray-600 dark:text-gray-400 mt-3">
                We keep these only for as long as anti-money-laundering and financial record-keeping laws require,
                generally at least five years after the account is closed, and use them only for legal, regulatory
                and fraud-prevention purposes.
              </p>
            </div>
          </div>

          {/* Data requests short of deleting the account. This section is the target of the
              "users can request data deletion without deleting their account" answer in Play
              Console, hence the id — it is linked directly as /delete-account#request-your-data. */}
          <div id="request-your-data" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Request your data without closing your account
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You don't have to delete your account to correct, export or remove your data.
            </p>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <FileEdit className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Correct your details</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Update your name, phone number, date of birth and address yourself in the app under
                  <strong> Profile → Edit Profile</strong>, or on the website under <strong>Settings</strong>.
                  To correct something you can't edit, such as a verified identity document, email us.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <Download className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Export your data</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Download a statement of your account as PDF or CSV — filtered by date and type, or emailed
                  to you — from <strong>Transactions → Download Statement</strong>. For a full copy of
                  everything else we hold on you, email us and we'll send it.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <Eraser className="w-7 h-7 text-accent-600 dark:text-accent-400 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Delete part of your data</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Ask us to remove data we aren't required to keep — saved beneficiaries, your profile photo,
                  marketing preferences, notification history and registered devices. Saved recipients can also
                  be deleted yourself in the app under <strong>Beneficiaries</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <p className="text-gray-700 dark:text-gray-300">
                <strong className="text-gray-900 dark:text-white">How to ask:</strong> email{' '}
                <a
                  href="mailto:privacy@jaxopay.com?subject=Data%20request"
                  className="text-accent-600 dark:text-accent-400 hover:underline"
                >
                  privacy@jaxopay.com
                </a>{' '}
                from the address on your account, telling us what you'd like corrected, exported or deleted.
                We reply within 30 days, and may ask you to confirm your identity first so nobody else can
                request your data.
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-3">
                What we can't delete while your account is open: your transaction history, identity
                verification records and audit logs. Anti-money-laundering and financial record-keeping laws
                require us to keep these, and we can't operate your account without them.
              </p>
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400">
            Questions? Contact{' '}
            <a href="mailto:privacy@jaxopay.com" className="text-accent-600 dark:text-accent-400 hover:underline">privacy@jaxopay.com</a>.
            See also our <Link to="/privacy" className="text-accent-600 dark:text-accent-400 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
