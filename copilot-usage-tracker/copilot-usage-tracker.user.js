// ==UserScript==
// @name        Copilot Usage Tracker
// @namespace   https://github.com/3096/monke
// @version     0.2.0
// @description Modifies the GitHub Copilot features settings page to display usage percentage with over/under projected allowance indicators based on how much of the month has passed.
// @author      3096
// @match       https://github.com/settings/copilot/features
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// ==/UserScript==

'use strict';

(function () {
  // =====================================================================
  // Configuration — Stored via GM_getValue/GM_setValue
  // Users can edit these from the Violentmonkey menu → "⚙ Usage Tracker Settings"
  // =====================================================================

  const DEFAULTS = {
    resetDayOfMonth: 1,
    workdaysOnly: false,
    holidays: [],       // Array of 'YYYY-MM-DD' strings
    onTrackThreshold: 2, // percentage points
  };

  /**
   * Load config from GM storage, falling back to defaults.
   */
  function loadConfig() {
    return {
      resetDayOfMonth: GM_getValue('resetDayOfMonth', DEFAULTS.resetDayOfMonth),
      workdaysOnly: GM_getValue('workdaysOnly', DEFAULTS.workdaysOnly),
      holidays: GM_getValue('holidays', DEFAULTS.holidays),
      onTrackThreshold: GM_getValue('onTrackThreshold', DEFAULTS.onTrackThreshold),
    };
  }

  /**
   * Save a full config object to GM storage.
   */
  function saveConfig(config) {
    GM_setValue('resetDayOfMonth', config.resetDayOfMonth);
    GM_setValue('workdaysOnly', config.workdaysOnly);
    GM_setValue('holidays', config.holidays);
    GM_setValue('onTrackThreshold', config.onTrackThreshold);
  }

  // =====================================================================
  // Settings Panel UI
  // =====================================================================

  function openSettingsPanel() {
    // Remove existing panel if open
    const existing = document.getElementById('monkey-settings-overlay');
    if (existing) existing.remove();

    const config = loadConfig();

    // --- Overlay ---
    const overlay = document.createElement('div');
    overlay.id = 'monkey-settings-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '99999',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    // --- Panel ---
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      backgroundColor: '#161b22', color: '#e6edf3', borderRadius: '12px',
      padding: '24px', width: '460px', maxHeight: '80vh', overflowY: 'auto',
      border: '1px solid #30363d', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    });

    const inputStyle = `
      background-color: #0d1117; color: #e6edf3; border: 1px solid #30363d;
      border-radius: 6px; padding: 6px 10px; font-size: 14px; width: 100%;
      box-sizing: border-box; margin-top: 4px;
    `;
    const labelStyle = 'display: block; margin-bottom: 16px;';
    const captionStyle = 'font-size: 12px; color: #8b949e; margin-top: 4px;';

    panel.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
        🐵 Copilot Usage Tracker — Settings
      </h3>

      <label style="${labelStyle}">
        <span>Reset day of month</span>
        <input id="monkey-cfg-resetDay" type="number" min="1" max="28"
               value="${config.resetDayOfMonth}" style="${inputStyle}" />
        <div style="${captionStyle}">Which day your billing cycle resets (1–28, UTC).</div>
      </label>

      <label style="${labelStyle}; display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input id="monkey-cfg-workdaysOnly" type="checkbox"
               ${config.workdaysOnly ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #238636;" />
        <span>Count workdays only</span>
      </label>
      <div style="${captionStyle}; margin-top: -12px; margin-bottom: 16px;">
        If checked, weekends are excluded from the elapsed-time calculation.
      </div>

      <label style="${labelStyle}">
        <span>Company holidays</span>
        <textarea id="monkey-cfg-holidays" rows="4" style="${inputStyle}; resize: vertical;"
        >${config.holidays.join('\n')}</textarea>
        <div style="${captionStyle}">One date per line in YYYY-MM-DD format (UTC). Only used when "workdays only" is enabled.</div>
      </label>

      <label style="${labelStyle}">
        <span>On-track threshold (%)</span>
        <input id="monkey-cfg-threshold" type="number" min="0" max="50" step="0.5"
               value="${config.onTrackThreshold}" style="${inputStyle}" />
        <div style="${captionStyle}">How close (in percentage points) usage must be to projected allowance to count as "on track".</div>
      </label>

      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
        <button id="monkey-cfg-cancel" style="
          background-color: #21262d; color: #e6edf3; border: 1px solid #30363d;
          border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 14px;
        ">Cancel</button>
        <button id="monkey-cfg-save" style="
          background-color: #238636; color: #ffffff; border: 1px solid #238636;
          border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 14px; font-weight: 600;
        ">Save & Reload</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Close on overlay click (outside panel)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Cancel
    document.getElementById('monkey-cfg-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    // Save
    document.getElementById('monkey-cfg-save').addEventListener('click', () => {
      const resetDay = parseInt(document.getElementById('monkey-cfg-resetDay').value, 10);
      const workdaysOnly = document.getElementById('monkey-cfg-workdaysOnly').checked;
      const holidaysRaw = document.getElementById('monkey-cfg-holidays').value.trim();
      const threshold = parseFloat(document.getElementById('monkey-cfg-threshold').value);

      const holidays = holidaysRaw
        ? holidaysRaw.split('\n').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
        : [];

      saveConfig({
        resetDayOfMonth: Math.max(1, Math.min(28, resetDay || 1)),
        workdaysOnly,
        holidays,
        onTrackThreshold: Math.max(0, threshold || 0),
      });

      overlay.remove();
      location.reload();
    });
  }

  // Register the settings command in Violentmonkey's menu
  GM_registerMenuCommand('⚙ Usage Tracker Settings', openSettingsPanel);

  // =====================================================================
  // Load config for this run
  // =====================================================================
  const CONFIG = loadConfig();

  // =====================================================================
  // Date / Period Utilities
  // =====================================================================

  const holidaySet = new Set(CONFIG.holidays);

  function isWorkday(date) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    const iso = date.toISOString().slice(0, 10);
    return !holidaySet.has(iso);
  }

  function getPeriodStart() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const resetDay = CONFIG.resetDayOfMonth;

    if (now.getUTCDate() < resetDay) {
      return new Date(Date.UTC(year, month - 1, resetDay));
    }
    return new Date(Date.UTC(year, month, resetDay));
  }

  function getPeriodEnd() {
    const start = getPeriodStart();
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, CONFIG.resetDayOfMonth));
  }

  function countDays(from, to) {
    let count = 0;
    const cursor = new Date(from);
    while (cursor < to) {
      if (!CONFIG.workdaysOnly || isWorkday(cursor)) {
        count++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  function getMonthProgress() {
    const start = getPeriodStart();
    const end = getPeriodEnd();
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const totalDays = countDays(start, end);
    if (totalDays === 0) return 0;

    const elapsedDays = countDays(start, today);
    return Math.min(elapsedDays / totalDays, 1);
  }

  // =====================================================================
  // Usage Status
  // =====================================================================

  function getUsageStatus(usagePercent, monthProgress) {
    const projected = monthProgress * 100;
    const delta = usagePercent - projected;

    if (Math.abs(delta) <= CONFIG.onTrackThreshold) {
      return { status: 'on-track', delta: 0 };
    }
    if (delta > 0) {
      return { status: 'over', delta: parseFloat(delta.toFixed(1)) };
    }
    return { status: 'under', delta: parseFloat(Math.abs(delta).toFixed(1)) };
  }

  // =====================================================================
  // DOM: Parse existing usage data
  // =====================================================================

  function parseUsageData() {
    const progressBar = document.getElementById('copilot_overages_progress_bar');
    if (!progressBar) return null;

    const wrapper = progressBar.closest(
      '[data-view-component="true"].d-inline-flex.flex-1.flex-column'
    );
    if (!wrapper) return null;

    const headerRow = wrapper.querySelector(
      '[data-view-component="true"].d-inline-flex.flex-items-center.flex-justify-between'
    );
    if (!headerRow) return null;

    const percentDiv = headerRow.querySelector('div[data-view-component="true"]');
    if (!percentDiv) return null;

    const raw = percentDiv.textContent.trim().replace('%', '');
    const usagePercent = parseFloat(raw);
    if (Number.isNaN(usagePercent)) return null;

    return { wrapper, progressBar, usagePercent };
  }

  // =====================================================================
  // DOM: Inject enhanced UI
  // =====================================================================

  function addStyles() {
    const css = `
      .monkey-progress-container {
        position: relative;
        width: 100%;
        margin-top: 8px;
        margin-bottom: 8px;
      }
      .monkey-progress-stack {
        position: relative;
        height: 10px;
        background-color: #21262d;
        border-radius: 6px;
        overflow: hidden;
      }
      .monkey-bar-usage {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        border-radius: 6px;
        z-index: 2;
      }
      .monkey-bar-time-marker {
        position: absolute;
        top: -3px;
        height: calc(100% + 6px);
        width: 2px;
        background-color: #e6edf3;
        z-index: 3;
        border-radius: 1px;
      }
      .monkey-status-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 6px;
        font-size: 12px;
      }
      .monkey-legend {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #8b949e;
        margin-top: 4px;
      }
      .monkey-status-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .monkey-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .monkey-status-badge {
        padding: 1px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
      }
      .monkey-status-under { color: #3fb950; }
      .monkey-status-under .monkey-status-badge {
        background-color: rgba(63, 185, 80, 0.15);
        color: #3fb950;
      }
      .monkey-status-over { color: #f85149; }
      .monkey-status-over .monkey-status-badge {
        background-color: rgba(248, 81, 73, 0.15);
        color: #f85149;
      }
      .monkey-status-ontrack { color: #8b949e; }
      .monkey-status-ontrack .monkey-status-badge {
        background-color: rgba(139, 148, 158, 0.15);
        color: #8b949e;
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectUsageIndicator(data, monthProgress, usageStatus) {
    const { progressBar, usagePercent } = data;
    const monthPercent = parseFloat((monthProgress * 100).toFixed(1));

    const isOver = usageStatus.status === 'over';
    const barColor = isOver ? '#f85149' : '#238636';

    const container = document.createElement('div');
    container.className = 'monkey-progress-container';

    // --- Layered progress bar ---
    const stack = document.createElement('div');
    stack.className = 'monkey-progress-stack';

    const usageBar = document.createElement('div');
    usageBar.className = 'monkey-bar-usage';
    usageBar.style.width = `${usagePercent}%`;
    usageBar.style.backgroundColor = barColor;

    const timeMarker = document.createElement('div');
    timeMarker.className = 'monkey-bar-time-marker';
    timeMarker.style.left = `${monthPercent}%`;

    stack.appendChild(usageBar);
    stack.appendChild(timeMarker);
    container.appendChild(stack);

    // --- Status row ---
    const statusRow = document.createElement('div');
    statusRow.className = 'monkey-status-row';

    const legend = document.createElement('div');
    legend.className = 'monkey-legend';
    legend.innerHTML = `
      <span class="monkey-status-label">
        <span class="monkey-dot" style="background-color: ${barColor};"></span> Usage: ${usagePercent}%
      </span>
      <span class="monkey-status-label">
        <span class="monkey-dot" style="background-color: #e6edf3;"></span> Period elapsed: ${monthPercent}%
      </span>
    `;

    const badgeWrapper = document.createElement('span');
    const badge = document.createElement('span');
    badge.className = 'monkey-status-badge';

    if (usageStatus.status === 'over') {
      badgeWrapper.className = 'monkey-status-over';
      badge.textContent = `▲ ${usageStatus.delta}% over`;
    } else if (usageStatus.status === 'under') {
      badgeWrapper.className = 'monkey-status-under';
      badge.textContent = `▼ ${usageStatus.delta}% under`;
    } else {
      badgeWrapper.className = 'monkey-status-ontrack';
      badge.textContent = '≈ On track';
    }
    badgeWrapper.appendChild(badge);

    statusRow.appendChild(legend);
    statusRow.appendChild(badgeWrapper);
    container.appendChild(statusRow);

    progressBar.replaceWith(container);
  }

  // =====================================================================
  // Main Entry Point
  // =====================================================================

  function init() {
    const data = parseUsageData();
    if (!data) {
      console.warn('[Copilot Usage Tracker] Could not find usage data on the page.');
      return;
    }

    addStyles();

    const monthProgress = getMonthProgress();
    const usageStatus = getUsageStatus(data.usagePercent, monthProgress);

    injectUsageIndicator(data, monthProgress, usageStatus);

    console.log('[Copilot Usage Tracker] Injected usage indicator.', {
      usagePercent: data.usagePercent,
      monthProgress: `${(monthProgress * 100).toFixed(1)}%`,
      status: usageStatus,
      config: CONFIG,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
