import { getConfig } from '../config/env';
import type { ContentRow } from '../db/content';
import { HttpError } from '../lib/http';
import { cached, enforceAiRateLimit, systemInstruction, text, textList } from './aiIntelligence';
import {
	ComparisonSet,
	DetectedTrends,
	Improvement,
	ObservedReason,
	PostComparisons,
	ScoredPost,
} from './analytics';
import { aiUnavailable, deleteGeminiFile, GEMINI_INLINE_LIMIT_BYTES, GeminiMedia, GeminiSchema, generateStructured, uploadGeminiFile } from './gemini';
import { localDayHour } from './intelligence';
import { IntelligenceSnapshot, snapshotVersion } from './intelligenceSnapshot';
import { downloadMedia, MediaTooLargeError, refreshInstagramMediaUrls, toBase64 } from './mediaFetch';
import { platformName } from './platforms';

// AI interpretation for the analysis screens. Gemini receives the measured facts computed by
// services/analytics.ts (and, where available, the post's own cover image or video) and writes
// interpretation only. Every response keeps the measured data and the AI text in separate fields,
// so the app can label them differently; numbers shown as data never come from the model.

const CAPTION_CHARS = 600;
const COVER_MAX_BYTES = 5 * 1024 * 1024;

const AREAS = ['hook', 'topic', 'format', 'visual', 'caption', 'cta', 'timing', 'audience', 'engagement', 'retention', 'length', 'other'] as const;

function postFacts(post: ScoredPost, timeZone: string) {
	const local = post.publishedAt ? localDayHour(post.publishedAt, timeZone) : null;
	return {
		format: post.format,
		publishedAt: post.publishedAt,
		publishedLocal: local ? { dayOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][local.dayOfWeek], hour: local.hour, timeZone } : null,
		caption: post.caption ? post.caption.slice(0, CAPTION_CHARS) : null,
		metrics: { ...post.metrics, engagementRatePercent: post.engagementRate, avgWatchTimeMs: post.avgWatchTimeMs },
		performanceScore: post.score,
		scoreBasis: post.scoreBasis,
	};
}

/** The post's cover image (thumbnail for videos), refreshed once if the stored CDN URL expired. */
async function coverImage(snapshot: IntelligenceSnapshot, post: ScoredPost, row: ContentRow | undefined): Promise<GeminiMedia | null> {
	if (!row) return null;
	let image = await downloadMedia(post.previewUrl, COVER_MAX_BYTES).catch(() => null);
	if (!image) {
		const fresh = await refreshInstagramMediaUrls(snapshot.account, row.provider_media_id).catch(() => null);
		const isVideo = post.format === 'REEL' || post.format === 'VIDEO';
		image = fresh ? await downloadMedia(isVideo ? fresh.thumbnailUrl : fresh.mediaUrl, COVER_MAX_BYTES).catch(() => null) : null;
	}
	if (!image || !image.mimeType.startsWith('image/')) return null;
	return { mimeType: image.mimeType, data: toBase64(image.bytes) };
}

// ---- Why it's top / Why it needs improvement ------------------------------------------------------

export interface AiReason {
	title: string;
	detail: string;
	area: (typeof AREAS)[number];
}

export interface AiPerformanceAnalysis {
	kind: 'top' | 'improve';
	summary: string;
	reasons: AiReason[];
	improvements: Array<{ action: string; why: string }>;
	cannotConfirm: string[];
	/** Whether the model also looked at the post's cover image. */
	usedCoverImage: boolean;
	generatedAt: string;
}

const PERFORMANCE_SCHEMA: GeminiSchema = {
	type: 'OBJECT',
	properties: {
		summary: { type: 'STRING', description: 'One or two sentences on how this post performed against the account.' },
		reasons: {
			type: 'ARRAY',
			description: 'Four or five specific reasons. Each must cite this post’s numbers or something visible in its caption or cover image.',
			items: {
				type: 'OBJECT',
				properties: {
					title: { type: 'STRING', description: 'At most 8 words, specific (not "Engaging content").' },
					detail: { type: 'STRING', description: 'One or two sentences with the evidence.' },
					area: { type: 'STRING', enum: [...AREAS] },
				},
				required: ['title', 'detail', 'area'],
			},
		},
		improvements: {
			type: 'ARRAY',
			description: 'For posts that need improvement: three to five practical changes. For top posts: what to repeat.',
			items: {
				type: 'OBJECT',
				properties: { action: { type: 'STRING', description: 'An instruction under 14 words.' }, why: { type: 'STRING' } },
				required: ['action', 'why'],
			},
		},
		cannotConfirm: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to three things the data cannot confirm.' },
	},
	required: ['summary', 'reasons', 'improvements', 'cannotConfirm'],
};

