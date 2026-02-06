import { Briefcase, MapPin, Clock, ArrowRight, Heart, Zap, Globe, Users } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Careers() {
    const jobs = [
        {
            id: 1,
            title: 'Senior Frontend Engineer',
            department: 'Engineering',
            location: 'Remote (Africa/Europe)',
            type: 'Full-time',
            tags: ['React', 'TypeScript', 'Tailwind']
        },
        {
            id: 2,
            title: 'Product Manager',
            department: 'Product',
            location: 'Lagos, Nigeria',
            type: 'Full-time',
            tags: ['Fintech', 'Agile', 'Strategy']
        },
        {
            id: 3,
            title: 'Customer Success Specialist',
            department: 'Support',
            location: 'Nairobi, Kenya',
            type: 'Full-time',
            tags: ['Support', 'Communication', 'Fintech']
        },
        {
            id: 4,
            title: 'Compliance Officer',
            department: 'Legal',
            location: 'London, UK / Remote',
            type: 'Full-time',
            tags: ['Legal', 'Regulatory', 'AML']
        }
    ];

    const benefits = [
        { icon: Globe, title: 'Remote First', description: 'Work from anywhere in the world. We focus on output, not hours.' },
        { icon: Heart, title: 'Health & Wellness', description: 'Comprehensive health insurance and wellness stipends.' },
        { icon: Zap, title: 'Competitive Pay', description: 'Top-tier salary packages with equity options.' },
        { icon: Users, title: 'Great Culture', description: 'Annual retreats, team bondings, and a supportive environment.' },
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
                            <Briefcase className="w-4 h-4" />
                            We're Hiring!
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 tracking-tight">
                            Join the <span className="text-primary-600">Revolution</span>
                        </h1>
                        <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
                            Help us build the financial infrastructure for the next billion users.
                            We are looking for passionate individuals to join our mission.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Benefits */}
            <section className="py-20 bg-gray-50 dark:bg-gray-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {benefits.map((benefit, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"
                            >
                                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-4">
                                    <benefit.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                </div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{benefit.title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{benefit.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Open Positions */}
            <section className="py-20 bg-white dark:bg-gray-900">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Open Positions</h2>
                        <p className="text-gray-600 dark:text-gray-400">Come do the best work of your career</p>
                    </div>

                    <div className="space-y-4">
                        {jobs.map((job, index) => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="flex flex-col md:flex-row items-center justify-between bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-all hover:shadow-lg group cursor-pointer"
                            >
                                <div className="flex-1 text-center md:text-left mb-4 md:mb-0">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{job.title}</h3>
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-gray-600 dark:text-gray-400">
                                        <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.department}</span>
                                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {job.type}</span>
                                    </div>
                                </div>
                                <div>
                                    <button className="px-6 py-3 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-full group-hover:bg-primary-600 group-hover:text-white transition-colors flex items-center gap-2">
                                        Apply Now <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>
        </PublicLayout>
    );
}
