import { Calendar, User, ArrowRight, Tag } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Blog() {
    const posts = [
        {
            id: 1,
            title: 'The Future of Cross-Border Payments in Africa',
            excerpt: 'How digital wallets and virtual cards are revolutionizing the way Africans transact globally.',
            author: 'David O.',
            date: 'Oct 24, 2025',
            category: 'Fintech',
            image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&auto=format&fit=crop'
        },
        {
            id: 2,
            title: 'Understanding Virtual Cards: A Complete Guide',
            excerpt: 'Everything you need to know about creating and using virtual USD cards for online subscriptions.',
            author: 'Sarah M.',
            date: 'Oct 20, 2025',
            category: 'Guides',
            image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop'
        },
        {
            id: 3,
            title: 'Crypto 101: Safe Trading for Beginners',
            excerpt: '5 essential tips for new crypto traders to navigate the market securely and profitably.',
            author: 'Michael B.',
            date: 'Oct 15, 2025',
            category: 'Crypto',
            image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&auto=format&fit=crop'
        },
        {
            id: 4,
            title: 'JAXOPAY Launches in 5 New Countries',
            excerpt: 'We are excited to announce our expansion into Ghana, Tanzania, Uganda, Rwanda, and Cameroon.',
            author: 'JAXOPAY Team',
            date: 'Oct 10, 2025',
            category: 'Company News',
            image: 'https://images.unsplash.com/photo-1526304640152-d4619684e484?w=800&auto=format&fit=crop'
        }
    ];

    return (
        <PublicLayout>
            {/* Hero Section */}
            <section className="relative bg-white pt-32 pb-20 overflow-hidden">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary-50 to-transparent opacity-60 skew-x-12" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="max-w-3xl mx-auto text-center"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold mb-6 border border-primary-100">
                            <Tag className="w-4 h-4" />
                            Latest Updates
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight">
                            Insights & <span className="text-primary-600">News</span>
                        </h1>
                        <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
                            Stay updated with the latest trends in fintech, crypto, and company announcements.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Blog Grid */}
            <section className="py-20 bg-gray-50 dark:bg-gray-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts.map((post, index) => (
                            <motion.article
                                key={post.id}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all border border-gray-100 dark:border-gray-700 group cursor-pointer"
                            >
                                <div className="relative h-48 overflow-hidden">
                                    <img
                                        src={post.image}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-primary-600 uppercase tracking-wide">
                                        {post.category}
                                    </div>
                                </div>

                                <div className="p-6">
                                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {post.date}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {post.author}
                                        </div>
                                    </div>

                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-primary-600 transition-colors line-clamp-2">
                                        {post.title}
                                    </h2>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">
                                        {post.excerpt}
                                    </p>

                                    <div className="flex items-center text-primary-600 font-semibold text-sm group-hover:gap-2 transition-all">
                                        Read Article <ArrowRight className="w-4 h-4 ml-1" />
                                    </div>
                                </div>
                            </motion.article>
                        ))}
                    </div>
                </div>
            </section>

            {/* Newsletter */}
            <section className="py-20 bg-white dark:bg-gray-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-primary-900 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-800 rounded-full blur-3xl opacity-50 translate-x-1/2 -translate-y-1/2" />
                        <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-600 rounded-full blur-3xl opacity-50 -translate-x-1/2 translate-y-1/2" />

                        <div className="relative z-10 max-w-2xl mx-auto">
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                                Subscribe to our newsletter
                            </h2>
                            <p className="text-primary-100 text-lg mb-8">
                                Get the latest financial tips and updates delivered straight to your inbox.
                            </p>
                            <form className="flex flex-col sm:flex-row gap-4">
                                <input
                                    type="email"
                                    placeholder="Enter your email address"
                                    className="flex-1 px-6 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                                />
                                <button className="px-8 py-4 bg-white text-primary-900 font-bold rounded-full hover:bg-gray-100 transition-colors">
                                    Subscribe
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </section>
        </PublicLayout>
    );
}
