# Slideshow

[![CI](https://github.com/feliperun/slideshow/actions/workflows/ci.yml/badge.svg)](https://github.com/feliperun/slideshow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A deterministic, privacy-first generator for turning a folder of photos, videos, and music into a
polished MP4 slideshow.

Slideshow analyzes media locally, orders it chronologically, creates collages, protects faces from
aggressive cropping, selects short video excerpts, detects the soundtrack beat grid, builds an
auditable timeline, renders it with Remotion, and finishes the result with FFmpeg.

> Your media stays on your machine. The project does not upload photos, videos, manifests, or audio.

## Highlights

- Chronological ordering using manual dates, EXIF, video metadata, filenames, and filesystem dates.
- Photos and videos mixed in the same timeline.
- Face-safe framing: the sharp foreground is shown completely over a blurred full-frame background.
- Deterministic layouts, movement, timing, and transitions controlled by a seed.
- Six flicker-safe transition families: wipe, slide, geometric mask, shared motion, photo stack, and
  zoom-through.
- Optional beat analysis with selected scene changes and accents aligned to the soundtrack.
- Automatic collages, chapters, date labels, captions, safe areas, and readable text overlays.
- Exact duration budgeting down to the frame.
- Full HD, 4K, portrait, square, or custom output dimensions.
- Generated manifest and reports for auditing every creative decision.
- Synthetic demo media, so the project can be evaluated without personal photos.

## How it works

```text
project.json + local media
          │
          ▼
metadata, dates, normalization, beat analysis
          │
          ▼
output/project-manifest.json
          │
          ▼
deterministic timeline + React/Remotion frames
          │
          ▼
FFmpeg audio mix, fades, loudness, and MP4 output
```

Creative decisions are made during `analyze`, recorded in the manifest, and reused during
`render`. Original media is never modified.

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer
- FFmpeg and FFprobe available in `PATH`
- macOS or Linux

Windows should work when the native Sharp and Remotion dependencies are available, but it is not
currently part of CI.

## Quick start

```bash
git clone https://github.com/feliperun/slideshow.git
cd slideshow
pnpm install

cp project.example.json project.json
mkdir media
```

Add photos and videos to `media/`, add a soundtrack as `media/soundtrack.mp3`, then run:

```bash
pnpm validate --project ./project.json
pnpm analyze --project ./project.json
pnpm preview --project ./project.json
pnpm render --project ./project.json
```

The final file is written to the path configured in `output.file`.

`project.json`, `media/`, `photos/`, `output/`, and `.slideshow-cache/` are ignored by Git to reduce
the risk of publishing private material.

## Try the synthetic demo

The demo creates abstract placeholder images and a synthetic audio track locally:

```bash
pnpm demo:generate
pnpm analyze --project ./examples/family/project.json
pnpm preview --project ./examples/family/project.json
pnpm render --project ./examples/family/project.json
```

No personal media or network download is involved.

## Commands

| Command                                               | Description                                       |
| ----------------------------------------------------- | ------------------------------------------------- |
| `pnpm validate --project FILE`                        | Validate configuration and referenced files       |
| `pnpm analyze --project FILE`                         | Analyze media and create the manifest and reports |
| `pnpm preview --project FILE`                         | Open the composition in Remotion Studio           |
| `pnpm render --project FILE`                          | Render the existing manifest to MP4               |
| `pnpm render --project FILE --rebuild-manifest`       | Analyze again, then render                        |
| `pnpm render:thumbnail --project FILE`                | Render a JPEG thumbnail                           |
| `pnpm render:scene --project FILE --scene scene-0012` | Render one scene                                  |
| `pnpm clean-cache --project FILE`                     | Remove normalized media and render chunks         |
| `pnpm demo:generate`                                  | Generate local synthetic demo assets              |
| `pnpm check`                                          | Run TypeScript, unit tests, and ESLint            |

## Configuration

Start with [project.example.json](project.example.json):

```json
{
  "id": "family-memories",
  "title": "Our Story",
  "subtitle": "A collection of favorite memories",
  "closingMessage": "Here is to many more memories!",
  "photosDirectory": "media",
  "targetDurationSeconds": 90,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "theme": "warm-memory",
  "seed": "family-memories-2026",
  "music": {
    "file": "media/soundtrack.mp3",
    "volume": 0.7,
    "fadeInSeconds": 2,
    "fadeOutSeconds": 4,
    "normalizeLoudness": true
  },
  "output": {
    "file": "output/slideshow.mp4",
    "quality": "high"
  },
  "photos": {}
}
```

Recommended dimensions:

| Format             | Dimensions    |
| ------------------ | ------------- |
| Full HD            | `1920 × 1080` |
| 4K                 | `3840 × 2160` |
| Portrait / Stories | `1080 × 1920` |
| Square             | `1080 × 1080` |
| Fast preview       | `960 × 540`   |

### Per-file overrides

Use the original filename as the key:

```json
{
  "photos": {
    "2024-05-12-birthday.jpg": {
      "date": "2024-05-12T14:30:00-03:00",
      "caption": "A special afternoon",
      "location": "Florianópolis",
      "priority": 1.8,
      "layout": "hero",
      "focus": { "x": 0.52, "y": 0.38 },
      "rotation": -2,
      "hero": true,
      "allowCollage": false
    },
    "2024-06-20-playground.mov": {
      "videoStartSeconds": 2.5,
      "videoEndSeconds": 7,
      "caption": "At the playground"
    },
    "duplicate.jpg": {
      "include": false
    }
  }
}
```

Available overrides include:

- manual date and ordering;
- caption, location, people, priority, and chapter;
- layout, fit, focus point, rotation, scale, and movement;
- fixed scene duration and transition;
- inclusion, hero status, and collage permission;
- video excerpt start and end times.

## Chronological ordering

Date resolution uses this priority:

1. manual override;
2. EXIF `DateTimeOriginal`;
3. EXIF `CreateDate`;
4. reliable video creation metadata;
5. date embedded in the filename;
6. file creation time;
7. file modification time;
8. alphabetical fallback.

Recognized filename forms include:

- `2024-05-20-photo.jpg`
- `IMG_20240520_143500.jpg`
- `20240520_143500.jpg`
- `20-05-2024.jpg`
- `2024_05_20_event.jpg`

Suspicious video import dates are reported instead of silently replacing an older filesystem date.

## Face-safe framing

Photo frames use two layers:

1. a blurred, enlarged background that fills the frame;
2. a sharp foreground rendered with `contain`, preserving the complete image.

Pan and zoom are applied only to the decorative background layer. The foreground remains intact, so
faces near an edge are not lost. Manual focus points remain available for custom layouts and
background positioning.

## Beat synchronization

The analyzer decodes the beginning of the soundtrack locally, builds an onset envelope, estimates a
tempo and phase, and records a deterministic beat grid in the manifest.

Only selected nearby transitions are snapped to beats. This keeps the timeline musical without
making every cut feel mechanical. Beat-aligned scenes may receive a short decorative accent.

The analysis is intentionally lightweight and dependency-free. It works best with music that has a
clear rhythmic pulse.

## Themes, layouts, and transitions

Built-in themes:

- `warm-memory`
- `clean-cinematic`
- `playful-celebration`
- `elegant-event`
- `travel-journal`

Built-in layouts include portrait, landscape, square editorial, polaroid, photo stack, split screen,
collage, hero, timeline strip, album page, and video editorial.

Transition variants avoid full-frame opacity animation because that can produce tiled compositor
artifacts in some Chromium/Remotion combinations. New transitions should be tested as encoded video,
not only as still frames.

Run the internal transition validation after changing composition behavior:

```bash
pnpm exec tsx scripts/validate-transitions.ts
```

## Exact duration

The target is `round(seconds × fps)` frames. Since adjacent scenes overlap during transitions:

```text
total = fixed frames + scene frames - transition frames
```

The allocator starts at every scene minimum, distributes remaining frames by weight, respects
maximums, and applies integer-frame correction. Intro, outro, manual durations, and video excerpts
are fixed. Analysis fails with a clear error if the requested duration is impossible.

## Generated files

`.slideshow-cache/` stores:

- normalized and auto-oriented images;
- thumbnails and blurred backgrounds;
- transcoded video excerpts;
- reusable render chunks.

`output/` stores:

- `project-manifest.json` — source of truth for rendering;
- `composition-report.json` — machine-readable audit;
- `composition-report.md` — human-readable timeline report;
- final MP4 and thumbnail files.

Both directories are ignored by Git.

## Project structure

```text
src/
  analysis/       metadata, dates, hashes, beat detection, image and video processing
  cli/            command-line interface
  config/         project loading and validation
  manifest/       manifest and report generation
  remotion/       compositions, scenes, media frames, and decorations
  rendering/      Remotion bundle, chunk rendering, and FFmpeg finalization
  schemas/        Zod schemas and TypeScript types
  themes/         visual design tokens
  timeline/       grouping, transitions, beat alignment, and duration allocation
  utils/          deterministic random, files, frames, and logging
scripts/          demo and visual validation helpers
tests/            unit tests
```

## Privacy and repository hygiene

Before publishing a fork or sending a pull request:

```bash
git status --ignored
git grep -n -i "private-name-or-path"
```

Never force-add ignored media. If personal material was accidentally committed, removing the file in
a later commit is not sufficient; rewrite the Git history before publishing.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), run `pnpm check`, and include
encoded before/after samples for visual changes.

## License

[MIT](LICENSE)
