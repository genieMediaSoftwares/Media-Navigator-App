import { ImageSourcePropType } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// OFFICIAL MEDIA NAVIGATOR LOGO
//
// The official logo was supplied as a raster image (JPEG, 1280×1600 on a white canvas).
// assets/brand/media-navigator-logo.png is that exact image: cropped to the logo (no scaling) and
// with the white canvas made transparent by exact colour-to-alpha. Composited on white it is
// pixel-identical to the supplied file. Nothing was redrawn, recoloured or simplified.
//
// If a true vector (.svg) version of the official logo becomes available, paste its complete
// <svg …>…</svg> markup (keep its original viewBox) into LOGO_SVG below. It then takes priority
// automatically; no screen changes are needed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Official logo as vector markup, if/when a true SVG is supplied. */
export const LOGO_SVG: string | null = null;

/** Optional official vector variant for dark backgrounds. */
export const LOGO_SVG_ON_DARK: string | null = null;

export interface LogoImage {
  source: ImageSourcePropType;
  /** Intrinsic pixel size, used only for the aspect ratio. */
  width: number;
  height: number;
}

/** The official logo exactly as supplied (transparent PNG, 1088×350). */
export const LOGO_IMAGE: LogoImage = {
  source: require('../../../assets/brand/media-navigator-logo.png'),
  width: 1088,
  height: 350,
};

/**
 * Official variant for dark backgrounds. None was supplied: the official logo's "MEDIA" wordmark
 * and tagline are dark navy, so it is designed for light backgrounds.
 */
export const LOGO_IMAGE_ON_DARK: LogoImage | null = null;
