# CLAUDE.md

## Project

Tradeback is a static Next.js (App Router) web app in TypeScript that applies trade evolutions to Pokémon save files of generations I to V, entirely in the browser. `app/page.tsx` renders the single page; `components/editor/EditorIsland.tsx` is the client island that loads, edits and offers the save for download; `lib/save/index.ts` detects the game and dispatches to one module per generation in `lib/save/gen1`…`gen5`. Format notes with sources are in `docs/formats/`. Next.js notes for agents are in `AGENTS.md`.

## Commands

- Install: `npm ci`
- Lint / format: `npm run lint`, `npm run format` (check: `npm run format:check`)
- Typecheck: `npm run typecheck`
- Test: `npm test` (unit), `npm run build && npm run test:e2e` (end to end); `npm run fetch-test-saves` downloads the real saves some unit tests use
- Run: `npm run dev`

## Language

Everything in this repository is written in English: code, comments, docs, commit messages, branch names, PR titles and descriptions.

## Code standards

- Follow the configured linter and formatter; code must pass them before committing.
- Clear, descriptive names; small single-responsibility functions and modules.
- Types where supported. Explicit error handling; never swallow errors.
- No hardcoded secrets or environment-specific values: use configuration and environment variables.
- Comments explain why, not what. No comments restating code, no banner/section comments, no history comments, no narrative comments. Short docstrings.
- Save format constants cite their source (pret decompilations, PKHeX read as documentation only). Never copy PKHeX code (GPLv3).
- TODOs only as `TODO(paolospoto): <concrete reason>`.
- No blanket defensive error handling, no premature abstractions, no decorative logs, plain non-verbose names.
- Every change comes with tests; all tests must pass.

## Writing style

- Short, direct, concrete, never enthusiastic. README is for users; everything else is for developers.
- No marketing words (seamless, robust, leverage, comprehensive, powerful, delve, streamline, cutting-edge, elevate, unlock, effortlessly, empower, crucial, etc.), no self-praising adjectives, no emoji, no em dashes as dramatic pauses, no scattered bold, no filler sentences.
- README.md describes the product for its users only (header with logo, name, description and CI/release/license badges, then what it does, screenshot, how to use it, limitations, license). Never put developer information in it: setup, structure, commands and conventions go in CONTRIBUTING.md.
- Repository description: one sentence, max ~100 characters, says what the product does; third-party product names only to say what it works with, never in the repo name.
- Commit bodies only when needed. PR descriptions proportional to the change. No first person, no generic messages like "various fixes".
- Before opening a PR, reread all new text and rewrite anything that sounds AI-generated.

## Git workflow

- Never commit directly to `main`; work on a branch and open a pull request.
- Branch names: `<type>/<camelCaseDescription>-<yymmdd>` (e.g. `feat/addAuth-261122`), using Conventional Commit types.
- Commits follow Conventional Commits: `<type>(<scope>): <imperative summary>`, max 72 characters, small and atomic, each one building and passing tests.
- The repository owner is always the commit author. Claude is added as co-author with the trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- PR descriptions use `.github/pull_request_template.md` (Summary, Changes, How to test, Notes).
- Merge PRs with a merge commit using GitHub's default subject (`Merge pull request #<n> from <owner>/<branch>`), PR title as body, plus the co-author trailer.
- Update `CHANGELOG.md` (Keep a Changelog) for user-facing changes; versions follow Semantic Versioning.

## Security

- Never commit secrets, credentials, personal data or large binary files. Real saves go in `tests/fixtures/private/` or `tests/fixtures/third-party/saves/`, both gitignored.
- Pre-commit hooks include a secret scan; do not bypass them.
