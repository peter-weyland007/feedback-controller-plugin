(function () {
    'use strict';

    const STORAGE_KEY = 'feedBack.controllerPrototype.profile';
    const POLL_MS = 150;
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
        })
    });

    const state = window.__feedBackControllerPrototype || (window.__feedBackControllerPrototype = {});
    if (state.installed) return;
    state.installed = true;
    state.lastPads = [];
    state.lastPrimary = null;
    state.liveInputs = { buttons: [], axes: [] };
    state.pollTimer = null;
    state.capture = null;
    state.currentProfile = null;

    function _clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
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

    function _readProfile() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function _defaultProfile() {
        return _clone(DEFAULT_PROFILE);
    }

    function _ensureProfileShape(profile) {
        const base = _defaultProfile();
        const next = profile && typeof profile === 'object' ? _clone(profile) : base;
        next.profileName = String(next.profileName || base.profileName);
        next.actions = Object.assign({}, base.actions, next.actions || {});
        return next;
    }

    function normalizeGamepad(gamepad) {
        if (!gamepad) return null;
        return {
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
    }

    function readGamepads() {
        const list = (window.navigator && typeof window.navigator.getGamepads === 'function')
            ? window.navigator.getGamepads()
            : [];
        return Array.from(list || []).filter(Boolean).map(normalizeGamepad).filter(Boolean);
    }

    function pickPrimaryGamepad(pads) {
        const list = Array.isArray(pads) ? pads.filter(Boolean) : [];
        return list.find((pad) => pad.connected && pad.mapping === 'standard')
            || list.find((pad) => pad.connected)
            || null;
    }

    function getPressedButtons(primary) {
        return primary ? primary.buttons.filter((button) => button.pressed) : [];
    }

    function getActiveAxes(primary, threshold = 0.35) {
        return primary ? primary.axes.filter((axis) => Math.abs(axis.value) >= threshold) : [];
    }

    function saveProfile(profile) {
        const next = _ensureProfileShape(profile);
        state.currentProfile = next;
        _storeProfile(next);
        render();
        return next;
    }

    function clearProfile() {
        state.currentProfile = _defaultProfile();
        _storeProfile(null);
        state.capture = null;
        render();
        return true;
    }

    function loadProfile() {
        return _ensureProfileShape(_readProfile() || state.currentProfile || _defaultProfile());
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
        state.capture = { actionKey, actionName };
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
        const actionName = state.capture.actionName;
        const profile = loadProfile();
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
        const pressedButton = getPressedButtons(primary)[0];
        if (pressedButton) {
            applyCapturedInput(pressedButton.key);
            return pressedButton.key;
        }
        const activeAxis = getActiveAxes(primary)[0];
        if (activeAxis) {
            applyCapturedInput(activeAxis.key);
            return activeAxis.key;
        }
        return null;
    }

    function _statusText(primary, pads) {
        if (state.capture) {
            return `Press a button or move an axis to map ${state.capture.actionName}.`;
        }
        if (!pads.length) return 'No controller detected yet.';
        if (!primary) return `${pads.length} controller(s) connected, but none expose the standard mapping yet.`;
        return `Primary controller: ${primary.id} (slot ${primary.index}).`;
    }

    function _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
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

    function _renderLiveInputs(summary) {
        const host = document.getElementById('controller-prototype-live-inputs');
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
        const host = document.getElementById('controller-prototype-mapping-grid');
        if (!host) return;
        host.innerHTML = ACTION_ORDER.map(([actionKey, label]) => {
            const armed = !!(state.capture && state.capture.actionKey === actionKey);
            const boundInput = Object.entries(profile.actions || {}).find(([, value]) => value === actionKey)?.[0] || 'not set';
            const active = boundInput !== 'not set' && (summary.buttons.includes(boundInput) || summary.axes.includes(boundInput));
            return `<button type="button" data-map-action="${actionKey}" class="controller-prototype-map-btn rounded-2xl border px-3 py-3 text-left transition ${_mappingButtonClass(active, armed)}">
                <div class="text-[10px] uppercase tracking-[0.24em] opacity-70">${armed ? 'Listening…' : boundInput}</div>
                <div class="text-sm font-semibold">${label}</div>
                <div class="mt-1 text-xs opacity-70">${profile.actions[actionKey] || actionKey}</div>
            </button>`;
        }).join('');
        host.querySelectorAll('[data-map-action]').forEach((button) => {
            if (button.__controllerPrototypeBound) return;
            button.__controllerPrototypeBound = true;
            button.addEventListener('click', () => beginCapture(button.getAttribute('data-map-action')));
        });
    }

    function _bindControls() {
        const refreshBtn = document.getElementById('controller-prototype-refresh');
        const saveBtn = document.getElementById('controller-prototype-save-default');
        const clearBtn = document.getElementById('controller-prototype-clear-profile');
        const cancelBtn = document.getElementById('controller-prototype-cancel-capture');
        if (refreshBtn && !refreshBtn.__controllerPrototypeBound) {
            refreshBtn.__controllerPrototypeBound = true;
            refreshBtn.addEventListener('click', render);
        }
        if (saveBtn && !saveBtn.__controllerPrototypeBound) {
            saveBtn.__controllerPrototypeBound = true;
            saveBtn.addEventListener('click', () => saveProfile(_defaultProfile()));
        }
        if (clearBtn && !clearBtn.__controllerPrototypeBound) {
            clearBtn.__controllerPrototypeBound = true;
            clearBtn.addEventListener('click', clearProfile);
        }
        if (cancelBtn && !cancelBtn.__controllerPrototypeBound) {
            cancelBtn.__controllerPrototypeBound = true;
            cancelBtn.addEventListener('click', cancelCapture);
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
        const profile = state.currentProfile = loadProfile();

        _setText('controller-prototype-status', _statusText(primary, pads));
        _setText('controller-prototype-primary', primary
            ? `${primary.id}\nButtons pressed: ${getPressedButtons(primary).map((button) => button.key).join(', ') || 'none'}\nAxes active: ${getActiveAxes(primary).map((axis) => `${axis.key}=${axis.value}`).join(', ') || 'none'}`
            : 'Waiting for a standard browser gamepad…');
        _setText('controller-prototype-pads', JSON.stringify(pads, null, 2));
        _setText('controller-prototype-profile', JSON.stringify(profile, null, 2));
        _setText('controller-prototype-capture-status', state.capture
            ? `Listening for input to map ${state.capture.actionName}.`
            : 'Click a tile below, then press a controller button to remap it.');

        const cancelBtn = document.getElementById('controller-prototype-cancel-capture');
        if (cancelBtn) cancelBtn.disabled = !state.capture;

        _renderLiveInputs(liveSummary);
        _renderMappingButtons(profile, liveSummary);
        return { pads, primary, profile, liveSummary, capture: state.capture ? _clone(state.capture) : null };
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

    window.feedBackControllerPrototype = {
        version: 2,
        storageKey: STORAGE_KEY,
        actionOrder: ACTION_ORDER.map(([key, label]) => ({ key, label })),
        defaultProfile: _defaultProfile(),
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
        saveProfile,
        loadProfile,
        clearProfile,
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
