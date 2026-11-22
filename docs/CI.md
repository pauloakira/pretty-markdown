# CI, branches and releases

How changes get from a branch to people who install the app.

## Branches

| Branch | What it holds | Moves by |
|--------|---------------|----------|
| `develop` | Integration: the latest work, always green | Merging a feature PR |
| `main` | Releases only; what `scripts/install.sh` installs | A release PR from `develop`, then a version tag |
| `feat/…`, `fix/…`, `docs/…`, `ci/…` | One card's work | Checkpoint commits, pushed |

Start work from `develop` and open the PR into `develop`:

```bash
git switch develop && git pull --ff-only
git switch -c feat/my-card
gh pr create --base develop
```

A PR built on another PR's branch (a stack) targets that branch. Before the lower PR is
merged and its branch deleted, retarget the upper one to `develop`
(`gh pr edit <n> --base develop`); otherwise it can merge into the deleted branch instead.

## CI (`.github/workflows/ci.yml`)

Runs on every pull request and on every push to `develop` and `main`. A newer push cancels
the run in progress for the same branch.

| Job | Runner | Steps |
|-----|--------|-------|
| **web** | Ubuntu | `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |
| **core** | macOS | `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` |

The Rust job runs on macOS because the core handles `RunEvent::Opened`, which Tauri has
only on Apple platforms. It compiles against an empty `dist/`, because
`tauri::generate_context!` embeds the web build but the tests don't need it.

Before pushing, the same checks run locally:

```bash
npm run typecheck && npm test
```

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Not in CI: the iPad build. It needs code signing with the Personal Team, which stays on
the Mac that builds it (see [ipad/README.md](../ipad/README.md)).

## Releases (`.github/workflows/release.yml`)

The workflow bundles the macOS app (`.app` and `.dmg`) in three cases:

- **A PR into `main`:** the release PR. The disk image is kept as a workflow artifact for
  14 days, so a release is known to bundle, and can be tried, before it merges.
- **A `v*` tag:** checks that the tag matches the version in `tauri.conf.json`, then creates
  a **draft** GitHub Release with the disk image. Nothing is public until the draft is
  published by hand.
- **Run by hand** (Actions → Release → Run workflow): builds the artifact from any branch.

To release version 0.2.0:

1. On a branch from `develop`, set `"version": "0.2.0"` in `package.json`,
   `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (then `cargo check` to update
   `Cargo.lock`). Merge it into `develop`.
2. Open the release PR: `gh pr create --base main --head develop --title "release: v0.2.0"`.
   Wait for CI and the bundle, then merge it with a merge commit.
3. Tag the merge on `main` and push the tag:

   ```bash
   git switch main && git pull --ff-only
   git tag -a v0.2.0 -m "pretty-markdown 0.2.0"
   git push origin v0.2.0
   ```

4. When the workflow finishes, review the draft under Releases, write the notes, and
   publish it.

### Signing

The app isn't signed with a Developer ID certificate, because the project has none (the
free Personal Team can't issue one), and it isn't notarized. macOS therefore warns the
first time the app opens. The draft release notes explain the workaround: Control-click
the app and choose Open, or run `xattr -dr com.apple.quarantine` on it. Building from
source with `scripts/install.sh` avoids the warning.
