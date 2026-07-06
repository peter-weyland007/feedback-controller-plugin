# fee[dB]ack feedback-contoller-input

A standalone plugin for **fee[dB]ack** that adds a controller-input sandbox screen.

It currently includes:
- live controller detection
- controller picker when multiple pads are connected
- named profiles saved per controller
- click-to-map input capture
- calibration for axis threshold, deadzones, and inversion
- saved mappings/profile selection via localStorage
- a console-style UI for testing controller input quickly

## What this is

This is a **plugin folder** you can drop into a fee[dB]ack plugin directory.

After install, open:
- **Plugins → feedback-contoller-input**

## Install

### 1. Download

Download the zip from the GitHub Releases page, then unzip it.

You should end up with this folder:

```text
feedback_contoller_input/
  plugin.json
  screen.html
  screen.js
```

### 2. Put it in your user plugins directory

Example:

```text
~/feedback-plugins/feedback_contoller_input/
```

So your final layout should look like:

```text
~/feedback-plugins/
  feedback_contoller_input/
    plugin.json
    screen.html
    screen.js
```

### 3. Launch fee[dB]ack with `FEEDBACK_PLUGINS_DIR`

fee[dB]ack discovers user plugins from the `FEEDBACK_PLUGINS_DIR` environment variable.

#### macOS / Linux

```bash
FEEDBACK_PLUGINS_DIR="$HOME/feedback-plugins" /path/to/your/feedback-app
```

If you normally start fee[dB]ack some other way, make sure that launcher also sets:

```bash
FEEDBACK_PLUGINS_DIR=$HOME/feedback-plugins
```

#### Windows

Set an environment variable before launching the app:

```powershell
$env:FEEDBACK_PLUGINS_DIR="$HOME\feedback-plugins"
Start-Process "C:\path\to\fee[dB]ack.exe"
```

### 4. Restart the app

If fee[dB]ack was already running, close it fully and reopen it.

### 5. Open the plugin

In fee[dB]ack, go to:
- **Plugins**
- **feedback-contoller-input**

## How to use it

### Pick the controller
1. Plug in one or more controllers
2. Open the **Selected controller** dropdown
3. Pick the exact controller you want to work on

The plugin uses the browser Gamepad API, so each controller is tracked by its reported **id** plus **slot/index**.

### Save a named profile
1. Pick the controller
2. Use the **Named profile** dropdown to choose the current profile
3. Edit the **Profile name** field
4. Click **Save**

That profile is saved for that controller and remembered between runs on the same machine/app storage.

### Map controls
1. Click a mapping tile
2. Press a controller button or move an axis
3. The plugin captures that next input
4. The mapping is saved into the selected named profile

### Calibrate axes
You can tune:
- **Axis threshold** — how far an axis has to move before it counts as active
- **Strum axis deadzone**
- **Whammy axis deadzone**
- **Invert axis** for each of those two common guitar axes

## Platform notes

### Windows
Should work if the app/browser runtime can see the controller through the Gamepad API.

### macOS
Should work under the same rule: if the runtime sees the controller, the plugin can read it.

### Docker
Docker is not the deciding part by itself.

The real question is whether the **actual browser/app process inside that environment has access to the controller device**. If controller passthrough is missing, the plugin cannot see it.

## Notes

- This plugin depends on the browser Gamepad API.
- A controller usually needs to be connected **before** or **during** app use.
- Some controllers only report after the first button press.
- Profiles are stored in browser/app localStorage, so they persist between runs in the same local app storage context.
- Styling depends on the fee[dB]ack build supporting runtime plugin CSS scanning.

## Troubleshooting

### I installed it but do not see it

Check these first:
- the plugin folder name is exactly `feedback_contoller_input`
- `plugin.json` is inside that folder
- `FEEDBACK_PLUGINS_DIR` points to the parent folder, not the plugin folder itself
- fee[dB]ack was fully restarted

Correct:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins
~/feedback-plugins/feedback_contoller_input/plugin.json
```

Wrong:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins/feedback_contoller_input
```

### The plugin appears but looks unstyled

Your fee[dB]ack build may not be rebuilding runtime CSS for user plugins yet.

The plugin files are still correct, but the host app may need its runtime plugin-style rebuild path enabled.

## Repository contents

```text
feedback_contoller_input/
  plugin.json
  screen.html
  screen.js
```

## Version

Current packaged plugin version:
- `0.5.0`

## License

MIT
