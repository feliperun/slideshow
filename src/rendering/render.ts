import { execFile, spawn } from 'node:child_process';
import { access, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import type { LoadedProject } from '../config/load-project.js';
import type { SlideshowManifest } from '../schemas/manifest.js';
import { writeJsonAtomic } from '../utils/files.js';
import { framesToSeconds } from '../utils/frames.js';
import { logger } from '../utils/logging.js';
import { stableHash } from '../utils/seeded-random.js';

const execFileAsync = promisify(execFile);
const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const remotionEntryPoint = path.join(applicationRoot, 'src', 'remotion', 'index.ts');
const browserTimeout = 300_000;
const browserOptions = {
  chromeMode: 'headless-shell' as const,
  chromiumOptions: { ignoreCertificateErrors: true, gl: 'swiftshader' as const },
};

const bundleProject = async (project: LoadedProject): Promise<string> =>
  bundle({
    entryPoint: remotionEntryPoint,
    publicDir: project.projectRoot,
    symlinkPublicDir: true,
    onProgress: (progress) => {
      if (progress % 25 === 0) logger.info('bundle', `${progress}%`);
    },
  });

const addAudio = async (
  silentVideo: string,
  outputFile: string,
  project: LoadedProject,
  manifest: SlideshowManifest,
): Promise<void> => {
  const duration = framesToSeconds(manifest.totalFrames, manifest.fps);
  if (manifest.audio.length === 0) {
    await rename(silentVideo, outputFile);
    return;
  }
  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y', '-i', silentVideo];
  for (const track of manifest.audio) {
    if (track.loop) args.push('-stream_loop', '-1');
    args.push('-i', path.resolve(project.projectRoot, track.file));
  }
  const filters: string[] = [];
  const labels: string[] = [];
  manifest.audio.forEach((track, index) => {
    const start = framesToSeconds(track.startAtFrame, manifest.fps);
    const available = Math.max(0.01, duration - start);
    const fadeIn = framesToSeconds(track.fadeInFrames, manifest.fps);
    const fadeOut = Math.min(available, framesToSeconds(track.fadeOutFrames, manifest.fps));
    const outStart = Math.max(0, available - fadeOut);
    const label = `track${index}`;
    const chain = [
      `[${index + 1}:a]atrim=0:${available.toFixed(6)}`,
      'asetpts=PTS-STARTPTS',
      start > 0 ? `adelay=${Math.round(start * 1000)}:all=1` : '',
      `volume=${track.volume}`,
      fadeIn > 0 ? `afade=t=in:st=0:d=${fadeIn.toFixed(6)}` : '',
      fadeOut > 0 ? `afade=t=out:st=${outStart.toFixed(6)}:d=${fadeOut.toFixed(6)}` : '',
      track.normalizeLoudness ? 'loudnorm=I=-16:TP=-1.5:LRA=11' : '',
      'alimiter=limit=0.95',
    ].filter(Boolean);
    filters.push(`${chain.join(',')}[${label}]`);
    labels.push(`[${label}]`);
  });
  const audioOutput = manifest.audio.length > 1 ? 'mixed' : 'track0';
  if (manifest.audio.length > 1) {
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[mixed]`,
    );
  }
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v:0',
    '-map',
    `[${audioOutput}]`,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '256k',
    '-ar',
    '48000',
    '-pix_fmt',
    'yuv420p',
    '-color_range',
    'tv',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-metadata',
    `title=${manifest.title} — ${manifest.subtitle}`,
    '-t',
    duration.toFixed(6),
    outputFile,
  );
  await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
  await rm(silentVideo, { force: true });
};

export const renderSlideshow = async (
  project: LoadedProject,
  manifest: SlideshowManifest,
  outputOverride?: string,
): Promise<string> => {
  const outputFile = path.resolve(
    project.projectRoot,
    outputOverride ?? project.config.output.file,
  );
  await mkdir(path.dirname(outputFile), { recursive: true });
  const silentVideo = path.join(
    path.dirname(outputFile),
    `.${path.basename(outputFile)}.silent.mp4`,
  );
  logger.info('render', 'preparando bundle Remotion');
  const serveUrl = await bundleProject(project);
  const composition = await selectComposition({
    serveUrl,
    id: 'Slideshow',
    inputProps: manifest,
    ...browserOptions,
    timeoutInMilliseconds: browserTimeout,
  });
  const chunkFrames = manifest.fps * 15;
  const renderFingerprint = stableHash({
    rendererVersion: 11,
    totalFrames: manifest.totalFrames,
    theme: manifest.theme,
    scenes: manifest.scenes,
    assets: manifest.assets.map((asset) => ({
      id: asset.id,
      normalizedPath: asset.normalizedPath,
      backgroundPath: asset.backgroundPath,
    })),
  });
  const chunkDirectory = path.join(
    project.projectRoot,
    '.slideshow-cache',
    'render-chunks',
    renderFingerprint,
  );
  await mkdir(chunkDirectory, { recursive: true });
  const chunks: string[] = [];
  let lastProgress = -5;
  for (let start = 0, chunkIndex = 0; start < manifest.totalFrames; chunkIndex += 1) {
    const end = Math.min(manifest.totalFrames - 1, start + chunkFrames - 1);
    const warmupFrames = start === 0 ? 0 : manifest.fps;
    const renderStart = Math.max(0, start - warmupFrames);
    const chunkFile = path.join(
      chunkDirectory,
      `chunk-${chunkIndex.toString().padStart(3, '0')}-${start}-${end}.mp4`,
    );
    const rawChunkFile = path.join(
      chunkDirectory,
      `.raw-${chunkIndex.toString().padStart(3, '0')}-${renderStart}-${end}.mp4`,
    );
    chunks.push(chunkFile);
    try {
      await access(chunkFile);
      logger.info(
        'render',
        `reutilizando bloco ${chunkIndex + 1}/${Math.ceil(manifest.totalFrames / chunkFrames)}`,
      );
    } catch {
      const segmentFrames = end - start + 1;
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        imageFormat: 'jpeg',
        jpegQuality: project.config.output.quality === 'high' ? 92 : 82,
        crf: project.config.output.quality === 'high' ? 17 : 22,
        x264Preset: 'medium',
        concurrency: 1,
        offthreadVideoThreads: 1,
        frameRange: [renderStart, end],
        outputLocation: rawChunkFile,
        inputProps: manifest,
        muted: true,
        overwrite: true,
        ...browserOptions,
        timeoutInMilliseconds: browserTimeout,
        onProgress: ({ progress }) => {
          const percentage = Math.floor(
            ((start + progress * segmentFrames) / manifest.totalFrames) * 100,
          );
          if (percentage >= lastProgress + 5) {
            lastProgress = percentage;
            logger.info('render', `${percentage}%`);
          }
        },
      });
      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          rawChunkFile,
          '-vf',
          `trim=start_frame=${warmupFrames}:end_frame=${warmupFrames + segmentFrames},setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv,format=yuv420p`,
          '-an',
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          '-r',
          manifest.fps.toString(),
          '-pix_fmt',
          'yuv420p',
          '-color_range',
          'tv',
          '-colorspace',
          'bt709',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          chunkFile,
        ],
        { maxBuffer: 20 * 1024 * 1024 },
      );
      await rm(rawChunkFile, { force: true });
    }
    start = end + 1;
  }
  const concatInputs = chunks.flatMap((file) => ['-i', file]);
  const concatFilter =
    `${chunks.map((_, index) => `[${index}:v:0]`).join('')}` +
    `concat=n=${chunks.length}:v=1:a=0,fps=${manifest.fps},` +
    `setpts=N/(${manifest.fps}*TB),format=yuv420p[v]`;
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...concatInputs,
      '-filter_complex',
      concatFilter,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-color_range',
      'tv',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-movflags',
      '+faststart',
      silentVideo,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  logger.info('ffmpeg', 'adicionando trilha, fades e limiter');
  await addAudio(silentVideo, outputFile, project, manifest);
  logger.info('render', `vídeo final salvo em ${outputFile}`);
  return outputFile;
};

export const renderThumbnail = async (
  project: LoadedProject,
  manifest: SlideshowManifest,
  frame = Math.min(manifest.totalFrames - 1, Math.round(manifest.fps * 3)),
  fileName = 'thumbnail.jpg',
): Promise<string> => {
  const outputFile = path.join(project.projectRoot, 'output', fileName);
  const serveUrl = await bundleProject(project);
  const composition = await selectComposition({
    serveUrl,
    id: 'Slideshow',
    inputProps: manifest,
    ...browserOptions,
    timeoutInMilliseconds: browserTimeout,
  });
  await renderStill({
    composition,
    serveUrl,
    output: outputFile,
    inputProps: manifest,
    frame,
    imageFormat: 'jpeg',
    jpegQuality: 92,
    ...browserOptions,
    timeoutInMilliseconds: browserTimeout,
  });
  return outputFile;
};

export const copyPreview = async (source: string, destination: string): Promise<void> => {
  await access(source);
  await copyFile(source, destination);
};

export const launchStudio = async (
  project: LoadedProject,
  manifest: SlideshowManifest,
): Promise<number | null> => {
  const manifestFile = path.join(project.projectRoot, 'output', '.preview-manifest.json');
  await writeJsonAtomic(manifestFile, manifest);
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'remotion',
        'studio',
        remotionEntryPoint,
        '--props',
        manifestFile,
        '--public-dir',
        project.projectRoot,
      ],
      { cwd: applicationRoot, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', resolve);
  });
};
