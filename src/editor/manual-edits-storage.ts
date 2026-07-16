import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedProject } from '../config/load-project.js';
import { writeJsonAtomic } from '../utils/files.js';
import { emptyManualEdits, manualEditsSchema, type ManualEdits } from './manual-edits.js';

export const manualEditsFileFor = (project: LoadedProject): string => {
  const extension = path.extname(project.projectFile);
  const basename = path.basename(project.projectFile, extension);
  return path.join(project.projectRoot, `${basename}.edits.json`);
};

export const loadManualEdits = async (project: LoadedProject): Promise<ManualEdits> => {
  const file = manualEditsFileFor(project);
  try {
    await access(file);
  } catch {
    return emptyManualEdits(project.config.id);
  }
  const parsed = manualEditsSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (parsed.projectId !== project.config.id) {
    throw new Error(
      `Ajustes de enquadramento pertencem ao projeto "${parsed.projectId}", não "${project.config.id}".`,
    );
  }
  return parsed;
};

export const saveManualEdits = async (
  project: LoadedProject,
  input: unknown,
): Promise<ManualEdits> => {
  const edits = manualEditsSchema.parse(input);
  if (edits.projectId !== project.config.id) {
    throw new Error(`projectId inválido nos ajustes: ${edits.projectId}`);
  }
  await writeJsonAtomic(manualEditsFileFor(project), edits);
  return edits;
};
