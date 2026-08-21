# pstatus

`pstatus` aggregates hand-maintained project status files into a local JSON snapshot and read-only dashboard.

## Configuration

Create `pstatus.json` in the working directory, point `PSTATUS_CONFIG` at a configuration file, or pass `-c path/to/config.json`. The command-line option takes precedence over `PSTATUS_CONFIG`. All relative paths resolve from the configuration file's directory.

```json
{
  "files": [
    "../project-a/STATUS.md",
    "../project-b/STATUS.md"
  ],
  "output": "./pstatus-output",
  "history": "./pstatus-output/history",
  "dashboard": "./pstatus-output/dashboard.html"
}
```

`history` and `dashboard` are optional. A dashboard can instead be an `http` or `https` URL for `pstatus -o`; in that case, serve the generated dashboard and `pstatus.json` yourself from the same static-server directory.

For a local dashboard path, regeneration writes the dynamic dashboard there. Serve that directory alongside `pstatus.json` with a static HTTP server.

## Commands

```text
pstatus                         Show actionable records from pstatus.json
pstatus -c work-config.json -r  Use an explicit configuration file
pstatus type:write              Query the existing snapshot
pstatus -r                      Regenerate, then show actionable records
pstatus -r type:write           Regenerate, then query
pstatus -r --overwrite-on-error Replace the snapshot despite unreadable files
pstatus -o                      Open the configured dashboard
pstatus -r -o                   Regenerate, then open the dashboard
pstatus --static                Write pstatus.html with embedded snapshot data
pstatus --static my-pstatus.html
```

Regeneration warns about malformed records and skips them. If any configured status file cannot load, `pstatus` does not replace the current snapshot unless `--overwrite-on-error` is used. It exits with an error if no files load.

Queries use case-insensitive regular expressions. Plain terms search the project, record fields, and metadata. `project:`, `status:`, `title:`, `date:`, and arbitrary metadata fields use `name:regex` syntax. All terms are combined with AND.

## Status Files

```markdown
# Example Project

---
2026-08-20: TODO: Write documentation. ETA:1.5h type:write priority:high

Explain the setup and query syntax.
```

Supported statuses are `BLOCKED`, `WIP`, `TODO`, and `DONE`. Metadata is case-insensitive and normalized to lowercase in the snapshot. Repeated metadata keys become arrays. The dashboard escapes all body HTML before applying its small Markdown renderer.
