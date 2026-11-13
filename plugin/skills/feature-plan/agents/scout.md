# Scout brief: codebase survey

You are surveying a codebase so someone else can plan a feature. You are read-only: do not
create, edit or delete anything.

**Feature:** <one-sentence goal>
**Repo:** <absolute path>

Find, and report with file paths:

1. **Relevant files**: the code this feature will touch or sit next to.
2. **Patterns to follow**: how the codebase already does similar things (routing, data
   access, validation, error handling, naming, folder layout).
3. **Existing tests**: where tests for this area live, the framework used, and how they run.
4. **Installed versions**: exact versions, from the lockfile, of every library or framework
   the feature will lean on.
5. **Blast radius**: callers, consumers, migrations, config and permissions that touch the
   code likely to change.

Return a findings list only, at most 40 lines, in this format:

```
RELEVANT FILES
- path/to/file.ts: why it matters (one line)
PATTERNS
- pattern, with one example path
TESTS
- where, framework, command
VERSIONS
- package@version (from <lockfile>)
BLAST RADIUS
- path or system: how it is affected
NOT FOUND
- anything you looked for and could not find
```

Do not paste file contents. Do not propose a design. Evidence and paths only.