/** The typical (median) post of a comparison group. */
function comparisonFacts(c: ComparisonSet) {
	return { posts: c.postCount, medianViews: c.views, medianLikes: c.likes, medianComments: c.comments, medianShares: c.shares, medianSaves: c.saves, medianEngagementRatePercent: c.engagementRate, medianScore: c.score };
}

export async function getPerformanceAnalysis(
	userId: string,
	snapshot: IntelligenceSnapshot,
	post: ScoredPost,
	kind: 'top' | 'improve',
	observed: { reasons: ObservedReason[]; improvements: Improvement[] },
	comparisons: PostComparisons,
	now: number,
): Promise<AiPerformanceAnalysis> {
	const key = `ai:v3:performance:${snapshot.account.id}:${post.id}:${snapshotVersion(snapshot.account)}:${kind}`;
	const { value } = await cached(key, { userId, accountId: snapshot.account.id }, now, async () => {
		await enforceAiRateLimit(userId, now);
		const row = snapshot.rows.find((r) => r.id === post.id);
		const cover = await coverImage(snapshot, post, row);
		const task =
			kind === 'top'
				? 'This is one of the account’s top-performing posts by performance score. Explain specifically why it performed well.'
				: 'This post is one of the account’s lowest-scoring posts. Explain specifically why it underperformed, and how to improve similar posts. Be constructive.';
		const output = (await generateStructured({
			systemInstruction: systemInstruction(snapshot),
			prompt: `${task}
Ground every reason in the measured facts below or in what is visible in the caption${cover ? ' and the attached cover image (describe what you actually see: framing, text on screen, subject, clarity)' : ''}.
Avoid generic statements such as "this post is engaging". Do not restate a measured fact without adding what it suggests.
Hook, retention and opening-frame claims about a video are interpretations of the cover/caption only (the video itself is not provided here) — say so.
Measured facts (computed by Media Navigator from ${platformName(snapshot.account.platform)} data):
${JSON.stringify({
	post: postFacts(post, snapshot.analytics.timeZone),
	measuredReasons: observed.reasons.map((r) => r.statement),
	ruleBasedSuggestions: observed.improvements.map((i) => i.action),
	comparisons: { typicalPost: comparisonFacts(comparisons.account), similarPosts: comparisonFacts(comparisons.similar), bestPosts: comparisonFacts(comparisons.best) },
})}`,
			schema: PERFORMANCE_SCHEMA,
			media: cover ? [cover] : undefined,
		})) as Record<string, unknown>;

		const reasons = (Array.isArray(output?.reasons) ? (output.reasons as Record<string, unknown>[]) : [])
			.map((r) => ({
				title: text(r.title, 100),
				detail: text(r.detail, 400),
				area: (AREAS.includes(r.area as AiReason['area']) ? r.area : 'other') as AiReason['area'],
			}))
			.filter((r) => r.title && r.detail)
			.slice(0, 5);
		if (!text(output?.summary) || reasons.length === 0) throw aiUnavailable();
		const improvements = (Array.isArray(output?.improvements) ? (output.improvements as Record<string, unknown>[]) : [])
			.map((i) => ({ action: text(i.action, 160), why: text(i.why, 300) }))
			.filter((i) => i.action)
			.slice(0, 5);
		return {
			kind,
			summary: text(output.summary),
			reasons,
			improvements,
			cannotConfirm: textList(output?.cannotConfirm, 3),
			usedCoverImage: cover !== null,
			generatedAt: new Date(now).toISOString(),
		};
	});
	return value;
}

// ---- AI Trends ------------------------------------------------------------------------------

export interface AiTrendInterpretation {
	summary: string;
	interpretations: Array<{ trendId: string; interpretation: string; recommendation: string }>;
	opportunities: Array<{ title: string; rationale: string; suggestion: string; trendIds: string[] }>;
	generatedAt: string;
}

