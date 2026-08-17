import { useState } from 'react';
import { Bitcoin, Landmark, Globe2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, CreditCard, Info } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';

const TABS = [
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'fiat', label: 'Fiat', icon: Landmark },
  { id: 'global', label: 'Global Pay', icon: Globe2 },
];

// Current pricing policy — kept as static copy rather than a live-fetched table. The numbers
// that actually vary in real time (crypto swap rates, per-coin network withdrawal fees) are
// explained as a policy here instead of hardcoded, so this page can't go stale the way a
// snapshot of live numbers would.
const FEE_ROWS = {
  crypto: [
    { icon: ArrowDownToLine, title: 'Deposit', value: 'Free', detail: 'No fee to deposit any supported coin into your JAXOPAY wallet.' },
    { icon: ArrowUpFromLine, title: 'Withdrawal', value: 'Network fee only', detail: 'A flat network fee that covers the actual blockchain transaction cost — varies by coin and network, and shown before you confirm. JAXOPAY adds nothing on top.' },
    { icon: ArrowLeftRight, title: 'Swap (Buy / Sell / Convert)', value: 'No separate fee', detail: "There's no extra swap fee line — our margin is already built into the exchange rate you see. The rate shown before you confirm is exactly the rate you get." },
  ],
  fiat: [
    { icon: ArrowDownToLine, title: 'Bank Deposit', value: 'Free', detail: 'Fund your NGN wallet from your bank with no JAXOPAY fee.' },
    { icon: ArrowUpFromLine, title: 'Withdrawal to Bank', value: 'Free', detail: 'Withdraw to your linked bank account with no JAXOPAY fee.' },
    { icon: CreditCard, title: 'Virtual USD Card — Creation', value: '2% + $2.50', detail: 'One-time issuance fee: 2% of the funding amount, plus a flat $2.50.' },
    { icon: CreditCard, title: 'Virtual USD Card — Funding', value: '2% + $2', detail: 'Each top-up: 2% of the amount funded, plus a flat $2.' },
  ],
  global: [
    { icon: Globe2, title: 'International Transfer', value: 'No JAXOPAY fee', detail: 'Send to 57+ countries at the live rate — JAXOPAY adds no separate transfer fee on top.' },
    { icon: ArrowLeftRight, title: 'Currency Swap', value: 'No JAXOPAY fee', detail: 'Convert between supported currencies at the live rate, with no extra JAXOPAY charge.' },
  ],
};

export default function Fees() {
  const [activeTab, setActiveTab] = useState('crypto');
  const rows = FEE_ROWS[activeTab];

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Fees &amp; Pricing
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Simple, transparent pricing across crypto, fiat, and global payments. No hidden charges —
            what you see before you confirm is what you pay.
          </p>
        </div>
      </section>

      {/* Tabs + Content */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit mx-auto mb-10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-accent-600 dark:text-accent-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.title}
              className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-5 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm"
            >
              <div className="flex items-center gap-4 sm:w-1/2">
                <div className="p-3 bg-accent-50 dark:bg-accent-900/20 rounded-xl shrink-0">
                  <row.icon className="w-5 h-5 text-accent-600 dark:text-accent-400" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{row.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{row.detail}</p>
                </div>
              </div>
              <div className="sm:w-1/2 sm:text-right">
                <span className="inline-block px-4 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-bold text-sm rounded-full">
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-10 flex items-start gap-3 p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <Info className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pricing reflects current JAXOPAY policy and is subject to change with prior notice. Crypto
            network fees fluctuate with blockchain conditions and are always shown before you confirm
            a transaction. See our{' '}
            <a href="/terms" className="text-accent-600 dark:text-accent-400 hover:underline">Terms &amp; Conditions</a>{' '}
            for full details.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
