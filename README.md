# pstatus

## Overview

`pstatus` helps you see task status across any number of projects.

Use it when you keep local `STATUS.md` files in different repositories and you want one place to see what is blocked, in progress, next, or done. It is designed to help you resume work fast after you switch context.

`pstatus` has two main interfaces:

- a command-line interface for regeneration and quick queries
- an HTML dashboard for browsing, filtering, and reading task details

`pstatus` does not watch your files. It does not update by itself. Your `STATUS.md` files are the source of truth. The generated snapshot and the dashboard change only when you run a CLI command such as `pstatus -r`.

## Getting Started

This section gives you a complete setup from scratch.

### 1. Prepare project status files

Create one `STATUS.md` file in each project that you want to track.

Example:

```markdown
---
2026-08-20: TODO: Write the release notes. ETA:1h type:write

Explain the main changes for the next release.
```

You can also add a checklist:

```markdown
---
2026-08-20: WIP: Finish API cleanup. ETA:2h type:code

- [x] Remove dead endpoint.
- [ ] Update tests.
- [ ] Update docs.
```

### 2. Create a configuration file

Create `pstatus.json` in the directory where you want to run `pstatus`, or pass the file path with `-c`.

Example:

```json
{
  "files": {
    "Project A": ["../project-a/STATUS.md"],
    "Project B": ["../project-b/STATUS.md", "../project-b/STATUS-extra.md"]
  },
  "output": "./pstatus-output",
  "history": "./pstatus-output/history",
  "dashboard": "./pstatus-output/dashboard.html",
  "custom_css": "./pstatus-theme.css",
  "page_title": "PStatus",
  "source_path_depth": 2
}
```

Use arrays for all `files` values. A project can have one file or many files.

`source_path_depth` limits how much path information `pstatus` stores in generated data. With the default value `2`, a source path such as `dev/projects/vouchsafe/getvouchsafe/STATUS.md` becomes `vouchsafe/getvouchsafe/STATUS.md` in `pstatus.json` and in the dashboard.

### 3. Generate the snapshot

Run:

```text
pstatus -r
```

This command reads the configured `STATUS.md` files and writes a fresh snapshot to the output directory.

If one or more status files fail to load, `pstatus` does not replace the current snapshot unless you use:

```text
pstatus -r --overwrite-on-error
```

### 4. Check the results

After `pstatus -r`, look in the output directory.

You will see at least:

- `pstatus.json`
- the dashboard HTML file, if `dashboard` is a local file path

### 5. Query the snapshot in the CLI

Run:

```text
pstatus
```

This command reads the current generated snapshot. It does not reread your source files.

### 6. Open or serve the dashboard

If your config has a local `dashboard` file path, run:

```text
pstatus -o
```

This opens the configured dashboard. It does not start a server.

To refresh the dashboard data, run `pstatus -r` first.

## Quick Start Example

Create these files.

`STATUS.md`:

```markdown
---
2026-08-20: TODO: Write the migration guide. ETA:1h type:write

Explain the breaking changes.
```

`pstatus.json`:

```json
{
  "files": {
    "Docs": ["./STATUS.md"]
  },
  "output": "./pstatus-output"
}
```

Run these commands:

```text
pstatus -r
pstatus
```

Expected result:

- `pstatus-output/pstatus.json` exists
- the CLI shows the task summary

## Write Tasks In `STATUS.md`

Use `---` to start a section.

### Dated record format

Use this format for normal task records:

```text
YYYY-MM-DD: STATUS: TITLE metadata:value metadata:value
```

Example:

```markdown
---
2026-08-20: TODO: Write the onboarding guide. ETA:1.5h type:write priority:high

Explain the local setup steps.
```

Supported status values:

- `BLOCKED`
- `WIP`
- `TODO`
- `DONE`

### Checklist section format

You can also use a checklist-only section.

Each top-level checklist item becomes one task.

Example:

```markdown
---
- [x] Align the config format.
  - [x] Update the main config file.
  - [x] Update the example config file.

- [ ] Finish the network layer.
  - [ ] Add peer link support.
  - [ ] Add tests.
```

For checklist-only sections:

- the file mtime becomes the date
- child checklist items become task progress
- deeper nested checklist items are ignored by `pstatus`

### Metadata

Metadata uses `name:value`.

Example:

```text
ETA:1h type:write priority:high
```

Keep metadata values on one token. Do not put spaces in a metadata value.

### HTML in source files

`pstatus` removes raw HTML tags from titles, bodies, and checklist text when it builds `pstatus.json`.

Use plain text or Markdown in `STATUS.md` files. Do not rely on inline HTML.

### ETA

Use ETA when you want to ask, “What can I finish in the time I have?”

Supported ETA formats:

- `30m`
- `1h`
- `1.5h`
- `2h30m`

## Use the CLI

The CLI reads the current snapshot unless you use `-r`.

### Show the current summary

```text
pstatus
```

### Regenerate the snapshot

```text
pstatus -r
```

Important: nothing updates until you run a regenerate command.

Important: generated snapshots do not store full source paths by default. `pstatus` trims stored paths with `source_path_depth`.

### Query the current snapshot

```text
pstatus type:write
pstatus status:WIP
pstatus project:docs ETA:1h
```

### Use a specific config file

```text
pstatus -c work-config.json -r
```

### Open the configured dashboard

```text
pstatus -o
```

### Create a static dashboard file

```text
pstatus --static
pstatus --static team-status.html
```

### Create a static dashboard for one project only

Use this when you want to publish one project snapshot into that repository.

```text
pstatus -r --static status.html --static-project "Project A"
```

This command embeds only the selected project in the generated HTML file.

