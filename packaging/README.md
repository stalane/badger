# Publishing Badger to free installers

These drafts live here for reference. To submit them, copy each file into the
upstream repo layout described below and open a PR. **After every Badger
release, bump the version + URLs + hashes** (get hashes from the release's
`SHA256SUMS.txt`).

## winget

Upstream: https://github.com/microsoft/winget-pkgs — create
`manifests/s/stalane/Badger/<version>/` containing the three files
`stalane.Badger.installer.yaml`, `stalane.Badger.locale.en-US.yaml`,
`stalane.Badger.yaml` (or run `wingetcreate new <url>` on Windows to generate
them). Installs with: `winget install stalane.Badger`

## Scoop

Upstream: either the main bucket (needs popularity) or your own tap, e.g.
`stalane/scoop-bucket` with this file at `bucket/badger.json`.
Installs with: `scoop bucket add stalane https://github.com/stalane/scoop-bucket`
then `scoop install badger`. Fill `hash` from the release's `SHA256SUMS.txt`
(`Badger.Setup.<version>.exe` entry — note release asset names use dots,
e.g. `Badger.Setup.0.1.1.exe`).
