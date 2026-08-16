# Learning Resources

Learning resources are local, versioned application data. The backend never
fetches a resource URL at runtime, scrapes a search engine or YouTube, crawls the
web, or guesses an article URL from a loose title.

## Curated catalog

`src/study/catalog/resources.js` stores resource ID, subject and optional exact
topic key, title, type, URL, provider, difficulty, language, optional duration,
`isCurated: true`, and tags. The initial catalog favors stable official
documentation/course roots and a small number of specifically reviewed pages.
Startup and tests validate the entire catalog; one invalid URL prevents the
catalog module from loading.

Recommendation is deterministic:

1. exact-topic curated resources;
2. subject-level curated resources;
3. directed search links when no curated entry matches.

The API and dashboard label the first two as `Terkurasi` and the third as
`Pencarian terarah`. A search result is never presented as a curated resource.

## Trusted URL validation

Validation uses `new URL()` and accepts only HTTPS without credentials. The
normalized hostname must equal a trusted domain or end in `.` plus that domain;
therefore `trusted.example.evil.test` cannot pass. Localhost, local subdomains,
private/loopback/link-local IP addresses, malformed input, and non-HTTPS schemes
such as `javascript:`, `data:`, and `file:` are rejected.

The initial allowlist is:

```text
geeksforgeeks.org, developer.mozilla.org, docs.python.org, docs.oracle.com,
freecodecamp.org, w3schools.com, khanacademy.org, pytorch.org,
scikit-learn.org, huggingface.co, coursera.org, edx.org, youtube.com, youtu.be
```

Adding a provider requires a reviewed catalog change, allowlist decision, and
passing catalog-validation tests.

## Directed search fallback

Fallback builders produce only a Google `site:` link and/or YouTube results
link. The application does not read the results. Query terms are Unicode
normalized, character-filtered, length-bounded, and URL-encoded. The builder
accepts only topic title, public subject display name, and a fixed provider key;
it has no inputs for UID, username, grade, raw SCELE text, credentials, or other
sensitive fields.

External dashboard links use a new tab with `noopener noreferrer`.
