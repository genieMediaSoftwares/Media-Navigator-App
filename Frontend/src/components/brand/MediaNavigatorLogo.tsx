import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { colors } from '@/constants/colors';

import { LOGO_IMAGE, LOGO_IMAGE_ON_DARK, LOGO_SVG, LOGO_SVG_ON_DARK } from './logoSource';

interface MediaNavigatorLogoProps {
  /** Rendered height in dp. Width follows the logo's own aspect ratio unless `width` is given. */
  height?: number;
  /** Rendered width in dp. If only width is given, height follows the aspect ratio. */
  width?: number;
  /** Background the logo sits on. `dark` uses a dark-background variant when one exists. */
  tone?: 'light' | 'dark';
}

/** Reads width/height from the SVG's viewBox so the logo always keeps its original proportions. */
function aspectRatioOf(xml: string): number | null {
  const viewBox = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i.exec(xml);
  if (viewBox) {
    const w = Number(viewBox[3]);
    const h = Number(viewBox[4]);
    if (w > 0 && h > 0) return w / h;
  }
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(xml);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(xml);
  return w && h && Number(h[1]) > 0 ? Number(w[1]) / Number(h[1]) : null;
}

/** Resolves height/width from whichever is given, preserving the aspect ratio (never stretched). */
function sizeFor(ratio: number, height?: number, width?: number) {
  const h = height ?? (width !== undefined ? width / ratio : 28);
  return { width: width !== undefined && height !== undefined ? Math.min(width, h * ratio) : (width ?? h * ratio), height: h };
}

let warnedDark = false;

/**
 * The official Media Navigator logo. The only place the logo is rendered; every screen uses this.
 * Uses the official vector SVG when one is present in ./logoSource.ts, otherwise the official
 * logo image exactly as supplied (transparent PNG).
 */
export const MediaNavigatorLogo = memo(function MediaNavigatorLogo({ height, width, tone = 'light' }: MediaNavigatorLogoProps) {
  const xml = tone === 'dark' ? (LOGO_SVG_ON_DARK ?? LOGO_SVG) : LOGO_SVG;
  const svgRatio = useMemo(() => (xml ? aspectRatioOf(xml) : null), [xml]);

  if (xml && svgRatio) {
    const size = sizeFor(svgRatio, height, width);
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="Media Navigator" style={size}>
        {/* `color` tints any parts of the SVG drawn with fill/stroke="currentColor". */}
        <SvgXml xml={xml} width={size.width} height={size.height} color={tone === 'dark' ? colors.white : colors.navy} />
      </View>
    );
  }

  const image = tone === 'dark' ? (LOGO_IMAGE_ON_DARK ?? LOGO_IMAGE) : LOGO_IMAGE;
  if (__DEV__ && tone === 'dark' && !LOGO_IMAGE_ON_DARK && !LOGO_SVG_ON_DARK && !warnedDark) {
    warnedDark = true;
    console.warn('MediaNavigatorLogo: no official dark-background variant exists; the standard logo has dark text and may lack contrast here.');
  }
  const size = sizeFor(image.width / image.height, height, width);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Media Navigator" style={size}>
      <Image source={image.source} style={size} contentFit="contain" cachePolicy="memory" transition={0} />
    </View>
  );
});
