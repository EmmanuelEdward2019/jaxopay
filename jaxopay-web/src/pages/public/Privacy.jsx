import PublicLayout from '../../components/layout/PublicLayout';

export default function Privacy() {
  const sections = [
    {
      title: '1. Information We Collect',
      content: [
        'We collect information you provide directly to us, including:',
        '• Personal identification information (name, email, phone number, date of birth)',
        '• Financial information (bank account details, transaction history)',
        '• Identity verification documents (government-issued ID, proof of address)',
        '• Device and usage information (IP address, browser type, operating system)',
        '• Location data (with your permission)',
      ],
    },
    {
      title: '2. How We Use Your Information',
      content: [
        'We use the information we collect to:',
        '• Provide, maintain, and improve our services',
        '• Process transactions and send transaction notifications',
        '• Verify your identity and prevent fraud',
        '• Comply with legal and regulatory requirements',
        '• Send you technical notices, updates, and support messages',
        '• Respond to your comments and questions',
        '• Analyze usage patterns to improve user experience',
      ],
    },
    {
      title: '3. Information Sharing and Disclosure',
      content: [
        'We may share your information with:',
        '• Service providers who perform services on our behalf',
        '• Financial institutions to process transactions',
        '• Regulatory authorities and law enforcement when required by law',
        '• Third parties with your consent',
        'We do not sell your personal information to third parties.',
      ],
    },
    {
      title: '4. Data Security',
      content: [
        'We implement industry-standard security measures to protect your information:',
        '• End-to-end encryption for sensitive data',
        '• Secure Socket Layer (SSL) technology',
        '• Two-factor authentication (2FA)',
        '• Regular security audits and penetration testing',
        '• Restricted access to personal information',
        '• Employee training on data protection',
      ],
    },
    {
      title: '5. Your Rights and Choices',
      content: [
        'You have the right to:',
        '• Access your personal information',
        '• Correct inaccurate information',
        '• Request deletion of your information',
        '• Object to processing of your information',
        '• Export your data in a portable format',
        '• Withdraw consent at any time',
        'To exercise these rights, contact us at privacy@jaxopay.com',
      ],
    },
    {
      title: '6. Data Retention',
      content: [
        'We retain your information for as long as necessary to:',
        '• Provide our services',
        '• Comply with legal obligations',
        '• Resolve disputes',
        '• Enforce our agreements',
        'After account closure, we may retain certain information as required by law or for legitimate business purposes.',
      ],
    },
    {
      title: '7. International Data Transfers',
      content: [
        'Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.',
      ],
    },
    {
      title: '8. Children\'s Privacy',
      content: [
        'Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.',
      ],
    },
    {
      title: '9. Changes to This Policy',
      content: [
        'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.',
      ],
    },
    {
      title: '10. Contact Us',
      content: [
        'If you have any questions about this Privacy Policy, please contact us:',
        '• Email: privacy@jaxopay.com',
        '• Phone: +234 800 JAXOPAY',
        '• Address: JAXOPAY HQ, Lagos, Nigeria',
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
              Privacy Policy
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
              At JAXOPAY, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.
            </p>

            <div className="space-y-12">
              {sections.map((section, index) => (
                <div key={index}>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {section.title}
                  </h2>
                  <div className="space-y-2">
                    {section.content.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-600 dark:text-gray-400">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 p-6 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
              <p className="text-primary-900 dark:text-primary-100">
                <strong>Your Consent:</strong> By using JAXOPAY, you consent to our Privacy Policy and agree to its terms. If you do not agree with this policy, please do not use our services.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

