import type { LoadedProject } from '../config/load-project.js';
import type { BeatAnalysis } from '../analysis/analyze-audio.js';
import { formatMonthYearRange } from '../analysis/dates.js';
import type {
  MediaAsset,
  Scene,
  SceneLayer,
  SlideshowManifest,
  Warning,
} from '../schemas/manifest.js';
import type { Layout, MovementType, TransitionType } from '../schemas/project.js';
import { secondsToFrames } from '../utils/frames.js';
import { pickSeeded, rangeSeeded, seededRandom, stableHash } from '../utils/seeded-random.js';
import { allocateFrames } from './allocation.js';

type DraftScene = Omit<Scene, 'startFrame' | 'endFrame' | 'durationInFrames' | 'transitionOut'> & {
  requestedFrames?: number;
  transitionOut?: Scene['transitionOut'];
};

const safeTransitions: TransitionType[] = [
  'wipe',
  'slide',
  'geometric-mask',
  'shared-motion',
  'photo-stack',
  'zoom-through',
];

const chooseMovement = (
  seed: string,
  preferred?: MovementType,
): Scene['photos'][number]['movement'] => {
  const type =
    preferred ??
    pickSeeded<MovementType>(
      ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'zoom-to-focus', 'diagonal'],
      `${seed}:movement`,
    );
  const zoomIn = ['zoom-in', 'zoom-to-focus', 'diagonal'].includes(type);
  const zoomOut = type === 'zoom-out';
  return {
    type,
    startScale: zoomOut ? 1.1 : 1.03,
    endScale: zoomIn ? 1.11 : zoomOut ? 1.02 : 1.07,
    startX: type === 'pan-right' ? -2.5 : type === 'pan-left' ? 2.5 : 0,
    endX: type === 'pan-right' ? 2.5 : type === 'pan-left' ? -2.5 : 0,
    startY: type === 'pan-down' ? -2 : type === 'pan-up' ? 2 : 0,
    endY: type === 'pan-down' ? 2 : type === 'pan-up' ? -2 : 0,
  };
};

const makeLayers = (
  sceneId: string,
  assets: MediaAsset[],
  duration: number,
  title?: string,
): SceneLayer[] => {
  const seed = `${sceneId}:layers`;
  const layers: SceneLayer[] = [
    {
      id: `${sceneId}-bg`,
      type: 'background',
      variant: 'derived-blur',
      order: 1,
      opacity: 1,
      fromFrame: 0,
      toFrame: duration,
      seed,
    },
    {
      id: `${sceneId}-wash`,
      type: 'light',
      variant: 'color-wash',
      order: 3,
      opacity: 0.58,
      fromFrame: 0,
      toFrame: duration,
      seed: `${seed}:wash`,
    },
    {
      id: `${sceneId}-texture`,
      type: 'texture',
      variant: 'paper-grain',
      order: 5,
      opacity: 0.16,
      fromFrame: 0,
      toFrame: duration,
      seed: `${seed}:texture`,
    },
    {
      id: `${sceneId}-decor`,
      type: 'decoration',
      variant: 'celebration',
      order: 7,
      opacity: 0.82,
      fromFrame: 4,
      toFrame: duration,
      seed: `${seed}:decor`,
    },
    {
      id: `${sceneId}-frame`,
      type: 'frame',
      variant: 'soft-paper',
      order: 8,
      opacity: 1,
      fromFrame: 2,
      toFrame: duration,
      seed: `${seed}:frame`,
    },
    ...assets.map<SceneLayer>((asset, index) => ({
      id: `${sceneId}-media-${index}`,
      type: 'image',
      assetId: asset.id,
      order: 10 + index,
      opacity: 1,
      fromFrame: index * 4,
      toFrame: duration,
      seed: `${seed}:media:${asset.id}`,
    })),
    {
      id: `${sceneId}-vignette`,
      type: 'vignette',
      intensity: 0.18,
      order: 30,
      opacity: 0.55,
      fromFrame: 0,
      toFrame: duration,
      seed: `${seed}:vignette`,
    },
  ];
  if (title) {
    layers.push({
      id: `${sceneId}-title`,
      type: 'text',
      role: 'title',
      text: title,
      order: 20,
      opacity: 1,
      fromFrame: 8,
      toFrame: duration,
      seed: `${seed}:title`,
    });
  }
  return layers;
};

