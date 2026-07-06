(function () {
    'use strict';

    const STORAGE_KEY = 'feedBack.feedbackContollerInput.profile';
    const POLL_MS = 150;
    const DEFAULT_AXIS_THRESHOLD = 0.35;
    const PLUGIN_ID = 'feedback_contoller_input';
    const GLOBAL_CONTROLLER_KEY = 'default-standard-pad#global';
    const DEFAULT_PROFILE_NAME = 'default-standard-pad';
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
    const AXIS_META = Object.freeze([
        { key: 'leftStickX', label: 'Strum axis', help: 'Main horizontal stick / strum axis' },
        { key: 'leftStickY', label: 'Whammy axis', help: 'Main vertical stick / whammy axis' },
        { key: 'rightStickX', label: 'Alt axis X', help: 'Secondary horizontal axis' },
        { key: 'rightStickY', label: 'Alt axis Y', help: 'Secondary vertical axis' },
    ]);
    const DEFAULT_PROFILE = Object.freeze({
        profileName: DEFAULT_PROFILE_NAME,
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

    function _queryAll(selector) {
        if (!document || typeof document.querySelectorAll !== 'function') return [];
        try {
            return Array.from(document.querySelectorAll(selector) || []);
        } catch (_) {
            return [];
        }
    }

    function _styleHrefFromScriptTag(script) {
        const src = script && script.src ? String(script.src) : '';
        if (!src || src.indexOf(`/api/plugins/${PLUGIN_ID}/screen.js`) === -1) return null;
        return src.replace('/screen.js', '/assets/plugin.css');
    }

    function _resolvePluginStyleHref() {
        const currentHref = _styleHrefFromScriptTag(document && document.currentScript);
        if (currentHref) return currentHref;
        const scripts = _queryAll('script[src]');
        for (let index = scripts.length - 1; index >= 0; index -= 1) {
            const href = _styleHrefFromScriptTag(scripts[index]);
            if (href) return href;
        }
        return null;
    }

    function ensureStyles() {
        if (!document || typeof document.createElement !== 'function') return null;
        const existing = _queryAll('link[rel="stylesheet"]').find((link) => {
            const href = String(link && link.href || '');
            return href.indexOf(`/api/plugins/${PLUGIN_ID}/assets/plugin.css`) !== -1;
        });
        if (existing) return existing.href;
        const href = _resolvePluginStyleHref();
        if (!href) return null;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset = link.dataset || {};
        link.dataset.fbciFallbackStyle = PLUGIN_ID;
        const head = document.head || _queryAll('head')[0] || document.documentElement || document.body;
        if (head && typeof head.appendChild === 'function') {
            head.appendChild(link);
        }
        return href;
    }

    function _slugName(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'profile';
    }

    function controllerKeyForGamepad(gamepad) {
        if (!gamepad) return GLOBAL_CONTROLLER_KEY;
        return `${String(gamepad.id || 'Unknown controller')}#${Number(gamepad.index || 0)}`;
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

    function _ensureAxisCalibrationShape(value) {
        const next = value && typeof value === 'object' ? _clone(value) : {};
        const output = {};
        AXIS_KEY_ORDER.forEach((axisKey) => {
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
        if (!controllerEntries.length) return _defaultStore();
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

    function _storeRaw(value) {
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

    function _readRaw() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function loadStore() {
        const store = _ensureStoreShape(_readRaw() || state.store || _defaultStore());
        state.store = store;
        state.selectedControllerKey = store.selectedControllerKey;
        return _clone(store);
    }

    function saveStore(store) {
        const shaped = _ensureStoreShape(store);
        state.store = shaped;
        state.selectedControllerKey = shaped.selectedControllerKey;
        _storeRaw(shaped);
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

    function _activeControllerKey(preferred) {
        const store = loadStore();
        return String(preferred || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
    }

    function _selectedProfileName(store, controllerKey) {
        const bucket = _controllerBucket(store, controllerKey);
        return store.selectedProfiles[controllerKey] || Object.keys(bucket.profiles)[0];
    }

    function _uniqueProfileName(store, controllerKey, requestedName) {
        const bucket = _controllerBucket(store, controllerKey);
        const base = _slugName(requestedName || 'profile');
        let next = base;
        let counter = 2;
        while (bucket.profiles[next]) {
            next = `${base}-${counter}`;
            counter += 1;
        }
        return next;
    }

    function listProfiles(controllerKey) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        return Object.keys(_controllerBucket(store, activeKey).profiles);
    }

    function selectController(controllerKey) {
        const store = loadStore();
        store.selectedControllerKey = controllerKey ? String(controllerKey) : null;
        const activeKey = _activeControllerKey(store.selectedControllerKey);
        _controllerBucket(store, activeKey);
        saveStore(store);
        render();
        return store.selectedControllerKey;
    }

    function selectProfile(profileName, controllerKey) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        const bucket = _controllerBucket(store, activeKey);
        if (!bucket.profiles[profileName]) return false;
        store.selectedProfiles[activeKey] = profileName;
        if (activeKey !== GLOBAL_CONTROLLER_KEY) store.selectedControllerKey = activeKey;
        saveStore(store);
        render();
        return true;
    }

    function loadProfile(controllerKey) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        const bucket = _controllerBucket(store, activeKey);
        const selectedName = _selectedProfileName(store, activeKey);
        const profile = bucket.profiles[selectedName] || Object.values(bucket.profiles)[0] || _defaultProfile(activeKey);
        return _ensureProfileShape(profile, activeKey);
    }

    function saveProfile(profile) {
        const store = loadStore();
        const controllerKey = String(profile && profile.controllerKey || store.selectedControllerKey || GLOBAL_CONTROLLER_KEY);
        const next = _ensureProfileShape(profile, controllerKey);
        const bucket = _controllerBucket(store, controllerKey);
        bucket.profiles[next.profileName] = next;
        store.selectedProfiles[controllerKey] = next.profileName;
        if (controllerKey !== GLOBAL_CONTROLLER_KEY) store.selectedControllerKey = controllerKey;
        saveStore(store);
        state.currentProfile = next;
        render();
        return _clone(next);
    }

    function createProfile(profileName, controllerKey) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        const nextName = _uniqueProfileName(store, activeKey, profileName || 'new-profile');
        const profile = _defaultProfile(activeKey);
        profile.profileName = nextName;
        return saveProfile(profile);
    }

    function duplicateCurrentProfile(profileName, controllerKey) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        const current = loadProfile(activeKey);
        const next = _clone(current);
        next.profileName = _uniqueProfileName(store, activeKey, profileName || `${current.profileName}-copy`);
        return saveProfile(next);
    }

    function renameSelectedProfile(nextName) {
        const trimmed = String(nextName || '').trim();
        if (!trimmed) return false;
        const store = loadStore();
        const current = loadProfile();
        const bucket = _controllerBucket(store, current.controllerKey);
        const targetName = current.profileName === trimmed ? trimmed : _uniqueProfileName(store, current.controllerKey, trimmed);
        delete bucket.profiles[current.profileName];
        current.profileName = targetName;
        bucket.profiles[targetName] = _ensureProfileShape(current, current.controllerKey);
        store.selectedProfiles[current.controllerKey] = targetName;
        saveStore(store);
        state.currentProfile = current;
        render();
        return true;
    }

    function clearProfile(controllerKey, profileName) {
        const store = loadStore();
        const activeKey = _activeControllerKey(controllerKey);
        const bucket = _controllerBucket(store, activeKey);
        const selectedName = String(profileName || _selectedProfileName(store, activeKey));
        delete bucket.profiles[selectedName];
        if (!Object.keys(bucket.profiles).length) {
            const fallback = _defaultProfile(activeKey);
            bucket.profiles[fallback.profileName] = fallback;
            store.selectedProfiles[activeKey] = fallback.profileName;
        } else if (!bucket.profiles[store.selectedProfiles[activeKey]]) {
            store.selectedProfiles[activeKey] = Object.keys(bucket.profiles)[0];
        }
        state.capture = null;
        saveStore(store);
        state.currentProfile = loadProfile(activeKey);
        render();
        return true;
    }

    function updateCalibration(partial) {
        const profile = loadProfile();
        profile.calibration = _ensureCalibrationShape(Object.assign({}, profile.calibration, partial || {}));
        if (partial && partial.axes) {
            profile.calibration.axes = _ensureAxisCalibrationShape(Object.assign({}, profile.calibration.axes, partial.axes));
        }
        return saveProfile(profile);
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

    function autoSelectController(pads) {
        const list = Array.isArray(pads) ? pads.filter(Boolean) : [];
        const store = loadStore();
        if (!list.length) return store.selectedControllerKey;
        const selectedKey = store.selectedControllerKey;
        if (selectedKey && list.some((pad) => pad.connected && pad.controllerKey === selectedKey)) {
            return selectedKey;
        }
        const exactStored = list.find((pad) => pad.connected && store.controllers[pad.controllerKey]);
        if (exactStored) {
            store.selectedControllerKey = exactStored.controllerKey;
            saveStore(store);
            return exactStored.controllerKey;
        }
        const firstStandard = list.find((pad) => pad.connected && pad.mapping === 'standard');
        if (firstStandard) return firstStandard.controllerKey;
        const connectedPad = list.find((pad) => pad.connected);
        return connectedPad ? connectedPad.controllerKey : null;
    }

    function pickPrimaryGamepad(pads) {
        const list = Array.isArray(pads) ? pads.filter(Boolean) : [];
        const selectedKey = autoSelectController(list);
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

    function _statusText(primary, pads) {
        if (state.capture) return `Press a button or move an axis to map ${state.capture.actionName}.`;
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

    function _buttonClass(active) {
        return `fbci-tile${active ? ' is-active' : ''}`;
    }

    function _mappingButtonClass(active, armed) {
        if (armed) return 'fbci-map-btn is-armed';
        if (active) return 'fbci-map-btn is-active';
        return 'fbci-map-btn';
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
            return `<div data-live-input="${key}" class="${_buttonClass(active)}">
                <div class="fbci-tile-key">${key}</div>
                <div class="fbci-tile-label">${label}</div>
            </div>`;
        }).join('');
    }

    function _renderMappingButtons(profile, summary) {
        const host = document.getElementById('feedback-contoller-input-mapping-grid');
        if (!host) return;
        host.innerHTML = ACTION_ORDER.map(([actionKey, label]) => {
            const armed = !!(state.capture && state.capture.actionKey === actionKey);
            const boundEntry = Object.entries(profile.actions || {}).find(([, value]) => value === actionKey);
            const boundInput = boundEntry ? boundEntry[0] : 'not set';
            const active = boundInput !== 'not set' && (summary.buttons.includes(boundInput) || summary.axes.includes(boundInput));
            return `<button type="button" data-map-action="${actionKey}" class="${_mappingButtonClass(active, armed)}">
                <div class="fbci-map-top">${armed ? 'Listening…' : boundInput}</div>
                <div class="fbci-map-label">${label}</div>
                <div class="fbci-map-value">${profile.actions[actionKey] || actionKey}</div>
            </button>`;
        }).join('');
        host.querySelectorAll('[data-map-action]').forEach((button) => {
            if (button.__fbciBound) return;
            button.__fbciBound = true;
            button.addEventListener('click', () => beginCapture(button.getAttribute('data-map-action')));
        });
    }

    function _renderAxisCards(profile) {
        const host = document.getElementById('feedback-contoller-input-axis-grid');
        if (!host) return;
        host.innerHTML = AXIS_META.map((axis) => {
            const config = profile.calibration.axes[axis.key] || { deadzone: 0, invert: false };
            return `<div class="fbci-axis-card">
                <div class="fbci-axis-title-row">
                    <div>
                        <div class="fbci-axis-title">${axis.label}</div>
                        <div class="fbci-axis-help">${axis.help}</div>
                    </div>
                    <div class="fbci-axis-key">${axis.key}</div>
                </div>
                <label class="fbci-field">
                    <span>Deadzone</span>
                    <input data-axis-deadzone="${axis.key}" type="number" min="0" max="1" step="0.01" value="${config.deadzone}" />
                </label>
                <label class="fbci-checkbox-row">
                    <input data-axis-invert="${axis.key}" type="checkbox" ${config.invert ? 'checked' : ''} />
                    <span>Invert axis</span>
                </label>
            </div>`;
        }).join('');
        host.querySelectorAll('[data-axis-deadzone]').forEach((input) => {
            if (input.__fbciBound) return;
            input.__fbciBound = true;
            input.addEventListener('change', () => {
                const axisKey = input.getAttribute('data-axis-deadzone');
                const invertEl = host.querySelector(`[data-axis-invert="${axisKey}"]`);
                updateCalibration({ axes: { [axisKey]: { deadzone: Number(input.value), invert: !!(invertEl && invertEl.checked) } } });
            });
        });
        host.querySelectorAll('[data-axis-invert]').forEach((input) => {
            if (input.__fbciBound) return;
            input.__fbciBound = true;
            input.addEventListener('change', () => {
                const axisKey = input.getAttribute('data-axis-invert');
                const deadzoneEl = host.querySelector(`[data-axis-deadzone="${axisKey}"]`);
                updateCalibration({ axes: { [axisKey]: { deadzone: Number(deadzoneEl && deadzoneEl.value || 0), invert: !!input.checked } } });
            });
        });
    }

    function _bindControls() {
        const refreshBtn = document.getElementById('feedback-contoller-input-refresh');
        const resetBtn = document.getElementById('feedback-contoller-input-save-default');
        const clearBtn = document.getElementById('feedback-contoller-input-clear-profile');
        const cancelBtn = document.getElementById('feedback-contoller-input-cancel-capture');
        const controllerSelect = document.getElementById('feedback-contoller-input-controller-select');
        const profileSelect = document.getElementById('feedback-contoller-input-profile-select');
        const profileNameInput = document.getElementById('feedback-contoller-input-profile-name');
        const renameBtn = document.getElementById('feedback-contoller-input-save-named');
        const newBtn = document.getElementById('feedback-contoller-input-new-profile');
        const duplicateBtn = document.getElementById('feedback-contoller-input-duplicate-profile');
        const thresholdInput = document.getElementById('feedback-contoller-input-axis-threshold');

        if (refreshBtn && !refreshBtn.__fbciBound) {
            refreshBtn.__fbciBound = true;
            refreshBtn.addEventListener('click', render);
        }
        if (resetBtn && !resetBtn.__fbciBound) {
            resetBtn.__fbciBound = true;
            resetBtn.addEventListener('click', () => {
                const profile = loadProfile();
                profile.actions = _defaultProfile(profile.controllerKey).actions;
                saveProfile(profile);
            });
        }
        if (clearBtn && !clearBtn.__fbciBound) {
            clearBtn.__fbciBound = true;
            clearBtn.addEventListener('click', () => clearProfile());
        }
        if (cancelBtn && !cancelBtn.__fbciBound) {
            cancelBtn.__fbciBound = true;
            cancelBtn.addEventListener('click', cancelCapture);
        }
        if (controllerSelect && !controllerSelect.__fbciBound) {
            controllerSelect.__fbciBound = true;
            controllerSelect.addEventListener('change', () => selectController(controllerSelect.value || null));
        }
        if (profileSelect && !profileSelect.__fbciBound) {
            profileSelect.__fbciBound = true;
            profileSelect.addEventListener('change', () => selectProfile(profileSelect.value));
        }
        if (renameBtn && !renameBtn.__fbciBound) {
            renameBtn.__fbciBound = true;
            renameBtn.addEventListener('click', () => renameSelectedProfile(profileNameInput && profileNameInput.value));
        }
        if (newBtn && !newBtn.__fbciBound) {
            newBtn.__fbciBound = true;
            newBtn.addEventListener('click', () => createProfile(profileNameInput && profileNameInput.value || 'new-profile'));
        }
        if (duplicateBtn && !duplicateBtn.__fbciBound) {
            duplicateBtn.__fbciBound = true;
            duplicateBtn.addEventListener('click', () => duplicateCurrentProfile(profileNameInput && profileNameInput.value || 'profile-copy'));
        }
        if (thresholdInput && !thresholdInput.__fbciBound) {
            thresholdInput.__fbciBound = true;
            thresholdInput.addEventListener('change', () => updateCalibration({ axisThreshold: Number(thresholdInput.value) }));
        }
    }

    function render() {
        _bindControls();
        const pads = readGamepads();
        state.lastPads = pads;
        const primary = pickPrimaryGamepad(pads);
        state.lastPrimary = primary;
        captureInputFromPrimary(primary);
        const liveSummary = getLiveSummary(primary);
        state.liveInputs = liveSummary;
        const activeControllerKey = (primary && primary.controllerKey) || autoSelectController(pads) || GLOBAL_CONTROLLER_KEY;
        const profile = state.currentProfile = loadProfile(activeControllerKey);
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

        _renderControllerOptions(pads, activeControllerKey);
        _renderProfileOptions(profileNames, profile.profileName);
        _setValue('feedback-contoller-input-profile-name', profile.profileName);
        _setValue('feedback-contoller-input-axis-threshold', profile.calibration.axisThreshold);

        const cancelBtn = document.getElementById('feedback-contoller-input-cancel-capture');
        if (cancelBtn) cancelBtn.disabled = !state.capture;

        _renderLiveInputs(liveSummary);
        _renderAxisCards(profile);
        _renderMappingButtons(profile, liveSummary);
        return {
            pads,
            primary,
            profile,
            liveSummary,
            capture: state.capture ? _clone(state.capture) : null,
            store: loadStore(),
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
        ensureStyles();
        _bindControls();
        render();
        _schedulePoll();
        return true;
    }

    window.feedBackFeedbackContollerInput = {
        version: 4,
        storageKey: STORAGE_KEY,
        actionOrder: ACTION_ORDER.map(([key, label]) => ({ key, label })),
        axisMeta: AXIS_META.map((axis) => Object.assign({}, axis)),
        defaultProfile: _defaultProfile(),
        controllerKeyForGamepad,
        normalizeGamepad,
        readGamepads,
        autoSelectController,
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
        createProfile,
        duplicateCurrentProfile,
        updateCalibration,
        renameSelectedProfile,
        ensureStyles,
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
