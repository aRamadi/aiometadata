# AIOMetadata: what this server changes

Everything that differs from stock AIOMetadata, so it can be done again after
an update. Written 2026-09-27.

- **Fork:** `github.com/aRamadi/aiometadata`, branch `claude/cool-curie-t5fpt7`
- **Based on:** upstream `cedya77/aiometadata`, branch `dev`, as of 2026-09-21
  (merge `932d4d7c`). Upstream has moved on 81 commits since.
- **Built by:** `~/aiometadata/compose.yaml` (`build.context` points at the
  fork branch), so `docker compose up -d --build` in `~/aiometadata` deploys
  whatever is on that branch.
- **Patches:** on the server, `~/aiometadata/fork-changes/` holds this guide
  and the eight code changes as `000N-*.patch` files, one per commit, oldest
  first. On GitHub the branch itself has them, plus this file as an eighth
  commit (`docs: ...`), which a rebase simply carries along.

## 1. Code changes (8 commits)

| # | Change | What you get | Files |
|---|--------|--------------|-------|
| 1 | **Dockerfile: `npm ci` → `npm install`** | The image builds even when `package-lock.json` is out of step with `package.json` | `Dockerfile` |
| 2 | **"Original Title" display language** | A new entry in **Display Language**. Every title shows in its own original language; overview, genres, certifications and art stay in a real fallback language (English). The sentinel value `original` is turned into a real language code before any TMDB/TVDB call, so no API ever sees `language=original` | `addon/utils/resolveApiLanguage.ts` (new), `parseProps.js`, `getMeta.js`, `getTmdb.ts`, `getSearch.ts`, `warmupTargets.js`, `fanart.ts`, `addon/index.ts`, `configure/src/data/languages.ts` |
| 3 | **"Original Title Languages" list** | Under **General settings**, a list of languages (e.g. Arabic) whose titles always show their original title, while Display Language stays English for everything else. Stored as `originalTitleLanguages` in the config | `resolveApiLanguage.ts`, `parseProps.js`, `getMeta.js`, `addon/types/index.ts`, `configure/.../GeneralSettings.tsx`, `configure/src/contexts/config.ts` |
| 4 | **"AER 1.0" version badge** | The header reads `v2.17.2 · AER 1.0`, so you can tell your build from stock. The real addon version is untouched (the config import/export check still uses it) | `scripts/generate-build-info.js`, `addon/index.ts`, `configure/.../Header.tsx`, `configure/src/contexts/ConfigContext.tsx` |
| 5 | **Cache follows the Original Title Languages list** | Editing the list takes effect at once instead of serving titles cached under the old list | `addon/lib/getCache.ts` |
| 6 | **Worldwide release region** (2026-09-27) | **Release Region → "Worldwide (release in any country)"** in the Discover builder. Stops a release-type filter (digital, physical…) from being narrowed to your language's country (US). Stored as `region: "any"` | `addon/lib/getCatalog.ts`, `configure/.../DiscoverBuilderDialog.tsx` |
| 7 | **Catalogs carry their collection folder** (2026-09-27) | Each catalog in the manifest gets a `folder` field with the title of the collection folder it sits in. Relay uses it to label repeated names ("Popular Movies · Netflix"). Stremio and AIOStreams ignore it | `addon/lib/getManifest.ts` |
| 8 | **Trending by original language** (2026-10-02) | TMDB Trending Movies / Series keep only titles originally in the languages listed in `TMDB_TRENDING_ORIGINAL_LANGUAGES` (`en` here: no Korean, Hindi, Japanese...), in TMDB's own trending order. Each page stays 20 titles (page n is that slice of the filtered chart, read from TMDB page 1 on; chart pages kept 10 minutes). Unset: the worldwide chart, unchanged. TMDB's chart has no language filter, and a Discover catalog sorted by popularity matched only about half of it for movies and a quarter for shows | `addon/lib/getTrending.ts` |

Commits 2, 3 and 5 are one feature (original titles) and depend on each
other, in that order.

## 2. Settings in `~/aiometadata/.env`

These live in `.env`, not the code, so an update keeps them. Listed here in
case `.env` is ever rebuilt from `.env.example`:

| Setting | Value | Why |
|---------|-------|-----|
| `CACHE_WARMUP_MODE` | `essential` | Chosen over comprehensive: lighter background warming |
| `MAL_WARMUP_ENABLED` | `false` | No MyAnimeList warming |
| `META_COLD_STORE_ENABLED` / `META_COLD_STORE_MAX_BYTES` | `true` / `2gb` | Keeps looked-up metadata on disk |
| `PREFER_SMALLER_LOGOS_TMDB` | `true` | |
| `NODE_OPTIONS` | `--max-old-space-size=1024` | |
| `TZ` | `America/New_York` | |
| `POSTER_CACHE_ALLOWED_HOSTS` | `postersplus` | Lets the poster proxy reach the PostersPlus container |
| `POSTER_CACHE_PROVIDER_POLICIES` | `[{"domain":"postersplus","policy":"custom","ttl":"12h"}]` | Added 2026-09-27: players re-fetch PostersPlus posters twice a day, so the "#N Today" trending badges stay current |
| `TMDB_TRENDING_ORIGINAL_LANGUAGES` | `en,ar` | Added 2026-10-02 (**needs change 8**): Trending catalogs keep only English- and Arabic-language titles (Arabic added the same day). Comma-separated ISO 639-1 codes (`en,fr`); empty or missing shows the full worldwide chart |

