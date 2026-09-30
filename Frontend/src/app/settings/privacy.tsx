import { DocumentScreen } from '@/components/DocumentScreen';

// Describes what the Media Navigator backend actually stores and shares. Keep it in sync with
// Backend/src/models and Backend/src/services/aiIntelligence.ts when data handling changes.
export default function PrivacyPolicyScreen() {
  return (
    <DocumentScreen
      updated="September 30, 2026"
      intro="This policy explains what Media Navigator stores, why, who it is shared with, and how to delete it."
      sections={[
        {
          title: 'Information we store',
          paragraphs: [
            'Your account: email address, name, and your password as a one-way hash (the password itself is never stored). Sessions are stored as a hash of the sign-in token, with creation, last-use and expiry times.',
            'Connected accounts: the platform account’s ID, name, handle, profile picture link and connection status, and the access token the platform issued, stored encrypted (AES-256-GCM).',
            'Synced content: captions, titles, links, publication times and the metrics each platform provides for your posts, videos and account.',
            'Your use of the app: questions you ask Media Navigator and their answers, cached AI results, notifications, notification preferences, and a profile photo if you upload one.',
          ],
        },
        {
          title: 'How we use it',
          paragraphs: [
            'Only to provide Media Navigator: syncing your connected accounts, calculating analytics, generating AI insights you request, and notifying you about your accounts. We do not sell your data or use it for advertising.',
          ],
        },
        {
          title: 'AI processing',
          paragraphs: [
            'To generate insights and answers, Media Navigator sends Google’s Gemini API your account’s metrics (followers, per-post likes, comments, views and similar), format and timing statistics, and captions shortened to 280 characters.',
            'Gemini never receives your email, password, session tokens or platform access tokens.',
          ],
        },
        {
          title: 'Service providers',
          paragraphs: [
            'Meta (Instagram, Facebook), Google (YouTube, Gemini) and LinkedIn, to read the accounts you connect and to generate AI text; our hosting provider for the API server; MongoDB for the database; and Cloudflare R2 for uploaded files. Each receives only what it needs for that purpose.',
          ],
        },
        {
          title: 'Retention and deletion',
          paragraphs: [
            'Disconnecting an account immediately deletes its access token and all of its synced data. Cached AI results expire after 7 days. Expired sessions are removed a week after they expire.',
            'Deleting your account (Profile → Security) permanently deletes your profile, sessions, connected accounts, tokens, synced content, AI results, notifications and uploaded files.',
          ],
        },
        {
          title: 'Security',
          paragraphs: [
            'Passwords are hashed with PBKDF2, platform tokens are encrypted before storage, access tokens never leave the server, and the app talks to the server over HTTPS in production.',
          ],
        },
        {
          title: 'Your choices',
          paragraphs: [
            'You can disconnect any account at any time, choose which notifications you receive in Preferences, and revoke Media Navigator’s access from each platform’s own settings.',
          ],
        },
      ]}
    />
  );
}
