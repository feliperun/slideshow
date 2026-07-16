import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { projectConfigSchema, type ProjectConfig } from '../schemas/project.js';

export type LoadedProject = {
  config: ProjectConfig;
  projectFile: string;
  projectRoot: string;
};

export const loadProject = async (projectFile: string): Promise<LoadedProject> => {
  const absoluteFile = path.resolve(projectFile);
  try {
    await access(absoluteFile);
  } catch {
    throw new Error(`Arquivo de projeto não encontrado: ${absoluteFile}`);
  }

  try {
    const raw = JSON.parse(await readFile(absoluteFile, 'utf8')) as unknown;
    const config = projectConfigSchema.parse(raw);
    const projectRoot = path.dirname(absoluteFile);
    const photosDirectory = path.resolve(projectRoot, config.photosDirectory);
    await access(photosDirectory);
    for (const track of config.music
      ? Array.isArray(config.music)
        ? config.music
        : [config.music]
      : []) {
      const audioFile = path.resolve(projectRoot, track.file);
      try {
        await access(audioFile);
      } catch {
        throw new Error(`Arquivo de música não encontrado: ${audioFile}`);
      }
    }
    return { config, projectFile: absoluteFile, projectRoot };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`)
        .join('\n  - ');
      throw new Error(`Configuração inválida em ${absoluteFile}:\n  - ${issues}`, { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new Error(`JSON inválido em ${absoluteFile}: ${error.message}`, { cause: error });
    }
    throw error;
  }
};
