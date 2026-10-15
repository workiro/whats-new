# What's new in Workiro: RSS feed

An RSS feed of Workiro product updates, built from the What's New data and published with GitHub Pages.

| | |
|---|---|
| **Subscribe** | https://workiro.github.io/whats-new/feed.xml |
| **Landing page** | https://workiro.github.io/whats-new/ |

Paste either URL into Slack's RSS app or any feed reader. The landing page advertises the feed, so readers that are given the site address will find it automatically.

## How it works

A GitHub Actions workflow (`.github/workflows/publish-feed.yml`) runs every hour and:

1. Fetches the update data from the public Firebase endpoint `https://scim-whats-new.firebaseio.com/updates.json`.
2. Runs `build-feed.js`, which writes two files to `_site/`:
   - `feed.xml`: an RSS 2.0 feed of the latest 50 updates
   - `index.html`: a landing page in Workiro's brand styling, with a copy-the-feed-URL button and the latest 12 updates
   - `logo.svg` and `favicon.png`: downloaded from Workiro's website at build time, so visitors make no requests to third parties
3. Deploys `_site/` to GitHub Pages.

If the logo or icon can't be downloaded, the page still publishes with a text wordmark in place of the logo.

If the fetch fails or returns no updates, the run fails without deploying, so the last good feed stays live.

A second job in the same workflow, `keepalive`, makes an empty commit when the repository has had no commits for 50 days. GitHub disables scheduled workflows in public repositories after 60 days without activity, and this stops the feed from silently going stale.

There is no server and no database access beyond a public read. Nothing in this repository is secret.

## Publishing an update

Add the update in Firebase as usual. It appears in the feed within about an hour. To publish immediately, go to **Actions → Publish What's New RSS feed → Run workflow**.

The data looks like this:

```json
{
  "updates": {
    "2026-09-04": {
      "items": [
        { "title": "Duplicate a document", "body": "Markdown text. [Learn more](https://help.workiro.com/...)" }
      ]
    }
  }
}
```

Follow these rules so subscribers get a clean feed:

- **Date keys must be `YYYY-MM-DD` with zero padding**, for example `2026-09-04`, not `2026-9-4`. The script tolerates missing padding, but other consumers of the data may not.
- **Never insert or reorder items within a day that has already been published.** Items have no ID, so each one is identified by its date and position. Moving an item changes its identity and readers will show old updates as new. Editing the text of an item is fine.
- **Write the body in Markdown.** It is converted to HTML for feed readers and the landing page.
- **Put the help article link first.** The first link in the body becomes the item's link in the feed. Items without a link point to the What's New page.

## Configuration

Settings live in the `FEED` block at the top of `build-feed.js`.

| Setting | Purpose |
|---|---|
| `title`, `description` | Feed and landing page name and summary |
| `link` | The human-facing What's New page, used as the fallback item link |
| `self` | This feed's own URL. Must match the published address exactly |
| `site` | The landing page URL |
| `maxItems` | Number of updates in `feed.xml` |
| `pageItems` | Number of updates shown on the landing page |

The data source can be overridden with the `SOURCE` environment variable.

Branding lives in the `BRAND` block, just above the landing page code.

| Setting | Purpose |
|---|---|
| `logoUrl`, `iconUrl` | Where the logo and favicon are downloaded from at build time |
| `home`, `help` | Links in the page header and footer |
| `fontFamily` | CSS font stack for the page |
| `fontCssUrl` | Optional web font stylesheet URL. Leave empty to use only installed fonts |

Colours follow the Workiro brand palette: Green `#00B1B2` for buttons and accents, a darker `#007A7B` for link text so it meets WCAG AA contrast on white, and Purple `#7E49E7` for focus outlines and hover states.

## Running locally

Requires Node.js 20 or later.

```bash
npm install
SOURCE=./path/to/export.json node build-feed.js
```

`SOURCE` accepts either a full Firebase export or just the `updates` node. Open `_site/index.html` in a browser and `_site/feed.xml` in a feed validator such as https://validator.w3.org/feed/.

Without `SOURCE`, the script reads the live Firebase endpoint.

## Repository settings this depends on

- **Settings → Pages → Source:** GitHub Actions
- **Settings → Actions → General → Workflow permissions:** Read and write, so the keepalive job can commit
- **`main` must not have branch protection** that blocks pushes from GitHub Actions
- **Settings → Environments → github-pages:** `main` allowed as a deployment branch (the default)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build step fails with `Permission denied` | Firebase rules no longer allow public reads | Restore public read on `/updates`, or switch the script to authenticated reads |
| Build step fails with `No items found` | The `/updates` node is empty or has moved | Check the data path in Firebase and `SOURCE` |
| Keepalive job fails with a 403 | Workflow token is read-only | Set workflow permissions to Read and write |
| Deploy blocked by an environment rule | `github-pages` environment restricts branches | Allow `main` under Settings → Environments |
| Scheduled runs have stopped | Workflow disabled by GitHub | Re-enable it in the Actions tab, then check the keepalive job |
| Old updates reappear as new in readers | Items were inserted or reordered in a published day | Restore the original order |

## Ownership

Maintained by: product@Wórkiro.com
