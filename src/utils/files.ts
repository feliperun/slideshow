import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(file, 'utf8')) as T;

export const writeJsonAtomic = async (file: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
};

export const toPosixPath = (value: string): string => value.split(path.sep).join('/');
