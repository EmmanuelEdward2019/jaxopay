import PublicLayout from '../../components/layout/PublicLayout';

export default function Terms() {
  const sections = [
    {
      title: '1. Acceptance of Terms',
      content: [
        'By accessing and using JAXOPAY, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.',
      ],
    },
    {
      title: '2. Eligibility',
      content: [
        'You must be at least 18 years old to use JAXOPAY services. By using our platform, you represent and warrant that:',
        '• You are of legal age to form a binding contract',
        '• You are not prohibited from using our services under applicable laws',
        '• All information you provide is accurate and complete',
        '• You will maintain the accuracy of such information',
      ],
    },
    {
      title: '3. Account Registration',
      content: [
        'To use JAXOPAY services, you must:',
        '• Create an account with accurate information',
        '• Complete identity verification (KYC) as required',
        '• Maintain the security of your account credentials',
        '• Notify us immediately of any unauthorized access',
        '• Accept responsibility for all activities under your account',
      ],
    },
    {
      title: '4. Services Provided',
      content: [
        'JAXOPAY provides the following services:',
        '• Cross-border money transfers',
        '• Multi-currency wallet management',
        '• Cryptocurrency exchange',
        '• Virtual card issuance',
        '• Bill payment services',
        '• Flight booking',
        '• Gift card marketplace',
        'Services may vary by country and are subject to regulatory approval.',
      ],
    },
    {
      title: '5. Fees and Charges',
      content: [
        'You agree to pay all applicable fees for services used:',
        '• Transaction fees as displayed before confirmation',
        '• Currency conversion fees',
        '• Card issuance and maintenance fees',
        '• Withdrawal fees',
        'Fees are subject to change with prior notice. Current fee schedules are available on our platform.',
      ],
    },
    {
      title: '6. Transaction Limits',
      content: [
        'Transaction limits apply based on your KYC tier:',
        '• Tier 0: Limited functionality, basic transactions only',
        '• Tier 1: Standard limits for verified users',
        '• Tier 2: Enhanced limits for fully verified users',
        'Limits may be adjusted based on regulatory requirements and risk assessment.',
      ],
    },
    {
      title: '7. Prohibited Activities',
      content: [
        'You agree not to:',
        '• Use our services for illegal activities',
        '• Engage in money laundering or terrorist financing',
        '• Provide false or misleading information',
        '• Attempt to circumvent security measures',
        '• Use our services to harm others',
        '• Violate any applicable laws or regulations',
        'Violation may result in account suspension or termination.',
      ],
    },
    {
      title: '8. Compliance and KYC',
      content: [
        'We are required to comply with anti-money laundering (AML) and know-your-customer (KYC) regulations. You agree to:',
        '• Provide accurate identity documents',
        '• Update information when requested',
        '• Cooperate with verification processes',
        '• Accept that we may refuse service if verification fails',
      ],
    },
    {
      title: '9. Intellectual Property',
      content: [
        'All content, features, and functionality of JAXOPAY are owned by us and protected by copyright, trademark, and other intellectual property laws. You may not:',
        '• Copy, modify, or distribute our content',
        '• Use our trademarks without permission',
        '• Reverse engineer our software',
        '• Create derivative works',
      ],
    },
    {
      title: '10. Limitation of Liability',
      content: [
        'To the maximum extent permitted by law:',
        '• We are not liable for indirect, incidental, or consequential damages',
        '• Our total liability is limited to the amount of fees paid in the last 12 months',
        '• We are not responsible for third-party services or content',
        '• We do not guarantee uninterrupted or error-free service',
      ],
    },
    {
      title: '11. Dispute Resolution',
      content: [
        'Any disputes arising from these terms will be resolved through:',
        '• Good faith negotiation',
        '• Mediation if negotiation fails',
        '• Arbitration in accordance with applicable laws',
        'You agree to waive the right to participate in class action lawsuits.',
      ],
    },
    {
      title: '12. Termination',
      content: [
        'We may suspend or terminate your account if:',
        '• You violate these terms',
        '• We suspect fraudulent activity',
        '• Required by law or regulation',
        '• You request account closure',
        'Upon termination, you must cease using our services and settle any outstanding obligations.',
      ],
    },
    {
      title: '13. Changes to Terms',
      content: [
        'We reserve the right to modify these terms at any time. We will notify you of material changes via email or platform notification. Continued use after changes constitutes acceptance of the new terms.',
      ],
    },
    {
      title: '14. Governing Law',
      content: [
        'These terms are governed by the laws of Nigeria and applicable international regulations. Any legal action must be brought in the courts of Lagos, Nigeria.',
      ],
    },
    {
      title: '15. Contact Information',
      content: [
        'For questions about these Terms and Conditions:',
        '• Email: legal@jaxopay.com',
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
              Terms & Conditions
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
              These Terms and Conditions govern your use of JAXOPAY and the services we provide. Please read them carefully.
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
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