const layoutFor = (assets: MediaAsset[], index: number, seed: string): Layout => {
  if (assets.some((asset) => asset.type === 'video')) return 'video-editorial';
  if (assets.length >= 3) return index % 3 === 0 ? 'album-page' : 'collage';
  if (assets.length === 2) {
    return pickSeeded<Layout>(['photo-stack', 'split-screen', 'collage'], `${seed}:layout`);
  }
  const asset = assets[0] as MediaAsset;
  if (index % 13 === 8) return 'hero';
  if (index % 9 === 4) return 'polaroid';
  if (index % 11 === 6) return 'timeline-strip';
  if (asset.orientation === 'portrait') return 'single-portrait';
  if (asset.orientation === 'square') return 'square-editorial';
  return 'single-landscape';
};

const sceneWeight = (assets: MediaAsset[], layout: Layout): number => {
  if (assets.some((asset) => asset.type === 'video')) return 1.55;
  if (layout === 'hero') return 2;
  const collageWeight =
    assets.length === 2 ? 1.25 : assets.length === 3 ? 1.4 : assets.length >= 4 ? 1.55 : 1;
  const priority = Math.max(...assets.map((asset) => asset.priority));
  const captions = assets.some((asset) => asset.caption) ? 1.15 : 1;
  return collageWeight * priority * captions;
};

const createDraftScene = (
  assets: MediaAsset[],
  index: number,
  project: LoadedProject,
): DraftScene => {
  const id = `scene-${(index + 1).toString().padStart(4, '0')}`;
  const seed = `${project.config.seed}:${id}`;
  const layout = layoutFor(assets, index, seed);
  const first = assets[0] as MediaAsset;
  const last = assets.at(-1) as MediaAsset;
  const override = project.config.photos[first.fileName];
  const dateLabel = formatMonthYearRange(new Date(first.date), new Date(last.date));
  const isVideo = first.type === 'video';
  const requestedFrames = isVideo
    ? Math.max(1, Math.round((first.clipDurationSeconds ?? 3.5) * project.config.fps))
    : override?.fixedDurationSeconds
      ? secondsToFrames(override.fixedDurationSeconds, project.config.fps)
      : undefined;
  const provisionalDuration =
    requestedFrames ?? secondsToFrames(project.config.idealSceneSeconds, project.config.fps);
  return {
    id,
    type: isVideo ? 'video' : assets.length > 1 ? 'collage' : 'photo',
    chapterId: first.chapterId,
    layout,
    photos: assets.map((asset, assetIndex) => {
      const assetOverride = project.config.photos[asset.fileName];
      return {
        assetId: asset.id,
        focus: asset.focus,
        rotation:
          assetOverride?.rotation ??
          rangeSeeded(-3.2, 3.2, `${seed}:${asset.id}:rotation:${assetIndex}`),
        scale: assetOverride?.scale ?? 1,
        movement: chooseMovement(`${seed}:${asset.id}`, assetOverride?.movement),
      };
    }),
    ...(assets.find((asset) => asset.caption)?.caption
      ? { caption: assets.find((asset) => asset.caption)?.caption }
      : {}),
    ...(project.config.showDates ? { dateLabel } : {}),
    ...(first.location ? { location: first.location } : {}),
    seed,
    weight: sceneWeight(assets, layout),
    fixedDuration: requestedFrames !== undefined,
    ...(requestedFrames !== undefined ? { requestedFrames } : {}),
    layers: makeLayers(id, assets, provisionalDuration),
    warnings: assets.flatMap((asset) => asset.warnings),
  };
};

