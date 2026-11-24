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
infra/                Terraform for the Vercel project (state in HCP Terraform)
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

## Deployment

The site runs on Vercel. The project has no Git integration: Terraform in `infra/` creates and
configures it, and the Vercel CLI deploys it from GitHub Actions.

- `.github/workflows/infra.yml`: on pull requests that touch `infra/`, `terraform fmt` and
  `validate` (no credentials). On push to `main`, `plan` and `apply`.
- `.github/workflows/deploy.yml`: on every published release, reads the project ID from the
  Terraform state, then runs `vercel pull`, `vercel build --prod` and `vercel deploy --prebuilt --prod`.

The Terraform state lives in the HCP Terraform workspace `tradeback-production`, in local execution
mode: HCP stores and locks the state, the runs happen in GitHub Actions.

Both workflows use the `production` environment, which only `main` and `v*` tags can use. Its
secrets (`TF_API_TOKEN`, `VERCEL_TOKEN`) are never available to pull requests, so contributors need
no access to Vercel or HCP, and pull requests from forks only get `fmt` and `validate`. Changes to
`infra/` and `.github/workflows/` need the code owner's review.

First-time setup, done once by the owner:

1. Create an HCP Terraform API token and a Vercel token.
2. Run `scripts/setup-deploy.sh`. It asks for the HCP organization and the two tokens, creates the
   workspace and the `production` environment, and stores the secrets.
3. Merge a change to `infra/` into `main`: the Infra workflow creates the Vercel project.

Run the script again to rotate a token.

## Releasing

1. Move the `Unreleased` entries of `CHANGELOG.md` under a new version and update `version` in
   `package.json`, in a pull request.
2. After merging, tag `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag.
3. Create a GitHub release from the tag with the changelog entry as notes. Publishing it deploys
   the tag to production.
