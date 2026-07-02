/**
 * ReflexLab - Clicks Per Second (CPS) Test
 *
 * Timed click-speed test. The first input starts the clock and counts as
 * click #1; the run ends when the duration elapses. Score = clicks / duration.
 * All data is stored locally (localStorage). Shares the design system and
 * telemetry patterns with the reaction test.
 */

(function () {
  'use strict';

  // ==========================================
  // CONFIGURATION & CONSTANTS
  // ==========================================

  const CONFIG = {
    // Duration presets in seconds
    durations: [5, 10, 30, 60],

    // Rank thresholds by clicks per second (higher is better)
    ranks: [
      { name: 'Elite', minCps: 10, class: 'elite' },
      { name: 'Pro', minCps: 8, class: 'pro' },
      { name: 'Advanced', minCps: 7, class: 'advanced' },
      { name: 'Intermediate', minCps: 4, class: 'intermediate' },
      { name: 'Beginner', minCps: 0, class: 'beginner' }
    ],

    // LocalStorage keys
    storageKeys: {
      best: 'cpslab_best',
      settings: 'cpslab_settings',
      sessionHistory: 'cpslab_session_history',
      achievedRanks: 'cpslab_achieved_ranks',
      historyLog: 'cpslab_history_log'
    },

    // Sound (Web Audio API)
    sound: {
      startFreq: 1046, // C6 - run start
      endFreq: 523, // C5 - run end
      duration: 0.08,
      type: 'sine'
    },

    maxHistory: 20, // trend graph + run history cap
    // Autocheat heuristic
    maxHumanCps: 25, // above this = almost certainly automated
    evenIntervalCv: 0.05 // coefficient of variation below this = bot-like
  };

  // ==========================================
  // STATE
  // ==========================================

  const state = {
    status: 'idle', // 'idle' | 'counting' | 'complete'
    clicks: 0,
    clickTimes: [],
    startTime: 0,
    duration: 5,
    rafId: null,

    settings: {
      duration: 5,
      inputMethod: 'mouse',
      sound: true
    },

    best: null,
    sessionHistory: [],
    achievedRanks: new Set(),
    historyLog: [],

    audioContext: null,
    chartInstance: null,
    lastFocused: null // for modal focus restore
  };

  // ==========================================
  // DOM REFERENCES
  // ==========================================

  const DOM = {};

  function cacheDOM() {
    DOM.area = document.getElementById('cps-area');
    DOM.contentDefault = document.getElementById('cps-content-default');
    DOM.live = document.getElementById('cps-live');
    DOM.results = document.getElementById('cps-results');
    DOM.hint = document.getElementById('cps-hint');
    DOM.status = document.getElementById('cps-status');
    DOM.instruction = document.getElementById('cps-instruction');
    DOM.announce = document.getElementById('cps-announce');

    DOM.cpsValue = document.getElementById('cps-value');
    DOM.cpsCount = document.getElementById('cps-count');
    DOM.timeleft = document.getElementById('cps-timeleft');

    DOM.cpsFinal = document.getElementById('cps-final');
    DOM.rankLabel = document.getElementById('cps-rank-label');
    DOM.resultMeta = document.getElementById('cps-result-meta');
    DOM.bestFlag = document.getElementById('cps-best-flag');
    DOM.message = document.getElementById('cps-message');
    DOM.tryAgainBtn = document.getElementById('cps-try-again');

    DOM.timerTrack = document.getElementById('cps-timer-track');
    DOM.timerFill = document.getElementById('cps-timer-fill');

    DOM.durationGroup = document.getElementById('duration-group');
    DOM.inputGroup = document.getElementById('input-group');

    DOM.resetBtn = document.getElementById('reset-btn');
    DOM.soundToggle = document.getElementById('sound-toggle');
    DOM.soundIcon = document.getElementById('sound-icon');

    DOM.resetModal = document.getElementById('reset-modal');
    DOM.modalCancelBtn = document.getElementById('modal-cancel-btn');
    DOM.modalConfirmBtn = document.getElementById('modal-confirm-btn');

    DOM.widgetBestTime = document.getElementById('widget-pb-time');
    DOM.widgetBestRank = document.getElementById('widget-pb-rank');
    DOM.widgetBestDescription = document.getElementById('widget-pb-description');
    DOM.widgetAvgTime = document.getElementById('widget-avg-time');
    DOM.widgetAvgRank = document.getElementById('widget-avg-rank');
    DOM.widgetAvgSessions = document.getElementById('widget-avg-sessions');
    DOM.widgetAvgDescription = document.getElementById('widget-avg-description');

    DOM.sessionChart = document.getElementById('session-chart');
    DOM.chartDescription = document.getElementById('chart-description');
    DOM.chartEmptyMessage = document.getElementById('chart-empty-message');
    DOM.rankChecklist = document.getElementById('rank-checklist');
    DOM.historyList = document.getElementById('history-list');
    DOM.historyEmptyMessage = document.getElementById('history-empty-message');
  }

  // ==========================================
  // INIT
  // ==========================================

  function init() {
    cacheDOM();
    loadSettings();
    applySettingsToUI();
    updateSoundIcon();
    loadBest();
    loadSessionHistory();
    loadAchievedRanks();
    loadHistoryLog();
    attachEventListeners();
    initChart();
    restoreChartData();
    restoreRankChecklist();
    renderHistoryLog();
    updateWidgetBest();
    updateWidgetAvg();
    updateInputText();
  }

  function attachEventListeners() {
    // Click surface: pointerdown counts a click (mouse / touch / pen).
    DOM.area.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#cps-try-again')) return; // let the button handle it
      if (e.button && e.button !== 0) return; // primary button only
      e.preventDefault();
      handleInput(e);
    });

    // Keyboard input (spacebar mode, plus Enter/Space a11y path in mouse mode).
    document.addEventListener('keydown', handleKeyDown);

    // Settings
    setupButtonGroup(DOM.durationGroup, 'duration');
    setupButtonGroup(DOM.inputGroup, 'inputMethod');

    // Try again
    DOM.tryAgainBtn.addEventListener('click', () => {
      resetRun();
      DOM.area.focus();
    });

    // Sound toggle
    DOM.soundToggle.addEventListener('click', () => {
      state.settings.sound = !state.settings.sound;
      saveSettings();
      updateSoundIcon();
      initAudio();
    });

    // Reset modal
    DOM.resetBtn.addEventListener('click', openResetModal);
    DOM.modalCancelBtn.addEventListener('click', closeResetModal);
    DOM.modalConfirmBtn.addEventListener('click', confirmReset);
    DOM.resetModal.addEventListener('click', (e) => {
      if (e.target === DOM.resetModal) closeResetModal();
    });
  }

  // ==========================================
  // INPUT HANDLING
  // ==========================================

  function handleInput(e) {
    if (state.status === 'idle') {
      startRun();
      registerClick(e);
    } else if (state.status === 'counting') {
      registerClick(e);
    }
    // 'complete': ignore; Try Again restarts.
  }

  function handleKeyDown(e) {
    const isSpace = e.code === 'Space' || e.key === ' ';
    const isEnter = e.key === 'Enter';

    // Close modal on Escape.
    if (e.key === 'Escape' && !DOM.resetModal.hidden) {
      closeResetModal();
      return;
    }

    const active = document.activeElement;
    const areaFocused = active === DOM.area;
    // Don't hijack keys meant to activate a focused control (settings, buttons, links).
    const onControl =
      active &&
      active !== DOM.area &&
      ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(
        active.tagName
      );

    if (state.settings.inputMethod === 'spacebar') {
      if (isSpace && !onControl) {
        e.preventDefault(); // stop page scroll
        handleInput(e);
      }
    } else {
      // Mouse mode: keyboard is the accessibility path (area focused or mid-run).
      if ((isSpace || isEnter) && (areaFocused || state.status === 'counting')) {
        if (isSpace) e.preventDefault();
        handleInput(e);
      }
    }
  }

  function registerClick(e) {
    if (state.status !== 'counting') return;
    state.clicks++;
    state.clickTimes.push(performance.now());
    DOM.cpsCount.textContent = state.clicks;
    spawnRipple(e);
  }

  // ==========================================
  // RUN LIFECYCLE
  // ==========================================

  function startRun() {
    initAudio();
    state.status = 'counting';
    state.clicks = 0;
    state.clickTimes = [];
    state.duration = state.settings.duration;
    state.startTime = performance.now();

    DOM.contentDefault.hidden = true;
    DOM.results.hidden = true;
    DOM.bestFlag.hidden = true;
    DOM.live.hidden = false;

    DOM.cpsValue.textContent = '0.0';
    DOM.cpsCount.textContent = '0';
    DOM.timeleft.textContent = state.duration.toFixed(1);

    setAreaState('cps-counting');
    announce(`Go. Click as fast as you can for ${state.duration} seconds.`);
    playBeep(CONFIG.sound.startFreq);

    state.rafId = requestAnimationFrame(tick);
  }

  function tick() {
    const elapsed = (performance.now() - state.startTime) / 1000;
    const remaining = Math.max(0, state.duration - elapsed);

    DOM.timerFill.style.transform = `scaleX(${remaining / state.duration})`;
    DOM.timeleft.textContent = remaining.toFixed(1);
    // Clamp the denominator early so the first fraction of a second doesn't spike.
    const liveCps = state.clicks / Math.max(elapsed, 0.3);
    DOM.cpsValue.textContent = liveCps.toFixed(1);

    if (remaining <= 0) {
      endRun();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function endRun() {
    cancelAnimationFrame(state.rafId);
    state.status = 'complete';
    DOM.timerFill.style.transform = 'scaleX(0)';

    const cps = Math.round((state.clicks / state.duration) * 10) / 10;
    const rank = getRank(cps);
    const flagged = isAutomated(cps, state.clickTimes);

    DOM.live.hidden = true;
    DOM.cpsFinal.textContent = cps.toFixed(1);
    DOM.rankLabel.textContent = rank.name;
    DOM.rankLabel.className = 'rank-badge ' + rank.class;
    DOM.resultMeta.textContent = `${state.clicks} click${state.clicks === 1 ? '' : 's'} in ${state.duration}s`;

    setAreaState('session-complete');
    DOM.area.classList.add('rank-' + rank.class);
    DOM.results.hidden = false;
    playBeep(CONFIG.sound.endFreq);

    if (flagged) {
      DOM.bestFlag.hidden = true;
      DOM.message.textContent =
        'That looks automated - this run was not saved to your records.';
      announce(
        `Time. ${cps.toFixed(1)} clicks per second. This run looks automated and was not saved.`
      );
      return; // keep records honest: no persistence
    }

    const isBest = state.best === null || cps > state.best;
    DOM.bestFlag.hidden = !isBest;
    if (isBest) {
      state.best = cps;
      saveBest();
    }
    DOM.message.textContent = getMotivationalMessage(rank, isBest);

    addToHistory(cps);
    updateChart(cps);
    updateRankChecklist(cps);
    updateWidgetBest();
    updateWidgetAvg();

    announce(
      `Time. ${cps.toFixed(1)} clicks per second. Rank ${rank.name}. ${state.clicks} clicks.` +
        (isBest ? ' New best.' : '')
    );
  }

  function resetRun() {
    cancelAnimationFrame(state.rafId);
    state.status = 'idle';
    state.clicks = 0;
    state.clickTimes = [];

    DOM.live.hidden = true;
    DOM.results.hidden = true;
    DOM.bestFlag.hidden = true;
    DOM.contentDefault.hidden = false;
    setAreaState('idle');
    DOM.timerFill.style.transform = 'scaleX(0)';
    updateInputText();
  }

  function setAreaState(name) {
    DOM.area.classList.remove(
      'state-idle',
      'state-cps-counting',
      'state-session-complete',
      'rank-elite',
      'rank-pro',
      'rank-advanced',
      'rank-intermediate',
      'rank-beginner'
    );
    if (name) DOM.area.classList.add('state-' + name);
  }

  // ==========================================
  // RANKS & MESSAGING
  // ==========================================

  function getRank(cps) {
    for (const rank of CONFIG.ranks) {
      if (cps >= rank.minCps) return rank;
    }
    return CONFIG.ranks[CONFIG.ranks.length - 1];
  }

  function isAutomated(cps, times) {
    if (cps > CONFIG.maxHumanCps) return true;
    if (times.length >= 15) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (mean <= 0) return true;
      const variance =
        intervals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < CONFIG.evenIntervalCv) return true;
    }
    return false;
  }

  function getMotivationalMessage(rank, isBest) {
    if (isBest) return 'New personal best. Keep that momentum going!';
    const msgs = {
      elite: 'Elite speed. Your hands are flying.',
      pro: 'Pro-level clicking. Seriously fast.',
      advanced: 'Fast and steady - above the pack.',
      intermediate: 'Solid pace. A warm-up and some rhythm will push you higher.',
      beginner: 'Good start. Relax your hand and try a quick warm-up run.'
    };
    return msgs[rank.class] || 'Nice run. Go again to beat it.';
  }

  // ==========================================
  // CLICK RIPPLE
  // ==========================================

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function spawnRipple(e) {
    if (prefersReducedMotion()) return;
    let x, y;
    if (e && typeof e.clientX === 'number' && e.clientX !== 0) {
      const rect = DOM.area.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    } else {
      x = DOM.area.clientWidth / 2;
      y = DOM.area.clientHeight / 2;
    }
    const ripple = document.createElement('span');
    ripple.className = 'cps-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.addEventListener('animationend', () => ripple.remove());
    DOM.area.appendChild(ripple);
  }

  // ==========================================
  // SOUND (Web Audio API)
  // ==========================================

  function initAudio() {
    if (!state.audioContext) {
      try {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        // Web Audio not supported; sound simply stays off.
      }
    }
  }

  function playBeep(frequency) {
    if (!state.settings.sound || !state.audioContext) return;
    try {
      const osc = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      osc.connect(gain);
      gain.connect(state.audioContext.destination);
      osc.type = CONFIG.sound.type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.25, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        state.audioContext.currentTime + CONFIG.sound.duration
      );
      osc.start(state.audioContext.currentTime);
      osc.stop(state.audioContext.currentTime + CONFIG.sound.duration);
    } catch (err) {
      // Ignore audio failures.
    }
  }

  function updateSoundIcon() {
    if (!DOM.soundIcon) return;
    DOM.soundIcon.className = state.settings.sound
      ? 'ph ph-speaker-high'
      : 'ph ph-speaker-slash';
    DOM.soundToggle.classList.toggle('muted', !state.settings.sound);
  }

  // ==========================================
  // SETTINGS
  // ==========================================

  function setupButtonGroup(group, key) {
    if (!group) return;
    group.querySelectorAll('.btn-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        group
          .querySelectorAll('.btn-option')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        let value = btn.dataset.value;
        if (key === 'duration') value = parseInt(value, 10);
        state.settings[key] = value;
        saveSettings();

        // Abort any run in progress - visibly, not silently.
        if (state.status !== 'idle') resetRun();
        else updateInputText();
      });
    });
  }

  function applySettingsToUI() {
    setActiveOption(DOM.durationGroup, String(state.settings.duration));
    setActiveOption(DOM.inputGroup, state.settings.inputMethod);
  }

  function setActiveOption(group, value) {
    if (!group) return;
    group.querySelectorAll('.btn-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function updateInputText() {
    const action = state.settings.inputMethod === 'mouse' ? 'Click' : 'Press Space';
    if (state.status === 'idle') {
      DOM.status.textContent = `${action} to start`;
    }
    DOM.instruction.textContent = `${state.settings.duration}-second test`;
    DOM.hint.textContent =
      state.settings.inputMethod === 'mouse'
        ? 'Click as fast as you can until the timer runs out. Your score is your clicks per second.'
        : 'Press Space as fast as you can until the timer runs out. Your score is your clicks per second.';
  }

  // ==========================================
  // TELEMETRY WIDGETS
  // ==========================================

  function updateWidgetBest() {
    if (state.best !== null) {
      const rank = getRank(state.best);
      DOM.widgetBestTime.textContent = state.best.toFixed(1);
      DOM.widgetBestRank.textContent = rank.name;
      DOM.widgetBestRank.className = 'pb-rank-badge ' + rank.class;
      DOM.widgetBestDescription.textContent = `${rank.name}-tier click speed.`;
    } else {
      DOM.widgetBestTime.textContent = '—';
      DOM.widgetBestRank.textContent = '—';
      DOM.widgetBestRank.className = 'pb-rank-badge';
      DOM.widgetBestDescription.textContent = 'Complete a run to set your best CPS.';
    }
  }

  function updateWidgetAvg() {
    if (state.sessionHistory.length > 0) {
      const avg =
        state.sessionHistory.reduce((a, b) => a + b, 0) / state.sessionHistory.length;
      const avgRounded = Math.round(avg * 10) / 10;
      const rank = getRank(avgRounded);
      DOM.widgetAvgTime.textContent = avgRounded.toFixed(1);
      DOM.widgetAvgRank.textContent = rank.name;
      DOM.widgetAvgRank.className = 'pb-rank-badge ' + rank.class;
      DOM.widgetAvgSessions.textContent = state.sessionHistory.length;
      DOM.widgetAvgDescription.textContent = `Average across your last ${state.sessionHistory.length} run${state.sessionHistory.length === 1 ? '' : 's'}.`;
    } else {
      DOM.widgetAvgTime.textContent = '—';
      DOM.widgetAvgRank.textContent = '—';
      DOM.widgetAvgRank.className = 'pb-rank-badge';
      DOM.widgetAvgSessions.textContent = '0';
      DOM.widgetAvgDescription.textContent = 'Complete a run to see your average.';
    }
  }

  // ==========================================
  // RANK CHECKLIST
  // ==========================================

  function updateRankChecklist(cps) {
    const rank = getRank(cps);
    const hierarchy = ['elite', 'pro', 'advanced', 'intermediate', 'beginner'];
    const achievedIndex = hierarchy.indexOf(rank.class);
    for (let i = achievedIndex; i < hierarchy.length; i++) {
      state.achievedRanks.add(hierarchy[i]);
    }
    saveAchievedRanks();
    renderRankChecklist();
  }

  function renderRankChecklist() {
    if (!DOM.rankChecklist) return;
    DOM.rankChecklist.querySelectorAll('.rank-item').forEach((item) => {
      if (state.achievedRanks.has(item.dataset.rank)) {
        item.classList.add('achieved');
        item.querySelector('.rank-check').textContent = '✓';
      }
    });
  }

  function restoreRankChecklist() {
    if (state.achievedRanks.size > 0) renderRankChecklist();
  }

  // ==========================================
  // HISTORY LOG
  // ==========================================

  function addToHistory(cps) {
    state.historyLog.unshift({ score: cps, timestamp: Date.now() });
    if (state.historyLog.length > CONFIG.maxHistory) {
      state.historyLog = state.historyLog.slice(0, CONFIG.maxHistory);
    }
    saveHistoryLog();
    renderHistoryLog();
  }

  function renderHistoryLog() {
    if (!DOM.historyList) return;
    DOM.historyList.querySelectorAll('.history-item').forEach((el) => el.remove());

    if (state.historyLog.length === 0) {
      DOM.historyEmptyMessage.classList.remove('hidden');
      return;
    }
    DOM.historyEmptyMessage.classList.add('hidden');

    state.historyLog.forEach((entry) => {
      const rank = getRank(entry.score);
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML =
        `<span class="history-score">${entry.score.toFixed(1)} CPS</span>` +
        `<span class="history-rank ${rank.class}">${rank.name}</span>` +
        `<span class="history-time">${formatTime(entry.timestamp)}</span>`;
      DOM.historyList.appendChild(item);
    });
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // ==========================================
  // CHART (Trend)
  // ==========================================

  function initChart() {
    if (typeof Chart === 'undefined' || !DOM.sessionChart) return;
    const ctx = DOM.sessionChart.getContext('2d');
    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Clicks Per Second',
            data: [],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#22c55e',
            pointBorderColor: '#22c55e',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (context) {
                return context.parsed.y + ' CPS';
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#a1a1aa', font: { size: 10 } }
          }
        }
      }
    });
  }

  function updateChart(cps) {
    state.sessionHistory.push(cps);
    if (state.sessionHistory.length > CONFIG.maxHistory) {
      state.sessionHistory = state.sessionHistory.slice(-CONFIG.maxHistory);
    }
    saveSessionHistory();
    renderChart();
  }

  function renderChart() {
    if (!state.chartInstance) return;
    const labels = state.sessionHistory.map((_, i) => `Run ${i + 1}`);
    state.chartInstance.data.labels = labels;
    state.chartInstance.data.datasets[0].data = state.sessionHistory;
    state.chartInstance.update();
    DOM.chartDescription.classList.remove('hidden');
    DOM.chartEmptyMessage.classList.add('hidden');
  }

  function restoreChartData() {
    if (state.sessionHistory.length > 0) renderChart();
  }

  // ==========================================
  // MODAL
  // ==========================================

  function openResetModal() {
    state.lastFocused = document.activeElement;
    DOM.resetModal.hidden = false;
    DOM.resetModal.setAttribute('role', 'dialog');
    DOM.resetModal.setAttribute('aria-modal', 'true');
    DOM.modalCancelBtn.focus();
  }

  function closeResetModal() {
    DOM.resetModal.hidden = true;
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
      state.lastFocused.focus();
    }
  }

  function confirmReset() {
    Object.values(CONFIG.storageKeys).forEach((key) => {
      if (key === CONFIG.storageKeys.settings) return; // keep preferences
      try {
        localStorage.removeItem(key);
      } catch (err) {
        /* ignore */
      }
    });

    state.best = null;
    state.sessionHistory = [];
    state.achievedRanks = new Set();
    state.historyLog = [];

    // Reset UI
    DOM.rankChecklist.querySelectorAll('.rank-item').forEach((item) => {
      item.classList.remove('achieved');
      item.querySelector('.rank-check').textContent = '✗';
    });
    if (state.chartInstance) {
      state.chartInstance.data.labels = [];
      state.chartInstance.data.datasets[0].data = [];
      state.chartInstance.update();
      DOM.chartDescription.classList.add('hidden');
      DOM.chartEmptyMessage.classList.remove('hidden');
    }
    renderHistoryLog();
    updateWidgetBest();
    updateWidgetAvg();
    resetRun();
    closeResetModal();
  }

  // ==========================================
  // PERSISTENCE
  // ==========================================

  function saveSettings() {
    safeSet(CONFIG.storageKeys.settings, JSON.stringify(state.settings));
  }
  function loadSettings() {
    const raw = safeGet(CONFIG.storageKeys.settings);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        if (CONFIG.durations.includes(saved.duration)) {
          state.settings.duration = saved.duration;
        }
        if (saved.inputMethod === 'mouse' || saved.inputMethod === 'spacebar') {
          state.settings.inputMethod = saved.inputMethod;
        }
        if (typeof saved.sound === 'boolean') state.settings.sound = saved.sound;
      }
    } catch (err) {
      /* ignore malformed */
    }
    state.duration = state.settings.duration;
  }

  function saveBest() {
    safeSet(CONFIG.storageKeys.best, String(state.best));
  }
  function loadBest() {
    const raw = safeGet(CONFIG.storageKeys.best);
    const val = parseFloat(raw);
    state.best = raw !== null && !Number.isNaN(val) ? val : null;
  }

  function saveSessionHistory() {
    safeSet(CONFIG.storageKeys.sessionHistory, JSON.stringify(state.sessionHistory));
  }
  function loadSessionHistory() {
    const raw = safeGet(CONFIG.storageKeys.sessionHistory);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        state.sessionHistory = arr.filter((n) => typeof n === 'number' && n >= 0);
      }
    } catch (err) {
      /* ignore */
    }
  }

  function saveAchievedRanks() {
    safeSet(CONFIG.storageKeys.achievedRanks, JSON.stringify([...state.achievedRanks]));
  }
  function loadAchievedRanks() {
    const raw = safeGet(CONFIG.storageKeys.achievedRanks);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) state.achievedRanks = new Set(arr);
    } catch (err) {
      /* ignore */
    }
  }

  function saveHistoryLog() {
    safeSet(CONFIG.storageKeys.historyLog, JSON.stringify(state.historyLog));
  }
  function loadHistoryLog() {
    const raw = safeGet(CONFIG.storageKeys.historyLog);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        state.historyLog = arr.filter(
          (e) => e && typeof e.score === 'number' && typeof e.timestamp === 'number'
        );
      }
    } catch (err) {
      /* ignore */
    }
  }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* storage unavailable / full */
    }
  }

  // ==========================================
  // A11Y ANNOUNCEMENTS
  // ==========================================

  function announce(message) {
    if (DOM.announce) DOM.announce.textContent = message;
  }

  // ==========================================
  // BOOT
  // ==========================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
