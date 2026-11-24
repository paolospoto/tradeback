# Contributing

## Setup

Requirements: Node.js 22 (see `.nvmrc`) and npm. [gitleaks](https://github.com/gitleaks/gitleaks) is
optional locally; the pre-commit hook uses it when it is installed, and CI always runs it.

```bash
npm ci
npm run fetch-test-saves   # optional: real saves for the "real saves" tests
npm run dev                # http://localhost:3000
```

No environment variables are needed. Every route is prerendered as static content.

## Project structure

```
app/                  the single page and its metadata
components/editor/    upload, candidate list and download (client island)
components/evolution/ evolution animation, lazy-loaded
components/help/      first-visit help wizard
components/ui/        buttons, cards, header and footer
lib/save/             one folder per generation (gen1-gen5): loading, crypto, evolution, verification;
                      shared types in types.ts, game detection in index.ts
lib/data/             species data, trade evolution table, display names, per-generation names
lib/i18n/en/          all user-facing text
public/brand/         logo, icons and colour tokens
scripts/              build data fetch, fixture generation and debugging tools
tests/unit/           Vitest
tests/e2e/            Playwright
tests/fixtures/       synthetic saves; third-party/ and private/ hold real saves and are gitignored
docs/formats/         save format notes with sources, one file per generation
```

## Commands

| Command                                   | What it does                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                             | Development server                                                                                                       |
| `npm run build`                           | Production build. `prebuild` refreshes display names from PokéAPI's CSV files and keeps the committed copy when offline. |
| `npm start`                               | Serves the production build                                                                                              |
| `npm run lint`                            | ESLint                                                                                                                   |
| `npm run format` / `npm run format:check` | Prettier                                                                                                                 |
| `npm run typecheck`                       | `tsc --noEmit`                                                                                                           |
| `npm test`                                | Vitest unit tests                                                                                                        |
| `npm run test:e2e`                        | Playwright tests (mobile and desktop) against a production build: run `npm run build` first                              |
| `npm run fetch-test-saves`                | Downloads the third-party saves listed in `tests/fixtures/third-party/README.md`                                         |
| `npm run make-fixtures`                   | Regenerates the synthetic saves in `tests/fixtures/`                                                                     |
| `npm run dump-save -- <file> [--all]`     | Prints trainer, party and boxes of a save                                                                                |
| `npm run diff-saves -- <a> <b>`           | Field-by-field diff of two generation IV saves                                                                           |

## Testing against real saves

Put real saves in `tests/fixtures/private/` (gitignored, never commit personal saves). `npm test`
then loads them, runs the self-check, evolves everything that can evolve and verifies the result.

To compare with PKHeX: evolve a Pokémon in PKHeX and save it as `expected.sav`, do the same evolution
here and save `actual.sav`, then run `npm run diff-saves -- expected.sav actual.sav`. Any difference
must be explained. Finally import the file into the emulator and check it in game.

Format changes must cite their source (pret decompilations, PKHeX read as documentation only) in the
code and in `docs/formats/`. No code is copied from PKHeX, which is GPLv3.

## Git workflow

- Never commit to `main`. Branch, push, and open a pull request.
- Branch names: `<type>/<camelCaseDescription>-<yymmdd>`, for example `feat/addAuth-261122`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <imperative summary>`, at most 72 characters, lowercase after the colon.
  Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`.
  commitlint checks them in the `commit-msg` hook and in CI.
- Keep commits small; each one must build and pass the tests. Add a body only to explain why.
- Pull requests use `.github/pull_request_template.md`. CI (lint, format, typecheck, unit tests,
  build, e2e, commit messages, secret scan) must pass before merging.
- Merge with a merge commit.

Hooks: `pre-commit` runs Prettier and ESLint on staged files plus gitleaks, `pre-push` runs lint,
typecheck and unit tests. Do not bypass them.

## Releasing

1. Move the `Unreleased` entries of `CHANGELOG.md` under a new version and update `version` in
   `package.json`, in a pull request.
2. After merging, tag `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag.
3. Create a GitHub release from the tag with the changelog entry as notes.
