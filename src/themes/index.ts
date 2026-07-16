import type { ThemeName } from '../schemas/project';

export type ThemeTokens = {
  colors: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    muted: string;
  };
  typography: { display: string; body: string };
  frame: { radius: number; border: number; shadow: string };
  decorationDensity: number;
  grainOpacity: number;
  vignetteOpacity: number;
};

export const themes: Record<ThemeName, ThemeTokens> = {
  'warm-memory': {
    colors: {
      background: '#4b2d2a',
      surface: '#fff7e7',
      primary: '#e88f71',
      secondary: '#f5c37a',
      accent: '#7f9d75',
      text: '#3d2924',
      muted: '#725c55',
    },
    typography: {
      display: 'Georgia, Times New Roman, serif',
      body: 'Avenir Next, Helvetica, sans-serif',
    },
    frame: { radius: 18, border: 14, shadow: '0 28px 80px rgba(41,20,16,.36)' },
    decorationDensity: 0.55,
    grainOpacity: 0.12,
    vignetteOpacity: 0.2,
  },
  'clean-cinematic': {
    colors: {
      background: '#0d1117',
      surface: '#f2f0eb',
      primary: '#d8d3c8',
      secondary: '#62758c',
      accent: '#be9f70',
      text: '#f5f4f0',
      muted: '#a7adb4',
    },
    typography: { display: 'Didot, Georgia, serif', body: 'Helvetica Neue, Arial, sans-serif' },
    frame: { radius: 4, border: 5, shadow: '0 30px 100px rgba(0,0,0,.55)' },
    decorationDensity: 0.16,
    grainOpacity: 0.09,
    vignetteOpacity: 0.34,
  },
  'playful-celebration': {
    colors: {
      background: '#6f4cba',
      surface: '#fffaf0',
      primary: '#ff6f91',
      secondary: '#55c9d5',
      accent: '#ffd45c',
      text: '#382466',
      muted: '#745c8b',
    },
    typography: {
      display: 'Avenir Next Rounded, Trebuchet MS, sans-serif',
      body: 'Avenir Next, Trebuchet MS, sans-serif',
    },
    frame: { radius: 28, border: 12, shadow: '0 26px 70px rgba(45,24,92,.35)' },
    decorationDensity: 0.78,
    grainOpacity: 0.07,
    vignetteOpacity: 0.12,
  },
  'elegant-event': {
    colors: {
      background: '#d9d0c5',
      surface: '#fffdf8',
      primary: '#a98a55',
      secondary: '#b7a8a2',
      accent: '#dbc08b',
      text: '#40362f',
      muted: '#7c716a',
    },
    typography: { display: 'Didot, Georgia, serif', body: 'Avenir Next, Helvetica, sans-serif' },
    frame: { radius: 8, border: 7, shadow: '0 30px 90px rgba(68,53,39,.25)' },
    decorationDensity: 0.3,
    grainOpacity: 0.08,
    vignetteOpacity: 0.18,
  },
  'travel-journal': {
    colors: {
      background: '#6b5539',
      surface: '#f4e7c7',
      primary: '#cc6248',
      secondary: '#507a78',
      accent: '#d6a33f',
      text: '#392f24',
      muted: '#75664e',
    },
    typography: {
      display: 'American Typewriter, Georgia, serif',
      body: 'Avenir Next, Helvetica, sans-serif',
    },
    frame: { radius: 5, border: 13, shadow: '0 24px 65px rgba(47,35,21,.38)' },
    decorationDensity: 0.58,
    grainOpacity: 0.15,
    vignetteOpacity: 0.2,
  },
};
