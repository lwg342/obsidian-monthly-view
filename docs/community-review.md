# Community submission review — 0.1.5

Checked against the official developer policies, plugin submission requirements,
and `eslint-plugin-obsidianmd` recommended rules on 2026-11-07.

- MIT LICENSE added; package metadata and README identify the license.
- Manifest ID and command IDs conform; description is concise and ends in a period.
- Runtime uses the public Obsidian API and browser APIs, with no Node/Electron imports.
- No accounts, requests, telemetry, advertisements, self-updates, or access outside the vault.
- Monthly files use Vault APIs. Creation is explicit and never overwrites existing files.
- No copied backend code or bundled third-party runtime libraries. Diane is a layout reference.
- Registered events and intervals are disposed with the view; refresh timeouts are cleared on close.
- Native Markdown rendering is used, with embedded media converted into links.
- Settings data is validated before use. Settings are searchable on recent hosts, with an imperative fallback for older hosts.
- Recommended lint: zero errors and warnings. One documented exception permits a control-character rejection regex.
- Type checking, all 20 tests, and production build pass.
- Minimum version remains 1.7.2 based on runtime APIs; mobile layout was tested with narrow desktop viewports, not physical devices.

The official directory scanner and review are separate from these local checks.
