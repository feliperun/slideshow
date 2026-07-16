import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeAudioBeats } from '../analysis/analyze-audio.js';
import { analyzeAssets } from '../analysis/analyze-assets.js';
import type { LoadedProject } from '../config/load-project.js';
import { manifestSchema, type SlideshowManifest } from '../schemas/manifest.js';
import { buildManifest } from '../timeline/builder.js';
import { writeJsonAtomic } from '../utils/files.js';
import { logger } from '../utils/logging.js';
import { buildJsonReport, buildMarkdownReport } from './report.js';

export const manifestFileFor = (project: LoadedProject): string =>
  path.join(project.projectRoot, 'output', 'project-manifest.json');

export const generateManifest = async (project: LoadedProject): Promise<SlideshowManifest> => {
  logger.info('analyze', 'analisando fotos e vídeos');
  const analysis = await analyzeAssets(project);
  logger.info(
    'metadata',
    `${analysis.assets.length} assets incluídos (${analysis.cacheHits} recuperados do cache)`,
  );
  const primaryTrack = project.config.music
    ? Array.isArray(project.config.music)
      ? project.config.music[0]
      : project.config.music
    : undefined;
  const beatAnalysis = primaryTrack
    ? await analyzeAudioBeats(
        path.resolve(project.projectRoot, primaryTrack.file),
        project.config.fps,
        project.config.targetDurationSeconds,
      )
    : undefined;
  if (beatAnalysis) {
    logger.info(
      'beats',
      `${beatAnalysis.bpm.toFixed(1)} BPM; grade com ${beatAnalysis.beatFrames.length} beats`,
    );
  }
  const manifest = buildManifest(
    project,
    analysis.assets,
    analysis.ignoredFiles,
    analysis.warnings,
    beatAnalysis,
  );
  const validated = manifestSchema.parse(manifest);
  const outputDirectory = path.join(project.projectRoot, 'output');
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonAtomic(manifestFileFor(project), validated);
  await writeJsonAtomic(
    path.join(outputDirectory, 'composition-report.json'),
    buildJsonReport(validated, project),
  );
  await writeFile(
    path.join(outputDirectory, 'composition-report.md'),
    buildMarkdownReport(validated, project),
    'utf8',
  );
  logger.info('timeline', `${validated.scenes.length} cenas, ${validated.totalFrames} frames`);
  logger.info('manifest', `salvo em ${manifestFileFor(project)}`);
  return validated;
};
