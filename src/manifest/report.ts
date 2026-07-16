import type { LoadedProject } from '../config/load-project.js';
import type { SlideshowManifest } from '../schemas/manifest.js';
import { framesToSeconds } from '../utils/frames.js';

export const buildJsonReport = (manifest: SlideshowManifest, project: LoadedProject) => {
  const imageAssets = manifest.assets.filter((asset) => asset.type === 'image');
  const videoAssets = manifest.assets.filter((asset) => asset.type === 'video');
  const manuallyExcluded = Object.entries(project.config.photos)
    .filter(([, override]) => override.include === false)
    .map(([file]) => file);
  return {
    project: {
      id: manifest.projectId,
      title: manifest.title,
      theme: manifest.theme,
      seed: manifest.seed,
      resolution: `${manifest.width}x${manifest.height}`,
      fps: manifest.fps,
    },
    summary: {
      originalMediaCount: manifest.assets.length + manuallyExcluded.length,
      includedPhotos: imageAssets.length,
      includedVideos: videoAssets.length,
      manuallyExcluded: manuallyExcluded.length,
      manuallyExcludedFiles: manuallyExcluded,
      automaticallyRemoved: 0,
      scenes: manifest.scenes.length,
      collages: manifest.scenes.filter((scene) => scene.type === 'collage').length,
      videoScenes: manifest.scenes.filter((scene) => scene.type === 'video').length,
      chapters: manifest.chapters.length,
      targetFrames: manifest.targetFrames,
      totalFrames: manifest.totalFrames,
      targetDurationSeconds: framesToSeconds(manifest.targetFrames, manifest.fps),
      calculatedDurationSeconds: framesToSeconds(manifest.totalFrames, manifest.fps),
      differenceFrames: manifest.totalFrames - manifest.targetFrames,
      averageSceneSeconds:
        framesToSeconds(manifest.totalFrames, manifest.fps) / manifest.scenes.length,
    },
    assets: manifest.assets.map((asset) => ({
      file: asset.fileName,
      type: asset.type,
      adoptedDate: asset.date,
      dateSource: asset.dateSource,
      orientation: asset.orientation,
      width: asset.width,
      height: asset.height,
      aspectRatio: Number(asset.aspectRatio.toFixed(4)),
      chapter: asset.chapterId,
      priority: asset.priority,
      duplicateOf: asset.duplicateOf ?? null,
      group: asset.groupId,
      videoSourceDurationSeconds: asset.mediaDurationSeconds ?? null,
      videoClipStartSeconds: asset.clipStartSeconds ?? null,
      videoClipDurationSeconds: asset.clipDurationSeconds ?? null,
      warnings: asset.warnings,
    })),
    scenes: manifest.scenes.map((scene) => ({
      id: scene.id,
      type: scene.type,
      layout: scene.layout,
      files: scene.photos.map(
        (photo) =>
          manifest.assets.find((asset) => asset.id === photo.assetId)?.fileName ?? photo.assetId,
      ),
      startFrame: scene.startFrame,
      durationInFrames: scene.durationInFrames,
      durationSeconds: framesToSeconds(scene.durationInFrames, manifest.fps),
      transition: scene.transitionOut ?? null,
      chapter: scene.chapterId ?? null,
      warnings: scene.warnings,
    })),
    warnings: manifest.warnings,
    ignoredFiles: manifest.ignoredFiles,
  };
};

export const buildMarkdownReport = (
  manifest: SlideshowManifest,
  project: LoadedProject,
): string => {
  const report = buildJsonReport(manifest, project);
  const lines = [
    `# Relatório — ${manifest.title}`,
    '',
    '## Resumo',
    '',
    `- Duração: **${report.summary.calculatedDurationSeconds.toFixed(3)} s** (${manifest.totalFrames} frames a ${manifest.fps} fps)`,
    `- Diferença para o alvo: **${report.summary.differenceFrames} frame(s)**`,
    `- Fotos incluídas: **${report.summary.includedPhotos}**`,
    `- Vídeos incluídos: **${report.summary.includedVideos}**`,
    `- Cenas: **${report.summary.scenes}** (${report.summary.collages} colagens, ${report.summary.videoScenes} trechos de vídeo)`,
    `- Capítulos: **${report.summary.chapters}**`,
    `- Remoções automáticas: **0**`,
    '',
    '## Ordem cronológica dos assets',
    '',
    '| # | Arquivo | Tipo | Data adotada | Fonte | Orientação | Capítulo | Trecho | Warnings |',
    '|---:|---|---|---|---|---|---|---|---|',
    ...report.assets.map(
      (asset, index) =>
        `| ${index + 1} | ${asset.file.replaceAll('|', '\\|')} | ${asset.type} | ${asset.adoptedDate} | ${asset.dateSource} | ${asset.orientation} (${asset.width}×${asset.height}) | ${asset.chapter} | ${asset.videoClipDurationSeconds ? `${asset.videoClipStartSeconds?.toFixed(2)}s + ${asset.videoClipDurationSeconds.toFixed(2)}s` : '—'} | ${asset.warnings.join('; ').replaceAll('|', '\\|') || '—'} |`,
    ),
    '',
    '## Cenas',
    '',
    '| Cena | Layout | Arquivos | Início | Duração | Transição |',
    '|---|---|---|---:|---:|---|',
    ...report.scenes.map(
      (scene) =>
        `| ${scene.id} | ${scene.layout} | ${scene.files.join(', ').replaceAll('|', '\\|')} | ${scene.startFrame} | ${scene.durationSeconds.toFixed(3)}s | ${scene.transition ? `${scene.transition.type} (${scene.transition.durationInFrames}f)` : '—'} |`,
    ),
    '',
    '## Warnings globais',
    '',
    ...(manifest.warnings.length
      ? manifest.warnings.map((warning) => `- ${warning.message}`)
      : ['Nenhum warning global.']),
    '',
  ];
  return `${lines.join('\n')}\n`;
};
