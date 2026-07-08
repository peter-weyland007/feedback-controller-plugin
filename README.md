# fee[dB]ack Controller Support

A standalone plugin for **fee[dB]ack** that adds a controller-input sandbox screen.

It now includes:
- live controller detection
- controller picker when multiple pads are connected
- per-controller auto-load when an exact saved device match returns
- named profiles saved per controller
- **New** profile button
- **Duplicate** profile button
- click-to-map input capture
- calibration for **all 4 standard stick axes**
- a bundled plugin CSS file so the standalone install renders correctly
- saved mappings/profile selection via localStorage

## What was broken

The standalone repo version previously shipped only `screen.html` + `screen.js` and depended on the host app's in-tree Tailwind scan.

That meant a standalone runtime install could show up looking blank or basically unstyled.

This is now fixed by shipping:
- `assets/plugin.css`
- `styles: "assets/plugin.css"` in `plugin.json`

## Install

### 1. Download and unzip

After unzip, you should have:

```text
feedback_controller_plugin/
  plugin.json
  screen.html
  screen.js
  assets/
    plugin.css
```

### 2. Put it in your user plugins directory

Example:

```text
~/feedback-plugins/feedback_controller_plugin/
```

### 3. Launch fee[dB]ack with `FEEDBACK_PLUGINS_DIR`

macOS / Linux:

```bash
FEEDBACK_PLUGINS_DIR="$HOME/feedback-plugins" /path/to/your/feedback-app
```

Windows PowerShell:

```powershell
$env:FEEDBACK_PLUGINS_DIR="$HOME\feedback-plugins"
Start-Process "C:\path\to\fee[dB]ack.exe"
```

### 4. Restart the app

If fee[dB]ack was already open, fully quit and reopen it.

### 5. Open the plugin

In fee[dB]ack:
- **Plugins**
- **Controller Support**

## How to use it

### Pick the controller
1. Plug in one or more controllers
2. Open **Selected controller**
3. Pick the exact controller you want

If a controller comes back later with the same exact browser-reported device id + slot, the plugin now auto-selects that controller when it has saved data for it.

### Work with profiles
- **Rename** changes the current profile name
- **New** creates a fresh profile for the selected controller
- **Duplicate** clones the current profile under a new name

### Map controls
1. Click a mapping tile
2. Press a button or move an axis
3. The plugin saves that input into the current profile

### Calibrate axes
You can tune:
- **Axis threshold**
- **Deadzone** for left stick X/Y and right stick X/Y
- **Invert axis** for left stick X/Y and right stick X/Y

## Troubleshooting

### The plugin appears but looks blank / unstyled
That specific packaging problem is what `0.6.6` fixes.

`0.6.6` also keeps the standalone package aligned with the live Feedback plugin UI:
- visible **Controller Support** naming
- visible in-screen version label
- safer `<select>` rendering so controller/profile dropdowns do not constantly reset while you interact with them
- JS fallback that injects the plugin stylesheet itself when the host app is older and does not auto-load plugin `styles` yet.

Make sure all of these files are present:

```text
feedback_controller_plugin/
  plugin.json
  screen.html
  screen.js
  assets/plugin.css
```

### I installed it but do not see it
Check:
- the folder name is exactly `feedback_controller_plugin`
- `plugin.json` is inside that folder
- `FEEDBACK_PLUGINS_DIR` points to the parent folder
- fee[dB]ack was restarted after install

Correct:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins
~/feedback-plugins/feedback_controller_plugin/plugin.json
```

Wrong:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins/feedback_controller_plugin
```

## Repository contents

```text
feedback_controller_plugin/
  plugin.json
  screen.html
  screen.js
  assets/
    plugin.css
```

## Version

Current packaged plugin version:
- `0.6.6`

## License

MIT