const TRENDS_SCHEMA: GeminiSchema = {
	type: 'OBJECT',
	properties: {
		summary: { type: 'STRING', description: 'Two sentences: the most important pattern and what to do about it.' },
		interpretations: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					trendId: { type: 'STRING', description: 'id of a trend from the JSON.' },
					interpretation: { type: 'STRING', description: 'Why this pattern may exist (a hypothesis).' },
					recommendation: { type: 'STRING', description: 'A concrete test: what to post, how many, when, and which metric to compare.' },
				},
				required: ['trendId', 'interpretation', 'recommendation'],
			},
		},
		opportunities: {
			type: 'ARRAY',
			description: 'Up to three new content opportunities that combine the detected trends.',
			items: {
				type: 'OBJECT',
				properties: {
					title: { type: 'STRING', description: 'At most 8 words.' },
					rationale: { type: 'STRING' },
					suggestion: { type: 'STRING' },
					trendIds: { type: 'ARRAY', items: { type: 'STRING' } },
				},
				required: ['title', 'rationale', 'suggestion', 'trendIds'],
			},
		},
	},
	required: ['summary', 'interpretations', 'opportunities'],
};

export async function getTrendInterpretation(userId: string, snapshot: IntelligenceSnapshot, trends: DetectedTrends, now: number): Promise<AiTrendInterpretation> {
	const key = `ai:v1:trends:${snapshot.account.id}:${snapshotVersion(snapshot.account)}:${snapshot.analytics.timeZone}`;
	const ids = new Set(trends.trends.map((t) => t.id));
	const { value } = await cached(key, { userId, accountId: snapshot.account.id }, now, async () => {
		await enforceAiRateLimit(userId, now);
		const examples = (id: string) => {
			const trend = trends.trends.find((t) => t.id === id);
			if (!trend?.topic && !trend?.format) return [];
			return snapshot.analytics.posts
				.filter((p) => (trend.format ? p.format === trend.format : (p.caption ?? '').toLowerCase().includes(trend.topic as string)))
				.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
				.slice(0, 3)
				.map((p) => ({ caption: p.caption?.slice(0, 200) ?? null, score: p.score }));
		};
		const output = (await generateStructured({
			systemInstruction: systemInstruction(snapshot),
			prompt: `Media Navigator measured these patterns in the account's complete synced history. The numbers are facts; do not change or add numbers.
For each trend, explain why it may exist and give one concrete test. Then suggest up to three content opportunities that combine trends.
Data:
${JSON.stringify({
	postsAnalyzed: trends.postsAnalyzed,
	trends: trends.trends.map((t) => ({ id: t.id, category: t.category, direction: t.direction, headline: t.headline, confidence: t.confidence, sampleSize: t.sampleSize, examples: examples(t.id) })),
	notMeasurable: trends.unavailable,
})}`,
			schema: TRENDS_SCHEMA,
		})) as Record<string, unknown>;

		const interpretations = (Array.isArray(output?.interpretations) ? (output.interpretations as Record<string, unknown>[]) : [])
			.map((i) => ({ trendId: text(i.trendId, 120), interpretation: text(i.interpretation), recommendation: text(i.recommendation) }))
			.filter((i) => ids.has(i.trendId) && i.interpretation);
		const opportunities = (Array.isArray(output?.opportunities) ? (output.opportunities as Record<string, unknown>[]) : [])
			.map((o) => ({
				title: text(o.title, 100),
				rationale: text(o.rationale),
				suggestion: text(o.suggestion),
				trendIds: Array.isArray(o.trendIds) ? o.trendIds.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [],
			}))
			// An opportunity must build on at least one trend the server measured; anything else is dropped.
			.filter((o) => o.title && o.suggestion && o.trendIds.length > 0)
			.slice(0, 3);
		if (!text(output?.summary)) throw aiUnavailable();
		return { summary: text(output.summary), interpretations, opportunities, generatedAt: new Date(now).toISOString() };
	});
	return value;
}

// ---- Deep Video Analysis ------------------------------------------------------------------

