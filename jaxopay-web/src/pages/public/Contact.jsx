import { useState } from 'react';
import { Mail, Phone, MapPin, Clock, Send } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayout';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Implement actual form submission
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const contactInfo = [
    {
      icon: Mail,
      title: 'Email Us',
      details: ['support@jaxopay.com', 'business@jaxopay.com'],
    },
    {
      icon: Phone,
      title: 'Call Us',
      details: ['+234 800 JAXOPAY', '+1 (555) 123-4567'],
    },
    {
      icon: MapPin,
      title: 'Visit Us',
      details: ['Lagos, Nigeria', 'Nairobi, Kenya', 'Accra, Ghana'],
    },
    {
      icon: Clock,
      title: 'Business Hours',
      details: ['Mon - Fri: 8:00 AM - 6:00 PM WAT', 'Sat: 9:00 AM - 2:00 PM WAT'],
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="bg-white pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-50 text-accent-700 rounded-full text-sm font-semibold mb-6 border border-accent-100">
              Support Center
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 tracking-tight">
              Get in Touch
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Send us a Message
              </h2>

              {submitted && (
                <div className="mb-6 p-4 bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg">
                  <p className="text-accent-800 dark:text-accent-200">
                    Thank you! Your message has been sent successfully. We'll get back to you soon.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="How can we help?"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    placeholder="Tell us more about your inquiry..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Send Message
                </button>
              </form>
            </div>

            {/* Contact Information */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Contact Information
              </h2>

              <div className="space-y-6">
                {contactInfo.map((info, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-accent-100 dark:bg-accent-900/30 rounded-lg flex items-center justify-center">
                        <info.icon className="w-6 h-6 text-accent-600 dark:text-accent-400" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        {info.title}
                      </h3>
                      {info.details.map((detail, idx) => (
                        <p key={idx} className="text-gray-600 dark:text-gray-400">
                          {detail}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* FAQ Link */}
              <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Looking for quick answers?
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Check out our FAQ section for instant answers to common questions.
                </p>
                <a
                  href="#"
                  className="text-accent-600 dark:text-accent-400 hover:underline font-medium"
                >
                  Visit FAQ →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

