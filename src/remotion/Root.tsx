import { Composition } from 'remotion';
import type { SlideshowManifest } from '../schemas/manifest';
import { Slideshow } from './compositions/Slideshow';

const placeholderManifest: SlideshowManifest = {
  version: 1,
  projectId: 'preview',
  projectRoot: '.',
  createdAt: '1970-01-01T00:00:00.000Z',
  configHash: '',
  seed: 'preview',
  fps: 30,
  width: 1920,
  height: 1080,
  targetFrames: 30,
  totalFrames: 30,
  theme: 'playful-celebration',
  title: 'Slideshow',
  subtitle: '',
  closingMessage: '',
  safeArea: { top: 0.05, right: 0.05, bottom: 0.07, left: 0.05 },
  assets: [],
  chapters: [],
  scenes: [],
  audio: [],
  ignoredFiles: [],
  warnings: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Slideshow"
    component={Slideshow}
    durationInFrames={placeholderManifest.totalFrames}
    fps={placeholderManifest.fps}
    width={placeholderManifest.width}
    height={placeholderManifest.height}
    defaultProps={placeholderManifest}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.totalFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
);
