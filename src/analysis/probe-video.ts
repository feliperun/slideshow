import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ProbeResult = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    tags?: { creation_time?: string };
  }>;
  format?: { duration?: string; tags?: { creation_time?: string } };
};

export type VideoProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  creationTime?: string;
};

export const probeVideo = async (file: string): Promise<VideoProbe> => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:format_tags=creation_time:stream=codec_type,width,height,duration:stream_tags=creation_time',
    '-of',
    'json',
    file,
  ]);
  const result = JSON.parse(stdout) as ProbeResult;
  const video = result.streams?.find((stream) => stream.codec_type === 'video');
  const durationSeconds = Number(video?.duration ?? result.format?.duration ?? 0);
  if (!video?.width || !video.height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Vídeo inválido ou sem duração: ${file}`);
  }
  const creationTime = video.tags?.creation_time ?? result.format?.tags?.creation_time;
  return {
    durationSeconds,
    width: video.width,
    height: video.height,
    ...(creationTime ? { creationTime } : {}),
  };
};

export const runFfmpeg = async (args: string[]): Promise<void> => {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg falhou: ${message}`, { cause: error });
  }
};
