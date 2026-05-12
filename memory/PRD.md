# BlueLink Mesh — PRD

## Original Problem Statement
> Create onboarding page and build the apk to push on github for apk release

## Product Snapshot
- **App**: BlueLink Mesh — offline-first peer-to-peer chat
- **Tech stack**: React 19 + TypeScript + Vite + Capacitor 8 (Android target)
- **Distribution**: Web (PWA) + Android APK via GitHub Actions

## User Persona
- Field/event attendee who wants to chat with people physically nearby without internet
- Privacy-focused user wary of cloud-based messengers
- Tinkerer/maker interested in BLE + WebRTC mesh networking

## Core Requirements (static)
1. First-launch onboarding that explains the mesh + collects a display name/avatar
2. Skippable onboarding (last step requires a name)
3. CI workflow that:
   - Builds a debug APK on every push to `main`/`master`
   - Builds + publishes a GitHub Release whenever a `v*` tag is pushed

## Implemented (2026-01-12)
- `src/components/Onboarding.tsx` — 4-slide animated onboarding (Welcome / Mesh / E2E Encryption / Profile)
  - Uses `motion/react` for visual animations (pulsing rings, animated mesh graph, rotating crypto ring, floating glyphs)
  - Dot pagination, back/skip/next controls, disabled state on empty name
  - All elements tagged with `data-testid`
- `src/App.tsx` integration:
  - Added `'onboarding'` to the `step` union type
  - On first launch (no `bluelink_onboarded` flag) → render Onboarding
  - On completion: persist `bluelink_name`, `bluelink_avatar`, set `bluelink_onboarded=true`, advance to `discovery`
  - Returning users go straight to chat
- `.github/workflows/build-apk.yml` updated:
  - Now triggers on `push` to main/master, on `v*` tag, and on manual dispatch
  - JDK 21 + Node 22 (Capacitor 8 requirement)
  - Produces `bluelink-mesh-<ref>.apk` artifact
  - On tag push: attaches APK to a new GitHub Release via `softprops/action-gh-release@v2`

## Tested
- ✅ Vite production build (3.4s, 1.24 MB JS gzipped to 350 KB)
- ✅ Onboarding loads on first visit (localStorage empty)
- ✅ Slide nav: continue, back, dots, skip all wired
- ✅ Name validation: button disabled when empty, enabled on input
- ✅ Avatar upload via file picker (FileReader → data URL)
- ✅ Completion persists profile and routes to `discovery`
- ✅ Returning users skip onboarding entirely
- ✅ YAML workflow is valid + uses Node 22 to satisfy `@capacitor/cli@8`

## How to publish an APK Release
1. Push the repo to GitHub via the **Save to Github** button in the chat input
2. Wait for the `Build Android APK` workflow to run (or trigger it manually) — produces a debug APK artifact
3. To cut a tagged release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   The workflow will rebuild the APK and publish a GitHub Release with `bluelink-mesh-v1.0.0.apk` attached.

## Future / Backlog
- P1 — Signed *release* APK (needs keystore in GitHub secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
- P1 — Bump `versionCode`/`versionName` in `android/app/build.gradle` from the git tag automatically
- P2 — Permission rationale screens for BT/Mic/Camera/Location (native Android prompts will still appear)
- P2 — Onboarding analytics / first-run telemetry (only if privacy policy allows)
- P2 — Localised onboarding copy (i18n)