const groupAssetsIntoScenes = (assets: MediaAsset[], project: LoadedProject): MediaAsset[][] => {
  const videoCount = assets.filter((asset) => asset.type === 'video').length;
  const imageCount = assets.length - videoCount;
  const contentSeconds =
    project.config.targetDurationSeconds -
    project.config.introDurationSeconds -
    project.config.outroDurationSeconds;
  const desiredTotal = Math.max(
    1,
    Math.floor(
      contentSeconds / (project.config.idealSceneSeconds - project.config.defaultTransitionSeconds),
    ),
  );
  const desiredImageScenes = Math.max(Math.ceil(imageCount / 4), desiredTotal - videoCount);
  const groups: MediaAsset[][] = [];
  let remainingImages = imageCount;
  let remainingImageScenes = desiredImageScenes;
  let cursor = 0;
  while (cursor < assets.length) {
    const current = assets[cursor] as MediaAsset;
    if (current.type === 'video') {
      groups.push([current]);
      cursor += 1;
      continue;
    }
    const nextVideo = assets.findIndex((asset, index) => index >= cursor && asset.type === 'video');
    const nextChapter = assets.findIndex(
      (asset, index) => index > cursor && asset.chapterId !== current.chapterId,
    );
    const boundaryCandidates = [nextVideo, nextChapter, assets.length].filter(
      (value) => value >= 0 && value > cursor,
    );
    const boundary = Math.min(...boundaryCandidates);
    const runRemaining = boundary - cursor;
    const idealSize = Math.ceil(remainingImages / Math.max(1, remainingImageScenes));
    const size = project.config.allowCollages
      ? Math.max(1, Math.min(4, idealSize, runRemaining))
      : 1;
    groups.push(assets.slice(cursor, cursor + size));
    cursor += size;
    remainingImages -= size;
    remainingImageScenes -= 1;
  }
  return groups;
};

const transitionFor = (
  scene: DraftScene,
  next: DraftScene,
  index: number,
  project: LoadedProject,
): NonNullable<Scene['transitionOut']> => {
  const override = scene.photos[0]
    ? project.config.photos[
        project.config.photos[scene.photos[0].assetId] ? scene.photos[0].assetId : ''
      ]?.transition
    : undefined;
  const isChapterChange = scene.chapterId !== next.chapterId;
  const transitionOffset = Math.floor(
    seededRandom(`${project.config.seed}:transition-order`) * safeTransitions.length,
  );
  const type =
    override ?? safeTransitions[(index + transitionOffset) % safeTransitions.length] ?? 'wipe';
  const durationMultiplier = isChapterChange ? 1.15 : 1;
  return {
    type,
    durationInFrames: Math.max(
      8,
      Math.min(
        secondsToFrames(1.2, project.config.fps),
        Math.round(
          secondsToFrames(project.config.defaultTransitionSeconds, project.config.fps) *
            durationMultiplier,
        ),
      ),
    ),
  };
};

