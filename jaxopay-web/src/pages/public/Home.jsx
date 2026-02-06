import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  Bell,
  Globe,
  Wallet,
  CreditCard,
  Zap,
  Shield,
  TrendingUp,
  Users,
  CheckCircle,
  Star,
  Send,
  Bitcoin,
  Plane,
  Gift,
  DollarSign,
  Plus,
  MoreHorizontal
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { FaApple, FaGooglePlay } from 'react-icons/fa';
import { FaPaperPlane, FaCreditCard, FaBitcoin, FaPlane, FaGift, FaGlobe, FaWallet, FaArrowRightArrowLeft, FaBolt, FaShieldHalved } from 'react-icons/fa6';
import PublicLayout from '../../components/layout/PublicLayout';
import VideoPlayer from '../../components/VideoPlayer';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/autoplay';

export default function Home() {
  // Country flags for carousel
  const countries = [
    { name: 'Nigeria', flag: '🇳🇬' },
    { name: 'Kenya', flag: '🇰🇪' },
    { name: 'Ghana', flag: '🇬🇭' },
    { name: 'South Africa', flag: '🇿🇦' },
    { name: 'Egypt', flag: '🇪🇬' },
    { name: 'Morocco', flag: '🇲🇦' },
    { name: 'Tanzania', flag: '🇹🇿' },
    { name: 'Uganda', flag: '🇺🇬' },
    { name: 'Rwanda', flag: '🇷🇼' },
    { name: 'Senegal', flag: '🇸🇳' },
    { name: 'UK', flag: '🇬🇧' },
    { name: 'USA', flag: '🇺🇸' },
    { name: 'Canada', flag: '🇨🇦' },
    { name: 'China', flag: '🇨🇳' },
  ];

  const products = [
    {
      icon: FaPaperPlane,
      title: 'Payments',
      description: 'Send and receive money from friends and family at affordable rates. We aim to drive the cost of payments to zero.',
      color: 'text-[#4ADE80]' // Greenish
    },
    {
      icon: FaCreditCard,
      title: 'Virtual Cards',
      description: 'Hold and exchange multiple currencies at fair and transparent exchange rates. We are constantly adding new currencies.',
      color: 'text-[#3B82F6]' // Blue
    },
    {
      icon: FaBitcoin,
      title: 'Crypto',
      description: 'Buy, sell, and exchange cryptocurrencies with ease. Secure, fast, and reliable crypto transactions.',
      color: 'text-[#8B5CF6]' // Purple
    },
    {
      icon: FaPlane,
      title: 'Flight Booking',
      description: 'Book flights globally with competitive rates. Travel the world without payment barriers.',
      color: 'text-[#F472B6]' // Pink
    },
    {
      icon: FaGift,
      title: 'Gift Cards',
      description: 'Trade and redeem gift cards from popular global brands instantly. The perfect gift for anyone.',
      color: 'text-[#FBBF24]' // Amber
    },
  ];

  const features = [
    {
      icon: FaGlobe,
      title: 'Cross-Border Payments',
      description: 'Send money to 57+ African countries and beyond with competitive rates and instant transfers.',
    },
    {
      icon: FaWallet,
      title: 'Multi-Currency Wallets',
      description: 'Hold and manage multiple currencies (USD, EUR, GBP, NGN, KES, GHS, ZAR, XOF) in one place.',
    },
    {
      icon: FaArrowRightArrowLeft,
      title: 'Crypto Exchange',
      description: 'Buy, sell, and exchange cryptocurrencies (BTC, ETH, USDT, USDC) with ease.',
    },
    {
      icon: FaCreditCard,
      title: 'Virtual USD Cards',
      description: 'Get instant virtual cards for online payments and subscriptions worldwide.',
    },
    {
      icon: FaBolt,
      title: 'Bill Payments',
      description: 'Pay utilities, airtime, data, and other bills across multiple countries.',
    },
    {
      icon: FaShieldHalved,
      title: 'Bank-Grade Security',
      description: 'Your funds are protected with 2FA, encryption, and compliance with global standards.',
    },
  ];

  const stats = [
    { value: '57+', label: 'Countries Supported' },
    { value: '12', label: 'Currencies Available' },
    { value: '99.9%', label: 'Uptime Guarantee' },
    { value: '<1min', label: 'Average Transfer Time' },
  ];

  const howItWorks = [
    {
      step: '1',
      title: 'Create Account',
      description: 'Sign up in minutes with just your email and phone number.',
    },
    {
      step: '2',
      title: 'Verify Identity',
      description: 'Complete KYC verification to unlock all features and higher limits.',
    },
    {
      step: '3',
      title: 'Add Funds',
      description: 'Fund your wallet via bank transfer, card, or crypto deposit.',
    },
    {
      step: '4',
      title: 'Start Transacting',
      description: 'Send money, exchange currencies, pay bills, and more!',
    },
  ];

  const testimonials = [
    {
      name: 'Amara Okafor',
      role: 'Business Owner, Nigeria',
      content: 'JAXOPAY has transformed how I send money to my suppliers across Africa. Fast, reliable, and affordable!',
      rating: 5,
    },
    {
      name: 'Kwame Mensah',
      role: 'Freelancer, Ghana',
      content: 'The virtual USD card feature is a game-changer. I can now subscribe to international services without hassle.',
      rating: 5,
    },
    {
      name: 'Fatima Hassan',
      role: 'Student, Kenya',
      content: 'Sending money home has never been easier. The rates are great and transfers are instant!',
      rating: 5,
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section - Modern Light Theme */}
      <section className="relative bg-white pt-16 pb-12 lg:pt-20 lg:pb-16 overflow-hidden">
        {/* Background Gradients/Shapes */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-50 to-transparent opacity-60 skew-x-12" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-100 rounded-full blur-3xl opacity-40 mix-blend-multiply animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-primary-100 rounded-full blur-3xl opacity-40 mix-blend-multiply animate-blob animation-delay-2000" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="max-w-2xl"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold mb-6 border border-primary-100"
              >
                <Globe className="w-4 h-4" />
                Trusted by 100,000+ users globally
              </motion.div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight tracking-tight text-gray-900">
                The better way to
                <span className="block text-primary-600 mt-1">send money.</span>
              </h1>

              <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-lg">
                JAXOPAY offers the best exchange rates, instant transfers, and zero hidden fees. Manage your global finances in one secure app.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center px-8 py-4 bg-primary-600 text-white font-bold rounded-full hover:bg-primary-700 transition-all hover:scale-105 shadow-lg shadow-primary-500/30 gap-2"
                >
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/about"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-gray-900 font-bold rounded-full border-2 border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all"
                >
                  How it works
                </Link>
              </div>

              {/* App Store Links */}
              <div className="flex items-center gap-6">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-bold text-gray-900">4.9/5</span> rating from 10k+ reviews
                </div>
              </div>
            </motion.div>

            {/* Right Image */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative lg:h-auto flex items-center justify-center lg:justify-end lg:pl-12"
            >
              {/* Abstract decorative circle */}
              <div className="absolute w-[500px] h-[500px] bg-primary-50 rounded-full blur-3xl opacity-50 -z-10" />

              <div className="relative z-10 w-full max-w-sm mx-auto">
                {/* Phone Frame */}
                <div className="relative bg-gray-900 rounded-[2.5rem] border-8 border-gray-900 overflow-hidden shadow-2xl h-[600px] w-full max-w-[300px] mx-auto ring-8 ring-gray-100">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-gray-900 rounded-b-xl z-20"></div>

                  {/* Screen Content */}
                  <div className="w-full h-full bg-white flex flex-col pt-12 px-6">
                    {/* App Header */}
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden">
                          <img src="https://i.pravatar.cc/100?img=33" alt="User" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Good Morning</div>
                          <div className="font-bold text-gray-900">Emmanuel Edward</div>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200">
                        <Bell className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>

                    {/* Balance Card */}
                    <div className="bg-primary-600 rounded-3xl p-6 text-white text-center mb-8 shadow-lg shadow-primary-500/30 relative overflow-hidden">
                      <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                      <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl"></div>

                      <div className="text-sm text-primary-100 mb-2 font-medium">Total Balance</div>
                      <div className="text-4xl font-bold mb-6">$24,500.00</div>
                      <div className="flex justify-center gap-4">
                        <button className="flex flex-col items-center gap-1 group">
                          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                            <Plus className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-medium">Add</span>
                        </button>
                        <button className="flex flex-col items-center gap-1 group">
                          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                            <Send className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-medium">Send</span>
                        </button>
                        <button className="flex flex-col items-center gap-1 group">
                          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                            <CreditCard className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-medium">Cards</span>
                        </button>
                        <button className="flex flex-col items-center gap-1 group">
                          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                            <MoreHorizontal className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-medium">More</span>
                        </button>
                      </div>
                    </div>

                    {/* Recent Transactions */}
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-900">Recent Activity</h3>
                        <a href="#" className="text-sm text-primary-600 font-semibold">See All</a>
                      </div>
                      <div className="space-y-4">
                        {[
                          { name: 'Netflix Subscription', date: 'Today, 9:41 AM', amount: '-$14.99', icon: 'N', color: 'bg-red-100 text-red-600' },
                          { name: 'Spotify Premium', date: 'Yesterday, 2:30 PM', amount: '-$9.99', icon: 'S', color: 'bg-green-100 text-green-600' },
                          { name: 'Salary Deposit', date: 'Oct 24, 10:00 AM', amount: '+$4,500.00', icon: '💰', color: 'bg-blue-100 text-blue-600' },
                          { name: 'Uber Ride', date: 'Oct 23, 8:15 PM', amount: '-$24.50', icon: 'U', color: 'bg-black text-white' },
                        ].map((tx, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${tx.color}`}>
                                {tx.icon}
                              </div>
                              <div>
                                <div className="font-bold text-gray-900 text-sm">{tx.name}</div>
                                <div className="text-xs text-gray-500">{tx.date}</div>
                              </div>
                            </div>
                            <div className={`font-bold text-sm ${tx.amount.startsWith('+') ? 'text-green-600' : 'text-gray-900'}`}>
                              {tx.amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Notification */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -right-4 md:-right-12 top-1/4 bg-white p-4 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3 z-20"
                >
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-bold">Success</div>
                    <div className="text-sm font-bold text-gray-900">Sent $150.00</div>
                  </div>
                </motion.div>

                {/* Floating Card */}
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -left-4 md:-left-12 bottom-1/4 bg-[#0f172a] p-5 rounded-xl shadow-xl border border-gray-700 w-60 z-20"
                >
                  <div className="flex justify-between items-start mb-6">
                    <img src="/logo-white.png" alt="JAXOPAY" className="h-6 w-auto" />
                    <div className="w-8 h-5 bg-white/20 rounded-md flex items-center justify-center">
                      <div className="w-4 h-3 border border-white/40 rounded-sm"></div>
                    </div>
                  </div>
                  <div className="text-white font-mono text-lg tracking-widest mb-4 drop-shadow-md">
                    5790 •••• •••• 5977
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-white/40 text-[9px] uppercase tracking-wider mb-1">Card Holder</div>
                      <div className="text-white text-xs font-medium tracking-wide">Emmanuel Edward</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-white/40 text-[9px]">Exp 09/28</div>
                      <div className="flex -space-x-2">
                        <div className="w-5 h-5 rounded-full bg-red-500/90 z-10"></div>
                        <div className="w-5 h-5 rounded-full bg-yellow-500/90"></div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gray-50 dark:bg-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Country Carousel */}
      <section className="py-12 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
            Serving 57+ Countries Worldwide
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400">
            Send money across Africa and beyond
          </p>
        </div>

        <Swiper
          modules={[Autoplay]}
          spaceBetween={30}
          slidesPerView={4}
          loop={true}
          autoplay={{
            delay: 2000,
            disableOnInteraction: false,
          }}
          breakpoints={{
            320: { slidesPerView: 3 },
            640: { slidesPerView: 5 },
            768: { slidesPerView: 7 },
            1024: { slidesPerView: 10 },
          }}
          className="!py-8"
        >
          {countries.map((country, index) => (
            <SwiperSlide key={index}>
              <div className="flex flex-col items-center gap-2">
                <div className="text-5xl">{country.flag}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
                  {country.name}
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </section>


      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12"> {/* Aligned left or keeps center? Screenshot logo is left, but nav is top. The section header in my code was centered. I will keep it centered or align left? Screenshot shows the brand logo top left. The cards layout is the main thing. I'll keep the header centered as per previous design unless user specified otherwise. */}
            {/* Wait, the screenshot shows the "eversend" header. It's properly the navbar. The cards are the content. */}
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 text-center">
              Our Products & Services
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-center">
              Everything you need to manage your finances globally
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {products.map((product, index) => {
              // Logic for alternating dark/light cards
              // Simple alternating pattern works best for 3-column grid (D, L, D / L, D) checks out visually
              const isDark = index % 2 === 0;

              // Styles
              const cardClass = isDark
                ? "bg-[#020B2D] text-white"
                : "bg-[#F3F4F6] text-gray-900";

              const descClass = isDark
                ? "text-gray-300"
                : "text-gray-600";

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`${cardClass} rounded-[2.5rem] p-10 flex flex-col items-start justify-between min-h-[320px] shadow-sm hover:shadow-md transition-shadow`}
                >
                  <div className="mb-0">
                    {/* Icon container - simply the icon with color */}
                    <product.icon className={`w-12 h-12 ${product.color} mb-6`} />

                    <h3 className="text-2xl font-bold mb-4">
                      {product.title}
                    </h3>

                    <p className={`text-lg leading-relaxed ${descClass}`}>
                      {product.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
            {/* 6th Card: CTA Link */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              className="bg-[#F3F4F6] text-gray-900 rounded-[2.5rem] p-10 flex flex-col items-center justify-center min-h-[320px] shadow-sm hover:shadow-md transition-all text-center group cursor-pointer"
            >
              <Link to="/products" className="flex flex-col items-center justify-center h-full w-full">
                <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                  <ArrowRight className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-1">
                  Explore All
                </h3>
                <h3 className="text-2xl font-bold text-primary-600">
                  Products
                </h3>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              Everything You Need in One Platform
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              JAXOPAY combines the best of traditional banking and modern fintech to give you complete financial freedom.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex flex-col items-start text-left group"
              >
                <div className="mb-6">
                  {/* Solid Icon Styling - Indigo/Purple shade */}
                  <feature.icon className="w-10 h-10 text-[#5e43f3] group-hover:scale-110 transition-transform duration-300" />
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


      {/* Virtual Cards Feature Section */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-[2.5rem] p-8 md:p-16 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 relative overflow-hidden">
            {/* Background Blob */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-100 dark:bg-primary-900/20 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />

            {/* Left Images - Stacked Cards */}
            <div className="relative w-full lg:w-1/2 min-h-[400px] flex items-center justify-center perspective-1000">
              {/* Card 1 - Back */}
              <motion.div
                initial={{ x: -100, opacity: 0, rotate: -15 }}
                whileInView={{ x: 0, opacity: 1, rotate: -6 }}
                transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
                viewport={{ once: true }}
                className="absolute w-[280px] sm:w-[320px] h-[180px] sm:h-[200px] bg-[#0f172a] rounded-2xl shadow-2xl z-10 -rotate-6 transform -translate-x-12 translate-y-4 border border-gray-700/50 flex flex-col justify-between p-6 overflow-hidden"
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
                initial={{ x: 100, opacity: 0, rotate: 15 }}
                whileInView={{ x: 0, opacity: 1, rotate: 3 }}
                transition={{ duration: 0.8, delay: 0.1, type: "spring", bounce: 0.4 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05, rotate: 0 }}
                className="absolute w-[300px] sm:w-[340px] h-[190px] sm:h-[210px] bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white rounded-2xl shadow-2xl z-20 rotate-3 transform translate-x-4 -translate-y-4 p-7 flex flex-col justify-between cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <img src="/logo-icon.png" alt="JAXOPAY" className="w-8 h-8 object-contain" />
                  </div>
                  <div className="text-white/80 text-xs tracking-wider">VIRTUAL</div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-4 font-mono text-xl tracking-widest text-shadow-sm">
                    <span>5339</span>
                    <span>****</span>
                    <span>****</span>
                    <span>5632</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">CARD HOLDER</div>
                      <div className="font-medium tracking-wide uppercase">Emmanuel Edward</div>
                    </div>
                    {/* Mastercard Logo Simulation */}
                    <div className="flex -space-x-3 opacity-90">
                      <div className="w-8 h-8 rounded-full bg-red-500/90" />
                      <div className="w-8 h-8 rounded-full bg-yellow-400/90" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right Content */}
            <div className="w-full lg:w-1/2 text-left relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
                Virtual debit cards
              </h2>
              <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed mb-8">
                Banks in Africa charge you up to 15% in hidden foreign exchange fees when you pay online with your local currency bank card. Use JAXOPAY USD virtual cards to save up to 13%.
              </p>

              <Link to="/products/cards" className="text-primary-600 dark:text-primary-400 font-bold text-lg hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center gap-2 group transition-colors">
                Learn more about cards
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section - Minimalist Steps */}
      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              Get started in minutes
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Join over 100,000+ people who get the best exchange rates with JAXOPAY.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-[2.5rem] left-[12%] right-[12%] h-0.5 bg-gray-100 z-0" />

            {howItWorks.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative z-10 flex flex-col items-center text-center"
              >
                <div className="w-20 h-20 bg-white border-4 border-gray-50 rounded-full flex items-center justify-center shadow-lg mb-6 group cursor-default transition-all hover:border-primary-100 hover:scale-110">
                  <div className="w-10 h-10 bg-primary-600 rounded-full text-white flex items-center justify-center font-bold text-lg">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed px-2">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>




      {/* Our Impact Section - Yellow Theme */}
      <section className="py-20 bg-gradient-to-br from-yellow-600 via-yellow-700 to-yellow-800 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Our Impact</h2>
            <p className="text-xl text-yellow-100 max-w-2xl mx-auto">
              Empowering millions across Africa with accessible financial services
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            {/* Left - Statistics */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="text-6xl font-bold mb-2">25%</div>
                <div className="text-xl font-semibold mb-2">Lower Transaction Fees</div>
                <p className="text-purple-100">
                  We've helped our users save millions in transaction fees compared to traditional banks
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="text-6xl font-bold mb-2">98%</div>
                <div className="text-xl font-semibold mb-2">Customer Satisfaction</div>
                <p className="text-purple-100">
                  Our users love the speed, security, and simplicity of our platform
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="text-6xl font-bold mb-2">24/7</div>
                <div className="text-xl font-semibold mb-2">Support Available</div>
                <p className="text-purple-100">
                  Round-the-clock customer support in multiple languages
                </p>
              </div>
            </motion.div>

            {/* Right - Photo Grid */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1531545514256-b1400bc00f31?w=400&auto=format&fit=crop&q=80"
                    alt="Happy customer"
                    className="w-full h-64 object-cover hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80"
                    alt="Business owner"
                    className="w-full h-48 object-cover hover:scale-110 transition-transform duration-300"
                  />
                </div>
              </div>
              <div className="space-y-4 pt-8">
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80"
                    alt="Young professional"
                    className="w-full h-48 object-cover hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <img
                    src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80"
                    alt="Entrepreneur"
                    className="w-full h-64 object-cover hover:scale-110 transition-transform duration-300"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Video Section - Dark Background */}
      <section className="py-20 bg-gray-900 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              See JAXOPAY in Action 🎬
            </h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Watch how JAXOPAY is transforming cross-border payments across Africa
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-5xl mx-auto"
          >
            <VideoPlayer videoId="aOmhZ20C4qc" title="JAXOPAY Introduction" />
          </motion.div>
        </div>
      </section>


      {/* Our Impact Section - Redesigned */}
      <section className="py-20 bg-white dark:bg-gray-900 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary-50 rounded-full blur-3xl" />
          <div className="absolute bottom-[0%] right-[0%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-50" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Content */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold mb-6 border border-primary-100">
                <Globe className="w-4 h-4" />
                Global Impact
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
                Connecting People <br />
                <span className="text-primary-600">Across Borders</span>
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                We've built a financial network that spans continents, empowering millions to send money, trade, and grow their wealth without boundaries.
              </p>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">57+</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Countries</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">2M+</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Happy Users</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">$500M</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Processed/Year</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">99.9%</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Uptime</div>
                </div>
              </div>
            </motion.div>

            {/* Right: Visual Map/Globe Representation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="relative aspect-square rounded-full border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center p-8">
                {/* Orbits */}
                <div className="absolute inset-4 border border-gray-200 dark:border-gray-700 rounded-full opacity-50" />
                <div className="absolute inset-20 border border-gray-200 dark:border-gray-700 rounded-full opacity-50" />

                {/* Center Hub */}
                <div className="w-32 h-32 bg-white dark:bg-gray-900 rounded-full shadow-2xl flex items-center justify-center z-10 relative">
                  <div className="w-24 h-24 bg-primary-50 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                    <img src="/logo-icon.png" alt="JAXOPAY" className="w-12 opacity-80" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '🌍' }} />
                  </div>
                  <div className="absolute inset-0 border-2 border-primary-100 rounded-full animate-ping opacity-20" />
                </div>

                {/* Floating Avatars / Flags */}
                {[
                  { flag: '🇳🇬', x: '10%', y: '20%' },
                  { flag: '🇺🇸', x: '80%', y: '15%' },
                  { flag: '🇬🇧', x: '85%', y: '70%' },
                  { flag: '🇰🇪', x: '15%', y: '75%' },
                  { flag: '🇨🇦', x: '50%', y: '5%' },
                  { flag: '🇿🇦', x: '50%', y: '95%' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center text-2xl border border-gray-100 dark:border-gray-700"
                    style={{ left: item.x, top: item.y }}
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, delay: i * 0.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {item.flag}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Loved by Millions Section */}
      <section className="py-20 bg-gradient-to-br from-purple-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400 text-sm font-medium mb-4">
              <Star className="w-4 h-4 fill-current" />
              Trusted Worldwide
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Loved by 40 Million Users
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Join millions of satisfied customers who trust JAXOPAY for their financial needs
            </p>
          </motion.div>

          {/* Testimonials Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {[
              {
                name: 'Sarah Johnson',
                role: 'Small Business Owner',
                image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
                text: 'JAXOPAY has transformed how I manage my international payments. The fees are incredibly low and transfers are instant!',
                rating: 5
              },
              {
                name: 'Michael Chen',
                role: 'Freelance Developer',
                image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
                text: 'As a freelancer working with global clients, JAXOPAY makes receiving payments seamless. Best financial app I\'ve used!',
                rating: 5
              },
              {
                name: 'Amara Okafor',
                role: 'E-commerce Entrepreneur',
                image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
                text: 'The virtual cards feature is a game-changer for my online business. Secure, fast, and reliable!',
                rating: 5
              },
              {
                name: 'David Martinez',
                role: 'Digital Nomad',
                image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
                text: 'Managing multiple currencies while traveling has never been easier. JAXOPAY is my go-to financial companion!',
                rating: 5
              }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 dark:text-gray-300 mb-6 text-lg leading-relaxed">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center gap-4">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{testimonial.name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners & Trust Section */}
      <section className="py-16 bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Trusted by Leading Organizations
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Partnering with the world's best to serve you better
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
            {[
              { name: 'Mastercard', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg' },
              { name: 'Visa', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg' },
              { name: 'Stripe', text: 'STRIPE' },
              { name: 'PayPal', text: 'PayPal' }
            ].map((partner, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-center p-6 grayscale hover:grayscale-0 transition-all"
              >
                {partner.logo ? (
                  <img src={partner.logo} alt={partner.name} className="h-12 w-auto opacity-60 hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="text-3xl font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    {partner.text}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary-50 to-transparent opacity-60 skew-x-12 pointer-events-none" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Stay Updated with JAXOPAY
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
              Get the latest updates, tips, and exclusive offers delivered to your inbox
            </p>

            <form className="max-w-md mx-auto">
              <div className="flex gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-6 py-4 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30"
                >
                  Subscribe
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                We respect your privacy. Unsubscribe at any time.
              </p>
            </form>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary-600 to-primary-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Transform Your Financial Life?
          </h2>
          <p className="text-lg text-primary-100 mb-8">
            Join JAXOPAY today and experience the future of cross-border payments.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center px-8 py-4 bg-white text-primary-600 font-semibold rounded-lg hover:bg-primary-50 transition-colors gap-2"
          >
            Create Free Account
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout >
  );
}
