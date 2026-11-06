<div align="center">

<img src="icons/icon-192.png" width="96" alt="Rozstav 3D logo">

# Rozstav 3D

**Plan a room in 3D right in your browser: draw it, furnish it, take a realistic photo of it.**

No sign-up. No installation. Your plans stay on your device.

### [▶ Open the app](https://romkaua.github.io/rozstav3d/)

**English** · [Українська](README.uk.md)

![Works in the browser](https://img.shields.io/badge/runs_in-browser-8064F2?style=flat-square)
![Offline](https://img.shields.io/badge/works-offline-46C98D?style=flat-square)
![Languages](https://img.shields.io/badge/languages-EN_·_UK_·_中文-E3B865?style=flat-square)
![Phones and tablets](https://img.shields.io/badge/touch-phone_·_tablet-A493FF?style=flat-square)

<img src="docs/screens/scene-en.png" width="860" alt="The 3D room editor with a furniture library and a room properties panel">

</div>

## What you can do

| | |
|---|---|
| 🏠 **Draw a floor plan** | Walls, rectangles, curved and freeform walls, doors, windows and stairs, all in millimeters. Corners snap to 90° or to any angle you set. |
| 📐 **Start from a drawing** | Open a PNG, JPEG, WebP, SVG or DXF plan. Walls, openings and rooms are detected on your device, and you review them before anything is built. |
| 🛋️ **Furnish it** | 236 items, including 111 realistic CC0 models. Drag them in, rotate them, change their size, or add your own `.glb` models. |
| 🎨 **Finish it** | Floor coverings, wall paint, wallpaper, tile, skirting boards, cornices, niches, windows and doors, with your own textures if you want them. |
| 📏 **Check the ergonomics** | The app warns you when a passage is too narrow, furniture overlaps or something blocks a door. |
| 📷 **Create a photo** | Path tracing on your own graphics card gives you soft shadows, bounced light and sun through the windows. It is free. |
| 📦 **Take it further** | Export a GLB model, a DXF drawing, or a project file you can move to another device. |

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screens/plan-en.png" alt="The floor plan editor in full screen with a curved wall and angle labels"><br><sub><b>Plan editor.</b> Full screen, icon toolbar, angles and lengths on the plan.</sub></td>
<td width="50%"><img src="docs/screens/top-en.png" alt="Top view of a furnished room"><br><sub><b>Top view.</b> Arrange the furniture with the whole room in sight.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screens/photo-en.png" alt="The photo studio with view, lighting and quality settings"><br><sub><b>Photo studio.</b> Choose the view, the light and the quality.</sub></td>
<td width="50%"><img src="docs/screens/scene-zh.png" alt="The app interface in Chinese"><br><sub><b>Three languages.</b> English, Ukrainian and Chinese.</sub></td>
</tr>
</table>

<p align="center"><img src="docs/screens/scene-phone-en.png" width="260" alt="The app on a phone with a section bar at the bottom"><br><sub><b>On a phone.</b> Touch gestures and a section bar.</sub></p>

## Getting started

1. **[Open the app](https://romkaua.github.io/rozstav3d/).** It picks your browser's language; you can change it under **⋯ → Language**.
2. **Choose a room** in the wizard, or use **⋯ → Draw a plan by hand**.
3. **Drag furniture** from the library into the room.
4. **Press "Create photo"** and pick a view and light.

To keep it on your phone, add it to your home screen. On iPhone: Safari → Share → Add to Home Screen. On Android: browser menu → Install.

### Touch gestures

| Gesture | Action |
|---|---|
| Pinch | Zoom in and out |
| Two fingers | Move the scene |
| One finger | Rotate the scene, even when it starts on furniture |
| One finger in Top view | Move the plan |
| Tap an item | Select it |
| Drag a selected item | Move it |
| Second finger during a drag | Put the item back and control the camera |

## Your plans stay yours

- Plans and projects are processed **in your browser** and are not uploaded anywhere.
- There are no accounts, and the app has no analytics code.
- The only outside request is for fonts from Google Fonts. Offline, the app uses system fonts.

Projects live in your browser's storage on that device. Use **Projects → Export** to keep a copy or move it to another device, because browsers can clear their stored data.

## Web version and Windows app

The online version is the one published here. A separate Windows app exists with a few extras.

| Feature | Online | Windows app |
|---|---|---|
| Plan editor, 3D scene, furniture, photo | ✅ | ✅ |
| Open plans from images, SVG, DXF | ✅ | ✅ |
| Own `.glb` models | ✅ in this browser | ✅ |
| Open plans from PDF | ❌ | ✅ |
| Open and save DWG | ❌ use DXF | ✅ with the free ODA File Converter |
| Export to 3ds Max (FBX + MAXScript) | ✅ | ✅ plus a texture folder |
| AI assistant (your own Gemini or OpenAI key) | ❌ | ✅ |

## Good to know

- **Browser support.** You need a browser with WebGL 2: a recent Chrome, Edge or Safari. The automated tests cover Chromium and WebKit, including phone profiles. Firefox has not been tested.
- **Devices.** Speed on phones depends on the device, and the path-traced photo is demanding.
- **Curved walls** are built from short straight segments, and doors and windows can only go on straight walls for now.
- **Translations** were not reviewed by native speakers. If a phrase reads oddly, please open an issue.

## Technology

Plain HTML and JavaScript with [three.js](https://threejs.org) and [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer). There is no backend: this repository is the built site, served by GitHub Pages.

## Credits and licensing

- Furniture models: [Poly Haven](https://polyhaven.com), [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- 3D engine: three.js and three-gpu-pathtracer, MIT.
- The app itself has no open-source license: you are welcome to use the site, but its code is not licensed for reuse.
