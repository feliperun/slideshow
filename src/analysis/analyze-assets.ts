import { access, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import ExifReader from 'exifreader';
import sharp from 'sharp';
import type { LoadedProject } from '../config/load-project.js';
import type { MediaAsset, Warning } from '../schemas/manifest.js';
import type { PhotoOverride } from '../schemas/project.js';
import { readJson, toPosixPath, writeJsonAtomic } from '../utils/files.js';
import { deterministicId, stableHash } from '../utils/seeded-random.js';
import { resolveAssetDate } from './dates.js';
import { hammingDistance, perceptualHash } from './hash.js';
import { probeVideo, runFfmpeg } from './probe-video.js';

const PIPELINE_VERSION = 1;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.m4v', '.webm']);

type AnalyzeResult = {
  assets: MediaAsset[];
  ignoredFiles: string[];
  warnings: Warning[];
  cacheHits: number;
};

const tagDescription = (tags: Record<string, unknown>, name: string): unknown => {
  const tag = tags[name];
  if (!tag || typeof tag !== 'object') return undefined;
  if ('description' in tag) return (tag as { description?: unknown }).description;
  if ('value' in tag) return (tag as { value?: unknown }).value;
  return undefined;
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const orientationOf = (width: number, height: number): MediaAsset['orientation'] => {
  const ratio = width / height;
  if (ratio > 1.08) return 'landscape';
  if (ratio < 0.92) return 'portrait';
  return 'square';
};

const chooseVideoClip = (
  duration: number,
  override: PhotoOverride | undefined,
): { start: number; duration: number } => {
  const requestedStart = override?.videoStartSeconds;
  const requestedEnd = override?.videoEndSeconds;
  if (requestedStart !== undefined || requestedEnd !== undefined) {
    const start = Math.min(Math.max(0, requestedStart ?? 0), Math.max(0, duration - 0.5));
    const end = Math.min(duration, requestedEnd ?? Math.min(duration, start + 4.5));
    if (end <= start) throw new Error('videoEndSeconds deve ser maior que videoStartSeconds');
    return { start, duration: end - start };
  }
  const clipDuration = Math.min(duration, Math.max(2.8, Math.min(4.6, duration * 0.45)));
  const start = Math.min(Math.max(0, duration * 0.22), Math.max(0, duration - clipDuration));
  return { start, duration: clipDuration };
};

const analyzeImage = async (
  absoluteFile: string,
  fileName: string,
  override: PhotoOverride | undefined,
  project: LoadedProject,
  cacheDirectory: string,
  cacheKey: string,
): Promise<MediaAsset> => {
  const warnings: string[] = [];
  let tags: Record<string, unknown> = {};
  try {
    tags = (await ExifReader.load(absoluteFile)) as Record<string, unknown>;
  } catch (error) {
    warnings.push(
      `EXIF não pôde ser lido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const fileStats = await stat(absoluteFile);
  const resolvedDate = resolveAssetDate({
    fileName,
    ...(override ? { override } : {}),
    exifOriginal: tagDescription(tags, 'DateTimeOriginal'),
    exifCreate: tagDescription(tags, 'CreateDate') ?? tagDescription(tags, 'DateTimeDigitized'),
    stats: fileStats,
  });
  if (resolvedDate.warning) warnings.push(resolvedDate.warning);

  await mkdir(cacheDirectory, { recursive: true });
  const normalizedFile = path.join(cacheDirectory, 'normalized.jpg');
  const thumbnailFile = path.join(cacheDirectory, 'thumbnail.jpg');
  const backgroundFile = path.join(cacheDirectory, 'background.jpg');
  const info = await sharp(absoluteFile)
    .rotate()
    .resize(2560, 1440, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(normalizedFile);
  await sharp(normalizedFile)
    .resize(480, 320, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(thumbnailFile);
  await sharp(normalizedFile)
    .resize(project.config.width, project.config.height, { fit: 'cover' })
    .blur(32)
    .modulate({ brightness: 0.78, saturation: 1.08 })
    .jpeg({ quality: 76 })
    .toFile(backgroundFile);
  if (info.width < 960 || info.height < 720) warnings.push('Imagem pequena para saída Full HD.');

  const id = deterministicId(
    'asset',
    toPosixPath(path.relative(project.projectRoot, absoluteFile)),
  );
  const asset: MediaAsset = {
    id,
    type: 'image',
    fileName,
    sourcePath: toPosixPath(path.relative(project.projectRoot, absoluteFile)),
    normalizedPath: toPosixPath(path.relative(project.projectRoot, normalizedFile)),
    thumbnailPath: toPosixPath(path.relative(project.projectRoot, thumbnailFile)),
    backgroundPath: toPosixPath(path.relative(project.projectRoot, backgroundFile)),
    date: resolvedDate.date.toISOString(),
    dateSource: resolvedDate.source,
    width: info.width,
    height: info.height,
    orientation: orientationOf(info.width, info.height),
    aspectRatio: info.width / info.height,
    perceptualHash: await perceptualHash(thumbnailFile),
    groupId: '',
    chapterId: '',
    priority: override?.priority ?? 1,
    ...(override?.caption ? { caption: override.caption } : {}),
    ...(override?.location ? { location: override.location } : {}),
    focus: override?.focus ?? { x: 0.5, y: 0.5 },
    hero: override?.hero ?? false,
    allowCollage: override?.allowCollage ?? true,
    warnings,
  };
  await writeJsonAtomic(path.join(cacheDirectory, 'analysis.json'), { cacheKey, asset });
  return asset;
};

const analyzeVideo = async (
  absoluteFile: string,
  fileName: string,
  override: PhotoOverride | undefined,
  project: LoadedProject,
  cacheDirectory: string,
  cacheKey: string,
): Promise<MediaAsset> => {
  const warnings: string[] = [];
  const fileStats = await stat(absoluteFile);
  const probe = await probeVideo(absoluteFile);
  const clip = chooseVideoClip(probe.durationSeconds, override);
  const resolvedDate = resolveAssetDate({
    fileName,
    ...(override ? { override } : {}),
    ...(probe.creationTime ? { videoCreationTime: probe.creationTime } : {}),
    stats: fileStats,
  });
  if (resolvedDate.warning) warnings.push(resolvedDate.warning);

  await mkdir(cacheDirectory, { recursive: true });
  const normalizedFile = path.join(cacheDirectory, 'normalized.mp4');
  const thumbnailFile = path.join(cacheDirectory, 'thumbnail.jpg');
  const backgroundFile = path.join(cacheDirectory, 'background.jpg');
  await runFfmpeg([
    '-ss',
    clip.start.toFixed(3),
    '-i',
    absoluteFile,
    '-t',
    clip.duration.toFixed(3),
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    normalizedFile,
  ]);
  await runFfmpeg([
    '-ss',
    Math.min(probe.durationSeconds - 0.1, clip.start + clip.duration * 0.35).toFixed(3),
    '-i',
    absoluteFile,
    '-frames:v',
    '1',
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease',
    thumbnailFile,
  ]);
  await sharp(thumbnailFile)
    .resize(project.config.width, project.config.height, { fit: 'cover' })
    .blur(32)
    .modulate({ brightness: 0.72, saturation: 1.12 })
    .jpeg({ quality: 76 })
    .toFile(backgroundFile);
  const normalizedMetadata = await probeVideo(normalizedFile);
  const id = deterministicId(
    'asset',
    toPosixPath(path.relative(project.projectRoot, absoluteFile)),
  );
  const asset: MediaAsset = {
    id,
    type: 'video',
    fileName,
    sourcePath: toPosixPath(path.relative(project.projectRoot, absoluteFile)),
    normalizedPath: toPosixPath(path.relative(project.projectRoot, normalizedFile)),
    thumbnailPath: toPosixPath(path.relative(project.projectRoot, thumbnailFile)),
    backgroundPath: toPosixPath(path.relative(project.projectRoot, backgroundFile)),
    date: resolvedDate.date.toISOString(),
    dateSource: resolvedDate.source,
    width: normalizedMetadata.width,
    height: normalizedMetadata.height,
    orientation: orientationOf(normalizedMetadata.width, normalizedMetadata.height),
    aspectRatio: normalizedMetadata.width / normalizedMetadata.height,
    perceptualHash: await perceptualHash(thumbnailFile),
    groupId: '',
    chapterId: '',
    priority: Math.max(1.35, override?.priority ?? 1),
    ...(override?.caption ? { caption: override.caption } : {}),
    ...(override?.location ? { location: override.location } : {}),
    focus: override?.focus ?? { x: 0.5, y: 0.5 },
    hero: override?.hero ?? false,
    allowCollage: false,
    mediaDurationSeconds: probe.durationSeconds,
    clipStartSeconds: clip.start,
    clipDurationSeconds: clip.duration,
    warnings,
  };
  await writeJsonAtomic(path.join(cacheDirectory, 'analysis.json'), { cacheKey, asset });
  return asset;
};

const mapConcurrent = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
};

export const analyzeAssets = async (project: LoadedProject): Promise<AnalyzeResult> => {
  const sourceDirectory = path.resolve(project.projectRoot, project.config.photosDirectory);
  const directoryEntries = await readdir(sourceDirectory, { withFileTypes: true });
  const configuredAudio = new Set(
    (project.config.music
      ? Array.isArray(project.config.music)
        ? project.config.music
        : [project.config.music]
      : []
    ).map((track) => path.resolve(project.projectRoot, track.file)),
  );
  const candidates: Array<{ fileName: string; type: 'image' | 'video' }> = [];
  const ignoredFiles: string[] = [];
  for (const entry of [...directoryEntries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const absoluteFile = path.join(sourceDirectory, entry.name);
    if (configuredAudio.has(absoluteFile)) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) candidates.push({ fileName: entry.name, type: 'image' });
    else if (VIDEO_EXTENSIONS.has(extension))
      candidates.push({ fileName: entry.name, type: 'video' });
    else if (!entry.name.startsWith('.')) ignoredFiles.push(entry.name);
  }
  if (candidates.length === 0)
    throw new Error(`Nenhuma foto ou vídeo encontrado em ${sourceDirectory}`);

  let cacheHits = 0;
  const analyzed = await mapConcurrent(candidates, 4, async (candidate) => {
    const absoluteFile = path.join(sourceDirectory, candidate.fileName);
    const fileStats = await stat(absoluteFile);
    const cacheKey = stableHash({
      pipeline: PIPELINE_VERSION,
      file: absoluteFile,
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
      width: project.config.width,
      height: project.config.height,
      override: project.config.photos[candidate.fileName] ?? null,
    });
    const id = deterministicId(
      'asset',
      toPosixPath(path.relative(project.projectRoot, absoluteFile)),
    );
    const cacheDirectory = path.join(project.projectRoot, '.slideshow-cache', 'assets', id);
    const analysisFile = path.join(cacheDirectory, 'analysis.json');
    if (await exists(analysisFile)) {
      const cached = await readJson<{ cacheKey: string; asset: MediaAsset }>(analysisFile);
      if (
        cached.cacheKey === cacheKey &&
        (await exists(path.resolve(project.projectRoot, cached.asset.normalizedPath))) &&
        (await exists(path.resolve(project.projectRoot, cached.asset.thumbnailPath))) &&
        (await exists(path.resolve(project.projectRoot, cached.asset.backgroundPath)))
      ) {
        cacheHits += 1;
        return cached.asset;
      }
    }
    const override = project.config.photos[candidate.fileName];
    if (candidate.type === 'image') {
      return analyzeImage(
        absoluteFile,
        candidate.fileName,
        override,
        project,
        cacheDirectory,
        cacheKey,
      );
    }
    return analyzeVideo(
      absoluteFile,
      candidate.fileName,
      override,
      project,
      cacheDirectory,
      cacheKey,
    );
  });

  const included = analyzed.filter(
    (asset) => project.config.photos[asset.fileName]?.include !== false,
  );
  included.sort((left, right) => {
    const leftOrder = project.config.photos[left.fileName]?.order;
    const rightOrder = project.config.photos[right.fileName]?.order;
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    const dateDifference = new Date(left.date).getTime() - new Date(right.date).getTime();
    return dateDifference || left.fileName.localeCompare(right.fileName);
  });

  const warnings: Warning[] = [];
  for (let index = 0; index < included.length; index++) {
    const asset = included[index] as MediaAsset;
    for (let previous = 0; previous < index; previous++) {
      const candidate = included[previous] as MediaAsset;
      if (hammingDistance(asset.perceptualHash, candidate.perceptualHash) <= 3) {
        asset.duplicateOf = candidate.id;
        asset.warnings.push(`Possível duplicata de ${candidate.fileName}.`);
        break;
      }
    }
    const previous = included[index - 1];
    const gap = previous
      ? new Date(asset.date).getTime() - new Date(previous.date).getTime()
      : Number.POSITIVE_INFINITY;
    asset.groupId =
      previous && gap >= 0 && gap <= 20 * 60_000
        ? previous.groupId
        : `group-${new Date(asset.date).toISOString().slice(0, 10)}-${index.toString().padStart(3, '0')}`;
    const overrideChapter = project.config.photos[asset.fileName]?.chapter;
    asset.chapterId = overrideChapter
      ? `chapter-${overrideChapter.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : `chapter-${new Date(asset.date).getFullYear()}`;
    asset.warnings.forEach((message) =>
      warnings.push({ code: 'asset-warning', message, assetId: asset.id }),
    );
  }

  return { assets: included, ignoredFiles, warnings, cacheHits };
};