## Use the Dashboard

The dashboard shows:

- one column per configured project label
- task cards for matching items
- task details in a popup dialog
- search, ETA filters, and a completed-items toggle

The dashboard is read-only.

The dashboard does not refresh source files. Run `pstatus -r` to refresh the generated data.

### Search

Use plain terms to search across project, status, title, body, and metadata.

Example:

```text
revocation
```

Use `name:value` to search a field or metadata key.

Examples:

```text
project:docs
status:WIP
type:write
priority:high
```

All terms use AND logic.

### ETA filters

Use the ETA buttons when you have a limited amount of time.

Examples:

- `<= 1h` shows tasks that take 1 hour or less
- `<= 2h` shows tasks that take 2 hours or less
- `<= 4h` shows tasks that take 4 hours or less

If a task has no parsed ETA, it does not appear when an ETA filter is active.

## Serve the Dashboard

Serve the output directory with any static file server.

Examples:

### Node.js

```text
npx http-server ./pstatus-output
```

### Python

```text
python -m http.server --directory ./pstatus-output 8080
```

### Ruby

```text
ruby -run -e httpd ./pstatus-output -p 8080
```

You can use any other static file server that you prefer.

## Create a Static Snapshot

Use a static snapshot when you want one self-contained HTML file.

Create the default static file:

```text
pstatus --static
```

Create a named static file:

```text
pstatus --static my-status.html
```

Create a named static file for one project only:

```text
pstatus --static my-status.html --static-project "Project A"
```

The static file contains the HTML, CSS, JavaScript, and snapshot data.

## How Data Flows

The flow is simple:

1. You edit `STATUS.md` files.
2. You run `pstatus -r`.
3. `pstatus` writes a new `pstatus.json` snapshot.
4. The CLI and dashboard read that generated snapshot.

If you do not run `pstatus -r`, the CLI and dashboard continue to show the old snapshot.

## Reference: Configuration File

### `files`

Required.

Type: object.

Each key is a project label. Each value is an array of one or more file paths.

Example:

```json
{
  "files": {
    "Docs": ["../docs/STATUS.md"],
    "Server": ["../server/STATUS.md", "../server/STATUS-extra.md"]
  },
  "source_path_depth": 2
}
```

### `output`

Required.

Type: string.

This directory stores the current snapshot.

### `history`

Optional.

Type: string.

If set, `pstatus -r` also writes timestamped full snapshots here.

### `dashboard`

Optional.

Type: string.

Use a local file path if you want `pstatus -r` to write the dynamic dashboard file.

Use an `http` or `https` URL if you want `pstatus -o` to open that URL.

### `custom_css`

Optional.

Type: string.

This is a path to a CSS file. `pstatus` appends that CSS after the base dashboard CSS.

### `page_title`

Optional.

Type: string.

Default: `PStatus`

This value sets the dashboard page title and visible heading.

### `source_path_depth`

Optional.

Type: non-negative integer.

Default: `2`

This value controls how many parent directories `pstatus` stores in generated snapshot paths.

Examples:

- depth `0`: `STATUS.md`
- depth `1`: `getvouchsafe/STATUS.md`
- depth `2`: `vouchsafe/getvouchsafe/STATUS.md`

Use this setting to avoid leaking full filesystem paths in `pstatus.json`, dashboard detail views, and static exports.

### Path rules

All relative paths in the config file resolve relative to the config file location.

## Reference: `STATUS.md`

### Section start

Use `---` to start a section.

### Dated record syntax

```text
YYYY-MM-DD: STATUS: TITLE metadata:value metadata:value
```

### Checklist-only section syntax

Top-level checklist items become records. One level of child checklist items becomes task progress.

### Metadata rules

- metadata keys are case-insensitive
- repeated keys become arrays in the snapshot
- unknown metadata is preserved

### ETA rules

Recognized ETA values become normalized minutes in derived data.

### Error rules

Malformed records are warned about and ignored.

Raw HTML is removed before data is written to the snapshot.

## Reference: Dashboard

### Dynamic mode

The dynamic dashboard reads `pstatus.json` from the output directory.

### Static mode

The static dashboard embeds snapshot data directly in one HTML file.

### Layout

- one column per configured project label
- per-column scrolling on desktop
- horizontal column scrolling on mobile
- task details in a popup dialog

### Controls

- search
- ETA filters
- show completed items

## Reference: CSS Customization

Base dashboard assets:

- `src/dashboard.html`
- `src/dashboard.css`

Use `custom_css` to override the base theme.

Important CSS variables include:

- `--page-bg`
- `--panel-bg`
- `--panel-border`
- `--text-main`
- `--text-muted`
- `--danger`
- `--success`
- `--warning`
- `--done`
- `--progress-fill`
- `--check-done`

Example:

```css
:root {
  --page-bg: #05070d;
  --accent-strong: #c2410c;
  --progress-fill: #c2410c;
}
```

## Troubleshooting

### The dashboard shows old data

Run:

```text
pstatus -r
```

### The CLI shows old data

Run:

```text
pstatus -r
```

### A file failed to load

Check the warning output from `pstatus -r`.

### The snapshot was not replaced

This happens when one or more configured files fail to load.

Use this only if you want to keep partial results:

```text
pstatus -r --overwrite-on-error
```

### The dashboard does not open

Check the `dashboard` setting in `pstatus.json`.

### Search gives an error

Your search term probably contains an invalid regular expression.

## Design Notes

- The dashboard is read-only.
- `pstatus` does not scan for projects automatically.
- `pstatus` does not watch source files.
- `pstatus` updates generated data only when you run CLI commands such as `pstatus -r`.
