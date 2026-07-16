# Contributing

Thanks for helping improve Slideshow.

## Development setup

1. Install Node.js 22+, pnpm 10+, and FFmpeg.
2. Run `pnpm install`.
3. Run `pnpm check` before submitting a change.

For visual work, generate the synthetic demo:

```bash
pnpm demo:generate
pnpm analyze --project examples/family/project.json
pnpm preview --project examples/family/project.json
```

## Pull requests

- Keep changes focused and explain the user-visible impact.
- Add or update tests for timeline, date, schema, or audio-analysis behavior.
- Do not commit personal media, generated videos, manifests, caches, or private project files.
- Include before/after frames when changing layouts or transitions.

By contributing, you agree that your contribution is licensed under the MIT License.
