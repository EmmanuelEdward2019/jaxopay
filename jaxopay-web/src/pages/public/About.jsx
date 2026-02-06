import { FaBullseye, FaEye, FaHeart, FaUsers, FaGlobe, FaShieldHalved, FaBolt, FaArrowTrendUp, FaStar, FaAward, FaCircleCheck } from 'react-icons/fa6';
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
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-50 to-transparent opacity-60 skew-x-12" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold mb-6 border border-primary-100">
                <FaStar className="w-4 h-4 text-primary-600" />
                About JAXOPAY
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-gray-900 tracking-tight">
                Building the Future of <span className="text-primary-600">African Finance</span>
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
                Our Story 📖
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
              transition={{ duration: 0.6 }}
              className="relative"
            >
              {/* Team/Happy Customers Imagery */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 flex items-center justify-center shadow-xl">
                  <FaUsers className="w-16 h-16 text-white" />
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-8 flex items-center justify-center shadow-xl">
                  <FaBolt className="w-16 h-16 text-white" />
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-8 flex items-center justify-center shadow-xl">
                  <FaShieldHalved className="w-16 h-16 text-white" />
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 flex items-center justify-center shadow-xl">
                  <FaGlobe className="w-16 h-16 text-white" />
                </div>
              </div>

              {/* Floating Badge */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute -bottom-6 -right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 border-4 border-primary-500"
              >
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <FaArrowTrendUp className="w-10 h-10 text-primary-600 dark:text-primary-400" />
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
              className="p-8 bg-gradient-to-br from-white to-primary-50 dark:from-gray-900 dark:to-primary-900/20 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg">
                  <FaBullseye className="w-10 h-10 text-white" />
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
              className="p-8 bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-blue-900/20 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg">
                  <FaEye className="w-10 h-10 text-white" />
                </div>
                <div className="text-5xl">👁️</div>
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
                  <value.icon className="w-12 h-12 text-[#5e43f3] group-hover:scale-110 transition-transform duration-300" />
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
                    className="w-20 h-20 bg-gradient-to-br from-primary-600 to-primary-800 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-xl"
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
                color: 'from-green-500 to-green-600'
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
                  <feature.icon className="w-12 h-12 text-[#5e43f3] group-hover:scale-110 transition-transform duration-300" />
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

      {/* Team Section with Happy Faces */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Meet Our Amazing Team
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Passionate professionals dedicated to transforming African finance
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { role: 'CEO & Founder', image: '/logo.png', name: 'Michael Chen' },
              { role: 'CTO', image: '/logo.png', name: 'Sarah Williams' },
              { role: 'Head of Product', image: '/logo.png', name: 'James Okon' },
              { role: 'Lead Designer', image: '/logo.png', name: 'Amara Diop' },
            ].map((member, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className="text-center"
              >
                <div className="w-40 h-40 mx-auto mb-6 rounded-full overflow-hidden shadow-xl border-4 border-white dark:border-gray-800 group-hover:scale-105 transition-transform duration-300 bg-gray-100 flex items-center justify-center">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-32 h-auto object-contain"
                  />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {member.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {member.role}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 text-center"
          >
            <div className="inline-block bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-2xl p-8 border border-primary-200 dark:border-primary-800">
              <div className="flex justify-center mb-4">
                <FaStar className="w-12 h-12 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Join Our Team!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                We're always looking for talented individuals to join our mission
              </p>
              <a
                href="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                Get in Touch
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}

