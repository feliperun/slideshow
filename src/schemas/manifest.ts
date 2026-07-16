import { z } from 'zod';
import { layoutSchema, movementTypeSchema, transitionTypeSchema } from './project';

export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  assetId: z.string().optional(),
  sceneId: z.string().optional(),
});

export const assetSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'video']),
  fileName: z.string(),
  sourcePath: z.string(),
  normalizedPath: z.string(),
  thumbnailPath: z.string(),
  backgroundPath: z.string(),
  date: z.string(),
  dateSource: z.enum([
    'manual',
    'exif-datetime-original',
    'exif-create-date',
    'video-creation-time',
    'filename',
    'file-created',
    'file-modified',
    'alphabetical',
  ]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: z.enum(['portrait', 'landscape', 'square']),
  aspectRatio: z.number().positive(),
  perceptualHash: z.string(),
  duplicateOf: z.string().optional(),
  groupId: z.string(),
  chapterId: z.string(),
  priority: z.number().positive(),
  caption: z.string().optional(),
  location: z.string().optional(),
  focus: z.object({ x: z.number(), y: z.number() }),
  hero: z.boolean(),
  allowCollage: z.boolean(),
  mediaDurationSeconds: z.number().positive().optional(),
  clipStartSeconds: z.number().nonnegative().optional(),
  clipDurationSeconds: z.number().positive().optional(),
  warnings: z.array(z.string()),
});

const movementSchema = z.object({
  type: movementTypeSchema,
  startScale: z.number().positive(),
  endScale: z.number().positive(),
  startX: z.number(),
  endX: z.number(),
  startY: z.number(),
  endY: z.number(),
});

const layerBaseSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  opacity: z.number().min(0).max(1),
  fromFrame: z.number().int().nonnegative(),
  toFrame: z.number().int().positive(),
  seed: z.string(),
});

export const layerSchema = z.discriminatedUnion('type', [
  layerBaseSchema.extend({ type: z.literal('background'), variant: z.string() }),
  layerBaseSchema.extend({ type: z.literal('image'), assetId: z.string() }),
  layerBaseSchema.extend({ type: z.literal('frame'), variant: z.string() }),
  layerBaseSchema.extend({ type: z.literal('decoration'), variant: z.string() }),
  layerBaseSchema.extend({ type: z.literal('text'), role: z.string(), text: z.string() }),
  layerBaseSchema.extend({ type: z.literal('texture'), variant: z.string() }),
  layerBaseSchema.extend({ type: z.literal('light'), variant: z.string() }),
  layerBaseSchema.extend({ type: z.literal('vignette'), intensity: z.number() }),
]);

export const scenePhotoSchema = z.object({
  assetId: z.string(),
  focus: z.object({ x: z.number(), y: z.number() }),
  rotation: z.number(),
  scale: z.number().positive(),
  movement: movementSchema,
});

export const sceneSchema = z.object({
  id: z.string(),
  type: z.enum(['intro', 'photo', 'video', 'collage', 'chapter', 'outro']),
  chapterId: z.string().optional(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
  layout: layoutSchema,
  photos: z.array(scenePhotoSchema),
  transitionOut: z
    .object({
      type: transitionTypeSchema,
      durationInFrames: z.number().int().nonnegative(),
      beatSynced: z.boolean().optional(),
      beatFrame: z.number().int().nonnegative().optional(),
    })
    .optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  caption: z.string().optional(),
  dateLabel: z.string().optional(),
  location: z.string().optional(),
  seed: z.string(),
  weight: z.number().positive(),
  fixedDuration: z.boolean(),
  beatAccent: z.boolean().optional(),
  layers: z.array(layerSchema),
  warnings: z.array(z.string()),
});

export const chapterManifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  assetIds: z.array(z.string()),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  projectRoot: z.string(),
  createdAt: z.string(),
  configHash: z.string(),
  seed: z.string(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  targetFrames: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  theme: z.string(),
  title: z.string(),
  subtitle: z.string(),
  closingMessage: z.string(),
  safeArea: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }),
  assets: z.array(assetSchema),
  chapters: z.array(chapterManifestSchema),
  scenes: z.array(sceneSchema),
  beatAnalysis: z
    .object({
      bpm: z.number().positive(),
      confidence: z.number().min(0).max(1),
      beatFrames: z.array(z.number().int().nonnegative()),
    })
    .optional(),
  audio: z.array(
    z.object({
      file: z.string(),
      startAtFrame: z.number().int().nonnegative(),
      volume: z.number(),
      fadeInFrames: z.number().int().nonnegative(),
      fadeOutFrames: z.number().int().nonnegative(),
      loop: z.boolean(),
      normalizeLoudness: z.boolean(),
    }),
  ),
  ignoredFiles: z.array(z.string()),
  warnings: z.array(warningSchema),
});

export type SlideshowManifest = z.infer<typeof manifestSchema>;
export type MediaAsset = z.infer<typeof assetSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneLayer = z.infer<typeof layerSchema>;
export type Warning = z.infer<typeof warningSchema>;
