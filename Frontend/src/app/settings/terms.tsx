import { DocumentScreen } from '@/components/DocumentScreen';

export default function TermsScreen() {
  return (
    <DocumentScreen
      updated="September 30, 2026"
      intro="These terms apply when you use Media Navigator."
      sections={[
        {
          title: 'The service',
          paragraphs: [
            'Media Navigator shows analytics for social media accounts you connect, calculated from data the platforms provide, and AI-written interpretations of those analytics.',
          ],
        },
        {
          title: 'Your account',
          paragraphs: [
            'Keep your password confidential. You are responsible for activity under your account. You can delete your account at any time from Profile → Security.',
          ],
        },
        {
          title: 'Connected accounts',
          paragraphs: [
            'Only connect accounts you own or are authorized to manage. Your use of each platform remains subject to that platform’s own terms, and a platform can limit or revoke access at any time.',
          ],
        },
        {
          title: 'Analytics and AI',
          paragraphs: [
            'Metrics depend on what each platform returns; missing values are shown as not available. AI insights are suggestions and hypotheses, not guarantees of results. Decide what to publish using your own judgment.',
          ],
        },
        {
          title: 'Acceptable use',
          paragraphs: [
            'Do not misuse the service: no attempts to access other users’ data, disrupt the service, circumvent limits, or reverse engineer credentials.',
          ],
        },
        {
          title: 'Availability and changes',
          paragraphs: [
            'Features may change as the service and the platforms’ APIs evolve. The service is provided as is, without warranties, to the extent permitted by law. We may update these terms and will show the date of the latest version here.',
          ],
        },
      ]}
    />
  );
}
