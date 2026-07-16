import {
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { MediaAsset, Scene } from '../../schemas/manifest';
import type { ThemeTokens } from '../../themes';

type Props = {
  asset: MediaAsset;
  scenePhoto: Scene['photos'][number];
  scene: Scene;
  theme: ThemeTokens;
  style?: React.CSSProperties;
  index: number;
};

export const MediaFrame: React.FC<Props> = ({ asset, scenePhoto, scene, theme, style, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame: frame - index * 4, config: { damping: 18, stiffness: 110 } });
  const progress = interpolate(frame, [0, scene.durationInFrames - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const movement = scenePhoto.movement;
  const internalScale = interpolate(progress, [0, 1], [movement.startScale, movement.endScale]);
  const x = interpolate(progress, [0, 1], [movement.startX, movement.endX]);
  const y = interpolate(progress, [0, 1], [movement.startY, movement.endY]);
  const foregroundStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: `${scenePhoto.focus.x * 100}% ${scenePhoto.focus.y * 100}%`,
    filter: 'drop-shadow(0 8px 18px rgba(20, 12, 42, .2))',
  };
  const backdropStyle: React.CSSProperties = {
    position: 'absolute',
    inset: -18,
    width: 'calc(100% + 36px)',
    height: 'calc(100% + 36px)',
    objectFit: 'cover',
    objectPosition: `${scenePhoto.focus.x * 100}% ${scenePhoto.focus.y * 100}%`,
    transform: `scale(${1.06 + (internalScale - 1) * 0.45}) translate(${x * 0.45}%, ${y * 0.45}%)`,
    filter: 'blur(18px) saturate(.92) brightness(.78)',
  };
  return (
    <div
      style={{
        position: 'absolute',
        overflow: 'hidden',
        background: theme.colors.surface,
        border: `${theme.frame.border}px solid ${theme.colors.surface}`,
        borderRadius: theme.frame.radius,
        boxShadow: theme.frame.shadow,
        opacity: enter,
        transform: `rotate(${scenePhoto.rotation}deg) scale(${(0.82 + 0.18 * enter) * scenePhoto.scale})`,
        ...style,
      }}
    >
      <Img src={staticFile(asset.backgroundPath)} style={backdropStyle} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,.08), rgba(22,12,45,.08))',
        }}
      />
      {asset.type === 'video' ? (
        <OffthreadVideo src={staticFile(asset.normalizedPath)} muted style={foregroundStyle} />
      ) : (
        <Img src={staticFile(asset.normalizedPath)} style={foregroundStyle} />
      )}
    </div>
  );
};
