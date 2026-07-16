import { z } from 'zod';
import type { Scene, SlideshowManifest } from '../schemas/manifest.js';

const focusSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const frameSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.08).max(1),
    height: z.number().min(0.08).max(1),
  })
  .superRefine((frame, context) => {
    if (frame.x + frame.width > 1.000_001) {
      context.addIssue({ code: 'custom', path: ['width'], message: 'frame ultrapassa a largura' });
    }
    if (frame.y + frame.height > 1.000_001) {
      context.addIssue({ code: 'custom', path: ['height'], message: 'frame ultrapassa a altura' });
    }
  });

export const photoFramingEditSchema = z.object({
  focus: focusSchema.optional(),
  contentScale: z.number().min(0.5).max(4).optional(),
  fit: z.enum(['contain', 'cover']).optional(),
  rotation: z.number().min(-15).max(15).optional(),
  frame: frameSchema.optional(),
});

const sceneFramingEditSchema = z.object({
  sceneType: z.enum(['intro', 'photo', 'video', 'collage', 'chapter', 'outro']),
  assetIds: z.array(z.string()).min(1),
  photos: z.record(z.string(), photoFramingEditSchema),
});

export const manualEditsSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  scenes: z.record(z.string(), sceneFramingEditSchema),
});

export type PhotoFramingEdit = z.infer<typeof photoFramingEditSchema>;
export type ManualEdits = z.infer<typeof manualEditsSchema>;

export const emptyManualEdits = (projectId: string): ManualEdits => ({
  version: 1,
  projectId,
  scenes: {},
});

const sortedAssetIds = (scene: Scene): string =>
  scene.photos
    .map((photo) => photo.assetId)
    .sort()
    .join('\0');

const sceneSignature = (sceneType: Scene['type'], assetIds: string[]): string =>
  `${sceneType}:${[...assetIds].sort().join('\0')}`;

export const applyManualEdits = (
  manifest: SlideshowManifest,
  edits: ManualEdits,
): SlideshowManifest => {
  const editByAssets = new Map(
    Object.values(edits.scenes).map((sceneEdit) => [
      sceneSignature(sceneEdit.sceneType, sceneEdit.assetIds),
      sceneEdit,
    ]),
  );
  return {
    ...manifest,
    scenes: manifest.scenes.map((scene) => {
      const direct = edits.scenes[scene.id];
      const sceneEdit =
        direct &&
        direct.sceneType === scene.type &&
        [...direct.assetIds].sort().join('\0') === sortedAssetIds(scene)
          ? direct
          : editByAssets.get(
              sceneSignature(
                scene.type,
                scene.photos.map((photo) => photo.assetId),
              ),
            );
      if (!sceneEdit) return scene;
      return {
        ...scene,
        photos: scene.photos.map((photo) => {
          const edit = sceneEdit.photos[photo.assetId];
          if (!edit) return photo;
          return {
            ...photo,
            ...(edit.focus ? { focus: edit.focus } : {}),
            ...(edit.contentScale !== undefined ? { contentScale: edit.contentScale } : {}),
            ...(edit.fit ? { fit: edit.fit } : {}),
            ...(edit.rotation !== undefined ? { rotation: edit.rotation } : {}),
            ...(edit.frame ? { frame: edit.frame } : {}),
          };
        }),
      };
    }),
  };
};
