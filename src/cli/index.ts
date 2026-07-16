#!/usr/bin/env node
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { loadProject } from '../config/load-project.js';
import { generateManifest, manifestFileFor } from '../manifest/generate.js';
import { manifestSchema, type SlideshowManifest } from '../schemas/manifest.js';
import { launchStudio, renderSlideshow, renderThumbnail } from '../rendering/render.js';
import { logger } from '../utils/logging.js';

const program = new Command();
program.name('slideshow').description('Compilador determinístico de slideshows').version('0.1.0');

const projectOption = (command: Command): Command =>
  command.option('-p, --project <file>', 'arquivo project.json', './project.json');

const readManifest = async (file: string): Promise<SlideshowManifest> =>
  manifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));

const loadOrGenerateManifest = async (
  projectFile: string,
  rebuild: boolean,
): Promise<{ project: Awaited<ReturnType<typeof loadProject>>; manifest: SlideshowManifest }> => {
  const project = await loadProject(projectFile);
  const file = manifestFileFor(project);
  if (!rebuild) {
    try {
      await access(file);
      return { project, manifest: await readManifest(file) };
    } catch {
      logger.warn('manifest', 'manifest ausente ou inválido; regenerando');
    }
  }
  return { project, manifest: await generateManifest(project) };
};

projectOption(
  program.command('validate').description('valida configuração e assets referenciados'),
).action(async ({ project: projectFile }: { project: string }) => {
  const project = await loadProject(projectFile);
  logger.info('validate', `configuração válida: ${project.projectFile}`);
});

projectOption(
  program.command('analyze').description('analisa assets e gera manifest/relatórios'),
).action(async ({ project: projectFile }: { project: string }) => {
  const project = await loadProject(projectFile);
  await generateManifest(project);
});

projectOption(program.command('render').description('renderiza o manifest existente'))
  .option('--rebuild-manifest', 'refaz a análise antes do render', false)
  .option('--output <file>', 'sobrescreve o destino do MP4')
  .action(
    async ({
      project: projectFile,
      rebuildManifest,
      output,
    }: {
      project: string;
      rebuildManifest: boolean;
      output?: string;
    }) => {
      const { project, manifest } = await loadOrGenerateManifest(projectFile, rebuildManifest);
      await renderSlideshow(project, manifest, output);
    },
  );

projectOption(program.command('preview').description('abre o Remotion Studio local'))
  .option('--rebuild-manifest', 'refaz a análise antes do preview', false)
  .action(
    async ({
      project: projectFile,
      rebuildManifest,
    }: {
      project: string;
      rebuildManifest: boolean;
    }) => {
      const { project } = await loadOrGenerateManifest(projectFile, rebuildManifest);
      await launchStudio(project, manifestFileFor(project));
    },
  );

projectOption(program.command('render-thumbnail').description('renderiza thumbnail JPEG'))
  .option('--frame <number>', 'frame exato para inspeção', (value) => Number(value))
  .option('--file <name>', 'nome do JPEG em output/', 'thumbnail.jpg')
  .action(
    async ({
      project: projectFile,
      frame,
      file,
    }: {
      project: string;
      frame?: number;
      file: string;
    }) => {
      const { project, manifest } = await loadOrGenerateManifest(projectFile, false);
      if (
        frame !== undefined &&
        (!Number.isInteger(frame) || frame < 0 || frame >= manifest.totalFrames)
      ) {
        throw new Error(
          `Frame inválido: ${frame}. Use um valor entre 0 e ${manifest.totalFrames - 1}.`,
        );
      }
      logger.info(
        'thumbnail',
        await renderThumbnail(
          project,
          manifest,
          frame ?? Math.min(manifest.totalFrames - 1, Math.round(manifest.fps * 3)),
          file,
        ),
      );
    },
  );

projectOption(program.command('render-scene').description('renderiza uma cena isolada'))
  .requiredOption('--scene <id>', 'id da cena')
  .action(async ({ project: projectFile, scene: sceneId }: { project: string; scene: string }) => {
    const { project, manifest } = await loadOrGenerateManifest(projectFile, false);
    const scene = manifest.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) throw new Error(`Cena não encontrada: ${sceneId}`);
    const isolated: SlideshowManifest = {
      ...manifest,
      targetFrames: scene.durationInFrames,
      totalFrames: scene.durationInFrames,
      scenes: [
        { ...scene, startFrame: 0, endFrame: scene.durationInFrames, transitionOut: undefined },
      ],
      audio: [],
    };
    await renderSlideshow(project, isolated, `output/${scene.id}.mp4`);
  });

projectOption(program.command('clean-cache').description('remove cache do projeto')).action(
  async ({ project: projectFile }: { project: string }) => {
    const project = await loadProject(projectFile);
    const cache = path.join(project.projectRoot, '.slideshow-cache');
    await rm(cache, { recursive: true, force: true });
    logger.info('cache', `removido: ${cache}`);
  },
);

program.parseAsync().catch((error: unknown) => {
  logger.error('fatal', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
