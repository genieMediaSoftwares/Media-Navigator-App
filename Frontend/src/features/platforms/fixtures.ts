import { SocialPlatform } from '@/types/api';
import { BLUEPRINTS, PlatformBlueprint, Tier } from './blueprint';

export interface FixturePost {
  id: string;
  platform: SocialPlatform;
  contentTypeId: string;
  title: string;
  caption: string;
  publishedAt: string;
  thumbnailUrl: string;
  permalink?: string;
  tier: Tier;
  vsBenchmarkPercent: number; // e.g. +145% vs typical
  metrics: Record<string, number | null>;
  observedFactors: { label: string; value: string }[];
  aiAnalysis: {
    interpretation: string;
    hypothesis: string[];
    suggestions: string[];
    stopSuggestions?: string[];
  };
}

export interface FixtureAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  profilePictureUrl: string;
  status: 'connected' | 'reauthorization_required' | 'error';
  lastSyncedAt: string;
  audienceCount: number;
  contentCount: number;
  avgEngagementRate: number;
  pendingOptions?: {
    platformAccountId: string;
    accountName: string;
    accountUsername: string;
    profilePictureUrl: string;
  }[];
  posts: FixturePost[];
}

export const PLATFORM_FIXTURES: Record<SocialPlatform, FixtureAccount> = {
  instagram: {
    id: 'fix-ig-01',
    platform: 'instagram',
    handle: 'svnbayparck',
    displayName: 'SVN Bay Parck',
    profilePictureUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=200&h=200&fit=crop',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    audienceCount: 14200,
    contentCount: 201,
    avgEngagementRate: 3.8,
    posts: [
      {
        id: 'ig-top-1',
        platform: 'instagram',
        contentTypeId: 'REEL',
        title: 'Jabili Meet & Greet Event Highlights',
        caption: 'Congratulations Jabili! 🎉 Over 1,700 community members gathered at SVN Bay Parck for our annual beachside celebration.',
        publishedAt: '2026-03-29T17:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600&fit=crop',
        tier: 'top',
        vsBenchmarkPercent: 19051,
        metrics: {
          views: 1982034,
          reach: 1350274,
          impressions: 2104500,
          likes: 112087,
          comments: 1734,
          shares: 4120,
          saves: 1687,
          engagementRate: 8.4,
        },
        observedFactors: [
          { label: 'Format', value: 'Reel (9:16 vertical)' },
          { label: 'Published', value: 'Sunday at 17:00' },
          { label: 'Caption length', value: '142 characters' },
          { label: 'Hashtags', value: '#Beachfront #SVNBayParck' },
          { label: 'Shares', value: '4,120 shares' },
        ],
        aiAnalysis: {
          interpretation: 'This Reel achieved 113,821 interactions and 1,982,034 views, performing 19,051% above account average.',
          hypothesis: [
            'Utilizing high-energy Reel format with vertical video.',
            'Publishing on Sunday at 17:00 during peak activity.',
            'Focusing on community milestone event generating strong shares.',
          ],
          suggestions: [
            'Repeat community milestone event reels on Sunday evenings.',
            'Maintain bold text overlays in the first 3 seconds.',
          ],
        },
      },
    ],
  },

  facebook: {
    id: 'fix-fb-01',
    platform: 'facebook',
    handle: 'svnresorts.fb',
    displayName: 'SVN Resorts & Residences',
    profilePictureUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=200&h=200&fit=crop',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    audienceCount: 38400,
    contentCount: 412,
    avgEngagementRate: 4.2,
    pendingOptions: [
      {
        platformAccountId: 'fb-page-101',
        accountName: 'SVN Resorts & Residences',
        accountUsername: 'svnresorts.fb',
        profilePictureUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=200&h=200&fit=crop',
      },
      {
        platformAccountId: 'fb-page-102',
        accountName: 'SVN Bay Parck Official',
        accountUsername: 'bayparck.official',
        profilePictureUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=200&h=200&fit=crop',
      },
    ],
    posts: [
      {
        id: 'fb-top-1',
        platform: 'facebook',
        contentTypeId: 'IMAGE',
        title: 'New Oceanfront Villas Launch',
        caption: 'The vision expands! Welcome to Phase 2 of SVN Ascent - Oceanfront luxury living with private infinity pools. Tap to tour our model villa.',
        publishedAt: '2026-03-28T14:30:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&fit=crop',
        tier: 'top',
        vsBenchmarkPercent: 320,
        metrics: {
          reach: 84500,
          impressions: 112000,
          views: 34000,
          reactions: 3420,
          comments: 289,
          shares: 512,
          clicks: 1840,
          linkClicks: 1420,
          engagementRate: 6.8,
        },
        observedFactors: [
          { label: 'Format', value: 'High-res Image Post' },
          { label: 'Published', value: 'Saturday at 14:30' },
          { label: 'Link Attached', value: 'Direct Virtual Tour' },
          { label: 'Reactions', value: '3,420 (Love & Wow heavy)' },
          { label: 'Link Clicks', value: '1,420 outward clicks' },
        ],
        aiAnalysis: {
          interpretation: 'This image post reached 84,500 Facebook users and generated 3,420 reactions and 1,840 total clicks, performing 320% above Page average reach.',
          hypothesis: [
            'Architectural renders with natural lighting generate higher click-through on Facebook Feeds.',
            'Direct call-to-action link in the main post body captured immediate purchase intent.',
            'Weekend afternoon publishing aligns with high desktop/mobile browsing time.',
          ],
          suggestions: [
            'Pair property launch announcements with direct virtual tour links.',
            'Use multi-photo albums for structural walkthroughs.',
          ],
        },
      },
      {
        id: 'fb-mod-1',
        platform: 'facebook',
        contentTypeId: 'VIDEO',
        title: 'Sunset Construction Update Episode 4',
        caption: 'Progress report from the coastal corridor. Concrete pour for Block B completed on schedule.',
        publishedAt: '2026-03-20T11:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&fit=crop',
        tier: 'moderate',
        vsBenchmarkPercent: 15,
        metrics: {
          reach: 22100,
          impressions: 28400,
          views: 12400,
          reactions: 480,
          comments: 42,
          shares: 31,
          clicks: 310,
          linkClicks: 190,
          engagementRate: 2.6,
        },
        observedFactors: [
          { label: 'Format', value: 'Landscape Video (16:9)' },
          { label: 'Published', value: 'Friday at 11:00' },
          { label: 'Duration', value: '2 mins 45 secs' },
        ],
        aiAnalysis: {
          interpretation: 'Generated 480 reactions and 22,100 reach, sitting around typical Page benchmarks.',
          hypothesis: [
            'Video length exceeded 2 minutes without a strong early hook.',
            'Technical construction terminology lowered casual Facebook user engagement.',
          ],
          suggestions: [
            'Shorten progress update videos to under 60 seconds or convert to Facebook Reels.',
            'Add clear text captions for muted Feed autoplay.',
          ],
        },
      },
      {
        id: 'fb-low-1',
        platform: 'facebook',
        contentTypeId: 'LINK',
        title: 'Weekly Real Estate Market Report',
        caption: 'Read our latest market update report on regional coastal property values.',
        publishedAt: '2026-03-12T09:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&fit=crop',
        tier: 'low',
        vsBenchmarkPercent: -62,
        metrics: {
          reach: 4800,
          impressions: 6100,
          views: null,
          reactions: 38,
          comments: 4,
          shares: 2,
          clicks: 84,
          linkClicks: 65,
          engagementRate: 0.9,
        },
        observedFactors: [
          { label: 'Format', value: 'Plain Link Post' },
          { label: 'Published', value: 'Thursday at 09:00' },
          { label: 'Link Type', value: 'External PDF link' },
        ],
        aiAnalysis: {
          interpretation: 'Reached only 4,800 people with 38 reactions, performing 62% below Page average.',
          hypothesis: [
            'Facebook feed algorithm de-prioritizes external plain link posts without native visual assets.',
            'Lack of custom preview image resulted in low click-through.',
          ],
          suggestions: [
            'Never post naked external links; attach a compelling image or upload a short teaser video.',
            'Summarize key insights in text with the link placed in comments or main caption.',
          ],
          stopSuggestions: [
            'Stop publishing automated plain link shares without custom media.',
          ],
        },
      },
    ],
  },

  youtube: {
    id: 'fix-yt-01',
    platform: 'youtube',
    handle: 'SVNDevelopers',
    displayName: 'SVN Developers & Architecture',
    profilePictureUrl: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=200&h=200&fit=crop',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    audienceCount: 89200,
    contentCount: 148,
    avgEngagementRate: 5.6,
    pendingOptions: [
      {
        platformAccountId: 'yt-channel-201',
        accountName: 'SVN Developers & Architecture',
        accountUsername: 'SVNDevelopers',
        profilePictureUrl: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=200&h=200&fit=crop',
      },
      {
        platformAccountId: 'yt-channel-202',
        accountName: 'SVN Living Vlogs',
        accountUsername: 'SVNLiving',
        profilePictureUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=200&h=200&fit=crop',
      },
    ],
    posts: [
      {
        id: 'yt-top-1',
        platform: 'youtube',
        contentTypeId: 'SHORT',
        title: 'Building a $5M Beachside Infinity Pool #Shorts',
        caption: 'Watch how we engineered a cantilevered infinity pool overlooking the ocean in 30 seconds! #Architect #LuxuryHome',
        publishedAt: '2026-03-25T16:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&fit=crop',
        tier: 'top',
        vsBenchmarkPercent: 480,
        metrics: {
          views: 485000,
          watchHours: 3200,
          avgViewDuration: 28, // seconds
          avgPercentViewed: 93.4,
          likes: 38400,
          comments: 890,
          shares: 2150,
          subscribersNet: 1420,
          impressions: 920000,
          ctr: 11.2,
          returningViewers: 34.5,
        },
        observedFactors: [
          { label: 'Format', value: 'YouTube Short' },
          { label: 'Duration', value: '30 seconds' },
          { label: 'Avg % Viewed', value: '93.4% retention' },
          { label: 'Subscribers Earned', value: '+1,420 net subscribers' },
          { label: 'CTR', value: '11.2% click-through' },
        ],
        aiAnalysis: {
          interpretation: 'This Short generated 485,000 views, 3,200 watch hours, and gained 1,420 net subscribers with an outstanding 93.4% retention rate.',
          hypothesis: [
            'Immediate visual impact in first 1.5 seconds prevented feed swipe-away.',
            'High retention rate (93.4%) triggered YouTube Shorts algorithm shelf recommendation.',
            'Clear transformation storyline (raw cliff to finished pool) maintained audience attention.',
          ],
          suggestions: [
            'Create a 3-part Shorts series on luxury engineering feats.',
            'Keep Short duration between 25 and 35 seconds for optimal loop replay.',
          ],
        },
      },
      {
        id: 'yt-mod-1',
        platform: 'youtube',
        contentTypeId: 'LONG',
        title: 'Full Tour: SVN Ascent Oceanfront Villa Walkthrough',
        caption: 'Join lead architect Rahul Sharma for an in-depth 15-minute tour of our flagship oceanfront smart villa in Vizag.',
        publishedAt: '2026-03-15T12:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&fit=crop',
        tier: 'moderate',
        vsBenchmarkPercent: 22,
        metrics: {
          views: 34500,
          watchHours: 2450,
          avgViewDuration: 255, // 4m15s
          avgPercentViewed: 38.2,
          likes: 2100,
          comments: 184,
          shares: 310,
          subscribersNet: 180,
          impressions: 210000,
          ctr: 6.4,
          returningViewers: 42.0,
        },
        observedFactors: [
          { label: 'Format', value: 'Long-form Video (15:20)' },
          { label: 'Avg View Duration', value: '4 mins 15 secs' },
          { label: 'Click-Through Rate', value: '6.4% CTR' },
        ],
        aiAnalysis: {
          interpretation: 'Gained 34,500 views and 2,450 watch hours, performing around channel median for long-form video.',
          hypothesis: [
            'Thumbnail click-through rate (6.4%) was good, but retention dropped after minute 4 during floor plan explanation.',
            'Lack of chapter timestamps made it harder for mobile viewers to skip to high-interest rooms.',
          ],
          suggestions: [
            'Add YouTube video chapters with clear descriptive timestamps.',
            'Place high-excitement master suite reveal earlier in the video edit.',
          ],
        },
      },
      {
        id: 'yt-low-1',
        platform: 'youtube',
        contentTypeId: 'POST',
        title: 'Community Poll: Preferred Living Amenities',
        caption: 'Which luxury amenity matters most when choosing your coastal home? Vote below!',
        publishedAt: '2026-03-08T10:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&fit=crop',
        tier: 'low',
        vsBenchmarkPercent: -55,
        metrics: {
          views: 2800,
          watchHours: null,
          avgViewDuration: null,
          avgPercentViewed: null,
          likes: 120,
          comments: 24,
          shares: 5,
          subscribersNet: 4,
          impressions: 14000,
          ctr: 2.1,
          returningViewers: 12.0,
        },
        observedFactors: [
          { label: 'Format', value: 'Community Poll' },
          { label: 'Votes', value: '280 total votes' },
          { label: 'CTR', value: '2.1%' },
        ],
        aiAnalysis: {
          interpretation: 'This community post received low engagement compared to video content on the channel.',
          hypothesis: [
            'Community posts without teaser video clips receive lower feed distribution from YouTube.',
          ],
          suggestions: [
            'Always pair Community Polls with a video gif teaser or thumbnail image.',
          ],
          stopSuggestions: [
            'Stop posting plain text polls without visual media attachments.',
          ],
        },
      },
    ],
  },

  linkedin: {
    id: 'fix-li-01',
    platform: 'linkedin',
    handle: 'svn-group',
    displayName: 'SVN Group & Infrastructure',
    profilePictureUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&h=200&fit=crop',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    audienceCount: 22600,
    contentCount: 164,
    avgEngagementRate: 5.1,
    pendingOptions: [
      {
        platformAccountId: 'li-org-301',
        accountName: 'SVN Group & Infrastructure',
        accountUsername: 'svn-group',
        profilePictureUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&h=200&fit=crop',
      },
      {
        platformAccountId: 'li-org-302',
        accountName: 'SVN Real Estate Advisory',
        accountUsername: 'svn-advisory',
        profilePictureUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=200&h=200&fit=crop',
      },
    ],
    posts: [
      {
        id: 'li-top-1',
        platform: 'linkedin',
        contentTypeId: 'DOCUMENT',
        title: '2026 Coastal Infrastructure & Real Estate Playbook',
        caption: 'How sustainable architecture is redefining coastal development in South India. Swipe through our 12-page executive summary breakdown.',
        publishedAt: '2026-03-24T08:30:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&fit=crop',
        tier: 'top',
        vsBenchmarkPercent: 285,
        metrics: {
          impressions: 42800,
          membersReached: 31200,
          reactions: 1450,
          comments: 182,
          reposts: 210,
          saves: 430,
          clicks: 2840,
          ctr: 6.6,
          engagementRate: 7.2,
          followersGained: 340,
        },
        observedFactors: [
          { label: 'Format', value: 'PDF Carousel Document' },
          { label: 'Pages', value: '12 document slides' },
          { label: 'Members Reached', value: '31,200 decision makers' },
          { label: 'Reposts', value: '210 organic reposts' },
          { label: 'Followers Gained', value: '+340 new followers' },
        ],
        aiAnalysis: {
          interpretation: 'This document post generated 42,800 impressions, 1,450 reactions, and 2,840 clicks, performing 285% above Organization median engagement.',
          hypothesis: [
            'PDF carousels drive high dwell time on LinkedIn feed as members swipe through slides.',
            'Actionable data frameworks with clean infographics encourage senior executives to repost and save.',
            'Publishing Tuesday morning at 08:30 aligned with professional morning check-in.',
          ],
          suggestions: [
            'Publish one high-value document playbook every fortnight on Tuesday morning.',
            'Include executive summary key points on page 1 for instant hook.',
          ],
        },
      },
      {
        id: 'li-mod-1',
        platform: 'linkedin',
        contentTypeId: 'TEXT',
        title: 'Lessons Learned Scaling Infrastructure Projects',
        caption: '3 things nobody tells you about managing multi-acre coastal developments: 1. Environmental zoning is your best friend. 2. Local talent builds long-term trust...',
        publishedAt: '2026-03-18T10:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&fit=crop',
        tier: 'moderate',
        vsBenchmarkPercent: 18,
        metrics: {
          impressions: 14200,
          membersReached: 10800,
          reactions: 380,
          comments: 64,
          reposts: 22,
          saves: 45,
          clicks: 410,
          ctr: 2.8,
          engagementRate: 3.5,
          followersGained: 48,
        },
        observedFactors: [
          { label: 'Format', value: 'Text Post' },
          { label: 'Word Count', value: '240 words' },
          { label: 'Reactions', value: '380 reactions' },
        ],
        aiAnalysis: {
          interpretation: 'Generated 14,200 impressions and 380 reactions, performing around Organization average.',
          hypothesis: [
            'Strong text hook captured attention, but lack of visual asset or PDF attachment limited viral repost potential.',
          ],
          suggestions: [
            'Repackage top-performing text posts into 5-slide PDF documents.',
          ],
        },
      },
      {
        id: 'li-low-1',
        platform: 'linkedin',
        contentTypeId: 'LINK',
        title: 'Press Release Link: SVN Q1 Earnings',
        caption: 'Check out our official press release regarding Q1 earnings and expansion plans.',
        publishedAt: '2026-03-10T15:00:00Z',
        thumbnailUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&fit=crop',
        tier: 'low',
        vsBenchmarkPercent: -58,
        metrics: {
          impressions: 3900,
          membersReached: 2800,
          reactions: 42,
          comments: 3,
          reposts: 2,
          saves: 4,
          clicks: 68,
          ctr: 1.7,
          engagementRate: 1.1,
          followersGained: 6,
        },
        observedFactors: [
          { label: 'Format', value: 'External Link Post' },
          { label: 'Published', value: 'Wednesday at 15:00' },
        ],
        aiAnalysis: {
          interpretation: 'Received only 3,900 impressions and 42 reactions, performing 58% below Organization median.',
          hypothesis: [
            'LinkedIn algorithm heavily penalizes posts containing outbound links in the main text body.',
          ],
          suggestions: [
            'Place press release links in the comment section and share key highlights natively in text.',
          ],
          stopSuggestions: [
            'Stop posting direct external links in main LinkedIn post text.',
          ],
        },
      },
    ],
  },
};

export function getFixtureAccount(platform: SocialPlatform): FixtureAccount {
  return PLATFORM_FIXTURES[platform] ?? PLATFORM_FIXTURES.instagram;
}
