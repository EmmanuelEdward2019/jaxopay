import { FaBullseye, FaEye, FaHeart, FaUsers, FaGlobe, FaShieldHalved, FaBolt, FaArrowTrendUp, FaStar, FaAward, FaCircleCheck } from 'react-icons/fa6';
import { Target, Compass } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';

export default function About() {
  const values = [
    {
      icon: FaShieldHalved,
      title: 'Security First',
      description: 'We prioritize the security of your funds and data with bank-grade encryption and compliance.',
    },
    {
      icon: FaUsers,
      title: 'Customer-Centric',
      description: 'Our users are at the heart of everything we do. We build features that solve real problems.',
    },
    {
      icon: FaBolt,
      title: 'Innovation',
      description: 'We leverage cutting-edge technology to provide fast, reliable, and affordable financial services.',
    },
    {
      icon: FaHeart,
      title: 'Transparency',
      description: 'No hidden fees, no surprises. We believe in honest and transparent pricing.',
    },
  ];

  const milestones = [
    { year: '2024', event: 'JAXOPAY founded with a vision to democratize cross-border payments in Africa' },
    { year: '2025', event: 'Launched in 10 African countries with multi-currency wallet support' },
    { year: '2026', event: 'Expanded to 57+ countries, added crypto exchange and virtual cards' },
    { year: 'Future', event: 'Building the most comprehensive fintech super app for Africa and beyond' },
  ];

  return (
    <PublicLayout>
      {/* Hero Section with Image */}
      <section className="relative bg-white pt-32 pb-20 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent-50 to-transparent opacity-60 skew-x-12" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 text-accent-700 rounded-full text-sm font-semibold mb-6 border border-accent-100">
                <FaStar className="w-4 h-4 text-accent-600" />
                About JAXOPAY
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-gray-900 tracking-tight">
                Building the Future of <span className="text-accent-600">African Finance</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                JAXOPAY is on a mission to make financial services accessible, affordable, and seamless for everyone across Africa and beyond.
              </p>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1 text-gray-900">100K+</div>
                  <div className="text-sm text-gray-500 font-medium">Active Users</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1 text-gray-900">57+</div>
                  <div className="text-sm text-gray-500 font-medium">Countries</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1 text-gray-900">$2M+</div>
                  <div className="text-sm text-gray-500 font-medium">Daily Volume</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80"
                  alt="Team collaboration"
                  className="w-full h-[500px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-yellow-900/60 via-transparent to-transparent" />

                {/* Floating Achievement Card */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  className="absolute bottom-8 left-8 right-8 bg-white/95 backdrop-blur-lg rounded-2xl p-6 shadow-2xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-yellow-500 to-yellow-700 rounded-full flex items-center justify-center">
                      <FaAward className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Award Winning Platform</div>
                      <div className="text-xs text-gray-600">Best Fintech Innovation 2025</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* New Section 1: Vision of Innovation - Dark Premium */}
      <section className="py-24 bg-[#0A0D0C] text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-accent-500/10 rounded-full blur-[160px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="w-full lg:w-1/2"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm font-bold mb-6 uppercase tracking-widest">
                <FaBolt className="w-4 h-4" />
                Next-Gen Vision
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-tight tracking-tight">
                Pioneering the <br />
                <span className="text-accent-500 italic">Digital Frontier</span>
              </h2>
              <p className="text-xl text-gray-400 leading-relaxed mb-10">
                At JAXOPAY, we don't just follow trends—we set them. Our engineering core is dedicated to building a borderless financial ecosystem that empowers every African to participate in the global economy.
              </p>
              <div className="space-y-6">
                <div className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                    <FaAward className="w-6 h-6 text-accent-500" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Advanced Ledger Tech</h4>
                    <p className="text-sm text-gray-500">Immutable, secure, and lightning-fast transaction processing.</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="w-full lg:w-1/2 relative"
            >
              <div className="absolute -inset-4 bg-accent-500/20 rounded-full blur-[80px] animate-pulse" />
              <img
                src="/images/innovation-vision.png"
                alt="Innovation Vision"
                className="relative z-10 w-full h-auto drop-shadow-[0_20px_50px_rgba(16,185,129,0.3)]"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Story Section with Images */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Our Story
              </h2>
              <div className="space-y-4 text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                <p>
                  JAXOPAY was born from a simple observation: sending money across African borders shouldn't be complicated, expensive, or slow. Yet millions of people face these challenges every day.
                </p>
                <p>
                  We started with a vision to create a platform that combines the best of traditional banking with modern fintech innovation. A platform where you can send money to your family in another country, exchange currencies at fair rates, pay your bills, and even invest in cryptocurrencies—all in one place.
                </p>
                <p>
                  Today, JAXOPAY serves thousands of users across 57+ countries, processing millions in transactions every month. But we're just getting started.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <div className="relative rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white dark:border-gray-800 group">
                <img
                  src="/images/team-story.png"
                  alt="Our Team"
                  className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/40 via-transparent to-transparent opacity-60" />
              </div>

              {/* Floating Badge */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute -bottom-6 -right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 border-4 border-accent-500 z-10"
              >
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <FaArrowTrendUp className="w-10 h-10 text-accent-600 dark:text-accent-400" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">100K+</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Happy Users</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mission & Vision with Imagery */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.02 }}
              className="p-8 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-xl"
            >
              <div className="mb-6">
                <div className="w-16 h-16 bg-accent-50 dark:bg-accent-950/30 rounded-2xl flex items-center justify-center">
                  <Target className="w-8 h-8 text-accent-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Our Mission
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                To empower individuals and businesses across Africa with accessible, affordable, and innovative financial services that enable them to thrive in the global economy.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.02 }}
              className="p-8 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-xl"
            >
              <div className="mb-6">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/30 rounded-2xl flex items-center justify-center">
                  <Compass className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Our Vision
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                To become the leading fintech super app in Africa, connecting millions of people to global financial opportunities and driving economic growth across the continent.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* New Section 2: Global Collaboration - High-End Aesthetic */}
      <section className="py-24 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-16 lg:gap-24">
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="w-full lg:w-1/2"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-bold mb-6 uppercase tracking-widest">
                <FaUsers className="w-4 h-4" />
                Global Partnerships
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-tight tracking-tight text-gray-900">
                Unity in <span className="text-indigo-600 italic">Diversity</span>
              </h2>
              <p className="text-xl text-gray-600 leading-relaxed mb-10">
                Collaboration is our superpower. We partner with global banks, local merchants, and tech giants to ensure your financial reach spans continents without friction.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100">
                  <div className="text-3xl font-bold text-gray-900 mb-1">500+</div>
                  <div className="text-sm text-gray-500 font-medium">Platform Partners</div>
                </div>
                <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100">
                  <div className="text-3xl font-bold text-gray-900 mb-1">12+</div>
                  <div className="text-sm text-gray-500 font-medium">Core Currencies</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -100 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: "circOut" }}
              className="w-full lg:w-1/2"
            >
              <img
                src="/images/global-collaboration.png"
                alt="Global Collaboration 3D"
                className="w-full h-auto drop-shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section with Happy Emojis */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Our Core Values 💎
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              These principles guide everything we do at JAXOPAY.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className="text-center p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-2xl transition-all"
              >
                <div className="mb-6 flex justify-center">
                  <value.icon className="w-12 h-12 text-accent-600 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {value.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {value.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Milestones Section with Imagery */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Our Journey
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              From humble beginnings to serving thousands across Africa
            </p>
          </motion.div>

          <div className="space-y-8">
            {milestones.map((milestone, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0">
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 360 }}
                    transition={{ type: 'spring' }}
                    className="w-20 h-20 bg-gradient-to-br from-accent-600 to-emerald-800 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-xl"
                  >
                    {milestone.year === 'Future' ? '🔮' : milestone.year}
                  </motion.div>
                </div>
                <div className="flex-1 pt-4">
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                      {milestone.event}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-gradient-to-br from-purple-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Why Choose JAXOPAY?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              We're not just another fintech app. Here's what makes us different.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FaShieldHalved,
                title: 'Bank-Grade Security',
                description: 'Your funds are protected with military-grade encryption and multi-factor authentication.',
                color: 'from-blue-500 to-blue-600'
              },
              {
                icon: FaBolt,
                title: 'Lightning Fast',
                description: 'Transfers complete in under 2 minutes. No more waiting days for your money.',
                color: 'from-purple-500 to-purple-600'
              },
              {
                icon: FaArrowTrendUp,
                title: 'Lowest Fees',
                description: 'Save up to 25% on transaction fees compared to traditional banks.',
                color: 'from-sky-500 to-sky-600'
              },
              {
                icon: FaGlobe,
                title: 'Global Reach',
                description: 'Send money to 57+ countries with support for 12 major currencies.',
                color: 'from-orange-500 to-orange-600'
              },
              {
                icon: FaUsers,
                title: '24/7 Support',
                description: 'Our dedicated support team is always here to help you, anytime, anywhere.',
                color: 'from-pink-500 to-pink-600'
              },
              {
                icon: FaCircleCheck,
                title: 'Fully Licensed',
                description: 'Regulated and compliant with international financial standards.',
                color: 'from-indigo-500 to-indigo-600'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow"
              >
                <div className="mb-6">
                  <feature.icon className="w-12 h-12 text-accent-600 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

