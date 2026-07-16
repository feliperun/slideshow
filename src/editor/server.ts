import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { LoadedProject } from '../config/load-project.js';
import type { SlideshowManifest } from '../schemas/manifest.js';
import { logger } from '../utils/logging.js';
import { loadManualEdits, manualEditsFileFor, saveManualEdits } from './manual-edits-storage.js';

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const editorRoot = path.join(applicationRoot, 'src', 'editor');

const mimeTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 2_000_000) throw new Error('Payload de ajustes excede 2 MB.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
};

const serveAsset = async (
  request: IncomingMessage,
  response: ServerResponse,
  file: string,
): Promise<void> => {
  const fileStat = await stat(file);
  const contentType = mimeTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.range;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  if (!range) {
    response.statusCode = 200;
    response.setHeader('Content-Length', fileStat.size);
    createReadStream(file).pipe(response);
    return;
  }
  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    response.statusCode = 416;
    response.end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
  if (start > end || start >= fileStat.size) {
    response.statusCode = 416;
    response.setHeader('Content-Range', `bytes */${fileStat.size}`);
    response.end();
    return;
  }
  response.statusCode = 206;
  response.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
  response.setHeader('Content-Length', end - start + 1);
  createReadStream(file, { start, end }).pipe(response);
};

export const launchFramingEditor = async (
  project: LoadedProject,
  baseManifest: SlideshowManifest,
  port: number,
): Promise<void> => {
  let edits = await loadManualEdits(project);
  const allowedAssets = new Set(
    baseManifest.assets.flatMap((asset) => [
      asset.normalizedPath,
      asset.backgroundPath,
      asset.thumbnailPath,
    ]),
  );
  const vite = await createServer({
    root: editorRoot,
    publicDir: false,
    appType: 'spa',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      open: true,
      fs: { allow: [applicationRoot, project.projectRoot] },
    },
    plugins: [
      {
        name: 'slideshow-framing-editor-api',
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            try {
              const url = new URL(
                request.url ?? '/',
                `http://${request.headers.host ?? 'localhost'}`,
              );
              if (url.pathname === '/api/editor' && request.method === 'GET') {
                sendJson(response, 200, {
                  projectName: path.basename(project.projectFile),
                  editsFileName: path.basename(manualEditsFileFor(project)),
                  manifest: baseManifest,
                  edits,
                });
                return;
              }
              if (url.pathname === '/api/edits' && request.method === 'PUT') {
                edits = await saveManualEdits(project, await readJsonBody(request));
                sendJson(response, 200, { edits });
                return;
              }
              const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
              if (request.method === 'GET' && allowedAssets.has(relativePath)) {
                const absolutePath = path.resolve(project.projectRoot, relativePath);
                const relativeToProject = path.relative(project.projectRoot, absolutePath);
                if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
                  sendJson(response, 403, { error: 'asset fora do projeto' });
                  return;
                }
                await serveAsset(request, response, absolutePath);
                return;
              }
              next();
            } catch (error) {
              sendJson(response, 400, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
        },
      },
    ],
  });
  await vite.listen();
  logger.info('editor', `Framing Editor: http://127.0.0.1:${port}`);
  logger.info('editor', `ajustes: ${manualEditsFileFor(project)}`);
  vite.printUrls();
};