const synchronizeScenesToBeats = (
  scenes: Scene[],
  beatAnalysis: BeatAnalysis | undefined,
  project: LoadedProject,
): number => {
  if (!beatAnalysis || beatAnalysis.beatFrames.length === 0) return 0;
  const minimumFrames = secondsToFrames(project.config.minimumSceneSeconds, project.config.fps);
  const maximumFrames = secondsToFrames(project.config.maximumSceneSeconds, project.config.fps);
  const maximumSnap = Math.max(1, Math.round(project.config.fps * 0.24));
  const cadenceOffset = Math.floor(seededRandom(`${project.config.seed}:beat-sync-cadence`) * 3);
  let synchronized = 0;
  for (let index = 1; index < scenes.length - 1; index++) {
    if ((index + cadenceOffset) % 3 !== 0) continue;
    const previous = scenes[index - 1] as Scene;
    const current = scenes[index] as Scene;
    const next = scenes[index + 1] as Scene;
    if (previous.fixedDuration || current.fixedDuration) continue;
    const desired = current.startFrame;
    const nearest = beatAnalysis.beatFrames.reduce(
      (best, candidate) =>
        Math.abs(candidate - desired) < Math.abs(best - desired) ? candidate : best,
      beatAnalysis.beatFrames[0] as number,
    );
    if (Math.abs(nearest - desired) > maximumSnap) continue;
    const previousTransition = previous.transitionOut?.durationInFrames ?? 0;
    const currentTransition = current.transitionOut?.durationInFrames ?? 0;
    const previousDuration = nearest - previous.startFrame + previousTransition;
    const currentDuration = next.startFrame - nearest + currentTransition;
    if (
      previousDuration < minimumFrames ||
      previousDuration > maximumFrames ||
      currentDuration < minimumFrames ||
      currentDuration > maximumFrames
    ) {
      continue;
    }
    previous.durationInFrames = previousDuration;
    previous.endFrame = previous.startFrame + previousDuration;
    previous.layers = previous.layers.map((layer) => ({ ...layer, toFrame: previousDuration }));
    if (previous.transitionOut) {
      previous.transitionOut = {
        ...previous.transitionOut,
        beatSynced: true,
        beatFrame: nearest,
      };
    }
    current.startFrame = nearest;
    current.durationInFrames = currentDuration;
    current.endFrame = nearest + currentDuration;
    current.layers = current.layers.map((layer) => ({ ...layer, toFrame: currentDuration }));
    current.beatAccent = true;
    synchronized += 1;
  }
  return synchronized;
};

