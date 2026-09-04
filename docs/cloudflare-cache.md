# Cloudflare edge caching for jcrt.org

Goal: stop Netlify serving every request. jcrt.org is already orange-clouded through
Cloudflare, but Cloudflare is caching almost nothing, so Netlify sees ~100% of traffic.

`files.jcrt.org` is out of scope — it has its own Cloudflare setup in `jcrt-files`.

## Measured baseline (2026-08-31)

Every probe returned an `x-nf-request-id`, i.e. it reached Netlify:

| Path | `cf-cache-status` | Origin `Cache-Control` |
| --- | --- | --- |
| `/` | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/archives/` | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/religioustheory/taxonomy/` | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/sitemap.xml` | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/feed/feed.xml` | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/standard.site/documents.json` (12 MB) | `DYNAMIC` | `public,max-age=0,must-revalidate` |
| `/pagefind/fragment/*.pf_fragment` | `DYNAMIC` | `public,max-age=31536000,immutable` |
| `/css/bs.css` | `MISS` (cacheable) | `public, max-age=1382400, ...` |

Two separate causes:

1. **Cloudflare's default cache is extension-based.** It caches `.css`, `.js`, images and
   fonts. It never caches HTML, and it does not recognise `.pf_fragment` / `.pf_index` /
   `.pf_meta` — so Pagefind's 37 MB of search shards are origin-served on every search
   despite being marked `immutable`.
2. **Netlify serves HTML as `max-age=0, must-revalidate`.** Even once HTML is made
   cache-eligible, that header would keep the edge TTL at zero unless a Cache Rule
   overrides it.

Both are fixed with Cache Rules, which the Free plan supports (10 rules, and the
"Ignore cache-control header and use this TTL" Edge TTL mode is available on Free).

## Cache Rules

Dashboard → **Caching → Cache Rules**, in this order. Rules are evaluated top-down and
the first match wins, so the bypass rules must stay above the catch-all.

### 1. `bypass-markdown-negotiation` — retired (2026-09-03)

This rule is no longer needed and no rule number depends on staying first.

It existed because `netlify/edge-functions/markdown-for-agents.js` used to return a
Markdown body for the *same* URL when the client sent `Accept: text/markdown`, setting
`Vary: Accept`. Cloudflare only varies its cache key on `Accept-Encoding`, so the HTML
page and its Markdown twin shared one cache key.

**That failure actually occurred.** On 2026-09-03 `https://jcrt.org/archives/25.2/` was
serving `text/markdown` to browsers (`cf-cache-status: HIT`, `age: 10331`), while a
cache-busted request to the same path returned correct HTML — a single agent request had
poisoned the edge entry. Probing `/` with `Accept: text/markdown` returned
`cf-cache-status: HIT` rather than `BYPASS`, confirming this rule was never actually
created in the dashboard. The edge function's `Cache-Control: private, no-store` backstop
did not save it either: the response carried `private, max-age=14400`, i.e. rule 4's
"Ignore cache-control header" Edge TTL and 4-hour Browser TTL override had replaced it.

The fix was the fallback this section already prescribed: Markdown moved onto its own URL,
`<path>index.md`. Two URLs cannot share a cache key, so nothing here is load-bearing any
more and the Markdown twin caches normally under rule 4. Discovery is a static
`<link rel="alternate" type="text/markdown">` in `_includes/partials/seo.njk`.

Verify with `curl -sSI https://jcrt.org/archives/25.2/index.md` (Markdown) and
`curl -sSI -H 'Accept: text/markdown' https://jcrt.org/archives/25.2/` (HTML — Accept is
now ignored).

### 2. `bypass-dynamic-endpoints` — Bypass cache

```
(http.request.uri.path in {"/oai" "/sitemaps/oai_dc.xml" "/sitemap/oai_dc.xml" "/admin" "/submissions"})
or (starts_with(http.request.uri.path, "/oai/"))
or (starts_with(http.request.uri.path, "/admin/"))
or (starts_with(http.request.uri.path, "/submissions/"))
```

Cache eligibility: **Bypass cache**.

The three literal OAI paths are exactly the set `netlify/edge-functions/oai-pmh.js`
handles (`CANONICAL_OAI_PATH`, `OAI_FEED_PATH`, `PRIMO_OAI_PATH`); the `/oai/` prefix
clause covers the `/oai/*` route in `netlify.toml`, including the `/oai/` → `/oai` 308.
`/admin` is the CMS and `/submissions` is a form target — neither should ever be cached.

Prefix matching is deliberately `"/oai/"` and not `"/oai"`: the trailing slash stops the
rule swallowing an unrelated future path like `/oai-guidelines`. If the builder rejects a
function or set operand, the same rule expands to plain comparisons:

```
(http.request.uri.path eq "/oai")
or (http.request.uri.path eq "/oai/")
or (http.request.uri.path eq "/sitemaps/oai_dc.xml")
or (http.request.uri.path eq "/sitemap/oai_dc.xml")
or (http.request.uri.path eq "/admin")
or (http.request.uri.path eq "/submissions")
or (starts_with(http.request.uri.path, "/oai/"))
or (starts_with(http.request.uri.path, "/admin/"))
or (starts_with(http.request.uri.path, "/submissions/"))
```

Do **not** add `/sitemaps/oai-records.json` to this rule. The edge function fetches it as
a Netlify-internal subrequest on every OAI call, so bypassing it costs origin bandwidth
and buys nothing.

Bypassing `/sitemaps/oai_dc.xml` is the conservative choice, not the cheap one — it is a
2.6 MB response and harvesters replay the same verbs. Cloudflare's default cache key
already includes the query string, so `resumptionToken` paging would key correctly and
POST is never cached. If OAI harvesting shows up as a real share of the bandwidth bill,
drop the two XML paths from this rule and let rule 4 cache them at a short TTL.

### 3. `cache-immutable-assets` — Eligible for cache

```
(starts_with(http.request.uri.path, "/pagefind/"))
or (starts_with(http.request.uri.path, "/fonts/"))
or (starts_with(http.request.uri.path, "/css/"))
or (starts_with(http.request.uri.path, "/js/"))
or (starts_with(http.request.uri.path, "/images/"))
or (starts_with(http.request.uri.path, "/badges/"))
```

- Cache eligibility: **Eligible for cache**
- Edge TTL: **Use cache-control header if present, use default Cloudflare caching behavior if not** — `public/_headers` already sets sane values, including `immutable` for
  `/pagefind/v/*`, `/pagefind/index/*`, `/pagefind/fragment/*` and `/fonts/*`.
- Browser TTL: **Respect origin**

This is the rule that rescues Pagefind. `/pagefind/*` (unhashed loader files) keeps its
`max-age=0, must-revalidate`, which is correct — it changes on every deploy.

### 4. `cache-html-and-data` — Eligible for cache

```
(http.request.method in {"GET" "HEAD"})
```

- Cache eligibility: **Eligible for cache**
- Edge TTL: **Ignore cache-control header and use this TTL** → `1 day` (86400 s)
- Browser TTL: **Override origin** → `4 hours`
- Serve stale content while revalidating: **on**

The catch-all. Rule 2 has already carved out everything that must not be cached, so this
covers HTML, sitemaps, feeds, `standard.site/*.json` and the `index.md` twins.

Start at 1 day. Once the deploy purge below is wired up and verified, raise the Edge TTL
to 1 month — the purge, not the TTL, becomes what controls freshness.

## Supporting settings

- **Caching → Tiered Cache → Smart Tiered Caching: on.** Free-plan feature. Upper-tier
  data centres absorb misses so only one region's miss reaches Netlify, instead of one per
  edge location. On a low-traffic site with 300+ Cloudflare PoPs this matters more than
  the hit ratio itself.
- **Caching → Configuration → Crawler Hints: on.** Free. Tells bots when content actually
  changed, cutting speculative recrawls.
- **Caching → Configuration → Always Online: on.** Free. Serves an Internet Archive copy
  if Netlify is down or credit-throttled.
- **Speed → Optimization → Brotli / auto minify equivalents.** Cloudflare recompresses at
  the edge, so `netlify.toml`'s `skip_processing = true` costs nothing.
- **Security → Bots → Block AI bots.** Free, but read the next section before enabling.
- **Rules → Redirect Rules** — see [Tracking parameters](#tracking-parameters) below.

## AI crawler traffic

1.1 M requests/month is high for a journal of this size, and `_site/robots.txt` currently
opts *in* to GPTBot, ClaudeBot, CCBot, PerplexityBot and friends with `Allow: /`. That is
a deliberate scholarly-access choice, so the caching work above is the right first move —
cached crawler hits cost Netlify nothing.

If credits are still high after caching, use **AI Crawl Control** (Free plan; user-agent
based) to allow *Search* crawlers and block *Training* crawlers, rather than a blanket
block. A blanket block would also break the `allow-indexing-bots` edge function's premise.

Check Cloudflare **Analytics → Traffic** by user agent before deciding.

## Tracking parameters

Tracking-parameter hits currently reach Netlify and get stripped there by
`netlify/edge-functions/query-canonical-redirects.js`. Moving the common cases to a
Redirect Rule kills those origin hits and stops them fragmenting the cache key, since
Cloudflare's default cache key includes the query string.

Redirect Rules run in the `http_request_dynamic_redirect` phase, **before** cache — so a
tagged URL gets a 301 at the edge, never reaches Netlify, and never creates a cache entry.

**Rules → Redirect Rules → Create rule.** The Free plan has 10 single redirects and **no
regular expressions**, so this uses the `http.request.uri.args.names` array field for exact
parameter-name matching rather than substring tests against the raw query string.

```
(http.request.method in {"GET" "HEAD"})
and (
  any(starts_with(lower(http.request.uri.args.names[*]), "utm_"))
  or any(lower(http.request.uri.args.names[*]) in {"fbclid" "gclid" "gbraid" "wbraid" "msclkid" "mc_cid" "mc_eid" "igshid" "pagewanted" "_thumbnail_id"})
)
```

- Type: **Dynamic**
- Expression: `concat("https://jcrt.org", http.request.uri.path)`
- Status: **301**
- **Preserve query string: OFF**

That mirrors `redirectClean()` in the edge function, which also sets `out.search = ""` and
resolves against `https://jcrt.org`.

### Things that were checked

- **Keep the logic in `query-canonical-redirects.js`.** Cloudflare fronts it; it does not
  replace it. The edge function still runs for deploy previews and any direct-to-Netlify
  traffic, and costs nothing once Cloudflare handles the common case.
- **`p` and `preview` are deliberately omitted.** Both are in `JUNK_QUERY_KEYS`, but
  without regex a Cloudflare match on such short names risks false positives. They stay
  with the edge function, where exact key matching is free.
- **Archive PDFs still land on files.jcrt.org.** `/archives/<issue>/<slug>.pdf?utm_x=y`
  currently redirects there via the `archivePdfMatch && requestUrl.search` branch of
  `query-canonical-redirects.js`. Once Cloudflare strips the query that branch stops
  firing, but `archive-legacy-redirects.js` catches the bare path and redirects to the same
  target. Same destination, one extra hop. `marion-taylor-intro.pdf` is special-cased in
  both files.
- **`?page=<slug>.shtml` is untouched** — `page` is not in the strip list, so
  `articleSlugFromPageParam()` keeps working.

## Purging on deploy

`scripts/cloudflare-purge.mjs`, exposed as `npm run cf:purge`.

```sh
export CLOUDFLARE_ZONE_ID=...      # jcrt.org zone id, dashboard overview sidebar
export CLOUDFLARE_API_TOKEN=...    # Zone → Cache Purge → Purge, scoped to jcrt.org only
npm run cf:purge                            # purge everything
node scripts/cloudflare-purge.mjs --urls / /archives/   # purge specific paths (max 30/call)
node scripts/cloudflare-purge.mjs --dry-run             # print the payload, send nothing
```

### Automatic purge

`plugins/cloudflare-purge/`, registered in `netlify.toml`. It runs on Netlify's
`onSuccess` event, which fires **after the deploy stage** — so the purge lands once the new
content is live, not while the old build is still being served.

No outgoing webhook, no Cloudflare Worker and no Netlify Function are involved. The
notification form under **Site configuration → Notifications** is not used.

The plugin skips quietly when `CONTEXT` is not `production` (deploy previews, branch
deploys) and when the credentials are absent, so it is safe to merge before the environment
variables exist. `onSuccess` cannot call `utils.build.failBuild()` — the deploy has already
shipped — so a purge failure reports through `failPlugin` and leaves the deploy alone.

Set both variables under **Site configuration → Environment variables**, scoped to Builds:

| Key | Value |
| --- | --- |
| `CLOUDFLARE_ZONE_ID` | jcrt.org zone id, Cloudflare overview sidebar |
| `CLOUDFLARE_API_TOKEN` | custom token, **Zone → Cache Purge → Purge**, resource-scoped to the jcrt.org zone only. Mark it secret. |

Do not reuse a broader token — Cache Purge is the only permission needed.

## Verifying

```sh
# Should be HIT on the second request, and lose x-nf-request-id
curl -sSI https://jcrt.org/ | grep -iE 'cf-cache-status|age:|x-nf-request-id'
curl -sSI https://jcrt.org/ | grep -iE 'cf-cache-status|age:|x-nf-request-id'

# Pagefind shards should be HIT, not DYNAMIC
curl -sSI "https://jcrt.org/pagefind/pagefind-entry.json" | grep -i cf-cache-status

# The Markdown twin lives on its own URL; the page URL always returns HTML
curl -sSI https://jcrt.org/index.md | grep -i content-type
curl -sSI -H 'Accept: text/markdown' https://jcrt.org/ | grep -i content-type
```

`DYNAMIC` means the rule did not match. `BYPASS` means a rule explicitly excluded it.
`HIT` with a rising `age` and no `x-nf-request-id` is the win condition.

## Rollback

Disable rule 4 (`cache-html-and-data`) in the dashboard and run `npm run cf:purge`. The
site reverts to today's behaviour within seconds; nothing in the repo needs reverting.
