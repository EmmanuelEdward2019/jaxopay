import { AlertCircle, ExternalLink, CheckCircle } from 'lucide-react';

export default function SetupNotice() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const hasValidCredentials =
    supabaseUrl &&
    !supabaseUrl.includes('placeholder');

  if (hasValidCredentials) {
    return null; // Don't show if Supabase is configured
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Setup Required
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure Supabase to get started
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>JAXOPAY</strong> requires a Supabase backend to function.
              Follow the steps below to set up your project.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Quick Setup Guide:
            </h2>

            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  Create a Supabase Project
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Go to Supabase and create a new project (free tier works fine)
                </p>
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Open Supabase Dashboard
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  Run the Database Schema
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  In your Supabase project, go to <strong>SQL Editor</strong> and run the
                  contents of <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">supabase/schema.sql</code>
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  Get Your API Credentials
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Go to <strong>Settings → API</strong> and copy:
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside mt-1 space-y-1">
                  <li>Project URL</li>
                  <li>anon/public key</li>
                </ul>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                4
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  Update Environment Variables
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Edit the <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">.env</code> file
                  in the project root and add your credentials:
                </p>
                <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-100 overflow-x-auto">
                  <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
                  <div>VITE_SUPABASE_ANON_KEY=your-anon-key-here</div>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                5
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  Restart the Dev Server
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Stop the current server (Ctrl+C) and run <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">npm run dev</code> again
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-primary-900 dark:text-primary-200">
              <strong>Need help?</strong> Check the <code>SETUP_GUIDE.md</code> file
              for detailed instructions and troubleshooting tips.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

