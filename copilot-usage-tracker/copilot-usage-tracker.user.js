// ==UserScript==
// @name        Copilot Usage Tracker
// @namespace   https://github.com/3096/monke
// @version     0.1.0
// @description Modifies the GitHub Copilot features settings page to display usage percentage with over/under projected allowance indicators based on how much of the month has passed.
// @author      3096
// @match       https://github.com/settings/copilot/features
// @grant       none
// ==/UserScript==

'use strict';

(function () {
  // =====================================================================
  // Configuration — Edit these values to match your billing cycle
  // =====================================================================
  const CONFIG = {
    // Which day of the month does the reset period start? (1–28)
    // e.g. 1 means the cycle resets on the 1st of each month (UTC).
    resetDayOfMonth: 1,

    // Count only workdays (Mon–Fri minus holidays) when calculating
    // how much of the period has elapsed? If false, every calendar day counts.
    workdaysOnly: false,

    // Company holidays to exclude when workdaysOnly is true.
    // Format: 'YYYY-MM-DD' strings in UTC.
    holidays: [
      // '2026-01-01', // New Year's Day
      // '2026-05-25', // Memorial Day
      // '2026-07-04', // Independence Day
      // '2026-09-07', // Labor Day
      // '2026-11-26', // Thanksgiving
      // '2026-12-25', // Christmas
    ],

    // How close (in percentage points) usage must be to the projected
    // allowance to be considered "on track" rather than over/under.
    onTrackThreshold: 2,
  };

  // =====================================================================
  // Date / Period Utilities
  // =====================================================================

  /**
   * Build a Set of holiday date strings for O(1) lookup.
   */
  const holidaySet = new Set(CONFIG.holidays);

  /**
   * Return true if a Date falls on a weekday (Mon–Fri) and is not a holiday.
   */
  function isWorkday(date) {
    const day = date.getUTCDay(); // 0=Sun … 6=Sat
    if (day === 0 || day === 6) return false;
    const iso = date.toISOString().slice(0, 10);
    return !holidaySet.has(iso);
  }

  /**
   * Get the start Date (UTC midnight) of the current reset period.
   */
  function getPeriodStart() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed
    const resetDay = CONFIG.resetDayOfMonth;

    // If we haven't reached the reset day this month, the period started last month
    if (now.getUTCDate() < resetDay) {
      const prev = new Date(Date.UTC(year, month - 1, resetDay));
      return prev;
    }
    return new Date(Date.UTC(year, month, resetDay));
  }

  /**
   * Get the end Date (UTC midnight) of the current reset period.
   */
  function getPeriodEnd() {
    const start = getPeriodStart();
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, CONFIG.resetDayOfMonth));
  }

  /**
   * Count the number of relevant days between two dates (exclusive of end).
   * If workdaysOnly is true, only counts weekdays minus holidays.
   */
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

  /**
   * Calculate the fraction (0–1) of the current reset period that has elapsed.
   */
  function getMonthProgress() {
    const start = getPeriodStart();
    const end = getPeriodEnd();
    const now = new Date();

    // Clamp "now" to midnight UTC of today for a clean day boundary
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const totalDays = countDays(start, end);
    if (totalDays === 0) return 0;

    const elapsedDays = countDays(start, today);
    return Math.min(elapsedDays / totalDays, 1);
  }

  // =====================================================================
  // Usage Status
  // =====================================================================

  /**
   * Determine whether current usage is over, under, or on-track relative
   * to the projected allowance at this point in the period.
   *
   * @param {number} usagePercent  – actual usage percentage (0–100)
   * @param {number} monthProgress – fraction of period elapsed (0–1)
   * @returns {{ status: 'over'|'under'|'on-track', delta: number }}
   */
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

  /**
   * Find the progress bar container on the page and extract the usage %.
   * @returns {{ container: Element, usagePercent: number }|null}
   */
  function parseUsageData() {
    const progressBar = document.getElementById('copilot_overages_progress_bar');
    if (!progressBar) return null;

    // The parent wrapper that holds the label row + progress bar
    const wrapper = progressBar.closest(
      '[data-view-component="true"].d-inline-flex.flex-1.flex-column'
    );
    if (!wrapper) return null;

    // The percentage text lives in the header row's second child
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

  /**
   * Add custom CSS styles for the usage indicator.
   */
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

  /**
   * Build and inject the enhanced progress bar + status indicator.
   */
  function injectUsageIndicator(data, monthProgress, usageStatus) {
    const { wrapper, progressBar, usagePercent } = data;
    const monthPercent = parseFloat((monthProgress * 100).toFixed(1));

    // Determine bar color
    const isOver = usageStatus.status === 'over';
    const barColor = isOver ? '#f85149' : '#238636';

    // Build the enhanced container
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

    // --- Status row (legend + badge) ---
    const statusRow = document.createElement('div');
    statusRow.className = 'monkey-status-row';

    // Legend
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

    // Badge
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

    // Replace the original progress bar with our enhanced version
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
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
