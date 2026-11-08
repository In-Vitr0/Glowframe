# Glowframe

A Safari extension for macOS that fills the empty space around YouTube videos with soft, ambient light taken from the video's own colors.

It was built for ultrawide and OLED screens: instead of black bars that never light up while the video area wears, the edges glow along with the picture. Pixels are used more evenly, and watching feels more immersive.

## Features

- **Ambient light from the video colors.** The light fills the free areas around the video (pillarbox and letterbox), all the way to the screen edge or with an adjustable spread. Each of the four sides can be switched on or off.
- **Smooth transitions, like a TV ambient light.** The video is sampled at a low rate (12–18 fps is enough). In between, the light fades smoothly at up to 60 frames per second instead of jumping.
- **Presets.** Four built-in presets (My Setup, Burn-in Guard, Cinema Bold, Eco), plus your own: type a name and save. Presets store only the look of the light.
- **HDR light.** On HDR displays, HDR videos get light that can glow brighter than normal white (WebGPU, `rgba16float`, extended tone mapping). Normal videos keep the normal light. HDR videos are detected via the chosen quality level, e.g. "2160p60 HDR".
- **Fullscreen.** Works in YouTube's player fullscreen and looks the same as theater mode.
- **Automatic theater mode.** Optional. If you leave theater mode yourself (button or `t` key), it stays off for that video.
- **Automatic video quality.** Optional. Picks the highest quality up to a cap of 1080p, 1440p or 4K. Never above 4K. The space bar keeps working afterwards.
- **Comments stay clear.** In page mode the light stays inside the player area and leaves out the control bar. Comments, description and recommendations are never covered.
- **Private.** Settings are stored locally. Video pixels are never read back or sent anywhere. Runs only on `https://www.youtube.com/`.

## Settings

| Group | Setting | What it does |
| --- | --- | --- |
| Colors | Brightness, contrast, saturation | Applied to the light, not to the video. Higher contrast turns dark grey edges into true black. |
| Light | Light up to the screen edge | Light fills the whole free area; otherwise *Spread* sets how far it reaches. |
| Light | Blur, light strength, darken at the edge | Softness, strength and an optional vignette. |
| Light | HDR light for HDR videos | Brighter-than-white light on HDR displays. |
| Transitions | Fade-in time | How long the light takes to appear. |
| Transitions | Smooth transitions | Fade time between samples (50 % ≈ 300 ms, 90 % ≈ 540 ms). 0 % = hard switches, cheapest. |
| Transitions | Video sample rate | How often the video is read. Lower saves power. |

## Install and build

Requirements: macOS with Safari and Xcode, on Apple Silicon. Built and tested with Xcode 27.2 and Safari 27.2.

1. Open `Glowframe.xcodeproj` in Xcode.
2. For both targets (*Glowframe* and *Glowframe Extension*), go to **Signing & Capabilities** and choose your own team. The team is left empty in this repository.
3. Build and run the *Glowframe* scheme. The small app window links to Safari's settings.
4. In Safari → **Settings → Extensions**, enable **Glowframe** and allow it on `www.youtube.com`.
5. Reload YouTube.

Without a paid developer account, Safari may require **Develop → Allow Unsigned Extensions** for locally built extensions.

Command line build:

```bash
xcodebuild -project Glowframe.xcodeproj -scheme Glowframe -configuration Debug -destination platform=macOS,arch=arm64 build
```

## Notes

- **Safari's native video fullscreen** does not allow page overlays. Use the fullscreen button in the YouTube player.
- **Safari 27 HDR findings:** a 2D canvas cannot output HDR; CSS `blur()` and CSS `opacity` clamp WebGPU HDR output back to normal white; `importExternalTexture` returns black for HDR/Dolby Vision videos; a `display-p3` 2D canvas made 4K HDR playback stutter. That is why blur, grading and fading for the HDR light run in a WebGPU shader fed from a small sRGB 2D canvas.

## Project layout

| Path | Contents |
| --- | --- |
| `Resources/content.js` | Light layer, geometry, sampling and smooth fading, theater mode, status |
| `Resources/settings.js` | Defaults, value ranges, geometry, presets |
| `Resources/quality.js` | Automatic quality choice via YouTube's settings menu |
| `Resources/hdr.js` | WebGPU HDR renderer (Gaussian blur and grading in WGSL) |
| `Resources/popup.*` | Settings popup |
| `main.swift`, `SafariWebExtensionHandler.swift` | Container app and extension handler |
