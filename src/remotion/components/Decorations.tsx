import { interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ThemeTokens } from '../../themes';

export const Decorations: React.FC<{ seed: string; theme: ThemeTokens }> = ({ seed, theme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const count = Math.round(7 + 9 * theme.decorationDensity);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, index) => {
        const x = random(`${seed}:x:${index}`) * width;
        const y = random(`${seed}:y:${index}`) * height;
        const size = 9 + random(`${seed}:s:${index}`) * 22;
        const delay = random(`${seed}:d:${index}`) * 24;
        const progress = interpolate(frame, [delay, delay + 18], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const palette = [
          theme.colors.primary,
          theme.colors.secondary,
          theme.colors.accent,
          '#ffffff',
        ];
        const color = palette[Math.floor(random(`${seed}:c:${index}`) * palette.length)];
        const round = random(`${seed}:shape:${index}`) > 0.48;
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y + Math.sin((frame + index * 8) / 24) * 9,
              width: size,
              height: round ? size : size * 0.35,
              borderRadius: round ? '50%' : 4,
              background: color,
              opacity: progress * (0.2 + random(`${seed}:o:${index}`) * 0.35),
              transform: `scale(${progress}) rotate(${frame * 0.12 + index * 31}deg)`,
            }}
          />
        );
      })}
    </div>
  );
};
