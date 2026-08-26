import { Send, Globe, Shield, Zap, CheckCircle, ArrowRight, Clock, DollarSign } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import PhoneHomeMockup from '../../components/PhoneHomeMockup';

export default function Payments() {
  const features = [
    {
      icon: Globe,
      title: 'Global Reach',
      description: 'Send money to 57+ countries across Africa, Europe, Asia, and the Americas'
    },
    {
      icon: Zap,
      title: 'Instant Transfers',
      description: 'Real-time transfers that arrive in seconds, not days'
    },
    {
      icon: Shield,
      title: 'Bank-Level Security',
      description: 'Your money is protected with enterprise-grade encryption'
    },
    {
      icon: DollarSign,
      title: 'Lowest Fees',
      description: 'Transparent pricing with no hidden charges - save up to 80% on fees'
    },
    {
      icon: Clock,
      title: '24/7 Support',
      description: 'Round-the-clock customer support in multiple languages'
    },
    {
      icon: CheckCircle,
      title: 'Easy Tracking',
      description: 'Track your transfers in real-time with instant notifications'
    }
  ];

  const currencies = [
    { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
    { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
    { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
    { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬' },
    { code: 'KES', name: 'Kenyan Shilling', flag: '🇰🇪' },
    { code: 'GHS', name: 'Ghanaian Cedi', flag: '🇬🇭' },
    { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
    { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' }
  ];

  const steps = [
    { title: 'Enter Amount', description: 'Choose how much you want to send' },
    { title: 'Select Recipient', description: 'Add recipient bank details' },
    { title: 'Review & Confirm', description: 'Check the exchange rate and fees' },
    { title: 'Send Money', description: 'Complete payment and track transfer' }
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative bg-white pt-32 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 text-accent-700 rounded-full text-sm font-semibold mb-6 border border-accent-100">
                <Send className="w-4 h-4" />
                Instant Transfers
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight leading-tight">
                Send Money Globally <span className="text-accent-600">in Seconds</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Fast, secure, and affordable cross-border payments to 57+ countries.
                Zero hidden fees, 100% transparent.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/signup"
                  className="px-8 py-4 bg-accent-600 text-white font-bold rounded-full hover:bg-accent-700 transition-all shadow-lg hover:shadow-accent-500/30 inline-flex items-center gap-2"
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/contact"
                  className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all"
                >
                  Contact Sales
                </Link>
              </div>
            </motion.div>

            {/* Right Visual - Phone Mockup with Notifications */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative flex items-center justify-center min-h-[500px]"
            >
              {/* Decorative background blob */}
              <div className="absolute w-[500px] h-[500px] bg-accent-100 rounded-full blur-3xl opacity-50" />

              {/* Phone Frame */}
              <div className="relative bg-gray-900 rounded-[2.5rem] border-[8px] border-gray-900 overflow-hidden shadow-2xl h-[600px] w-[300px] ring-4 ring-gray-100/50">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-gray-900 rounded-b-xl z-20"></div>

                {/* Screen Content — the real RN app's Home tab (DashboardScreen.tsx), shared
                    with the homepage hero's phone so neither can drift from the other. */}
                <PhoneHomeMockup name="Kunle" balance={3950} greeting="Good afternoon" />
              </div>

              {/* Floating Notification Bubble 1 */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -right-8 top-1/3 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 z-30 max-w-[200px]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-100 overflow-hidden flex-shrink-0">
                    <img src="https://i.pravatar.cc/100?img=12" alt="Daniel" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-1">Money Received</div>
                    <div className="text-sm text-gray-900 font-bold leading-tight">
                      You received <span className="text-accent-600">$2,500</span> from Emmanuel Edward
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Floating Notification Bubble 2 */}
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-12 bottom-1/4 bg-white p-3 rounded-2xl shadow-xl border border-gray-100 z-30 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-accent-600 flex items-center justify-center text-white shadow-lg shadow-accent-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <div className="font-bold text-gray-900 pr-2">
                  Instant Transfer
                </div>
              </motion.div>

            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why Choose JAXOPAY Payments?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Experience the future of cross-border payments with our cutting-edge platform
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-accent-100 dark:bg-accent-900/30 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-accent-600 dark:text-accent-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Currencies */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Supported Currencies
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Send and receive money in multiple currencies
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {currencies.map((currency, index) => (
              <motion.div
                key={currency.code}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="p-6 bg-white dark:bg-gray-900 rounded-lg text-center hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-2">{currency.flag}</div>
                <div className="font-bold text-gray-900 dark:text-white">{currency.code}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{currency.name}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Send money in 4 simple steps
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-accent-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {index + 1}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gray-300 dark:bg-gray-700"></div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-accent-600 to-emerald-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Send Money Globally?
          </h2>
          <p className="text-xl text-accent-100 mb-8">
            Join thousands of users who trust JAXOPAY for fast, secure cross-border payments
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Create Free Account
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
