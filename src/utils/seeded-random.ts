import { createHash } from 'node:crypto';

const hashToUint32 = (value: string): number => {
  const hash = createHash('sha256').update(value).digest();
  return hash.readUInt32LE(0);
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const seededRandom = (seed: string): number => mulberry32(hashToUint32(seed))();

export const pickSeeded = <T>(items: readonly T[], seed: string): T => {
  if (items.length === 0) throw new Error('Não é possível escolher em uma lista vazia');
  return items[Math.floor(seededRandom(seed) * items.length)] as T;
};

export const rangeSeeded = (min: number, max: number, seed: string): number =>
  min + (max - min) * seededRandom(seed);

export const deterministicId = (prefix: string, value: string): string =>
  `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 10)}`;

export const stableHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
