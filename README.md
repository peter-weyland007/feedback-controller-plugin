# fee[dB]ack Controller Input Prototype

A standalone plugin for **fee[dB]ack** that adds a controller-input sandbox screen.

It currently includes:
- live controller detection
- live button / axis highlight
- click-to-map input capture
- saved mappings via localStorage
- a console-style UI for testing controller input quickly

## What this is

This is a **plugin folder** you can drop into a fee[dB]ack plugin directory.

After install, open:
- **Plugins → Controller Input Prototype**

## Install

### 1. Download

Download the zip from the GitHub Releases page, then unzip it.

You should end up with this folder:

```text
controller_input_prototype/
  plugin.json
  screen.html
  screen.js
```

### 2. Put it in your user plugins directory

Example:

```text
~/feedback-plugins/controller_input_prototype/
```

So your final layout should look like:

```text
~/feedback-plugins/
  controller_input_prototype/
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
- **Controller Input Prototype**

## How to use it

### Live highlight
Press buttons or move sticks on your controller.

The plugin will light up the matching live input tiles so you can see what the browser is receiving.

### Interactive mapping
1. Click a mapping tile
2. Press a controller button or move an axis
3. The plugin captures that next input
4. The mapping is saved in browser localStorage

## Notes

- This plugin depends on the browser Gamepad API.
- A controller usually needs to be connected **before** or **during** app use.
- Some controllers only report after the first button press.
- Styling depends on the fee[dB]ack build supporting runtime plugin CSS scanning.

## Troubleshooting

### I installed it but do not see it

Check these first:
- the plugin folder name is exactly `controller_input_prototype`
- `plugin.json` is inside that folder
- `FEEDBACK_PLUGINS_DIR` points to the parent folder, not the plugin folder itself
- fee[dB]ack was fully restarted

Correct:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins
~/feedback-plugins/controller_input_prototype/plugin.json
```

Wrong:

```text
FEEDBACK_PLUGINS_DIR=~/feedback-plugins/controller_input_prototype
```

### The plugin appears but looks unstyled

Your fee[dB]ack build may not be rebuilding runtime CSS for user plugins yet.

The plugin files are still correct, but the host app may need its runtime plugin-style rebuild path enabled.

## Repository contents

```text
controller_input_prototype/
  plugin.json
  screen.html
  screen.js
```

## Version

Current packaged plugin version:
- `0.2.0`

## License

MIT