export interface AiVideoAnalysis {
	summary: string;
	hook: { opening: string; strength: 'strong' | 'moderate' | 'weak'; topicClearQuickly: boolean; assessment: string };
	structure: { intro: string; mainContent: string; pacing: string; transitions: string; story: string; endingCta: string };
	visual: { framing: string; textOverlays: string; clarity: string; sceneChanges: string; branding: string; cover: string };
	engagement: { whyViewersWatched: string; shareability: string; saveability: string; commentPotential: string; ctaEffectiveness: string };
	keyMoments: Array<{ timestamp: string; note: string }>;
	recommendations: string[];
	cannotAssess: string[];
	generatedAt: string;
}

const VIDEO_SCHEMA: GeminiSchema = {
	type: 'OBJECT',
	properties: {
		summary: { type: 'STRING' },
		hook: {
			type: 'OBJECT',
			properties: {
				opening: { type: 'STRING', description: 'What literally happens in the first 1–3 seconds (what is seen, said and shown as text).' },
				strength: { type: 'STRING', enum: ['strong', 'moderate', 'weak'] },
				topicClearQuickly: { type: 'BOOLEAN', description: 'Whether a new viewer understands the topic within about 3 seconds.' },
				assessment: { type: 'STRING' },
			},
			required: ['opening', 'strength', 'topicClearQuickly', 'assessment'],
		},
		structure: {
			type: 'OBJECT',
			properties: {
				intro: { type: 'STRING' },
				mainContent: { type: 'STRING' },
				pacing: { type: 'STRING' },
				transitions: { type: 'STRING' },
				story: { type: 'STRING' },
				endingCta: { type: 'STRING' },
			},
			required: ['intro', 'mainContent', 'pacing', 'transitions', 'story', 'endingCta'],
		},
		visual: {
			type: 'OBJECT',
			properties: {
				framing: { type: 'STRING' },
				textOverlays: { type: 'STRING' },
				clarity: { type: 'STRING' },
				sceneChanges: { type: 'STRING' },
				branding: { type: 'STRING' },
				cover: { type: 'STRING' },
			},
			required: ['framing', 'textOverlays', 'clarity', 'sceneChanges', 'branding', 'cover'],
		},
		engagement: {
			type: 'OBJECT',
			properties: {
				whyViewersWatched: { type: 'STRING' },
				shareability: { type: 'STRING' },
				saveability: { type: 'STRING' },
				commentPotential: { type: 'STRING' },
				ctaEffectiveness: { type: 'STRING' },
			},
			required: ['whyViewersWatched', 'shareability', 'saveability', 'commentPotential', 'ctaEffectiveness'],
		},
		keyMoments: {
			type: 'ARRAY',
			items: { type: 'OBJECT', properties: { timestamp: { type: 'STRING', description: 'MM:SS' }, note: { type: 'STRING' } }, required: ['timestamp', 'note'] },
		},
		recommendations: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Three to five specific changes for the next video.' },
		cannotAssess: { type: 'ARRAY', items: { type: 'STRING' }, description: 'What cannot be judged from the video and data provided.' },
	},
	required: ['summary', 'hook', 'structure', 'visual', 'engagement', 'keyMoments', 'recommendations', 'cannotAssess'],
};

