# Releasing

How a version goes out, in the order it is done, with what goes wrong when a step is left out. Releasing is a person's decision: every step that publishes (the tag, the image, the deploy, the GitHub Release) waits for their word.

A release is **six steps**, and it is only done when all six are. `v0.4.0` went through the tag, the image and the deploy and had no GitHub Release for a while, so the Releases page still said 0.3.1.

## 1. The release pull request

One pull request, `release/X.Y.Z`, with one commit, `release: El portal X.Y.Z`, that touches:

- the **three `package.json`** (the root, `ui/` and `packages/llm-provider/`): the versions move together;
- **`CHANGELOG.md`**: what was under `## Unreleased` goes under `## X.Y.Z (date)`, after a line that says what the release is and whether anything must be set; `## Unreleased` becomes `Nothing yet.`. Read the unreleased entries against `git log` of the pull requests since the last tag: an entry can be missed (the path from the gate to the garden was);
- **`SIGNAL.md`**: what the release is, and the stamp (`pnpm signal`).

The number: a change a person can see or must act on is a minor (`0.4.0`); a way to run it, or a fix, is a patch (`0.3.1`). Before 1.0 the config, the API and the skin contract (`contract`) are what is kept still: say in the CHANGELOG when they are.

Run the checks first: `pnpm test`, `pnpm --filter portal-ui test`, `pnpm --filter portal-ui build`, `pnpm cloudflare:check`, `pnpm traces`. CI runs them; the pull request merges when it is clean, as a merge commit.

## 2. The tag

An **annotated** tag on the **merge commit** of the release pull request (not on the commit inside it), named `vX.Y.Z`:

```bash
git tag -a vX.Y.Z <merge-commit> -m "El portal X.Y.Z"
git push origin vX.Y.Z
```

Pushing the tag is what publishes the image: the `Container` workflow builds it, opens the portal in it and asks for its health, **checks that the tag is the version in `package.json`** (`EXPECT_VERSION`), and publishes `ghcr.io/gratiaos/portal` (`linux/amd64`). Push once: a second push of the same tag does nothing. The package stays private until the organisation makes it public in its settings.

## 3. The Worker, from the tag

`firegate.space` is deployed by hand, from the tag, so that its health says the truth:

```bash
git checkout vX.Y.Z && pnpm cloudflare:deploy
git checkout main
```

Read what wrangler says. If it **applies migrations you did not expect, or warns that a tag is not in `wrangler.jsonc`**, stop: wrangler re-applies every migration over a Worker whose last tag it cannot find (that is why `v3` stays in the file as an empty marker; see [the-tree-on-the-gate.md](the-tree-on-the-gate.md)). A migration is history: never rewrite or remove one a Worker has applied.

A secret that changed (`PORTAL_CONFIG`) goes up with `wrangler secret put`, and the object adopts it when it goes idle or within five minutes ([INSTALL.md](../INSTALL.md), "On Cloudflare").

## 4. Look at what a visitor opens

After the deploy, and after those five minutes: `/api/health` says `X.Y.Z`; the page names the assets that were built; a path that must not answer does not. The tests prove the code; this proves what is running.

## 5. The GitHub Release

The Releases page is a separate object from the tag. Named `El portal X.Y.Z`, on `main`, not a draft and not a prerelease, with the CHANGELOG section of that version as its notes:

```bash
gh release create vX.Y.Z --repo GratiaOS/portal --title "El portal X.Y.Z" --notes-file <the section> --verify-tag --latest
```

`--verify-tag` refuses to make a release for a tag that is not on GitHub.

## 6. The signal

`SIGNAL.md` says the release is out, what is live where, and what nobody has looked at. The release pull request already changes it, so `pnpm signal` is **current** right after a release: a pull request that touches `SIGNAL.md` has kept it true, and does not count against its stamp (the stamp cannot name the merge commit of the pull request that carries it). A pull request that leaves `SIGNAL.md` alone does count, until the signal says something about it.

## If something fails

- **The image workflow fails on the version**: the tag and `package.json` disagree. Delete the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), fix with a new pull request, tag again.
- **The deploy fails**: nothing was changed (a deploy is all or nothing). Read the message, and do not force a migration.
- **A release has to be taken back**: a tag that has published an image is not deleted quietly: say so in a new release (`X.Y.Z+1`) and in the CHANGELOG.
