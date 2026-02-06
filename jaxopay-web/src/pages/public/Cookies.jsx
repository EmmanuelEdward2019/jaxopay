import PublicLayout from '../../components/layout/PublicLayout';

export default function Cookies() {
  const cookieTypes = [
    {
      title: 'Essential Cookies',
      description: 'These cookies are necessary for the website to function and cannot be switched off.',
      examples: [
        'Authentication cookies to keep you logged in',
        'Security cookies to protect against fraud',
        'Session cookies to maintain your preferences',
      ],
    },
    {
      title: 'Performance Cookies',
      description: 'These cookies help us understand how visitors interact with our website.',
      examples: [
        'Analytics cookies to track page views',
        'Error tracking to identify and fix issues',
        'Load time monitoring for performance optimization',
      ],
    },
    {
      title: 'Functional Cookies',
      description: 'These cookies enable enhanced functionality and personalization.',
      examples: [
        'Language preference cookies',
        'Theme preference (light/dark mode)',
        'Currency display preferences',
      ],
    },
    {
      title: 'Marketing Cookies',
      description: 'These cookies track your activity to deliver relevant advertisements.',
      examples: [
        'Advertising cookies from our partners',
        'Retargeting cookies for personalized ads',
        'Social media cookies for sharing features',
      ],
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Cookie Policy
            </h1>
            <p className="text-xl text-primary-100">
              Last Updated: February 1, 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              This Cookie Policy explains how JAXOPAY uses cookies and similar technologies to recognize you when you visit our platform. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
            </p>

            {/* What are Cookies */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                What are Cookies?
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Cookies are small text files that are placed on your device when you visit a website. They are widely used to make websites work more efficiently and provide information to website owners.
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                Cookies can be "persistent" or "session" cookies. Persistent cookies remain on your device after you close your browser, while session cookies are deleted when you close your browser.
              </p>
            </div>

            {/* Types of Cookies */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Types of Cookies We Use
              </h2>
              <div className="space-y-8">
                {cookieTypes.map((type, index) => (
                  <div key={index} className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      {type.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      {type.description}
                    </p>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Examples:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {type.examples.map((example, idx) => (
                          <li key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                            {example}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How to Control Cookies */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                How to Control Cookies
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                You have the right to decide whether to accept or reject cookies. You can exercise your cookie preferences by:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400 mb-4">
                <li>Using our cookie consent banner when you first visit our website</li>
                <li>Adjusting your browser settings to refuse cookies</li>
                <li>Deleting cookies that have already been set</li>
                <li>Using browser plugins to manage cookies</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-400">
                Please note that if you choose to reject cookies, you may not be able to use the full functionality of our platform.
              </p>
            </div>

            {/* Browser Settings */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Browser-Specific Instructions
              </h2>
              <div className="space-y-2 text-gray-600 dark:text-gray-400">
                <p><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</p>
                <p><strong>Firefox:</strong> Options → Privacy & Security → Cookies and Site Data</p>
                <p><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</p>
                <p><strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</p>
              </div>
            </div>

            {/* Third-Party Cookies */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Third-Party Cookies
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                In addition to our own cookies, we may use third-party cookies from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
                <li>Google Analytics for website analytics</li>
                <li>Payment processors for transaction processing</li>
                <li>Social media platforms for sharing features</li>
                <li>Advertising partners for targeted advertising</li>
              </ul>
            </div>

            {/* Updates */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Updates to This Policy
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. Please revisit this page regularly to stay informed about our use of cookies.
              </p>
            </div>

            {/* Contact */}
            <div className="p-6 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
              <h3 className="text-xl font-semibold text-primary-900 dark:text-primary-100 mb-2">
                Questions About Cookies?
              </h3>
              <p className="text-primary-800 dark:text-primary-200">
                If you have any questions about our use of cookies, please contact us at <strong>privacy@jaxopay.com</strong>
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

