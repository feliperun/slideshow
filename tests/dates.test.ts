import type { Stats } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatMonthYearRange,
  parseDateFromFilename,
  parseExifDate,
  resolveAssetDate,
} from '../src/analysis/dates.js';

const stats = (birth: string, modified = '2026-07-16T04:00:00.000Z') =>
  ({
    birthtime: new Date(birth),
    birthtimeMs: new Date(birth).getTime(),
    mtime: new Date(modified),
    mtimeMs: new Date(modified).getTime(),
  }) as Stats;

describe('date parsing', () => {
  it.each([
    ['2024-05-20-photo.jpg', 2024, 4, 20],
    ['IMG_20240520_143500.jpg', 2024, 4, 20],
    ['20240520_143500.jpg', 2024, 4, 20],
    ['20-05-2024.jpg', 2024, 4, 20],
    ['2024_05_20_evento.jpg', 2024, 4, 20],
  ])('parses %s', (file, year, month, day) => {
    const date = parseDateFromFilename(file);
    expect(date?.getFullYear()).toBe(year);
    expect(date?.getMonth()).toBe(month);
    expect(date?.getDate()).toBe(day);
  });

  it('parses EXIF local timestamps', () => {
    const date = parseExifDate('2026:03:21 19:03:02');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(21);
  });

  it('prioritizes manual date over EXIF', () => {
    const result = resolveAssetDate({
      fileName: 'IMG_0001.jpg',
      override: {
        date: '2020-01-02T12:00:00-03:00',
        priority: 1,
        include: true,
        hero: false,
        allowCollage: true,
      },
      exifOriginal: '2024:04:05 12:00:00',
      stats: stats('2025-01-01T00:00:00.000Z'),
    });
    expect(result.source).toBe('manual');
    expect(result.date.toISOString()).toBe('2020-01-02T15:00:00.000Z');
  });

  it('uses EXIF DateTimeOriginal before CreateDate', () => {
    const result = resolveAssetDate({
      fileName: 'IMG_0001.jpg',
      exifOriginal: '2024:04:05 12:00:00',
      exifCreate: '2025:04:05 12:00:00',
      stats: stats('2026-01-01T00:00:00.000Z'),
    });
    expect(result.source).toBe('exif-datetime-original');
    expect(result.date.getFullYear()).toBe(2024);
  });

  it('rejects a video import timestamp in favor of file birth time', () => {
    const result = resolveAssetDate({
      fileName: 'imported-video.mov',
      videoCreationTime: '2026-07-16T04:55:00.000Z',
      stats: stats('2025-12-06T20:57:53.000Z'),
    });
    expect(result.source).toBe('file-created');
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.warning).toMatch(/importação/);
  });
});

describe('month range formatting', () => {
  it('does not repeat an equal month', () => {
    expect(formatMonthYearRange(new Date(2025, 11, 1), new Date(2025, 11, 22))).toBe(
      'Dezembro de 2025',
    );
  });

  it('writes month names in full and shares the year', () => {
    expect(formatMonthYearRange(new Date(2026, 4, 1), new Date(2026, 5, 22))).toBe(
      'Maio a Junho de 2026',
    );
  });
});
