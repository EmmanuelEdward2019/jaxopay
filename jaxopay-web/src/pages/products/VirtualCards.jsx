import { FaCreditCard, FaLock, FaBolt, FaGlobe, FaShieldHalved, FaEye, FaEyeSlash, FaArrowRight, FaCircleCheck } from 'react-icons/fa6';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function VirtualCards() {
  const features = [
    {
      icon: FaBolt,
      title: 'Instant Issuance',
      description: 'Get your virtual card in seconds - no waiting, no paperwork'
    },
    {
      icon: FaGlobe,
      title: 'Global Acceptance',
      description: 'Use anywhere Visa/Mastercard is accepted worldwide'
    },
    {
      icon: FaLock,
      title: 'Enhanced Security',
      description: 'Freeze, unfreeze, or delete cards instantly from your dashboard'
    },
    {
      icon: FaShieldHalved,
      title: 'Spending Controls',
      description: 'Set custom spending limits and transaction restrictions'
    },
    {
      icon: FaEye,
      title: 'Real-Time Tracking',
      description: 'Monitor every transaction with instant push notifications'
    },
    {
      icon: FaCircleCheck,
      title: 'Multiple Cards',
      description: 'Create unlimited virtual cards for different purposes'
    }
  ];

  const useCases = [
    {
      title: 'Online Shopping',
      description: 'Shop on Amazon, eBay, AliExpress and thousands of other sites',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&auto=format&fit=crop'
    },
    {
      title: 'Subscriptions',
      description: 'Pay for Netflix, Spotify, YouTube Premium, and more',
      image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop'
    },
    {
      title: 'Digital Services',
      description: 'Subscribe to software, cloud services, and digital tools',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop'
    },
    {
      title: 'Travel Bookings',
      description: 'Book flights, hotels, and car rentals with confidence',
      image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&auto=format&fit=crop'
    }
  ];

  const cardTypes = [
    { name: 'Standard Card', fee: '$2', limit: '$500/month', color: 'from-accent-500 to-accent-600' },
    { name: 'Premium Card', fee: '$5', limit: '$2,000/month', color: 'from-accent-600 to-emerald-700' },
    { name: 'Business Card', fee: '$10', limit: '$10,000/month', color: 'from-gray-800 to-black' }
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative bg-white pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 text-accent-700 rounded-full text-sm font-semibold mb-6 border border-accent-100">
                <FaGlobe className="w-4 h-4" />
                Global Virtual Cards
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight leading-tight">
                Virtual USD Cards for <span className="text-accent-600">Global Payments</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Get instant virtual cards for online shopping, subscriptions, and digital services.
                Pay on Amazon, Netflix, and thousands of sites worldwide.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/signup"
                  className="px-8 py-4 bg-accent-600 text-white font-bold rounded-full hover:bg-accent-700 transition-all shadow-lg hover:shadow-accent-500/30 inline-flex items-center gap-2"
                >
                  Get Your Card
                  <FaArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/contact"
                  className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all"
                >
                  Learn More
                </Link>
              </div>
            </motion.div>

            {/* Right Visual - Stacked Cards */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative flex items-center justify-center min-h-[400px] perspective-1000"
            >
              {/* Decorative background blob */}
              <div className="absolute w-[400px] h-[400px] bg-accent-100 rounded-full blur-3xl opacity-50" />

              {/* Card 1 - Back */}
              <motion.div
                animate={{ y: [0, -10, 0], rotate: [-6, -8, -6] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute w-[340px] h-[210px] bg-[#0f172a] rounded-2xl shadow-2xl z-10 -rotate-6 transform -translate-x-12 translate-y-4 border border-gray-700/50 flex flex-col justify-between p-6 overflow-hidden"
              >
                <div className="flex justify-between items-start">
                  <img src="/logo-icon.png" alt="JAXOPAY" className="h-5 w-auto brightness-200 opacity-80" />
                  <div className="text-white/50 text-xs">VIRTUAL</div>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-white/90 font-mono tracking-widest text-lg">**** 5339</div>
                  <div className="w-10 h-6 bg-white/10 rounded-sm" />
                </div>
              </motion.div>

              {/* Card 2 - Front (Main) */}
              <motion.div
                animate={{ y: [0, 10, 0], rotate: [3, 5, 3] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute w-[360px] h-[225px] bg-gradient-to-br from-accent-600 to-emerald-700 text-white rounded-2xl shadow-2xl z-20 rotate-3 transform translate-x-4 -translate-y-4 p-8 flex flex-col justify-between"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <img src="/logo-icon.png" alt="JAXOPAY" className="w-8 h-8 object-contain" />
                  </div>
                  <div className="text-white/80 text-xs tracking-wider">PREMIUM</div>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4 font-mono text-2xl tracking-widest text-shadow-sm">
                    <span>4532</span>
                    <span>****</span>
                    <span>****</span>
                    <span>8894</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">CARD HOLDER</div>
                      <div className="font-medium tracking-wide text-sm uppercase">Emmanuel Edward</div>
                    </div>
                    {/* Mastercard Logo Simulation */}
                    <div className="flex -space-x-3 opacity-90">
                      <div className="w-10 h-10 rounded-full bg-red-500/90" />
                      <div className="w-10 h-10 rounded-full bg-yellow-400/90" />
                    </div>
                  </div>
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
              Powerful Features for Modern Spending
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Everything you need to manage your online payments securely
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

      {/* Use Cases */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Perfect For Every Need
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Use your virtual card for all your online needs
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden hover:shadow-xl transition-shadow"
              >
                <img
                  src={useCase.image}
                  alt={useCase.title}
                  className="w-full h-48 object-cover"
                />
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {useCase.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {useCase.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Card Types */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Choose Your Card Type
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Select the perfect card for your spending needs
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {cardTypes.map((card, index) => (
              <motion.div
                key={card.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className={`bg-gradient-to-br ${card.color} rounded-2xl p-8 text-white h-64 flex flex-col justify-between shadow-xl`}>
                  <div>
                    <FaCreditCard className="w-12 h-12 mb-4" />
                    <h3 className="text-2xl font-bold mb-2">{card.name}</h3>
                  </div>
                  <div>
                    <div className="text-sm opacity-80 mb-1">Monthly Limit</div>
                    <div className="text-3xl font-bold">{card.limit}</div>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Issuance Fee</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{card.fee}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-accent-600 to-emerald-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Get Your Virtual Card Today
          </h2>
          <p className="text-xl text-accent-100 mb-8">
            Start shopping globally with instant virtual cards. No credit check required.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Create Free Account
            <FaArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

