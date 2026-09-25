import PublicLayout from '../../components/layout/PublicLayout';

export default function Privacy() {
  const sections = [
    {
      title: '1. Information We Collect',
      content: [
        'Information you give us when you open and use an account:',
        '• Identity details: first and last name, date of birth, gender, and residential address',
        '• Contact details: email address and phone number',
        '• Account credentials: password, transaction PIN, and two-factor authentication settings',
        '• Identity verification data: your Bank Verification Number (BVN) or National Identification Number (NIN), other government-issued identity documents, photographs of those documents, and a selfie taken for a liveness check. Facial images are sensitive personal data and are used only to confirm that you are who you say you are',
        '• Financial information: bank account details, wallet balances, crypto wallet addresses, transaction history, and the details of any virtual card we issue to you',
        '• Messages you send us, including support tickets and their replies',
        'Information we collect automatically when you use the app or website:',
        '• Device and connection information: device identifier, push notification token, IP address, browser type, and operating system',
        '• Crash reports and performance diagnostics, used to find and fix faults',
        'We do not collect your location. Our mobile app requests no location permission and does not use your IP address to work out where you are. We do not serve advertising, and we do not use advertising identifiers.',
      ],
    },
    {
      title: '2. How We Use Your Information',
      content: [
        'We use the information we collect to:',
        '• Provide, maintain, and improve our services',
        '• Process transactions and send transaction notifications',
        '• Verify your identity and prevent fraud',
        '• Comply with legal and regulatory requirements, including anti-money-laundering (AML) and counter-terrorist financing (CFT) obligations',
        '• Send you technical notices, updates, and support messages',
        '• Respond to your comments and questions',
        '• Analyze usage patterns and diagnose faults to improve the service',
        'We do not use your personal information to build advertising profiles, and we do not make automated decisions that produce legal effects for you without human review.',
      ],
    },
    {
      title: '3. Information Sharing and Disclosure',
      content: [
        'We share your information only where it is needed to run the service or where the law requires it. Our providers are bound by contract to protect it and to use it only for the purposes we specify.',
        '• Identity verification: Smile Identity (name, date of birth, ID number, ID document images, selfie, phone, email)',
        '• Crypto trading, deposits, and withdrawals: Obiex (transaction details and crypto addresses)',
        '• Cross-border transfers and currency exchange: Yellow Card (names, transaction and recipient details)',
        '• Naira deposits and payouts: Korapay (name, bank account, transaction details)',
        '• Virtual card issuing: StroWallet (name, date of birth, ID number, email, phone, address)',
        '• Airtime, data, and bill payments: Reloadly (phone number, biller reference)',
        '• Crash and performance monitoring: Sentry (crash logs and diagnostics; these carry no name or email)',
        '• Push notifications: Expo and Google Firebase Cloud Messaging (push token only)',
        '• Email and SMS delivery providers, for the messages we send you',
        '• Regulatory authorities, law enforcement, and financial institutions where required by law',
        'We do not sell your personal information, and we do not share it with advertising networks or data brokers.',
      ],
    },
    {
      title: '4. Data Security',
      content: [
        'We implement industry-standard security measures to protect your information:',
        '• Encryption in transit: all traffic between your device and our servers uses TLS',
        '• Encryption at rest for sensitive fields, including card details and authentication secrets',
        '• Passwords and transaction PINs are stored only as salted hashes, never in a readable form',
        '• Optional two-factor authentication (2FA) and biometric sign-in',
        '• Automatic sign-out after a period of inactivity, and the ability to see and sign out of every device on your account',
        '• Restricted staff access to personal information, with access logged and audited',
        'No system is perfectly secure. Please use a strong, unique password, keep your transaction PIN private, and contact us immediately if you suspect unauthorised access to your account.',
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
        'You can update your name, phone number, date of birth, and address yourself in the app under Profile → Edit Profile, or on the website under Settings. You can download a statement of your transactions as a PDF or CSV at any time from Transactions → Download Statement.',
        'To correct, export, or delete data without closing your account, see jaxopay.com/delete-account#request-your-data or email privacy@jaxopay.com from the address on your account. We respond within 30 days, and may ask you to confirm your identity first so that nobody else can request your data.',
        'To delete your account entirely, follow the steps at jaxopay.com/delete-account. Every request is reviewed by our team, and your account stays active until it has been processed.',
        'If you believe we have not handled your information properly, you may lodge a complaint with the Nigeria Data Protection Commission (NDPC), or with your local data protection authority.',
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
        'When your account is deleted, we erase your personal details: your name, date of birth, gender and address, your email address and phone number, your password, transaction PIN and two-factor secrets, your identity document numbers and images, your selfie, your virtual card details, your saved beneficiaries, notifications, sessions and registered devices.',
        'As a regulated financial service we must keep certain records after an account is closed: your transaction and wallet history, identity verification records (the status and tier, without the document images or ID numbers), deactivated virtual bank account numbers so that a late incoming payment can still be traced, and audit and compliance logs. We keep these only for as long as anti-money-laundering and financial record-keeping laws require — generally at least five years after the account is closed — and use them only for legal, regulatory, and fraud-prevention purposes.',
      ],
    },
    {
      title: '7. International Data Transfers',
      content: [
        'Some of the providers listed in section 3 operate outside Nigeria, so your information may be transferred to and processed in other countries. Where that happens we rely on contractual protections requiring those providers to safeguard your information to a standard consistent with this Privacy Policy and with the Nigeria Data Protection Act 2023.',
      ],
    },
    {
      title: '8. Children\'s Privacy',
      content: [
        'Our services are not intended for individuals under the age of 18, and you must be at least 18 to open an account. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately and we will delete it.',
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
        'If you have any questions about this Privacy Policy, or wish to exercise any of the rights in section 5, please contact us:',
        '• Privacy and data requests: privacy@jaxopay.com',
        '• General support: support@jaxopay.com',
        '• WhatsApp: +234 813 831 8705',
        'JAXOPAY is operated by Jaxopay Technologies.',
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
              Last Updated: September 25, 2026
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