## 3. Your catalog setup (stored in AIOMetadata's database)

Made in the database on 2026-09-27. It survives code updates, but two of
these only work with the fork's code changes:

- **Latest Movies** (`tmdb.discover.movie.latest_movies.vx0fe6`): English,
  released (digital/physical/TV) up to today, at least 25 votes, newest
  first, region **Worldwide** (**needs change 6**; without it the region
  falls back to US and the list is US digital releases only).
- **Latest Series** (`tmdb.discover.series.latest_series.g26xit`): English,
  premiered up to today, at least 5 votes, newest first.
- Both sit right after TMDB Trending/Popular and show on home.
- **Deleted:** `tmdb.discover.movie.trending_movies.1iws4f9` (the Discover
  collection's all-genres "Trending Movies", which was really "most popular"
  and clashed with the real TMDB Trending).
- **PostersPlus poster URL** (Settings → custom poster URL): starts
  `http://postersplus:8000/poster?…` — the container's own address, which the
  poster proxy fetches from inside Docker (`POSTER_CACHE_ALLOWED_HOSTS`),
  instead of going out through the public domain. It has no `mdblist_key`
  (AIOMetadata has no MDBList key, and an empty placeholder drops the URL;
  PostersPlus uses its own) and no
  `imdb_id={imdb_id}` since 2026-09-28. AIOMetadata drops the whole URL when
  a placeholder is empty, so titles with no IMDb id (web series) got no
  PostersPlus poster; PostersPlus 1.2.0+ needs only `tmdb_id`. Keep it out if
  the URL is ever regenerated in PostersPlus's configurator.
- Relay's folder labels (**need change 7**): without it, Relay shows 50
  identical "Popular Movies" rows again.

## 4. On the host

- **Nightly cache clear** (2026-09-27): `~/aiometadata/flush-catalog-cache.sh`,
  run by the `ubuntu` user's crontab at 06:55 and 07:55 UTC; it only acts at
  2:55 AM New York time. Deletes AIOMetadata's cached catalog pages (redis
  `e2:catalog:*`) just before Relay's 3:00 AM full warm-up, so rebuilding
  happens at night. Log: `~/aiometadata/flush-catalog-cache.log`. Upstream
  changing its redis key names would make it a silent no-op: check the log
  shows a count above 0 after an update.

## 5. Updating to a newer AIOMetadata

The changes live on the fork branch, so an update means moving that branch
onto the new upstream and redeploying. From a clone of the fork:

```bash
git remote add upstream https://github.com/cedya77/aiometadata.git  # once
git fetch upstream
git checkout claude/cool-curie-t5fpt7
git rebase upstream/dev        # replays the 8 commits on the new code
# fix any conflicts, `git add` them, `git rebase --continue`
git push --force-with-lease origin claude/cool-curie-t5fpt7
cd ~/aiometadata && docker compose up -d --build
```

Or from these patch files, on a fresh branch off the new upstream:
`git am -3 ~/aiometadata/fork-changes/000*.patch`.

**Where conflicts are expected** (each patch checked against upstream `dev`
on 2026-09-27):

| Change | Applies cleanly? |
|--------|------------------|
| 1 Dockerfile | Yes |
| 2 Original Title | **No**: `addon/index.ts` has changed upstream |
| 3 Original Title Languages | **No**: `addon/utils/parseProps.js`, `addon/lib/getMeta.js` (partly because it builds on 2) |
| 4 AER badge | **No**: `configure/src/contexts/ConfigContext.tsx` |
| 5 Cache key | Yes |
| 6 Worldwide region | Yes |
| 7 Catalog folder | Yes |
| 8 Trending languages | Yes (checked against upstream `dev` `4b32ed58`, 2026-10-02) |

After updating, check:

1. **Display Language** offers *Original Title*, and **General settings**
   has *Original Title Languages*; an Arabic title shows its Arabic name.
2. The header shows `· AER 1.0`.
3. The Discover builder's **Release Region** offers *Worldwide*, and Latest
   Movies still lists recent digital releases from any country.
4. `curl -s localhost:3232/stremio/<uuid>/manifest.json` has `"folder":`
   entries, then press ↻ on the MD addon in Relay: repeated names read
   "Popular Movies · Netflix".
5. The next morning, `~/aiometadata/flush-catalog-cache.log` shows pages
   cleared.
6. Trending Movies / Series list only English and Arabic titles (with
   `TMDB_TRENDING_ORIGINAL_LANGUAGES=en,ar` in `.env`): English and Arabic titles.
