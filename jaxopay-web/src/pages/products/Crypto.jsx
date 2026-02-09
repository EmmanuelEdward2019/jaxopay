import { FaBitcoin, FaArrowTrendUp, FaShieldHalved, FaBolt, FaLock, FaArrowRight, FaArrowsRotate, FaArrowTrendDown } from 'react-icons/fa6';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Crypto() {
  const [cryptoPrices, setCryptoPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCryptoPrices = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h'
        );
        const data = await response.json();
        setCryptoPrices(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        setLoading(false);
      }
    };

    fetchCryptoPrices();
    // Refresh prices every 60 seconds
    const interval = setInterval(fetchCryptoPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    { icon: FaBolt, title: 'Instant Trading', description: 'Buy, sell, and swap crypto in seconds with real-time pricing' },
    { icon: FaShieldHalved, title: 'Secure Storage', description: 'Your crypto is protected with military-grade cold storage' },
    { icon: FaArrowTrendUp, title: 'Low Fees', description: 'Industry-leading trading fees starting at just 0.1%' },
    { icon: FaLock, title: 'Regulated Platform', description: 'Fully compliant with international crypto regulations' },
    { icon: FaArrowsRotate, title: 'Instant Conversion', description: 'Convert crypto to fiat and vice versa instantly' },
    { icon: FaBitcoin, title: 'Multiple Coins', description: 'Trade Bitcoin, Ethereum, USDT, USDC, and more' }
  ];

  const cryptos = [
    { name: 'Bitcoin', symbol: 'BTC', image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&auto=format&fit=crop', price: '$45,230' },
    { name: 'Ethereum', symbol: 'ETH', image: 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=400&auto=format&fit=crop', price: '$2,850' },
    { name: 'Tether', symbol: 'USDT', image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=400&auto=format&fit=crop', price: '$1.00' },
    { name: 'USD Coin', symbol: 'USDC', image: 'https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=400&auto=format&fit=crop', price: '$1.00' }
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative bg-white pt-32 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-full text-sm font-semibold mb-6 border border-orange-100">
                <FaArrowTrendUp className="w-4 h-4" />
                Crypto Exchange
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight leading-tight">
                Trade Crypto with <span className="text-orange-600">Confidence</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Buy, sell, and swap cryptocurrencies at competitive rates. Secure, fast, and easy.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/signup" className="px-8 py-4 bg-orange-600 text-white font-bold rounded-full hover:bg-orange-700 transition-all shadow-lg hover:shadow-orange-500/30 inline-flex items-center gap-2">
                  Start Trading <FaArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/contact" className="px-8 py-4 bg-white text-gray-900 font-bold rounded-full border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all">
                  Learn More
                </Link>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-8 border-white">
                <img src="https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&auto=format&fit=crop" alt="Cryptocurrency trading" className="w-full h-auto" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Live Crypto Price Ticker */}
      <section className="bg-gray-900 dark:bg-gray-950 py-4 overflow-hidden border-y border-gray-800">
        <div className="relative">
          {loading ? (
            <div className="text-center text-gray-400 py-2">Loading live prices...</div>
          ) : (
            <div className="flex animate-marquee whitespace-nowrap">
              {/* Duplicate the array to create seamless loop */}
              {[...cryptoPrices, ...cryptoPrices].map((crypto, index) => (
                <div
                  key={`${crypto.id}-${index}`}
                  className="inline-flex items-center mx-6 px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50"
                >
                  <img
                    src={crypto.image}
                    alt={crypto.name}
                    className="w-6 h-6 mr-2 rounded-full"
                  />
                  <span className="font-semibold text-white mr-2">
                    {crypto.symbol.toUpperCase()}
                  </span>
                  <span className="text-gray-300 mr-2">
                    ${crypto.current_price.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: crypto.current_price < 1 ? 6 : 2
                    })}
                  </span>
                  <span
                    className={`flex items-center text-sm font-medium ${crypto.price_change_percentage_24h >= 0
                      ? 'text-primary-400'
                      : 'text-red-400'
                      }`}
                  >
                    {crypto.price_change_percentage_24h >= 0 ? (
                      <FaArrowTrendUp className="w-3 h-3 mr-1" />
                    ) : (
                      <FaArrowTrendDown className="w-3 h-3 mr-1" />
                    )}
                    {Math.abs(crypto.price_change_percentage_24h).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Why Trade with JAXOPAY?</h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">Professional-grade crypto trading for everyone</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Cryptos */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Supported Cryptocurrencies</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">Trade the most popular digital assets</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {cryptos.map((crypto, index) => (
              <motion.div key={crypto.symbol} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden hover:shadow-xl transition-shadow">
                <img src={crypto.image} alt={crypto.name} className="w-full h-40 object-cover" />
                <div className="p-6">
                  <div className="font-bold text-gray-900 dark:text-white text-lg">{crypto.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{crypto.symbol}</div>
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{crypto.price}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-orange-600 to-yellow-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Start Trading Crypto Today</h2>
          <p className="text-xl text-orange-100 mb-8">Join thousands of traders who trust JAXOPAY for secure crypto trading</p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-orange-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            Create Free Account <FaArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

