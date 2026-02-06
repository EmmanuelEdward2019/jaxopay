import {
  FaGlobe,
  FaCreditCard,
  FaBitcoin,
  FaPlane,
  FaGift,
  FaShieldHalved,
  FaBolt,
  FaCircleCheck,
  FaArrowRight,
  FaWallet,
  FaMoneyBillTransfer
} from 'react-icons/fa6';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Products() {
  const products = [
    {
      id: 'payments',
      icon: FaGlobe, // Changed to Globe to match screenshot for Cross-Border
      title: 'Cross-Border Payments',
      description: 'Send money to 57+ countries instantly with the lowest fees in the market.',
      features: [
        'Real-time transfers to bank accounts',
        'Support for 8 fiat currencies',
        'Transparent pricing with no hidden fees',
        'Track your transfers in real-time',
      ],
      image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop', // Higher res
      link: '/products/payments',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      id: 'cards',
      icon: FaCreditCard,
      title: 'Virtual USD Cards',
      description: 'Get instant virtual cards for online shopping and subscriptions worldwide.',
      features: [
        'Instant card issuance',
        'Use for Netflix, Spotify, Amazon, etc.',
        'Freeze/unfreeze cards anytime',
        'Set spending limits',
      ],
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&auto=format&fit=crop',
      link: '/products/cards',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      gradient: 'from-blue-500 to-indigo-600'
    },
    {
      id: 'crypto',
      icon: FaBitcoin,
      title: 'Crypto Exchange',
      description: 'Buy, sell, and swap cryptocurrencies at competitive rates.',
      features: [
        'Support for BTC, ETH, USDT, USDC',
        'Instant crypto-to-fiat conversion',
        'Secure cold storage',
        'Low trading fees',
      ],
      image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&auto=format&fit=crop',
      link: '/products/crypto',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      gradient: 'from-purple-500 to-violet-600'
    },
    {
      id: 'flights',
      icon: FaPlane,
      title: 'Flight Booking',
      description: 'Book flights to any destination worldwide with flexible payment options.',
      features: [
        'Access to 500+ airlines',
        'Best price guarantee',
        'Pay with crypto or fiat',
        '24/7 customer support',
      ],
      image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
      link: '/products/flights',
      color: 'text-pink-500',
      bgColor: 'bg-pink-50',
      gradient: 'from-pink-500 to-rose-600'
    },
    {
      id: 'giftcards',
      icon: FaGift,
      title: 'Gift Card Trading',
      description: 'Buy and sell gift cards from top brands at the best rates.',
      features: [
        'Trade 100+ gift card brands',
        'Instant verification',
        'Competitive exchange rates',
        'Secure escrow system',
      ],
      image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&auto=format&fit=crop',
      link: '/products/giftcards',
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
      gradient: 'from-amber-400 to-orange-500'
    },
  ];

  const quickFeatures = [
    { icon: FaShieldHalved, label: 'Bank-Grade Security' },
    { icon: FaBolt, label: 'Instant Transfers' },
    { icon: FaMoneyBillTransfer, label: 'Low Fees' },
    { icon: FaWallet, label: 'Multi-Currency' },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative bg-white pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-50 to-transparent opacity-60 skew-x-12" />
        <div className="absolute top-20 left-10 w-96 h-96 bg-purple-100 rounded-full blur-3xl opacity-30 mix-blend-multiply filter blur-[100px]" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-30 mix-blend-multiply filter blur-[100px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white shadow-md text-primary-700 rounded-full text-sm font-bold mb-8 border border-gray-100 animate-fade-in-up">
              <FaGlobe className="w-4 h-4" />
              Comprehensive Financial Ecosystem
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-8 text-gray-900 tracking-tight leading-tight">
              One Platform. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">
                Limitless Possibilities.
              </span>
            </h1>

            <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-12">
              Experience the future of finance with JAXOPAY. From seamless payments to crypto trading, we provide the tools you need to thrive globally.
            </p>

            {/* Quick Feature Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {quickFeatures.map((feat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100"
                >
                  <feat.icon className="w-6 h-6 text-primary-600" />
                  <span className="font-semibold text-sm text-gray-700">{feat.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Products Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-32">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className={`flex flex-col md:flex-row gap-12 lg:gap-24 items-center ${index % 2 === 1 ? 'md:flex-row-reverse' : ''
                  }`}
              >
                {/* Content Side */}
                <div className="flex-1 w-full">
                  <div className={`inline-flex items-center justify-center w-16 h-16 ${product.bgColor} rounded-2xl mb-8 shadow-sm transform rotate-3`}>
                    <product.icon className={`w-8 h-8 ${product.color}`} />
                  </div>

                  <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
                    {product.title}
                  </h2>

                  <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                    {product.description}
                  </p>

                  <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-700 mb-8">
                    <ul className="space-y-4">
                      {product.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-4">
                          <FaCircleCheck className={`w-6 h-6 ${product.color} flex-shrink-0`} />
                          <span className="text-lg text-gray-700 dark:text-gray-300 font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to={product.link}
                    className={`inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r ${product.gradient} text-white font-bold rounded-full hover:shadow-lg transition-all hover:scale-105`}
                  >
                    Explore {product.title}
                    <FaArrowRight className="w-5 h-5" />
                  </Link>
                </div>

                {/* Visual Side */}
                <div className="flex-1 w-full relative group perspective-1000">
                  <div className={`absolute inset-0 bg-gradient-to-tr ${product.gradient} opacity-20 blur-3xl rounded-full transform scale-90 group-hover:scale-100 transition-transform duration-700`} />

                  <motion.div
                    whileHover={{ rotateY: 5, rotateX: 5 }}
                    transition={{ type: "spring", stiffness: 100 }}
                    className="relative rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white dark:border-gray-800"
                  >
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-[500px] object-cover transform group-hover:scale-110 transition-transform duration-700"
                    />

                    {/* Floating Overlay Card */}
                    <div className="absolute bottom-8 left-8 right-8 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md p-6 rounded-2xl shadow-lg border border-white/20 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${product.bgColor}`}>
                          <product.icon className={`w-6 h-6 ${product.color}`} />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">Start using today</div>
                          <div className="text-xs text-gray-500">Available on iOS & Android</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white dark:bg-black overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:[mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.5))]" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-8">
            Ready to experience financial freedom?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            Join over 100,000+ happy users managing their money with JAXOPAY. No hidden fees, just seamless transactions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="px-10 py-5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-full text-lg shadow-xl hover:shadow-2xl hover:shadow-primary-600/30 transition-all transform hover:-translate-y-1">
              Create Free Account
            </Link>
            <Link to="/contact" className="px-10 py-5 bg-white text-gray-900 font-bold rounded-full text-lg border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all">
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
