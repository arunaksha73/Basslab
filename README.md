# BassLab 3D

Android sound-enhancement and soundbar companion app. Credits: Arunaksha Das.

## Status (Phase 1-2: UI prototype)
Working: all 8 screens, navigation, sound-mode EQ curves, 10-band EQ and curve, presets, parametric filter list, theme, local persistence.
Not yet implemented: audio engine / DSP (Phase 4), media-session integration (Phase 5), device control (Phase 6).
The soundbar profile is informational only; no connection, firmware or hardware command is claimed.

## Structure
- www/index.html   - markup for all screens
- www/css/styles.css - design tokens and components
- www/js/app.js    - navigation, state, EQ, effects, visualizer (demo data)

## Run in a browser
Open www/index.html, or run `npx serve www`.

## Build the Android debug APK
1. `npm install`
2. `npx cap add android`
3. `npx cap sync android`
4. `npx cap open android`, then Build > Build APK(s) in Android Studio
Requires Node 18+, Android Studio and JDK 17.
