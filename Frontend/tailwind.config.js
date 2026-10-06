// Design tokens live in src/constants (colors.ts, theme.ts); Tailwind loads them directly
// (TypeScript is supported by Tailwind's config loader), so there is only one source of truth.
const { palette } = require('./src/constants/colors.ts');
const { spacing, radius, typography } = require('./src/constants/theme.ts');

const px = (value) => `${value}px`;
const mapValues = (object, fn) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value)]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // The app is light-only (app.json userInterfaceStyle). With the default 'media' strategy NativeWind
  // throws on web when Expo applies that setting ("Cannot manually set color scheme").
  darkMode: 'class',
  theme: {
    extend: {
      colors: palette,
      spacing: mapValues(spacing, px),
      borderRadius: mapValues(radius, px),
      fontSize: mapValues(typography, ({ fontSize, lineHeight, fontWeight }) => [
        px(fontSize),
        { lineHeight: px(lineHeight), fontWeight },
      ]),
    },
  },
  plugins: [],
};
