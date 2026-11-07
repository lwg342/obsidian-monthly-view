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

## Directory feedback — 0.1.6

The initial submission was accepted and published on 2026-11-07. Automated
review identified missing English README sections and recommended release
asset attestations. Added English installation, usage and privacy guidance,
and GitHub build attestations. Replaced CSS grid column-gap with equivalent
gap syntax to avoid the scanner's multicolumn-compatibility warning.
Review completion remains controlled by the community directory.

## Source review follow-up — 0.1.7

The directory recommended Obsidian's createEl helper. View elements now use
a detached fragment's createEl method, retaining the correct owning document
for popout windows. The test host implements that official DOM helper.
