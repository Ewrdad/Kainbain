# Site Docs — authoring guide

Markdown-driven knowledge base for humans **and** agents. The API serves these
files as raw markdown (`GET /docs`, `GET /docs/:slug`); the frontend `Docs`
view renders them with the shared `MarkdownViewer`.

## Adding an article

1. Create `<slug>.md` in this directory (lowercase, hyphens only).
2. Start with frontmatter — all four fields required:

```md
---
title: My Article
section: how-it-works
order: 10
slug: my-article
---

# My Article
...
```

3. No code changes needed — the index builds from frontmatter at request time,
   so edits and new files are live without a rebuild.

## Rules

- `section` is exactly `how-it-works` (how the system works) or `working-with`
  (how to operate it). Files with any other section are skipped from the index.
- `slug` must equal the filename (`my-article.md` declares `slug: my-article`).
  `getDoc` falls back to a directory scan on mismatch, so a mismatch still
  resolves — but it is fragile, and the integrity test below fails on it.
- `order` sorts within a section (gaps of 10 leave room to insert). No two
  articles may share an `order` within the same section — sidebar order must be
  deterministic, and the integrity test fails on collisions.
- No stubs: an overview article must link to detail articles, not restate them.
  Duplicated content folds into the canonical article (stub is deleted, the
  target gains a one-line "(Formerly in `<slug>`, removed)" provenance note).
- Cross-link with `` `#/docs/<slug>` `` (backticked). Every such link must
  resolve to an indexed slug — the integrity test checks this, so update links
  in the same change that renames or deletes an article.
- Keep articles small and task-focused; seed claims from live sources
  (`README.md`, `SystemGuideModal`, `agentGuide.js`) so content cannot rot.
- Code samples use `bash`/`text` fences; tables need leading/trailing `|` per
  the `MarkdownViewer` parser. No raw HTML — it renders as inert text.
- Never put secrets, tokens, or host-specific credentials in an article: every
  file in this directory is served unauthenticated over HTTP by design.
