import { model, Schema } from 'mongoose';

import { PLATFORMS, Platform } from './ConnectedAccount';
import { newId } from './ids';

/**
 * Content types in each platform's own vocabulary. Instagram: REEL, POST (photo), CAROUSEL, VIDEO, STORY.
 * Facebook: TEXT, IMAGE, VIDEO, REEL, LINK, LIVE, CAROUSEL (album). YouTube: VIDEO, LIVE (the API does not
 * identify Shorts). LinkedIn: TEXT, IMAGE, VIDEO, ARTICLE, DOCUMENT, POLL, CAROUSEL (multi-image).
 * POST remains the fallback for a type the platform did not describe.
 */
export const CONTENT_FORMATS = ['REEL', 'POST', 'CAROUSEL', 'VIDEO', 'STORY', 'TEXT', 'IMAGE', 'LINK', 'LIVE', 'ARTICLE', 'DOCUMENT', 'POLL'] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/**
 * Platform-neutral metrics. `null` always means "the platform did not provide this value" (unsupported,
 * missing permission, not returned) and must never be read as zero. Not every platform has every metric.
 */
export interface ContentMetrics {
	views: number | null;
	reach: number | null;
	/** Instagram/YouTube/LinkedIn likes; Facebook total reactions. */
	likes: number | null;
	comments: number | null;
	saves: number | null;
	shares: number | null;
	/** The platform's own total-interactions figure, when it reports one. */
	totalInteractions: number | null;
}

/** One published piece of content (Instagram media, Facebook post, YouTube video, LinkedIn post). */
export interface ContentItemDoc {
	_id: string;
	userId: string;
	connectedAccountId: string;
	platform: Platform;
	/** Id of the content on the platform (Instagram media id, video id, post URN…). */
	platformContentId: string;
	format: ContentFormat;
	/** Raw platform type fields, kept for fidelity (Instagram media_type / media_product_type). */
	mediaType: string | null;
	mediaProductType: string | null;
	/** YouTube video title / LinkedIn article title. */
	title: string | null;
	caption: string | null;
	permalink: string | null;
	mediaUrl: string | null;
	thumbnailUrl: string | null;
	/** Publication time exactly as the platform returned it. */
	timestampRaw: string | null;
	/** Parsed publication time (UTC); used for sorting and date filters. */
	publishedAt: Date | null;
	metrics: ContentMetrics;
	/** likes + comments; null when the platform returned neither. */
	interactions: number | null;
	/** Platform-specific extras that have no neutral equivalent (e.g. YouTube watch time). */
	extraMetrics: Record<string, number | null> | null;
	/** Last sync that returned insight metrics for this item; null = never. */
	insightsSyncedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const metricsSchema = new Schema<ContentMetrics>(
	{
		views: { type: Number, default: null },
		reach: { type: Number, default: null },
		likes: { type: Number, default: null },
		comments: { type: Number, default: null },
		saves: { type: Number, default: null },
		shares: { type: Number, default: null },
		totalInteractions: { type: Number, default: null },
	},
	{ _id: false },
);

const contentItemSchema = new Schema<ContentItemDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		connectedAccountId: { type: String, required: true, ref: 'ConnectedAccount' },
		platform: { type: String, required: true, enum: PLATFORMS },
		platformContentId: { type: String, required: true },
		format: { type: String, required: true, enum: CONTENT_FORMATS },
		mediaType: { type: String, default: null },
		mediaProductType: { type: String, default: null },
		title: { type: String, default: null },
		caption: { type: String, default: null },
		permalink: { type: String, default: null },
		mediaUrl: { type: String, default: null },
		thumbnailUrl: { type: String, default: null },
		timestampRaw: { type: String, default: null },
		publishedAt: { type: Date, default: null },
		metrics: { type: metricsSchema, required: true },
		interactions: { type: Number, default: null },
		extraMetrics: { type: Schema.Types.Mixed, default: null },
		insightsSyncedAt: { type: Date, default: null },
		createdAt: { type: Date, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ collection: 'content_items', versionKey: false, minimize: false },
);

contentItemSchema.index(
	{ connectedAccountId: 1, platformContentId: 1 },
	{ unique: true, name: 'content_items_account_content_unique' },
);
contentItemSchema.index({ connectedAccountId: 1, publishedAt: -1, createdAt: -1 }, { name: 'content_items_account_published_idx' });
contentItemSchema.index({ userId: 1, platform: 1, publishedAt: -1 }, { name: 'content_items_user_platform_published_idx' });

export const ContentItem = model<ContentItemDoc>('ContentItem', contentItemSchema);