export const buildManifest = (
  project: LoadedProject,
  assets: MediaAsset[],
  ignoredFiles: string[],
  analysisWarnings: Warning[],
  beatAnalysis?: BeatAnalysis,
): SlideshowManifest => {
  const fps = project.config.fps;
  const targetFrames = secondsToFrames(project.config.targetDurationSeconds, fps);
  const groups = groupAssetsIntoScenes(assets, project);
  const mainScenes = groups.map((group, index) => createDraftScene(group, index, project));
  const introAssets = assets.slice(0, Math.min(3, assets.length));
  const outroAssets = assets.slice(Math.max(0, assets.length - 3));
  const introFrames = secondsToFrames(project.config.introDurationSeconds, fps);
  const outroFrames = secondsToFrames(project.config.outroDurationSeconds, fps);
  const intro: DraftScene = {
    id: 'scene-intro',
    type: 'intro',
    layout: 'photo-stack',
    photos: introAssets.map((asset, index) => ({
      assetId: asset.id,
      focus: asset.focus,
      rotation: [-4, 2.5, -1][index] ?? 0,
      scale: 1,
      movement: chooseMovement(`${project.config.seed}:intro:${asset.id}`),
    })),
    title: project.config.title,
    subtitle: project.config.subtitle,
    seed: `${project.config.seed}:intro`,
    weight: 1,
    fixedDuration: true,
    requestedFrames: introFrames,
    layers: makeLayers('scene-intro', introAssets, introFrames, project.config.title),
    warnings: [],
  };
  const outro: DraftScene = {
    id: 'scene-outro',
    type: 'outro',
    layout: 'album-page',
    photos: outroAssets.map((asset, index) => ({
      assetId: asset.id,
      focus: asset.focus,
      rotation: [2, -3, 1][index] ?? 0,
      scale: 1,
      movement: chooseMovement(`${project.config.seed}:outro:${asset.id}`),
    })),
    title: project.config.closingMessage,
    seed: `${project.config.seed}:outro`,
    weight: 1,
    fixedDuration: true,
    requestedFrames: outroFrames,
    layers: makeLayers('scene-outro', outroAssets, outroFrames, project.config.closingMessage),
    warnings: [],
  };
  const drafts = [intro, ...mainScenes, outro];
  for (let index = 0; index < drafts.length - 1; index++) {
    const scene = drafts[index] as DraftScene;
    scene.transitionOut = transitionFor(scene, drafts[index + 1] as DraftScene, index, project);
  }
  const transitionFrames = drafts.reduce(
    (sum, scene) => sum + (scene.transitionOut?.durationInFrames ?? 0),
    0,
  );
  const fixedFrames = drafts.reduce(
    (sum, scene) => sum + (scene.fixedDuration ? (scene.requestedFrames as number) : 0),
    0,
  );
  const flexible = drafts.filter((scene) => !scene.fixedDuration);
  const flexibleBudget = targetFrames + transitionFrames - fixedFrames;
  const allocated = allocateFrames(
    flexible.map((scene) => ({
      id: scene.id,
      weight: scene.weight,
      minFrames: secondsToFrames(project.config.minimumSceneSeconds, fps),
      maxFrames: secondsToFrames(project.config.maximumSceneSeconds, fps),
    })),
    flexibleBudget,
  );

  let cursor = 0;
  const scenes: Scene[] = drafts.map((draft) => {
    const durationInFrames = draft.fixedDuration
      ? (draft.requestedFrames as number)
      : (allocated.get(draft.id) as number);
    const scene: Scene = {
      id: draft.id,
      type: draft.type,
      ...(draft.chapterId ? { chapterId: draft.chapterId } : {}),
      startFrame: cursor,
      endFrame: cursor + durationInFrames,
      durationInFrames,
      layout: draft.layout,
      photos: draft.photos,
      ...(draft.transitionOut ? { transitionOut: draft.transitionOut } : {}),
      ...(draft.title ? { title: draft.title } : {}),
      ...(draft.subtitle ? { subtitle: draft.subtitle } : {}),
      ...(draft.caption ? { caption: draft.caption } : {}),
      ...(draft.dateLabel ? { dateLabel: draft.dateLabel } : {}),
      ...(draft.location ? { location: draft.location } : {}),
      seed: draft.seed,
      weight: draft.weight,
      fixedDuration: draft.fixedDuration,
      layers: draft.layers.map((layer) => ({ ...layer, toFrame: durationInFrames })),
      warnings: draft.warnings,
    };
    cursor += durationInFrames - (draft.transitionOut?.durationInFrames ?? 0);
    return scene;
  });
  if (cursor !== targetFrames) {
    throw new Error(`Erro interno de timeline: ${cursor} frames calculados, alvo ${targetFrames}.`);
  }
  synchronizeScenesToBeats(scenes, beatAnalysis, project);

  const chapterMap = new Map<string, MediaAsset[]>();
  for (const asset of assets) {
    const group = chapterMap.get(asset.chapterId) ?? [];
    group.push(asset);
    chapterMap.set(asset.chapterId, group);
  }
  const chapters = [...chapterMap.entries()].map(([id, chapterAssets]) => ({
    id,
    title: id.replace('chapter-', ''),
    subtitle: `${chapterAssets.length} memórias`,
    startDate: (chapterAssets[0] as MediaAsset).date,
    endDate: (chapterAssets.at(-1) as MediaAsset).date,
    assetIds: chapterAssets.map((asset) => asset.id),
  }));
  const tracks = project.config.music
    ? Array.isArray(project.config.music)
      ? project.config.music
      : [project.config.music]
    : [];
  return {
    version: 1,
    projectId: project.config.id,
    projectRoot: project.projectRoot,
    createdAt: new Date().toISOString(),
    configHash: stableHash(project.config),
    seed: project.config.seed,
    fps,
    width: project.config.width,
    height: project.config.height,
    targetFrames,
    totalFrames: targetFrames,
    theme: project.config.theme,
    title: project.config.title,
    subtitle: project.config.subtitle,
    closingMessage: project.config.closingMessage,
    safeArea: project.config.safeArea,
    assets,
    chapters,
    scenes,
    ...(beatAnalysis ? { beatAnalysis } : {}),
    audio: tracks.map((track) => ({
      file: track.file,
      startAtFrame: secondsToFrames(track.startAtSeconds, fps),
      volume: track.volume,
      fadeInFrames: secondsToFrames(track.fadeInSeconds, fps),
      fadeOutFrames: secondsToFrames(track.fadeOutSeconds, fps),
      loop: track.loop,
      normalizeLoudness: track.normalizeLoudness,
    })),
    ignoredFiles,
    warnings: analysisWarnings,
  };
};
