import type { Stats } from 'node:fs';
import type { PhotoOverride } from '../schemas/project.js';

export type DateSource =
  | 'manual'
  | 'exif-datetime-original'
  | 'exif-create-date'
  | 'video-creation-time'
  | 'filename'
  | 'file-created'
  | 'file-modified'
  | 'alphabetical';

export type ResolvedDate = { date: Date; source: DateSource; warning?: string };

const capitalize = (value: string): string =>
  value.length === 0 ? value : `${value[0]?.toLocaleUpperCase('pt-BR')}${value.slice(1)}`;

const monthName = (date: Date): string =>
  capitalize(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date));

export const formatMonthYearRange = (start: Date, end: Date): string => {
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startMonth === endMonth && startYear === endYear) {
    return `${monthName(start)} de ${startYear}`;
  }
  if (startYear === endYear) {
    return `${monthName(start)} a ${monthName(end)} de ${startYear}`;
  }
  return `${monthName(start)} de ${startYear} a ${monthName(end)} de ${endYear}`;
};

const validDate = (date: Date): Date | undefined =>
  Number.isNaN(date.getTime()) ? undefined : date;

export const parseExifDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return validDate(new Date(value));
  const [, year, month, day, hours, minutes, seconds] = match;
  return validDate(
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    ),
  );
};

export const parseDateFromFilename = (fileName: string): Date | undefined => {
  const patterns: Array<RegExp> = [
    /(?:^|\D)(\d{4})[-_](\d{2})[-_](\d{2})(?:[-_ T]?(\d{2})(\d{2})(\d{2}))?/,
    /(?:^|\D)(\d{4})(\d{2})(\d{2})(?:[-_ T]?(\d{2})(\d{2})(\d{2}))?/,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (!match) continue;
    const [, year, month, day, hours = '12', minutes = '00', seconds = '00'] = match;
    const parsed = validDate(
      new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds),
      ),
    );
    if (parsed && parsed.getMonth() === Number(month) - 1) return parsed;
  }

  const brazilian = fileName.match(/(?:^|\D)(\d{2})[-_](\d{2})[-_](\d{4})(?:\D|$)/);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    const parsed = validDate(new Date(Number(year), Number(month) - 1, Number(day), 12));
    if (parsed && parsed.getMonth() === Number(month) - 1) return parsed;
  }
  return undefined;
};

type ResolveDateInput = {
  fileName: string;
  override?: PhotoOverride;
  exifOriginal?: unknown;
  exifCreate?: unknown;
  videoCreationTime?: string;
  stats: Stats;
};

export const resolveAssetDate = ({
  fileName,
  override,
  exifOriginal,
  exifCreate,
  videoCreationTime,
  stats,
}: ResolveDateInput): ResolvedDate => {
  if (override?.date) return { date: new Date(override.date), source: 'manual' };
  const original = parseExifDate(exifOriginal);
  if (original) return { date: original, source: 'exif-datetime-original' };
  const created = parseExifDate(exifCreate);
  if (created) return { date: created, source: 'exif-create-date' };

  if (videoCreationTime) {
    const videoDate = validDate(new Date(videoCreationTime));
    const birthDate = stats.birthtime;
    const looksLikeImportDate =
      videoDate &&
      Math.abs(stats.mtimeMs - videoDate.getTime()) < 2 * 86_400_000 &&
      videoDate.getTime() - birthDate.getTime() > 7 * 86_400_000;
    if (videoDate && !looksLikeImportDate) {
      return { date: videoDate, source: 'video-creation-time' };
    }
    if (looksLikeImportDate && stats.birthtimeMs > 0) {
      return {
        date: birthDate,
        source: 'file-created',
        warning:
          'Data interna do vídeo parece ser a data de importação; usada a criação do arquivo.',
      };
    }
  }

  const filenameDate = parseDateFromFilename(fileName);
  if (filenameDate) return { date: filenameDate, source: 'filename' };
  if (stats.birthtimeMs > 0) return { date: stats.birthtime, source: 'file-created' };
  if (stats.mtimeMs > 0) return { date: stats.mtime, source: 'file-modified' };
  return { date: new Date(0), source: 'alphabetical', warning: 'Data ausente.' };
};
