import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import type { MediaAsset, Scene, SlideshowManifest } from '../../schemas/manifest';
import { themes } from '../../themes';
import { Decorations } from '../components/Decorations';
import { MediaFrame } from '../components/MediaFrame';

const mediaPositions = (
  layout: Scene['layout'],
  count: number,
  index: number,
): React.CSSProperties => {
  if (layout === 'single-portrait') return { left: '29%', top: '8%', width: '42%', height: '84%' };
  if (layout === 'single-landscape' || layout === 'hero')
    return { left: '7%', top: '8%', width: '86%', height: '79%' };
  if (layout === 'square-editorial') return { left: '26%', top: '7%', width: '48%', height: '78%' };
  if (layout === 'video-editorial') return { left: '8%', top: '9%', width: '84%', height: '76%' };
  if (layout === 'polaroid')
    return { left: '25%', top: '6%', width: '50%', height: '79%', paddingBottom: 55 };
  if (layout === 'timeline-strip') return { left: '14%', top: '9%', width: '72%', height: '72%' };
  if (layout === 'split-screen') {
    return { left: index === 0 ? '5%' : '51%', top: '11%', width: '44%', height: '72%' };
  }
  if (layout === 'photo-stack') {
    const stack = [
      { left: '12%', top: '15%', width: '43%', height: '68%' },
      { left: '46%', top: '9%', width: '43%', height: '70%' },
      { left: '31%', top: '20%', width: '40%', height: '66%' },
    ];
    return stack[index] ?? stack[stack.length - 1]!;
  }
  if (layout === 'album-page') {
    const album = [
      { left: '8%', top: '12%', width: '42%', height: '64%' },
      { left: '53%', top: '9%', width: '38%', height: '45%' },
      { left: '56%', top: '57%', width: '34%', height: '30%' },
    ];
    return album[index] ?? album[album.length - 1]!;
  }
  if (count === 2) {
    return { left: index === 0 ? '7%' : '52%', top: '12%', width: '41%', height: '69%' };
  }
  const collage = [
    { left: '5%', top: '9%', width: '48%', height: '46%' },
    { left: '56%', top: '7%', width: '38%', height: '54%' },
    { left: '12%', top: '59%', width: '38%', height: '31%' },
    { left: '55%', top: '64%', width: '36%', height: '25%' },
  ];
  return collage[index] ?? collage[collage.length - 1]!;
};

const readableBadge: React.CSSProperties = {
  color: '#fff',
  background: 'rgba(24, 14, 48, .76)',
  border: '1px solid rgba(255, 255, 255, .24)',
  boxShadow: '0 10px 28px rgba(14, 8, 30, .34)',
  textShadow: '0 2px 8px rgba(0, 0, 0, .88)',
  backdropFilter: 'blur(12px)',
};

export const SceneRenderer: React.FC<{
  scene: Scene;
  manifest: SlideshowManifest;
  assetMap: Map<string, MediaAsset>;
}> = ({ scene, manifest, assetMap }) => {
  const frame = useCurrentFrame();
  const theme = themes[manifest.theme as keyof typeof themes] ?? themes['warm-memory'];
  const assets = scene.photos
    .map((photo) => assetMap.get(photo.assetId))
    .filter((asset): asset is MediaAsset => Boolean(asset));
  const first = assets[0];
  const textEnter = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const isTitleScene = scene.type === 'intro' || scene.type === 'outro' || scene.type === 'chapter';
  return (
    <AbsoluteFill style={{ background: theme.colors.background, overflow: 'hidden' }}>
      {first ? (
        <Img
          src={staticFile(first.backgroundPath)}
          style={{
            position: 'absolute',
            inset: -35,
            width: 'calc(100% + 70px)',
            height: 'calc(100% + 70px)',
            objectFit: 'cover',
            opacity: 0.84,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${theme.colors.primary}66 0%, transparent 42%, ${theme.colors.secondary}55 100%)`,
          mixBlendMode: 'soft-light',
        }}
      />
      <Decorations seed={scene.seed} theme={theme} />
      {isTitleScene ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: `${manifest.safeArea.left * 100}%`,
            right: `${manifest.safeArea.right * 100}%`,
            top: scene.type === 'outro' ? '62%' : '36%',
            textAlign: 'center',
            transform: `translateY(${(1 - textEnter) * 35}px)`,
            opacity: textEnter,
            color: '#fff',
            textShadow: '0 5px 24px rgba(40,20,70,.55)',
          }}
        >
          <div
            style={{
              fontFamily: theme.typography.display,
              fontSize: scene.type === 'intro' ? 112 : 76,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {scene.title}
          </div>
          {scene.subtitle ? (
            <div
              style={{
                fontFamily: theme.typography.body,
                fontSize: scene.type === 'outro' ? 31 : 43,
                fontWeight: 600,
                marginTop: 22,
                lineHeight: 1.25,
              }}
            >
              {scene.subtitle}
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
        {scene.photos.map((photo, index) => {
          const asset = assetMap.get(photo.assetId);
          if (!asset) return null;
          return (
            <MediaFrame
              key={`${scene.id}-${photo.assetId}`}
              asset={asset}
              scenePhoto={photo}
              scene={scene}
              theme={theme}
              index={index}
              style={mediaPositions(scene.layout, scene.photos.length, index)}
            />
          );
        })}
      </div>
      {!isTitleScene ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 45,
            left: `${manifest.safeArea.left * 100}%`,
            right: `${manifest.safeArea.right * 100}%`,
            bottom: `${manifest.safeArea.bottom * 100}%`,
            display: 'flex',
            alignItems: 'end',
            justifyContent: 'space-between',
            color: '#fff',
            fontFamily: theme.typography.body,
            opacity: textEnter,
          }}
        >
          {scene.caption ? (
            <div
              style={{
                ...readableBadge,
                fontSize: 29,
                fontWeight: 650,
                maxWidth: '68%',
                lineHeight: 1.2,
                padding: '13px 19px',
                borderRadius: 18,
              }}
            >
              {scene.caption}
            </div>
          ) : (
            <div />
          )}
          {scene.dateLabel ? (
            <div
              style={{
                ...readableBadge,
                fontSize: 25,
                fontWeight: 750,
                padding: '10px 18px',
                borderRadius: 999,
              }}
            >
              {scene.dateLabel}
            </div>
          ) : null}
        </div>
      ) : null}
      <AbsoluteFill
        style={{
          zIndex: 60,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 170px rgba(28,12,50,${theme.vignetteOpacity})`,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%270 0 180 180%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.85%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%27.22%27/%3E%3C/svg%3E")',
          opacity: theme.grainOpacity,
          mixBlendMode: 'soft-light',
        }}
      />
    </AbsoluteFill>
  );
};
