import PublicLayout from '../../components/layout/PublicLayout';

export default function Sanctions() {
  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Sanctions & Restricted Countries Policy
            </h1>
            <p className="text-xl text-primary-100">
              Last Updated: August 17, 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              JAXOPAY is committed to complying with applicable international sanctions, anti-money
              laundering (AML), and counter-terrorist financing (CFT) laws and regulations. This policy
              explains how that commitment shapes who we can offer our services to.
            </p>

            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Our Commitment
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                We do not knowingly provide our services to individuals, entities, or jurisdictions that
                are subject to sanctions administered by, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
                <li>The U.S. Department of the Treasury's Office of Foreign Assets Control (OFAC), including its Specially Designated Nationals and Blocked Persons (SDN) List</li>
                <li>The United Nations Security Council Consolidated Sanctions List</li>
                <li>The European Union's consolidated list of sanctions</li>
                <li>His Majesty's Treasury (UK) Consolidated List of Financial Sanctions Targets</li>
                <li>Any other sanctions authority applicable to us under the laws governing our operations</li>
              </ul>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Comprehensively Sanctioned Jurisdictions
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                In addition to screening individual users and transactions, we do not offer our services
                to individuals or entities located in, ordinarily resident in, or incorporated in a
                country or region that is subject to comprehensive sanctions under the regimes listed
                above. Because sanctions programs are updated by regulators on an ongoing basis, we do
                not publish a static list here — our compliance team applies the current, authoritative
                lists from each regulator at the time of onboarding and on an ongoing basis thereafter.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                How We Screen
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                As part of our Know Your Customer (KYC) and ongoing monitoring processes, we may screen
                user information — including name, date of birth, nationality, and address — against
                sanctions and watchlists. Accounts or transactions that are found to involve a sanctioned
                party or jurisdiction will be blocked, restricted, or closed, and reported to the relevant
                authorities where required by law.
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                This screening is separate from, and in addition to, our standard KYC identity
                verification tiers.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Updates to This Policy
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We review this policy periodically to reflect changes in applicable sanctions regimes
                and our own compliance practices. Please revisit this page for the latest version.
              </p>
            </div>

            {/* Contact */}
            <div className="p-6 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
              <h3 className="text-xl font-semibold text-primary-900 dark:text-primary-100 mb-2">
                Questions About This Policy?
              </h3>
              <p className="text-primary-800 dark:text-primary-200">
                If you have any questions about our sanctions compliance policy, please contact us at <strong>legal@jaxopay.com</strong>
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
