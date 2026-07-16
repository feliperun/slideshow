import { z } from 'zod';

export const layoutSchema = z.enum([
  'single-portrait',
  'single-landscape',
  'square-editorial',
  'polaroid',
  'photo-stack',
  'split-screen',
  'collage',
  'hero',
  'timeline-strip',
  'album-page',
  'video-editorial',
]);

export const transitionTypeSchema = z.enum([
  'cross-dissolve',
  'fade-color',
  'fade-black',
  'slide',
  'wipe',
  'zoom-through',
  'photo-stack',
  'light-leak',
  'film-burn',
  'camera-flash',
  'page-turn',
  'album-turn',
  'geometric-mask',
  'blur-dissolve',
  'shared-motion',
]);

export const movementTypeSchema = z.enum([
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'zoom-to-focus',
  'diagonal',
  'still',
]);

const focusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const photoOverrideSchema = z.object({
  date: z.iso
    .datetime({ offset: true })
    .or(z.iso.datetime({ local: true }))
    .optional(),
  order: z.number().int().optional(),
  caption: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  people: z.array(z.string().max(100)).optional(),
  priority: z.number().positive().max(10).default(1),
  sceneType: z.enum(['photo', 'collage', 'hero', 'video']).optional(),
  layout: layoutSchema.optional(),
  fit: z
    .enum(['contain', 'cover', 'smart-cover', 'blur-background', 'full-frame', 'manual'])
    .optional(),
  focus: focusSchema.optional(),
  rotation: z.number().min(-15).max(15).optional(),
  scale: z.number().min(0.5).max(2).optional(),
  chapter: z.string().max(100).optional(),
  include: z.boolean().default(true),
  fixedDurationSeconds: z.number().positive().max(60).optional(),
  movement: movementTypeSchema.optional(),
  transition: transitionTypeSchema.optional(),
  hero: z.boolean().default(false),
  allowCollage: z.boolean().default(true),
  videoStartSeconds: z.number().nonnegative().optional(),
  videoEndSeconds: z.number().positive().optional(),
});

export const musicTrackSchema = z.object({
  file: z.string().min(1),
  startAtSeconds: z.number().nonnegative().default(0),
  volume: z.number().min(0).max(2).default(0.7),
  fadeInSeconds: z.number().nonnegative().default(2),
  fadeOutSeconds: z.number().nonnegative().default(4),
  loop: z.boolean().default(false),
  normalizeLoudness: z.boolean().default(false),
});

const chapterSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: z.enum(['year', 'month', 'day', 'interval', 'manual']).default('year'),
  minimumPhotos: z.number().int().min(1).default(3),
});

const safeAreaSchema = z.object({
  top: z.number().min(0).max(0.25).default(0.05),
  right: z.number().min(0).max(0.25).default(0.05),
  bottom: z.number().min(0).max(0.25).default(0.07),
  left: z.number().min(0).max(0.25).default(0.05),
});

export const projectConfigSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(180).default(''),
    closingMessage: z.string().max(500).default('Obrigado por fazer parte desta história.'),
    photosDirectory: z.string().min(1).default('photos'),
    targetDurationSeconds: z.number().positive().max(3600),
    fps: z.number().int().min(1).max(60).default(30),
    width: z.number().int().min(320).max(7680).default(1920),
    height: z.number().int().min(240).max(4320).default(1080),
    theme: z
      .enum([
        'warm-memory',
        'clean-cinematic',
        'playful-celebration',
        'elegant-event',
        'travel-journal',
      ])
      .default('warm-memory'),
    seed: z.string().min(1),
    chronologicalOrder: z.boolean().default(true),
    music: z.union([musicTrackSchema, z.array(musicTrackSchema).min(1)]).optional(),
    introDurationSeconds: z.number().min(1).max(30).default(5),
    outroDurationSeconds: z.number().min(1).max(60).default(6),
    defaultTransitionSeconds: z.number().min(0).max(2).default(0.8),
    minimumSceneSeconds: z.number().positive().default(2.2),
    idealSceneSeconds: z.number().positive().default(3.8),
    maximumSceneSeconds: z.number().positive().default(6),
    allowCollages: z.boolean().default(true),
    allowPhotoRemoval: z.boolean().default(false),
    showDates: z.boolean().default(true),
    showLocations: z.boolean().default(false),
    showCaptions: z.boolean().default(true),
    chapters: chapterSchema.default({ enabled: true, strategy: 'year', minimumPhotos: 3 }),
    safeArea: safeAreaSchema.default({ top: 0.05, right: 0.05, bottom: 0.07, left: 0.05 }),
    output: z
      .object({
        file: z.string().min(1),
        codec: z.literal('h264').default('h264'),
        audioCodec: z.literal('aac').default('aac'),
        quality: z.enum(['preview', 'medium', 'high']).default('high'),
      })
      .default({
        file: 'output/slideshow-final.mp4',
        codec: 'h264',
        audioCodec: 'aac',
        quality: 'high',
      }),
    photos: z.record(z.string(), photoOverrideSchema).default({}),
  })
  .superRefine((config, context) => {
    if (config.minimumSceneSeconds > config.idealSceneSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['minimumSceneSeconds'],
        message: 'minimumSceneSeconds não pode ser maior que idealSceneSeconds',
      });
    }
    if (config.idealSceneSeconds > config.maximumSceneSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['idealSceneSeconds'],
        message: 'idealSceneSeconds não pode ser maior que maximumSceneSeconds',
      });
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type PhotoOverride = z.infer<typeof photoOverrideSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type TransitionType = z.infer<typeof transitionTypeSchema>;
export type MovementType = z.infer<typeof movementTypeSchema>;
export type ThemeName = ProjectConfig['theme'];
