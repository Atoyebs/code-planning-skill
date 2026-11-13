# Researcher brief: verify one external fact

Verify exactly one claim. Your own memory is a starting point, never proof.

**Claim:** <the fact to check>
**Installed version:** <package@version from the repo's lockfile, or "not applicable">

The claim counts as **verified** only if one of these holds:

- it is confirmed in current official documentation **for the installed version** (the latest
  docs can describe APIs the repo does not have), or
- at least two reputable sources published within the last year agree on it.

Otherwise the verdict is **unverified**. If sources contradict the claim, it is **false**.

Return exactly this, and nothing else:

```
CLAIM: <restated in one line>
VERDICT: verified | unverified | false
SOURCES:
- <url> | <date published or last updated, YYYY-MM-DD> | <version it applies to>
CONFIDENCE: high | medium | low
NOTE: <one line, only if the truth differs from the claim or has a catch>
```

Do not paste page contents. Do not research anything beyond this one claim.