function obj(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Downloads the video (refreshing an expired URL once) and returns it as inline data or an uploaded file. */
async function prepareVideo(snapshot: IntelligenceSnapshot, row: ContentRow): Promise<{ media: GeminiMedia; cleanup: () => Promise<void> }> {
	const max = getConfig().VIDEO_ANALYSIS_MAX_BYTES;
	const tooLarge = () => new HttpError(422, 'VIDEO_TOO_LARGE', `This video is larger than ${Math.round(max / 1024 / 1024)} MB and cannot be analyzed.`);
	let video;
	try {
		video = await downloadMedia(row.media_url, max);
		if (!video) {
			const fresh = await refreshInstagramMediaUrls(snapshot.account, row.provider_media_id);
			video = fresh ? await downloadMedia(fresh.mediaUrl, max) : null;
		}
	} catch (error) {
		if (error instanceof MediaTooLargeError) throw tooLarge();
		throw error;
	}
	if (!video) {
		throw new HttpError(
			422,
			'VIDEO_NOT_AVAILABLE',
			snapshot.account.platform === 'instagram'
				? 'Instagram did not provide a downloadable file for this video (for example, Reels with copyrighted audio have no media URL in the API). Deep video analysis needs the video itself.'
				: `${platformName(snapshot.account.platform)}’s API does not provide the video file, so deep video analysis is not available for it. The measured performance is unaffected.`,
		);
	}
	const mimeType = video.mimeType.startsWith('video/') ? video.mimeType : 'video/mp4';
	if (video.bytes.byteLength <= GEMINI_INLINE_LIMIT_BYTES) {
		return { media: { mimeType, data: toBase64(video.bytes) }, cleanup: async () => undefined };
	}
	const file = await uploadGeminiFile(video.bytes, mimeType);
	return { media: { mimeType, fileUri: file.fileUri }, cleanup: () => deleteGeminiFile(file.name) };
}

export async function getVideoAnalysis(
	userId: string,
	snapshot: IntelligenceSnapshot,
	post: ScoredPost,
	comparisons: PostComparisons,
	now: number,
): Promise<AiVideoAnalysis> {
	const row = snapshot.rows.find((r) => r.id === post.id);
	if (!row || !(post.format === 'REEL' || post.format === 'VIDEO' || row.media_type === 'VIDEO')) {
		throw new HttpError(422, 'NOT_A_VIDEO', 'Deep video analysis is available for video content only.');
	}
	const key = `ai:v1:video:${snapshot.account.id}:${post.id}`;
	const { value } = await cached(key, { userId, accountId: snapshot.account.id }, now, async () => {
		await enforceAiRateLimit(userId, now);
		const { media, cleanup } = await prepareVideo(snapshot, row);
		try {
			const output = (await generateStructured({
				systemInstruction: systemInstruction(snapshot),
				prompt: `Watch the attached ${platformName(snapshot.account.platform)} video and analyze it for the creator.
Describe what you actually see and hear; when you judge (strength, pacing, shareability) say why in terms of specific moments, using MM:SS timestamps.
Performance numbers below are measured facts; use them for context but do not invent watch-time, retention or audience data that is not listed.
Measured facts:
${JSON.stringify({
	post: postFacts(post, snapshot.analytics.timeZone),
	comparisons: { typicalPost: comparisonFacts(comparisons.account), similarPosts: comparisonFacts(comparisons.similar), bestPosts: comparisonFacts(comparisons.best) },
})}`,
				schema: VIDEO_SCHEMA,
				media: [media],
				timeoutMs: Math.max(getConfig().GEMINI_REQUEST_TIMEOUT_MS, 120_000),
			})) as Record<string, unknown>;

			const hook = obj(output?.hook);
			const structure = obj(output?.structure);
			const visual = obj(output?.visual);
			const engagement = obj(output?.engagement);
			if (!text(output?.summary) || !text(hook.opening)) throw aiUnavailable();
			const strength = ['strong', 'moderate', 'weak'].includes(hook.strength as string) ? (hook.strength as 'strong' | 'moderate' | 'weak') : 'moderate';
			return {
				summary: text(output.summary),
				hook: { opening: text(hook.opening), strength, topicClearQuickly: hook.topicClearQuickly === true, assessment: text(hook.assessment) },
				structure: {
					intro: text(structure.intro),
					mainContent: text(structure.mainContent),
					pacing: text(structure.pacing),
					transitions: text(structure.transitions),
					story: text(structure.story),
					endingCta: text(structure.endingCta),
				},
				visual: {
					framing: text(visual.framing),
					textOverlays: text(visual.textOverlays),
					clarity: text(visual.clarity),
					sceneChanges: text(visual.sceneChanges),
					branding: text(visual.branding),
					cover: text(visual.cover),
				},
				engagement: {
					whyViewersWatched: text(engagement.whyViewersWatched),
					shareability: text(engagement.shareability),
					saveability: text(engagement.saveability),
					commentPotential: text(engagement.commentPotential),
					ctaEffectiveness: text(engagement.ctaEffectiveness),
				},
				keyMoments: (Array.isArray(output?.keyMoments) ? (output.keyMoments as Record<string, unknown>[]) : [])
					.map((m) => ({ timestamp: text(m.timestamp, 8), note: text(m.note, 240) }))
					.filter((m) => /^\d{1,2}:\d{2}$/.test(m.timestamp) && m.note)
					.slice(0, 8),
				recommendations: textList(output?.recommendations, 5),
				cannotAssess: textList(output?.cannotAssess, 4),
				generatedAt: new Date(now).toISOString(),
			};
		} finally {
			await cleanup();
		}
	});
	return value;
}
