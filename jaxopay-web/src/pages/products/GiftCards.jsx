import { Gift, Shield, Zap, TrendingUp, CheckCircle, DollarSign, ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function GiftCards() {
  const features = [
    { icon: Zap, title: 'Instant Verification', description: 'Get your gift cards verified and credited within minutes' },
    { icon: TrendingUp, title: 'Best Rates', description: 'Competitive exchange rates for all major gift card brands' },
    { icon: Shield, title: 'Secure Escrow', description: 'Your transactions are protected with our secure escrow system' },
    { icon: DollarSign, title: 'Fast Payouts', description: 'Receive your money instantly after successful verification' },
    { icon: CheckCircle, title: '100+ Brands', description: 'Trade gift cards from Amazon, iTunes, Google Play, and more' },
    { icon: Gift, title: 'Buy & Sell', description: 'Both buying and selling options available for all cards' }
  ];

  const brands = [
    { name: 'Amazon', rate: '85%', image: 'https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=400&auto=format&fit=crop' },
    { name: 'iTunes', rate: '82%', image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&auto=format&fit=crop' },
    { name: 'Google Play', rate: '80%', image: 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=400&auto=format&fit=crop' },
    { name: 'Steam', rate: '78%', image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400&auto=format&fit=crop' },
    { name: 'Visa', rate: '88%', image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&auto=format&fit=crop' },
    { name: 'eBay', rate: '83%', image: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&auto=format&fit=crop' }
  ];

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative bg-white pt-32 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 text-accent-700 rounded-full text-sm font-semibold mb-6 border border-accent-100">
                <Gift className="w-4 h-4" />
                Gift Card Trading
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight leading-tight">
                Trade Gift Cards at the <span className="text-accent-600">Best Rates</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Buy and sell gift cards from 100+ top brands. Instant verification, competitive rates, secure transactions.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/signup" className="px-8 py-4 bg-accent-600 text-white font-bold rounded-full hover:bg-accent-700 transition-all shadow-lg hover:shadow-accent-500/30 inline-flex items-center gap-2">
                  Start Trading <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/contact" className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all">
                  Check Rates
                </Link>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-8 border-white">
                <img src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&auto=format&fit=crop" alt="Gift cards" className="w-full h-auto" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Why Trade with JAXOPAY?</h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">The most trusted gift card trading platform</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-accent-100 dark:bg-accent-900/30 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-accent-600 dark:text-accent-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Brands */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Supported Brands</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">Trade gift cards from your favorite brands</p>
          </motion.div>

          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-6">
            {brands.map((brand, index) => (
              <motion.div key={brand.name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden hover:shadow-xl transition-shadow">
                <img src={brand.image} alt={brand.name} className="w-full h-32 object-cover" />
                <div className="p-4 text-center">
                  <div className="font-bold text-gray-900 dark:text-white mb-1">{brand.name}</div>
                  <div className="text-sm text-accent-600 dark:text-accent-400 font-semibold">Up to {brand.rate}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-accent-600 to-emerald-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Start Trading Gift Cards Today</h2>
          <p className="text-xl text-accent-100 mb-8">Join thousands who trust JAXOPAY for secure gift card trading</p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            Create Free Account <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

