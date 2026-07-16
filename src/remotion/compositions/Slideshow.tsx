import { useMemo } from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import type { MediaAsset, Scene, SlideshowManifest } from '../../schemas/manifest';
import { themes } from '../../themes';
import { SceneRenderer } from '../scenes/SceneRenderer';

type AssetMap = Map<string, MediaAsset>;

const BeatAccent: React.FC<{ manifest: SlideshowManifest; scene: Scene }> = ({
  manifest,
  scene,
}) => {
  const frame = useCurrentFrame();
  const theme = themes[manifest.theme as keyof typeof themes] ?? themes['warm-memory'];
  const strength = interpolate(frame, [0, 4, 18], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ zIndex: 100, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '7%',
          right: '7%',
          top: 22,
          height: 7,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.accent}, ${theme.colors.secondary})`,
          opacity: strength * 0.92,
          transform: `scaleX(${0.18 + strength * 0.82})`,
          boxShadow: `0 0 24px ${theme.colors.accent}`,
        }}
      />
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={`${scene.id}-beat-${index}`}
          style={{
            position: 'absolute',
            left: `${7 + index * 9.5}%`,
            top: 37 + (index % 3) * 12,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: index % 2 === 0 ? theme.colors.accent : theme.colors.secondary,
            opacity: strength * 0.9,
            transform: `translateY(${(1 - strength) * -15}px) scale(${0.5 + strength * 0.9})`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const clipPathFor = (scene: Scene, index: number, progress: number): string => {
  const hidden = `${(1 - progress) * 100}%`;
  switch (scene.transitionOut?.type) {
    case 'geometric-mask':
      return `circle(${progress * 74}% at ${index % 2 === 0 ? '34%' : '66%'} 50%)`;
    case 'photo-stack':
      return `inset(${hidden} 0 0 0 round ${20 + (1 - progress) * 54}px)`;
    case 'zoom-through':
      return `inset(${hidden} ${hidden} ${hidden} ${hidden} round 32px)`;
    case 'shared-motion':
      return `polygon(0 0, ${progress * 100}% 0, ${Math.min(100, progress * 118)}% 100%, 0 100%)`;
    case 'slide':
      return index % 2 === 0
        ? `inset(0 ${hidden} 0 0 round 24px)`
        : `inset(0 0 0 ${hidden} round 24px)`;
    case 'wipe':
    default:
      if (index % 2 === 0) return `inset(0 ${hidden} 0 0 round 24px)`;
      return `inset(0 0 0 ${hidden} round 24px)`;
  }
};

const RevealTransitionScene: React.FC<{
  scene: Scene;
  manifest: SlideshowManifest;
  assetMap: AssetMap;
  incomingDuration: number;
  index: number;
  incomingType: Scene['transitionOut'];
}> = ({ scene, manifest, assetMap, incomingDuration, index, incomingType }) => {
  const frame = useCurrentFrame();
  const linearProgress =
    incomingDuration <= 1 ? 1 : Math.max(0, Math.min(1, frame / (incomingDuration - 1)));
  const progress = linearProgress * linearProgress * (3 - 2 * linearProgress);
  const incomingScene = { ...scene, transitionOut: incomingType };
  const slideDistance =
    incomingType?.type === 'slide' ? (1 - progress) * (index % 2 === 0 ? 8 : -8) : 0;
  const zoom = incomingType?.type === 'zoom-through' ? 0.92 + progress * 0.08 : 1;
  const rotation =
    incomingType?.type === 'photo-stack' ? (1 - progress) * (index % 2 === 0 ? -2.2 : 2.2) : 0;
  const clipPath = progress >= 0.999 ? 'none' : clipPathFor(incomingScene, index, progress);

  return (
    <AbsoluteFill
      style={{
        clipPath,
        transform: `translateX(${slideDistance}%) scale(${zoom}) rotate(${rotation}deg)`,
        transformOrigin: 'center',
      }}
    >
      <SceneRenderer scene={scene} manifest={manifest} assetMap={assetMap} />
    </AbsoluteFill>
  );
};

export const Slideshow: React.FC<SlideshowManifest> = (manifest) => {
  const assetMap = useMemo(
    () => new Map(manifest.assets.map((asset) => [asset.id, asset])),
    [manifest.assets],
  );

  return (
    <AbsoluteFill>
      {manifest.scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          layout="none"
        >
          <AbsoluteFill style={{ zIndex: index }}>
            <RevealTransitionScene
              scene={scene}
              manifest={manifest}
              assetMap={assetMap}
              index={index}
              incomingType={index === 0 ? undefined : manifest.scenes[index - 1]?.transitionOut}
              incomingDuration={
                index === 0 ? 0 : (manifest.scenes[index - 1]?.transitionOut?.durationInFrames ?? 0)
              }
            />
          </AbsoluteFill>
        </Sequence>
      ))}
      {manifest.scenes
        .filter((scene) => scene.beatAccent)
        .map((scene) => (
          <Sequence
            key={`${scene.id}-beat-accent`}
            from={scene.startFrame}
            durationInFrames={19}
            layout="none"
          >
            <BeatAccent manifest={manifest} scene={scene} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
