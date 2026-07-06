(function () {
    'use strict';

    const STORAGE_KEY = 'feedBack.feedbackContollerInput.profile';
    const POLL_MS = 150;
    const DEFAULT_AXIS_THRESHOLD = 0.35;
    const GLOBAL_CONTROLLER_KEY = 'default-standard-pad#global';
    const AXIS_CALIBRATION_KEYS = Object.freeze(['leftStickX', 'leftStickY', 'rightStickX', 'rightStickY']);
    const ACTION_ORDER = Object.freeze([
        ['south', 'Confirm'],
        ['east', 'Back'],
        ['west', 'Green fret'],
        ['north', 'Yellow fret'],
        ['l1', 'Blue fret'],
        ['r1', 'Orange fret'],
        ['dpadUp', 'Menu up'],
        ['dpadDown', 'Menu down'],
        ['dpadLeft', 'Menu left'],
        ['dpadRight', 'Menu right'],
        ['leftStickX', 'Strum axis'],
        ['leftStickY', 'Whammy axis'],
    ]);
    const BUTTON_KEY_ORDER = Object.freeze([
        'south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'leftStickPress', 'rightStickPress',
        'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'guide', 'touchpad'
    ]);
    const AXIS_KEY_ORDER = Object.freeze(['leftStickX', 'leftStickY', 'rightStickX', 'rightStickY']);
    const DEFAULT_PROFILE = Object.freeze({
        profileName: 'default-standard-pad',
        actions: Object.freeze({
            south: 'confirm',
            east: 'back',
            west: 'green-fret',
            north: 'yellow-fret',
            l1: 'blue-fret',
            r1: 'orange-fret',
            dpadUp: 'menu-up',
            dpadDown: 'menu-down',
            dpadLeft: 'menu-left',
            dpadRight: 'menu-right',
            leftStickX: 'strum-axis',
            leftStickY: 'whammy-axis'
        }),
        calibration: Object.freeze({
            axisThreshold: DEFAULT_AXIS_THRESHOLD,
            axes: Object.freeze({})
        })
    });

    const state = window.__feedBackFeedbackContollerInput || (window.__feedBackFeedbackContollerInput = {});
    if (state.installed) return;
    state.installed = true;
    state.lastPads = [];
    state.lastPrimary = null;
    state.liveInputs = { buttons: [], axes: [] };
    state.pollTimer = null;
    state.capture = null;
    state.currentProfile = null;
    state.store = null;
    state.selectedControllerKey = null;

    function _clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function _defaultProfile(controllerKey) {
        const next = _clone(DEFAULT_PROFILE);
        next.controllerKey = controllerKey || GLOBAL_CONTROLLER_KEY;
        return next;
    }

    function _defaultStore() {
        const defaultProfile = _defaultProfile(GLOBAL_CONTROLLER_KEY);
        return {
            version: 2,
            selectedControllerKey: null,
            selectedProfiles: { [GLOBAL_CONTROLLER_KEY]: defaultProfile.profileName },
            controllers: {
                [GLOBAL_CONTROLLER_KEY]: {
                    profiles: { [defaultProfile.profileName]: defaultProfile },
                }
            }
        };
    }

    function controllerKeyForGamepad(gamepad) {
        if (!gamepad) return GLOBAL_CONTROLLER_KEY;
        return `${String(gamepad.id || 'Unknown controller')}#${Number(gamepad.index || 0)}`;
    }

    function _ensureAxisCalibrationShape(value) {
        const next = value && typeof value === 'object' ? _clone(value) : {};
        const output = {};
        AXIS_CALIBRATION_KEYS.forEach((axisKey) => {
            const axis = next[axisKey] && typeof next[axisKey] === 'object' ? next[axisKey] : {};
            const deadzone = Number(axis.deadzone);
            output[axisKey] = {
                deadzone: Number.isFinite(deadzone) ? Math.max(0, Math.min(0.95, deadzone)) : 0,
                invert: !!axis.invert,
            };
        });
        return output;
    }

    function _ensureCalibrationShape(value) {
        const next = value && typeof value === 'object' ? _clone(value) : {};
        const axisThreshold = Number(next.axisThreshold);
        return {
            axisThreshold: Number.isFinite(axisThreshold) ? Math.max(0, Math.min(1, axisThreshold)) : DEFAULT_AXIS_THRESHOLD,
            axes: _ensureAxisCalibrationShape(next.axes),
        };
    }

    function _ensureProfileShape(profile, controllerKey) {
        const base = _defaultProfile(controllerKey || GLOBAL_CONTROLLER_KEY);
        const next = profile && typeof profile === 'object' ? _clone(profile) : base;
        next.controllerKey = String(next.controllerKey || controllerKey || base.controllerKey);
        next.profileName = String(next.profileName || base.profileName);
        next.actions = Object.assign({}, base.actions, next.actions || {});
        next.calibration = _ensureCalibrationShape(next.calibration);
        return next;
    }

    function _migrateLegacyStore(raw) {
        if (!raw || typeof raw !== 'object') return _defaultStore();
        if (raw.controllers) return raw;
        if (raw.actions || raw.profileName) {
            const store = _defaultStore();
            const migrated = _ensureProfileShape(raw, GLOBAL_CONTROLLER_KEY);
            store.controllers[GLOBAL_CONTROLLER_KEY] = {
                profiles: { [migrated.profileName]: migrated },
            };
            store.selectedProfiles[GLOBAL_CONTROLLER_KEY] = migrated.profileName;
            return store;
        }
        return _defaultStore();
    }

    function _ensureStoreShape(store) {
        const next = _migrateLegacyStore(store);
        const output = {
            version: 2,
            selectedControllerKey: next.selectedControllerKey ? String(next.selectedControllerKey) : null,
            selectedProfiles: {},
            controllers: {},
        };
        const controllerEntries = next.controllers && typeof next.controllers === 'object' ? Object.entries(next.controllers) : [];
        if (!controllerEntries.length) {
            return _defaultStore();
        }
        controllerEntries.forEach(([controllerKey, controllerValue]) => {
            const normalizedKey = String(controllerKey || GLOBAL_CONTROLLER_KEY);
            const profiles = controllerValue && typeof controllerValue === 'object' ? controllerValue.profiles : null;
            const nextProfiles = {};
            Object.entries(profiles || {}).forEach(([profileName, profileValue]) => {
                const shaped = _ensureProfileShape(profileValue, normalizedKey);
                nextProfiles[String(profileName || shaped.profileName)] = shaped;
            });
            if (!Object.keys(nextProfiles).length) {
                const fallback = _defaultProfile(normalizedKey);
                nextProfiles[fallback.profileName] = fallback;
            }
            output.controllers[normalizedKey] = { profiles: nextProfiles };
            const preferred = next.selectedProfiles && next.selectedProfiles[normalizedKey];
            output.selectedProfiles[normalizedKey] = nextProfiles[preferred] ? preferred : Object.keys(nextProfiles)[0];
        });
        if (!output.controllers[GLOBAL_CONTROLLER_KEY]) {
            const fallback = _defaultProfile(GLOBAL_CONTROLLER_KEY);
            output.controllers[GLOBAL_CONTROLLER_KEY] = { profiles: { [fallback.profileName]: fallback } };
            output.selectedProfiles[GLOBAL_CONTROLLER_KEY] = fallback.profileName;
        }
        if (output.selectedControllerKey && !output.controllers[output.selectedControllerKey]) {
            output.selectedControllerKey = null;
        }
        return output;
    }

    function _storeProfile(value) {
        try {
            if (value == null) {
                window.localStorage.removeItem(STORAGE_KEY);
                return true;
            }
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
            return true;
        } catch (_) {
            return false;
        }
    }

    function _readStore() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function loadStore() {
        const store = _ensureStoreShape(_readStore() || state.store || _defaultStore());
        state.store = store;
        state.selectedControllerKey = store.selectedControllerKey;
        return _clone(store);
    }

    function saveStore(store) {
        const shaped = _ensureStoreShape(store);
        state.store = shaped;
        state.selectedControllerKey = shaped.selectedControllerKey;
        _storeProfile(shaped);
        return _clone(shaped);
    }

    function _controllerBucket(store, controllerKey) {
        const normalizedKey = String(controllerKey || GLOBAL_CONTROLLER_KEY);
        if (!store.controllers[normalizedKey]) {
            const fallback = _defaultProfile(normalizedKey);
            store.controllers[normalizedKey] = { profiles: { [fallback.profileName]: fallback } };
            store.selectedProfiles[normalizedKey] = fallback.profileName;
        }
        return store.controllers[normalizedKey];
    }

    function listProfiles(controllerKey) {
        const store = loadStore();
        const normalizedKey = String(controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const bucket = _controllerBucket(store, normalizedKey);
        return Object.keys(bucket.profiles);
    }

    function selectController(controllerKey) {
        const store = loadStore();
        store.selectedControllerKey = controllerKey ? String(controllerKey) : null;
        const activeKey = store.selectedControllerKey || GLOBAL_CONTROLLER_KEY;
        _controllerBucket(store, activeKey);
        saveStore(store);
        render();
        return store.selectedControllerKey;
    }

    function selectProfile(profileName, controllerKey) {
        const store = loadStore();
        const activeControllerKey = String(controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const bucket = _controllerBucket(store, activeControllerKey);
        if (!bucket.profiles[profileName]) return false;
        store.selectedProfiles[activeControllerKey] = profileName;
        if (!store.selectedControllerKey && activeControllerKey !== GLOBAL_CONTROLLER_KEY) {
            store.selectedControllerKey = activeControllerKey;
        }
        saveStore(store);
        render();
        return true;
    }

    function loadProfile(controllerKey) {
        const store = loadStore();
        const activeControllerKey = String(controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const bucket = _controllerBucket(store, activeControllerKey);
        const selectedName = store.selectedProfiles[activeControllerKey] || Object.keys(bucket.profiles)[0];
        const profile = bucket.profiles[selectedName] || Object.values(bucket.profiles)[0] || _defaultProfile(activeControllerKey);
        return _ensureProfileShape(profile, activeControllerKey);
    }

    function saveProfile(profile) {
        const store = loadStore();
        const controllerKey = String(profile && profile.controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const next = _ensureProfileShape(profile, controllerKey);
        const bucket = _controllerBucket(store, controllerKey);
        bucket.profiles[next.profileName] = next;
        store.selectedProfiles[controllerKey] = next.profileName;
        if (controllerKey !== GLOBAL_CONTROLLER_KEY) {
            store.selectedControllerKey = controllerKey;
        }
        saveStore(store);
        state.currentProfile = next;
        render();
        return _clone(next);
    }

    function clearProfile(controllerKey, profileName) {
        const store = loadStore();
        const activeControllerKey = String(controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const bucket = _controllerBucket(store, activeControllerKey);
        const selectedName = String(profileName || store.selectedProfiles[activeControllerKey] || Object.keys(bucket.profiles)[0]);
        delete bucket.profiles[selectedName];
        if (!Object.keys(bucket.profiles).length) {
            const fallback = _defaultProfile(activeControllerKey);
            bucket.profiles[fallback.profileName] = fallback;
            store.selectedProfiles[activeControllerKey] = fallback.profileName;
        } else if (!bucket.profiles[store.selectedProfiles[activeControllerKey]]) {
            store.selectedProfiles[activeControllerKey] = Object.keys(bucket.profiles)[0];
        }
        state.capture = null;
        saveStore(store);
        state.currentProfile = loadProfile(activeControllerKey);
        render();
        return true;
    }

    function normalizeGamepad(gamepad) {
        if (!gamepad) return null;
        const base = {
            id: String(gamepad.id || 'Unknown controller'),
            index: Number(gamepad.index || 0),
            connected: gamepad.connected !== false,
            mapping: String(gamepad.mapping || ''),
            timestamp: Number(gamepad.timestamp || 0),
            buttons: Array.from(gamepad.buttons || []).map((button, index) => ({
                index,
                key: BUTTON_KEY_ORDER[index] || `button${index}`,
                pressed: !!(button && button.pressed),
                value: Number(button && typeof button.value === 'number' ? button.value : 0),
            })),
            axes: Array.from(gamepad.axes || []).map((value, index) => ({
                index,
                key: AXIS_KEY_ORDER[index] || `axis${index}`,
                value: Number(Number(value || 0).toFixed(3)),
            })),
        };
        base.controllerKey = controllerKeyForGamepad(base);
        const profile = loadProfile(base.controllerKey);
        base.calibration = _clone(profile.calibration);
        base.axes = base.axes.map((axis) => {
            const calibration = base.calibration.axes[axis.key] || { deadzone: 0, invert: false };
            let value = axis.value;
            if (Math.abs(value) < calibration.deadzone) value = 0;
            if (calibration.invert) value *= -1;
            return Object.assign({}, axis, { value: Number(Number(value).toFixed(3)) });
        });
        return base;
    }

    function readGamepads() {
        const list = (window.navigator && typeof window.navigator.getGamepads === 'function')
            ? window.navigator.getGamepads()
            : [];
        return Array.from(list || []).filter(Boolean).map(normalizeGamepad).filter(Boolean);
    }

    function pickPrimaryGamepad(pads) {
        const list = Array.isArray(pads) ? pads.filter(Boolean) : [];
        const store = loadStore();
        const selectedKey = store.selectedControllerKey;
        if (selectedKey) {
            const exact = list.find((pad) => pad.connected && pad.controllerKey === selectedKey);
            if (exact) return exact;
        }
        return list.find((pad) => pad.connected && pad.mapping === 'standard')
            || list.find((pad) => pad.connected)
            || null;
    }

    function getPressedButtons(primary) {
        return primary ? primary.buttons.filter((button) => button.pressed) : [];
    }

    function getActiveAxes(primary, threshold) {
        if (!primary) return [];
        const calibration = primary.calibration || _ensureCalibrationShape();
        const nextThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : calibration.axisThreshold;
        return primary.axes.filter((axis) => Math.abs(axis.value) >= nextThreshold);
    }

    function getLiveSummary(primary) {
        return {
            buttons: getPressedButtons(primary).map((button) => button.key),
            axes: getActiveAxes(primary).map((axis) => axis.key),
        };
    }

    function beginCapture(actionKey) {
        const existing = loadProfile();
        const actionName = existing.actions[actionKey] || actionKey;
        state.capture = { actionKey, actionName, controllerKey: existing.controllerKey, profileName: existing.profileName };
        render();
        return _clone(state.capture);
    }

    function cancelCapture() {
        state.capture = null;
        render();
        return true;
    }

    function applyCapturedInput(inputKey) {
        if (!state.capture || !inputKey) return false;
        const profile = loadProfile(state.capture.controllerKey);
        const actionName = state.capture.actionName;
        Object.keys(profile.actions || {}).forEach((key) => {
            if (profile.actions[key] === actionName) delete profile.actions[key];
        });
        profile.actions[inputKey] = actionName;
        state.capture = null;
        saveProfile(profile);
        return true;
    }

    function captureInputFromPrimary(primary) {
        if (!state.capture || !primary) return null;
        if (state.capture.controllerKey && state.capture.controllerKey !== GLOBAL_CONTROLLER_KEY && primary.controllerKey !== state.capture.controllerKey) return null;
        const pressedButton = getPressedButtons(primary)[0];
        if (pressedButton) {
            applyCapturedInput(pressedButton.key);
            return pressedButton.key;
        }
        const activeAxis = getActiveAxes(primary, 0.2)[0];
        if (activeAxis) {
            applyCapturedInput(activeAxis.key);
            return activeAxis.key;
        }
        return null;
    }

    function updateCalibration(partial) {
        const profile = loadProfile();
        profile.calibration = Object.assign({}, profile.calibration, partial || {});
        if (partial && partial.axes) {
            profile.calibration.axes = Object.assign({}, profile.calibration.axes, partial.axes);
        }
        return saveProfile(profile);
    }

    function renameSelectedProfile(nextName) {
        const trimmed = String(nextName || '').trim();
        if (!trimmed) return false;
        const current = loadProfile();
        const store = loadStore();
        const bucket = _controllerBucket(store, current.controllerKey);
        delete bucket.profiles[current.profileName];
        current.profileName = trimmed;
        bucket.profiles[trimmed] = _ensureProfileShape(current, current.controllerKey);
        store.selectedProfiles[current.controllerKey] = trimmed;
        saveStore(store);
        state.currentProfile = current;
        render();
        return true;
    }

    function _statusText(primary, pads) {
        if (state.capture) {
            return `Press a button or move an axis to map ${state.capture.actionName}.`;
        }
        if (!pads.length) return 'No controller detected yet.';
        if (!primary) return `${pads.length} controller(s) connected, but none expose the standard mapping yet.`;
        return `Selected controller: ${primary.id} (slot ${primary.index}).`;
    }

    function _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function _setValue(id, value) {
        const el = document.getElementById(id);
        if (el && typeof el.value !== 'undefined') el.value = value;
    }

    function _setChecked(id, value) {
        const el = document.getElementById(id);
        if (el && typeof el.checked !== 'undefined') el.checked = !!value;
    }

    function _buttonClass(active) {
        return active
            ? 'border-blue-100/60 bg-blue-300/20 text-white shadow-[0_0_18px_rgba(96,165,250,0.22)]'
            : 'border-white/12 bg-slate-950/35 text-blue-50/75';
    }

    function _mappingButtonClass(active, armed) {
        if (armed) return 'border-amber-300/60 bg-amber-300/15 text-amber-50';
        if (active) return 'border-blue-100/60 bg-blue-300/20 text-white';
        return 'border-white/12 bg-white/[0.04] text-blue-50/85 hover:border-blue-100/35 hover:bg-white/[0.08]';
    }

    function _renderControllerOptions(pads, selectedKey) {
        const host = document.getElementById('feedback-contoller-input-controller-select');
        if (!host) return;
        const options = pads.map((pad) => {
            const selected = pad.controllerKey === selectedKey ? ' selected' : '';
            return `<option value="${pad.controllerKey}"${selected}>${pad.id} · slot ${pad.index}</option>`;
        });
        if (!options.length) options.push('<option value="">No controller detected</option>');
        host.innerHTML = options.join('');
    }

    function _renderProfileOptions(profileNames, selectedName) {
        const host = document.getElementById('feedback-contoller-input-profile-select');
        if (!host) return;
        host.innerHTML = profileNames.map((name) => {
            const selected = name === selectedName ? ' selected' : '';
            return `<option value="${name}"${selected}>${name}</option>`;
        }).join('');
    }

    function _renderLiveInputs(summary) {
        const host = document.getElementById('feedback-contoller-input-live-inputs');
        if (!host) return;
        host.innerHTML = ACTION_ORDER.map(([key, label]) => {
            const active = summary.buttons.includes(key) || summary.axes.includes(key);
            return `<div data-live-input="${key}" class="rounded-2xl border px-3 py-2 transition ${_buttonClass(active)}">
                <div class="text-[10px] uppercase tracking-[0.24em] opacity-70">${key}</div>
                <div class="text-sm font-medium">${label}</div>
            </div>`;
        }).join('');
    }

    function _renderMappingButtons(profile, summary) {
        const host = document.getElementById('feedback-contoller-input-mapping-grid');
        if (!host) return;
        host.innerHTML = ACTION_ORDER.map(([actionKey, label]) => {
            const armed = !!(state.capture && state.capture.actionKey === actionKey);
            const boundInput = Object.entries(profile.actions || {}).find(([, value]) => value === actionKey)?.[0] || 'not set';
            const active = boundInput !== 'not set' && (summary.buttons.includes(boundInput) || summary.axes.includes(boundInput));
            return `<button type="button" data-map-action="${actionKey}" class="feedback-contoller-input-map-btn rounded-2xl border px-3 py-3 text-left transition ${_mappingButtonClass(active, armed)}">
                <div class="text-[10px] uppercase tracking-[0.24em] opacity-70">${armed ? 'Listening…' : boundInput}</div>
                <div class="text-sm font-semibold">${label}</div>
                <div class="mt-1 text-xs opacity-70">${profile.actions[actionKey] || actionKey}</div>
            </button>`;
        }).join('');
        host.querySelectorAll('[data-map-action]').forEach((button) => {
            if (button.__controllerLabBound) return;
            button.__controllerLabBound = true;
            button.addEventListener('click', () => beginCapture(button.getAttribute('data-map-action')));
        });
    }

    function _bindControls() {
        const refreshBtn = document.getElementById('feedback-contoller-input-refresh');
        const saveBtn = document.getElementById('feedback-contoller-input-save-default');
        const clearBtn = document.getElementById('feedback-contoller-input-clear-profile');
        const cancelBtn = document.getElementById('feedback-contoller-input-cancel-capture');
        const controllerSelect = document.getElementById('feedback-contoller-input-controller-select');
        const profileSelect = document.getElementById('feedback-contoller-input-profile-select');
        const profileNameInput = document.getElementById('feedback-contoller-input-profile-name');
        const saveNamedBtn = document.getElementById('feedback-contoller-input-save-named');
        const thresholdInput = document.getElementById('feedback-contoller-input-axis-threshold');
        const leftDeadzoneInput = document.getElementById('feedback-contoller-input-leftStickX-deadzone');
        const leftInvertInput = document.getElementById('feedback-contoller-input-leftStickX-invert');
        const whammyDeadzoneInput = document.getElementById('feedback-contoller-input-leftStickY-deadzone');
        const whammyInvertInput = document.getElementById('feedback-contoller-input-leftStickY-invert');

        if (refreshBtn && !refreshBtn.__controllerLabBound) {
            refreshBtn.__controllerLabBound = true;
            refreshBtn.addEventListener('click', render);
        }
        if (saveBtn && !saveBtn.__controllerLabBound) {
            saveBtn.__controllerLabBound = true;
            saveBtn.addEventListener('click', () => {
                const profile = loadProfile();
                profile.actions = _defaultProfile(profile.controllerKey).actions;
                saveProfile(profile);
            });
        }
        if (clearBtn && !clearBtn.__controllerLabBound) {
            clearBtn.__controllerLabBound = true;
            clearBtn.addEventListener('click', () => clearProfile());
        }
        if (cancelBtn && !cancelBtn.__controllerLabBound) {
            cancelBtn.__controllerLabBound = true;
            cancelBtn.addEventListener('click', cancelCapture);
        }
        if (controllerSelect && !controllerSelect.__controllerLabBound) {
            controllerSelect.__controllerLabBound = true;
            controllerSelect.addEventListener('change', () => selectController(controllerSelect.value || null));
        }
        if (profileSelect && !profileSelect.__controllerLabBound) {
            profileSelect.__controllerLabBound = true;
            profileSelect.addEventListener('change', () => selectProfile(profileSelect.value));
        }
        if (saveNamedBtn && !saveNamedBtn.__controllerLabBound) {
            saveNamedBtn.__controllerLabBound = true;
            saveNamedBtn.addEventListener('click', () => renameSelectedProfile(profileNameInput && profileNameInput.value));
        }
        if (thresholdInput && !thresholdInput.__controllerLabBound) {
            thresholdInput.__controllerLabBound = true;
            thresholdInput.addEventListener('change', () => updateCalibration({ axisThreshold: Number(thresholdInput.value) }));
        }
        if (leftDeadzoneInput && !leftDeadzoneInput.__controllerLabBound) {
            leftDeadzoneInput.__controllerLabBound = true;
            leftDeadzoneInput.addEventListener('change', () => updateCalibration({ axes: { leftStickX: { deadzone: Number(leftDeadzoneInput.value), invert: !!(leftInvertInput && leftInvertInput.checked) } } }));
        }
        if (leftInvertInput && !leftInvertInput.__controllerLabBound) {
            leftInvertInput.__controllerLabBound = true;
            leftInvertInput.addEventListener('change', () => updateCalibration({ axes: { leftStickX: { deadzone: Number(leftDeadzoneInput && leftDeadzoneInput.value || 0), invert: !!leftInvertInput.checked } } }));
        }
        if (whammyDeadzoneInput && !whammyDeadzoneInput.__controllerLabBound) {
            whammyDeadzoneInput.__controllerLabBound = true;
            whammyDeadzoneInput.addEventListener('change', () => updateCalibration({ axes: { leftStickY: { deadzone: Number(whammyDeadzoneInput.value), invert: !!(whammyInvertInput && whammyInvertInput.checked) } } }));
        }
        if (whammyInvertInput && !whammyInvertInput.__controllerLabBound) {
            whammyInvertInput.__controllerLabBound = true;
            whammyInvertInput.addEventListener('change', () => updateCalibration({ axes: { leftStickY: { deadzone: Number(whammyDeadzoneInput && whammyDeadzoneInput.value || 0), invert: !!whammyInvertInput.checked } } }));
        }
    }

    function render() {
        _bindControls();
        const store = loadStore();
        const pads = readGamepads();
        state.lastPads = pads;
        if (!store.selectedControllerKey && pads.length === 1) {
            store.selectedControllerKey = pads[0].controllerKey;
            saveStore(store);
        }
        const primary = pickPrimaryGamepad(pads);
        state.lastPrimary = primary;
        if (primary && !store.selectedControllerKey) {
            state.selectedControllerKey = primary.controllerKey;
        }
        captureInputFromPrimary(primary);
        const liveSummary = getLiveSummary(primary);
        state.liveInputs = liveSummary;
        const profile = state.currentProfile = loadProfile(primary ? primary.controllerKey : undefined);
        const activeControllerKey = (primary && primary.controllerKey) || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY;
        const profileNames = listProfiles(activeControllerKey);

        _setText('feedback-contoller-input-status', _statusText(primary, pads));
        _setText('feedback-contoller-input-primary', primary
            ? `${primary.id}\nSlot: ${primary.index}\nController key: ${primary.controllerKey}\nButtons pressed: ${getPressedButtons(primary).map((button) => button.key).join(', ') || 'none'}\nAxes active: ${getActiveAxes(primary).map((axis) => `${axis.key}=${axis.value}`).join(', ') || 'none'}`
            : 'Waiting for a standard browser gamepad…');
        _setText('feedback-contoller-input-pads', JSON.stringify(pads, null, 2));
        _setText('feedback-contoller-input-profile', JSON.stringify(profile, null, 2));
        _setText('feedback-contoller-input-capture-status', state.capture
            ? `Listening for input to map ${state.capture.actionName} on ${state.capture.profileName}.`
            : 'Pick a controller, choose a profile, then click a tile to remap it.');

        _renderControllerOptions(pads, primary ? primary.controllerKey : store.selectedControllerKey);
        _renderProfileOptions(profileNames, profile.profileName);
        _setValue('feedback-contoller-input-profile-name', profile.profileName);
        _setValue('feedback-contoller-input-axis-threshold', profile.calibration.axisThreshold);
        _setValue('feedback-contoller-input-leftStickX-deadzone', profile.calibration.axes.leftStickX.deadzone);
        _setChecked('feedback-contoller-input-leftStickX-invert', profile.calibration.axes.leftStickX.invert);
        _setValue('feedback-contoller-input-leftStickY-deadzone', profile.calibration.axes.leftStickY.deadzone);
        _setChecked('feedback-contoller-input-leftStickY-invert', profile.calibration.axes.leftStickY.invert);

        const cancelBtn = document.getElementById('feedback-contoller-input-cancel-capture');
        if (cancelBtn) cancelBtn.disabled = !state.capture;

        _renderLiveInputs(liveSummary);
        _renderMappingButtons(profile, liveSummary);
        return {
            pads,
            primary,
            profile,
            liveSummary,
            capture: state.capture ? _clone(state.capture) : null,
            store: _clone(store),
        };
    }

    function _schedulePoll() {
        if (state.pollTimer != null || typeof window.setTimeout !== 'function') return;
        state.pollTimer = window.setTimeout(() => {
            state.pollTimer = null;
            render();
            _schedulePoll();
        }, POLL_MS);
    }

    function mount() {
        _bindControls();
        render();
        _schedulePoll();
        return true;
    }

    window.feedBackFeedbackContollerInput = {
        version: 3,
        storageKey: STORAGE_KEY,
        actionOrder: ACTION_ORDER.map(([key, label]) => ({ key, label })),
        defaultProfile: _defaultProfile(),
        controllerKeyForGamepad,
        normalizeGamepad,
        readGamepads,
        pickPrimaryGamepad,
        getPressedButtons,
        getActiveAxes,
        getLiveSummary,
        beginCapture,
        cancelCapture,
        applyCapturedInput,
        captureInputFromPrimary,
        loadStore,
        saveStore,
        saveProfile,
        loadProfile,
        clearProfile,
        listProfiles,
        selectController,
        selectProfile,
        updateCalibration,
        renameSelectedProfile,
        render,
        mount,
    };

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('gamepadconnected', render);
        window.addEventListener('gamepaddisconnected', render);
        window.addEventListener('load', mount);
    }
    if (document && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', mount);
    }
    if (typeof window.setTimeout === 'function') {
        window.setTimeout(mount, 0);
    }
})();
