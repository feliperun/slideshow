import { access } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { remotionEntryPoint } from '../src/rendering/render.js';

describe('rendering paths', () => {
  it('resolves the Remotion entry point from the application, not the project directory', async () => {
    await expect(access(remotionEntryPoint)).resolves.toBeUndefined();
    expect(path.basename(remotionEntryPoint)).toBe('index.ts');
    expect(path.basename(path.dirname(remotionEntryPoint))).toBe('remotion');
    expect(path.basename(path.dirname(path.dirname(remotionEntryPoint)))).toBe('src');
  });
});
