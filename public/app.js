/**
 * ReflexLab - Reaction Time Test
 *
 * A simple, accurate reaction time test implementation using
 * performance.now() for high-precision timing.
 */

(function() {
    'use strict';

    // ==========================================
    // CONFIGURATION & CONSTANTS
    // ==========================================

    const CONFIG = {
        // Delay presets in milliseconds [min, max]
        delayPresets: {
            '1-3': [1000, 3000],
            '2-4': [2000, 4000],
            '2-6': [2000, 6000],
            '3-8': [3000, 8000]
        },
        // Rank thresholds based on reaction time in ms
        ranks: [
            { name: 'Elite', maxMs: 149, class: 'elite' },
            { name: 'Pro', maxMs: 199, class: 'pro' },
            { name: 'Advanced', maxMs: 249, class: 'advanced' },
            { name: 'Intermediate', maxMs: 349, class: 'intermediate' },
            { name: 'Beginner', maxMs: Infinity, class: 'beginner' }
        ],
        // LocalStorage keys
        storageKeys: {
            personalBest: 'reactionlab_personal_best',
            settings: 'reactionlab_settings',
            sessionHistory: 'reactionlab_session_history',
            achievedRanks: 'reactionlab_achieved_ranks',
            historyLog: 'reactionlab_history_log'
        },
        // Sound settings for Web Audio API
        sound: {
            frequency: 880, // Hz (A5 note)
            duration: 0.08, // seconds
            type: 'sine'
        }
    };

    // ==========================================
    // STATE MANAGEMENT
    // ==========================================

    const state = {
        // Current test state: 'idle' | 'waiting' | 'go' | 'result' | 'false-start' | 'session-complete'
        status: 'idle',

        // Current session data
        currentRound: 0,
        totalRounds: 5,
        attempts: [],

        // Timing
        goTimestamp: null,
        delayTimeoutId: null,

        // Settings
        settings: {
            rounds: 5,
            delay: '1-3',
            inputMethod: 'mouse',
            sound: true
        },

        // Personal best
        personalBest: null,

        // Audio context for sound
        audioContext: null,

        // Prevent double-clicks
        inputLocked: false,

        // Chart instance
        chartInstance: null,

        // Session history for chart (average scores from completed sessions)
        sessionHistory: [],

        // Achieved ranks in current session
        achievedRanks: new Set(),

        // History log with timestamps
        historyLog: []
    };

    // ==========================================
    // DOM REFERENCES
    // ==========================================

    const DOM = {
        // Test area
        testArea: null,
        testContentDefault: null,
        testContentResults: null,
        testHint: null,
        testStatus: null,
        testResult: null,
        testInstruction: null,

        // Progress
        progressIndicator: null,
        progressBar: null,

        // Modal
        resetModal: null,
        modalCancelBtn: null,
        modalConfirmBtn: null,

        // Results (inside test area)
        avgTime: null,
        rankLabel: null,
        attemptsList: null,
        resultMessage: null,
        tryAgainBtn: null,

        // Progress Widgets
        widgetPbTime: null,
        widgetPbRank: null,
        widgetPbDescription: null,
        sessionChart: null,
        chartDescription: null,
        chartEmptyMessage: null,
        rankChecklist: null,
        historyList: null,
        historyEmptyMessage: null,

        // Settings
        roundsGroup: null,
        delayGroup: null,
        inputGroup: null,
        resetBtn: null,
        soundToggle: null,
        soundIcon: null
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================

    /**
     * Initialize the application
     */
    function init() {
        cacheDOMElements();
        loadSettings();
        applySettingsToUI();
        updateSoundIcon();
        loadPersonalBest();
        loadSessionHistory();
        loadAchievedRanks();
        loadHistoryLog();
        attachEventListeners();
        initChart();
        restoreChartData();
        restoreRankChecklist();
        renderHistoryLog();
        updateUI();
        updateWidgetPB();
        updateWidgetAvg();
        updateInputMethodText();
    }

    /**
     * Cache all DOM element references
     */
    function cacheDOMElements() {
        // Test area
        DOM.testArea = document.getElementById('test-area');
        DOM.testContentDefault = document.getElementById('test-content-default');
        DOM.testContentResults = document.getElementById('test-content-results');
        DOM.testHint = document.getElementById('test-hint');
        DOM.testStatus = document.getElementById('test-status');
        DOM.testResult = document.getElementById('test-result');
        DOM.testInstruction = document.getElementById('test-instruction');

        // Progress
        DOM.progressIndicator = document.getElementById('progress-indicator');
        DOM.progressBar = document.getElementById('progress-bar');

        // Modal
        DOM.resetModal = document.getElementById('reset-modal');
        DOM.modalCancelBtn = document.getElementById('modal-cancel-btn');
        DOM.modalConfirmBtn = document.getElementById('modal-confirm-btn');

        // Results (inside test area)
        DOM.avgTime = document.getElementById('avg-time');
        DOM.rankLabel = document.getElementById('rank-label');
        DOM.attemptsList = document.getElementById('attempts-list');
        DOM.resultMessage = document.getElementById('result-message');
        DOM.tryAgainBtn = document.getElementById('try-again-btn');

        // Progress Widgets
        DOM.widgetPbTime = document.getElementById('widget-pb-time');
        DOM.widgetPbRank = document.getElementById('widget-pb-rank');
        DOM.widgetPbDescription = document.getElementById('widget-pb-description');
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

        // Settings
        DOM.roundsGroup = document.getElementById('rounds-group');
        DOM.delayGroup = document.getElementById('delay-group');
        DOM.inputGroup = document.getElementById('input-group');
        DOM.resetBtn = document.getElementById('reset-btn');
        DOM.soundToggle = document.getElementById('sound-toggle');
        DOM.soundIcon = document.getElementById('sound-icon');
    }

    /**
     * Attach all event listeners
     */
    function attachEventListeners() {
        // Test area click/touch
        DOM.testArea.addEventListener('click', handleTestAreaInput);
        DOM.testArea.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent double-firing on touch devices
            handleTestAreaInput();
        });

        // Keyboard input
        document.addEventListener('keydown', handleKeyDown);

        // Settings button groups
        setupButtonGroup(DOM.roundsGroup, 'rounds');
        setupButtonGroup(DOM.delayGroup, 'delay');
        setupButtonGroup(DOM.inputGroup, 'inputMethod');

        // Reset button - opens modal
        DOM.resetBtn.addEventListener('click', openResetModal);

        // Sound toggle button
        DOM.soundToggle.addEventListener('click', toggleSound);

        // Modal buttons
        DOM.modalCancelBtn.addEventListener('click', closeResetModal);
        DOM.modalConfirmBtn.addEventListener('click', confirmResetAllData);

        // Close modal when clicking overlay
        DOM.resetModal.addEventListener('click', (e) => {
            if (e.target === DOM.resetModal) {
                closeResetModal();
            }
        });

        // Try again button - returns to idle state instead of starting test immediately
        DOM.tryAgainBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent test area click
            resetSession();
        });
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    /**
     * Scroll to test section smoothly
     */
    function scrollToTest() {
        DOM.testArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ==========================================
    // SETTINGS MANAGEMENT
    // ==========================================

    /**
     * Load settings from localStorage
     */
    function loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.settings);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.settings = { ...state.settings, ...parsed };
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }

        // Update state
        state.totalRounds = state.settings.rounds;
    }

    /**
     * Apply settings to UI (called after DOM is cached)
     */
    function applySettingsToUI() {
        // Update button groups to reflect current settings
        setActiveButton(DOM.roundsGroup, state.settings.rounds.toString());
        setActiveButton(DOM.delayGroup, state.settings.delay);
        setActiveButton(DOM.inputGroup, state.settings.inputMethod);
    }

    /**
     * Set active button in a button group
     */
    function setActiveButton(group, value) {
        if (!group) return;
        const buttons = group.querySelectorAll('.btn-option');
        buttons.forEach(btn => {
            if (btn.dataset.value === value) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Setup button group event listeners
     */
    function setupButtonGroup(group, settingKey) {
        if (!group) return;
        const buttons = group.querySelectorAll('.btn-option');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update setting
                const value = btn.dataset.value;
                if (settingKey === 'rounds') {
                    state.settings.rounds = parseInt(value, 10);
                    state.totalRounds = state.settings.rounds;
                } else if (settingKey === 'delay') {
                    state.settings.delay = value;
                } else if (settingKey === 'inputMethod') {
                    state.settings.inputMethod = value;
                    updateInputMethodText();
                }

                saveSettings();

                // Reset if currently in a session
                if (state.status !== 'idle') {
                    resetSession();
                }

                updateUI();
            });
        });
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings() {
        try {
            localStorage.setItem(CONFIG.storageKeys.settings, JSON.stringify(state.settings));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }

    /**
     * Toggle sound on/off
     */
    function toggleSound() {
        state.settings.sound = !state.settings.sound;
        saveSettings();
        updateSoundIcon();
    }

    /**
     * Update sound icon UI
     */
    function updateSoundIcon() {
        if (state.settings.sound) {
            DOM.soundIcon.className = 'ph ph-speaker-high';
            DOM.soundToggle.classList.remove('muted');
        } else {
            DOM.soundIcon.className = 'ph ph-speaker-slash';
            DOM.soundToggle.classList.add('muted');
        }
    }

    /**
     * Handle settings change (legacy - kept for compatibility)
     */
    function handleSettingsChange() {
        state.totalRounds = state.settings.rounds;

        saveSettings();

        // Reset if currently in a session
        if (state.status !== 'idle') {
            resetSession();
        }

        updateUI();
    }

    // ==========================================
    // PERSONAL BEST MANAGEMENT
    // ==========================================

    /**
     * Load personal best from localStorage
     */
    function loadPersonalBest() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.personalBest);
            if (saved) {
                state.personalBest = parseInt(saved, 10);
            }
        } catch (e) {
            console.warn('Could not load personal best:', e);
        }
        updatePersonalBestDisplay();
    }

    /**
     * Save personal best to localStorage
     */
    function savePersonalBest(time) {
        if (state.personalBest === null || time < state.personalBest) {
            state.personalBest = time;
            try {
                localStorage.setItem(CONFIG.storageKeys.personalBest, time.toString());
            } catch (e) {
                console.warn('Could not save personal best:', e);
            }
            updatePersonalBestDisplay();
        }
    }

    // ==========================================
    // RESET MODAL
    // ==========================================

    /**
     * Open the reset confirmation modal
     */
    function openResetModal() {
        DOM.resetModal.hidden = false;
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    /**
     * Close the reset confirmation modal
     */
    function closeResetModal() {
        DOM.resetModal.hidden = true;
        document.body.style.overflow = ''; // Restore scrolling
    }

    /**
     * Confirm and reset all data
     */
    function confirmResetAllData() {
        // Clear all state
        state.personalBest = null;
        state.sessionHistory = [];
        state.achievedRanks.clear();
        state.historyLog = [];

        // Clear localStorage
        try {
            localStorage.removeItem(CONFIG.storageKeys.personalBest);
            localStorage.removeItem(CONFIG.storageKeys.sessionHistory);
            localStorage.removeItem(CONFIG.storageKeys.achievedRanks);
            localStorage.removeItem(CONFIG.storageKeys.historyLog);
        } catch (e) {
            console.warn('Could not clear data:', e);
        }

        // Update widget displays
        updateWidgetPB();
        updateWidgetAvg();

        // Reset chart
        if (state.chartInstance) {
            state.chartInstance.data.labels = [];
            state.chartInstance.data.datasets[0].data = [];
            state.chartInstance.update();
            DOM.chartDescription.classList.add('hidden');
            DOM.chartEmptyMessage.classList.remove('hidden');
        }

        // Reset rank checklist UI
        resetRankChecklist();

        // Reset history log UI
        renderHistoryLog();

        // Close modal
        closeResetModal();
    }

    /**
     * Update personal best display (widget only)
     */
    function updatePersonalBestDisplay() {
        updateWidgetPB();
    }

    /**
     * Update the widget personal best display
     */
    function updateWidgetPB() {
        if (state.personalBest !== null) {
            DOM.widgetPbTime.textContent = state.personalBest;
            const rank = getRank(state.personalBest);
            DOM.widgetPbRank.textContent = rank.name;
            DOM.widgetPbRank.className = `pb-rank-badge ${rank.class}`;
            DOM.widgetPbDescription.innerHTML = getPbDescription(rank.class);
        } else {
            DOM.widgetPbTime.textContent = '—';
            DOM.widgetPbRank.textContent = '—';
            DOM.widgetPbRank.className = 'pb-rank-badge';
            DOM.widgetPbDescription.textContent = 'Complete a session to set your personal best.';
        }
    }

    /**
     * Update the widget average score display
     */
    function updateWidgetAvg() {
        if (state.sessionHistory.length > 0) {
            const totalAvg = Math.round(state.sessionHistory.reduce((a, b) => a + b, 0) / state.sessionHistory.length);
            const rank = getRank(totalAvg);
            DOM.widgetAvgTime.textContent = totalAvg;
            DOM.widgetAvgRank.textContent = rank.name;
            DOM.widgetAvgRank.className = `pb-rank-badge ${rank.class}`;
            DOM.widgetAvgSessions.textContent = state.sessionHistory.length;
            DOM.widgetAvgDescription.innerHTML = getAvgDescription(rank.class);
        } else {
            DOM.widgetAvgTime.textContent = '—';
            DOM.widgetAvgRank.textContent = '—';
            DOM.widgetAvgRank.className = 'pb-rank-badge';
            DOM.widgetAvgSessions.textContent = '0';
            DOM.widgetAvgDescription.textContent = 'Complete a session to see your average.';
        }
    }

    /**
     * Get description for personal best rank
     */
    function getPbDescription(rankClass) {
        const highlight = '<span class="desc-highlight">personal best reaction time</span>';
        const descriptions = {
            elite: `Your ${highlight} is incredible! You're in the top tier, competitive with professional esports players.`,
            pro: `Your ${highlight} is excellent! You have competitive-level reflexes that put you ahead of most players.`,
            advanced: `Your ${highlight} is above average. You're faster than the majority of people.`,
            intermediate: `Your ${highlight} is in the average range. Keep practicing to reach the next level.`,
            beginner: `Your ${highlight} has room for improvement. With regular practice, you'll get faster.`
        };
        return descriptions[rankClass] || "Keep practicing to improve your reaction time!";
    }

    /**
     * Get description for average score rank
     */
    function getAvgDescription(rankClass) {
        const highlight = '<span class="desc-highlight">average reaction time</span>';
        const descriptions = {
            elite: `Your ${highlight} is incredible! You're consistently performing at a professional level.`,
            pro: `Your ${highlight} is excellent! You're consistently achieving competitive-level results.`,
            advanced: `Your ${highlight} is above average. You're consistently faster than most people.`,
            intermediate: `Your ${highlight} is in the normal range. Consistent practice will help you improve.`,
            beginner: `Your ${highlight} has room for growth. Focus on consistency and you'll see improvement.`
        };
        return descriptions[rankClass] || "Keep practicing to improve your average!";
    }

    // ==========================================
    // SESSION HISTORY PERSISTENCE
    // ==========================================

    /**
     * Load session history from localStorage
     */
    function loadSessionHistory() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.sessionHistory);
            if (saved) {
                state.sessionHistory = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load session history:', e);
        }
    }

    /**
     * Save session history to localStorage
     */
    function saveSessionHistory() {
        try {
            localStorage.setItem(CONFIG.storageKeys.sessionHistory, JSON.stringify(state.sessionHistory));
        } catch (e) {
            console.warn('Could not save session history:', e);
        }
    }

    /**
     * Load achieved ranks from localStorage
     */
    function loadAchievedRanks() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.achievedRanks);
            if (saved) {
                const ranksArray = JSON.parse(saved);
                state.achievedRanks = new Set(ranksArray);
            }
        } catch (e) {
            console.warn('Could not load achieved ranks:', e);
        }
    }

    /**
     * Save achieved ranks to localStorage
     */
    function saveAchievedRanks() {
        try {
            const ranksArray = Array.from(state.achievedRanks);
            localStorage.setItem(CONFIG.storageKeys.achievedRanks, JSON.stringify(ranksArray));
        } catch (e) {
            console.warn('Could not save achieved ranks:', e);
        }
    }

    /**
     * Load history log from localStorage
     */
    function loadHistoryLog() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKeys.historyLog);
            if (saved) {
                state.historyLog = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load history log:', e);
        }
    }

    /**
     * Save history log to localStorage
     */
    function saveHistoryLog() {
        try {
            localStorage.setItem(CONFIG.storageKeys.historyLog, JSON.stringify(state.historyLog));
        } catch (e) {
            console.warn('Could not save history log:', e);
        }
    }

    /**
     * Add entry to history log
     */
    function addHistoryEntry(avgTime) {
        const entry = {
            score: avgTime,
            timestamp: Date.now()
        };

        // Add to beginning (newest first)
        state.historyLog.unshift(entry);

        // Limit to last 50 entries
        if (state.historyLog.length > 50) {
            state.historyLog = state.historyLog.slice(0, 50);
        }

        saveHistoryLog();
        renderHistoryLog();
    }

    /**
     * Render history log UI
     */
    function renderHistoryLog() {
        // Clear existing items (except empty message)
        const existingItems = DOM.historyList.querySelectorAll('.history-item');
        existingItems.forEach(item => item.remove());

        if (state.historyLog.length === 0) {
            DOM.historyEmptyMessage.classList.remove('hidden');
            return;
        }

        DOM.historyEmptyMessage.classList.add('hidden');

        state.historyLog.forEach(entry => {
            const rank = getRank(entry.score);
            const timeStr = formatTime(entry.timestamp);

            const item = document.createElement('div');
            item.className = 'history-item';

            item.innerHTML = `
                <span class="history-score">${entry.score}ms</span>
                <span class="history-rank ${rank.class}">${rank.name}</span>
                <span class="history-time">${timeStr}</span>
            `;

            DOM.historyList.appendChild(item);
        });
    }

    /**
     * Format timestamp to time string
     */
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    /**
     * Restore chart data from loaded session history
     */
    function restoreChartData() {
        if (!state.chartInstance || state.sessionHistory.length === 0) return;

        const labels = state.sessionHistory.map((_, i) => `Session ${i + 1}`);
        state.chartInstance.data.labels = labels;
        state.chartInstance.data.datasets[0].data = state.sessionHistory;
        state.chartInstance.update();

        // Hide empty message and show description if we have data
        DOM.chartDescription.classList.remove('hidden');
        DOM.chartEmptyMessage.classList.add('hidden');
    }

    /**
     * Restore rank checklist UI from loaded achieved ranks
     */
    function restoreRankChecklist() {
        if (state.achievedRanks.size === 0) return;

        const items = DOM.rankChecklist.querySelectorAll('.rank-item');
        items.forEach(item => {
            const itemRank = item.dataset.rank;
            if (state.achievedRanks.has(itemRank)) {
                item.classList.add('achieved');
                item.querySelector('.rank-check').textContent = '✓';
            }
        });
    }

    // ==========================================
    // CHART (Session Trend Graph)
    // ==========================================

    /**
     * Initialize the Chart.js chart
     */
    function initChart() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return;
        }

        const ctx = DOM.sessionChart.getContext('2d');

        state.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Average Reaction Time (ms)',
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
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + 'ms';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        display: true,
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#71717a',
                            font: {
                                size: 10
                            },
                            callback: function(value) {
                                return value;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Update chart with session average
     */
    function updateChart(avgTime) {
        if (!state.chartInstance) return;

        // Add session average to history
        state.sessionHistory.push(avgTime);

        // Limit history to last 20 sessions for readability
        if (state.sessionHistory.length > 20) {
            state.sessionHistory = state.sessionHistory.slice(-20);
        }

        // Save to localStorage
        saveSessionHistory();

        // Update chart data
        const labels = state.sessionHistory.map((_, i) => `Session ${i + 1}`);
        state.chartInstance.data.labels = labels;
        state.chartInstance.data.datasets[0].data = state.sessionHistory;
        state.chartInstance.update();

        // Hide empty message and show description
        DOM.chartDescription.classList.remove('hidden');
        DOM.chartEmptyMessage.classList.add('hidden');

        // Update average score widget
        updateWidgetAvg();
    }

    // ==========================================
    // RANK CHECKLIST
    // ==========================================

    /**
     * Update rank checklist based on achieved session average
     * Unlocks the achieved rank and all ranks below it
     */
    function updateRankChecklist(avgTime) {
        const rank = getRank(avgTime);

        // Rank hierarchy from best to worst
        const rankHierarchy = ['elite', 'pro', 'advanced', 'intermediate', 'beginner'];
        const achievedIndex = rankHierarchy.indexOf(rank.class);

        // Add the achieved rank and all lower ranks
        for (let i = achievedIndex; i < rankHierarchy.length; i++) {
            state.achievedRanks.add(rankHierarchy[i]);
        }

        // Save to localStorage
        saveAchievedRanks();

        // Update all items in checklist
        const items = DOM.rankChecklist.querySelectorAll('.rank-item');
        items.forEach(item => {
            const itemRank = item.dataset.rank;
            if (state.achievedRanks.has(itemRank)) {
                item.classList.add('achieved');
                item.querySelector('.rank-check').textContent = '✓';
            }
        });
    }

    /**
     * Reset rank checklist for new session
     */
    function resetRankChecklist() {
        state.achievedRanks.clear();
        const items = DOM.rankChecklist.querySelectorAll('.rank-item');
        items.forEach(item => {
            item.classList.remove('achieved');
            item.querySelector('.rank-check').textContent = '✗';
        });
    }

    // ==========================================
    // SOUND (Web Audio API)
    // ==========================================

    /**
     * Initialize audio context (must be called after user interaction)
     */
    function initAudio() {
        if (!state.audioContext) {
            try {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
            }
        }
    }

    /**
     * Play a beep sound
     */
    function playBeep() {
        if (!state.settings.sound || !state.audioContext) return;

        try {
            const oscillator = state.audioContext.createOscillator();
            const gainNode = state.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(state.audioContext.destination);

            oscillator.type = CONFIG.sound.type;
            oscillator.frequency.value = CONFIG.sound.frequency;

            gainNode.gain.setValueAtTime(0.3, state.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, state.audioContext.currentTime + CONFIG.sound.duration);

            oscillator.start(state.audioContext.currentTime);
            oscillator.stop(state.audioContext.currentTime + CONFIG.sound.duration);
        } catch (e) {
            console.warn('Could not play sound:', e);
        }
    }

    // ==========================================
    // TEST LOGIC
    // ==========================================

    /**
     * Start a new test (or new round)
     */
    function startTest() {
        // Initialize audio on first user interaction
        initAudio();

        // If session is complete, reset first
        if (state.status === 'session-complete') {
            resetSession();
        }

        // Clear any existing timeout
        if (state.delayTimeoutId) {
            clearTimeout(state.delayTimeoutId);
            state.delayTimeoutId = null;
        }

        // Show default content, hide results
        DOM.testContentDefault.hidden = false;
        DOM.testContentResults.hidden = true;

        // Hide hint during test
        DOM.testHint.hidden = true;

        // Set waiting state
        state.status = 'waiting';
        state.inputLocked = false;
        updateTestAreaState('waiting');

        DOM.testStatus.textContent = 'Wait for it…';
        DOM.testResult.textContent = '';
        DOM.testInstruction.textContent = 'Hold steady…';

        // Random delay within selected range
        const [minDelay, maxDelay] = CONFIG.delayPresets[state.settings.delay];
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;

        state.delayTimeoutId = setTimeout(showGo, delay);
    }

    /**
     * Show the GO state
     */
    function showGo() {
        state.status = 'go';
        state.goTimestamp = performance.now();
        state.inputLocked = false;

        updateTestAreaState('go');

        DOM.testStatus.textContent = getInputGoText();
        DOM.testResult.textContent = '';
        DOM.testInstruction.textContent = '';

        // Play beep if enabled
        playBeep();
    }

    /**
     * Handle user response
     */
    function handleResponse() {
        if (state.inputLocked) return;

        if (state.status === 'waiting') {
            // False start!
            handleFalseStart();
        } else if (state.status === 'go') {
            // Valid response - record time
            const reactionTime = Math.round(performance.now() - state.goTimestamp);
            recordAttempt(reactionTime);
        } else if (state.status === 'idle' || state.status === 'result' || state.status === 'false-start') {
            // Start new round
            startTest();
        } else if (state.status === 'session-complete') {
            // Start new session
            resetSession();
            startTest();
        }
    }

    /**
     * Handle false start
     */
    function handleFalseStart() {
        // Clear the pending GO timeout
        if (state.delayTimeoutId) {
            clearTimeout(state.delayTimeoutId);
            state.delayTimeoutId = null;
        }

        state.status = 'false-start';
        state.inputLocked = true;

        updateTestAreaState('false-start');

        DOM.testStatus.textContent = 'Not yet!';
        DOM.testResult.textContent = '';
        DOM.testInstruction.textContent = `Jumped the gun — wait for the flash. ${getInputActionText()} to try again.`;

        // Unlock after a brief delay to prevent accidental double-click
        setTimeout(() => {
            state.inputLocked = false;
        }, 500);
    }

    /**
     * Record an attempt
     */
    function recordAttempt(time) {
        state.inputLocked = true;
        state.currentRound++;
        state.attempts.push(time);

        // Show result state
        state.status = 'result';
        updateTestAreaState('result');

        DOM.testStatus.textContent = 'Your time:';
        DOM.testResult.textContent = `${time}ms`;

        // Update progress bar
        updateProgressBar();

        if (state.currentRound < state.totalRounds) {
            // More rounds to go
            DOM.testInstruction.textContent = `${getInputActionText()} for next round`;

            setTimeout(() => {
                state.inputLocked = false;
            }, 300);
        } else {
            // Session complete
            completeSession();
        }
    }

    /**
     * Get motivational message based on rank
     */
    function getMotivationalMessage(rank) {
        const messages = {
            elite: "Incredible reflexes! You're in the top tier.",
            pro: "Excellent! You have competitive-level reactions.",
            advanced: "Nice work! Your reflexes are above average.",
            intermediate: "Good effort! Keep practicing to improve.",
            beginner: "Keep at it! Practice makes perfect."
        };
        return messages[rank.class] || "Great job completing the test!";
    }

    /**
     * Complete the session and show final results
     */
    function completeSession() {
        state.status = 'session-complete';
        updateTestAreaState('session-complete');

        // Calculate stats
        const avgTime = Math.round(state.attempts.reduce((a, b) => a + b, 0) / state.attempts.length);
        const rank = getRank(avgTime); // Rank based on average

        // Add rank class to test area for colored border
        DOM.testArea.classList.add(`rank-${rank.class}`);

        // Check for personal best (based on average score)
        savePersonalBest(avgTime);

        // Update rank checklist (based on average score)
        updateRankChecklist(avgTime);

        // Add to history log
        addHistoryEntry(avgTime);

        // Update average time display
        DOM.avgTime.textContent = avgTime;

        // Update rank badge
        DOM.rankLabel.textContent = rank.name;
        DOM.rankLabel.className = `rank-badge ${rank.class}`;

        // Update motivational message
        DOM.resultMessage.textContent = getMotivationalMessage(rank);

        // Populate attempts row
        DOM.attemptsList.innerHTML = '';
        state.attempts.forEach((time, index) => {
            const column = document.createElement('div');
            column.className = 'attempt-column';

            const timeSpan = document.createElement('span');
            timeSpan.className = 'attempt-time';
            timeSpan.textContent = time;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'attempt-label';
            labelSpan.textContent = `Test ${index + 1}`;

            column.appendChild(timeSpan);
            column.appendChild(labelSpan);
            DOM.attemptsList.appendChild(column);
        });

        // Show results content, hide default content
        DOM.testContentDefault.hidden = true;
        DOM.testContentResults.hidden = false;

        // Update chart with session average
        updateChart(avgTime);

        setTimeout(() => {
            state.inputLocked = false;
        }, 500);
    }

    /**
     * Get rank based on reaction time
     */
    function getRank(time) {
        for (const rank of CONFIG.ranks) {
            if (time <= rank.maxMs) {
                return rank;
            }
        }
        return CONFIG.ranks[CONFIG.ranks.length - 1];
    }

    /**
     * Reset the current session
     */
    function resetSession() {
        // Clear any pending timeout
        if (state.delayTimeoutId) {
            clearTimeout(state.delayTimeoutId);
            state.delayTimeoutId = null;
        }

        // Reset state
        state.status = 'idle';
        state.currentRound = 0;
        state.attempts = [];
        state.goTimestamp = null;
        state.inputLocked = false;

        // Show default content, hide results
        DOM.testContentDefault.hidden = false;
        DOM.testContentResults.hidden = true;

        // Show hint again
        DOM.testHint.hidden = false;

        // Note: We don't reset rank checklist here - achieved ranks persist until user clears data

        // Reset UI
        updateTestAreaState('idle');
        DOM.testStatus.textContent = `${getInputActionText()} to start`;
        DOM.testResult.textContent = '';
        DOM.testInstruction.textContent = '';

        updateUI();
    }

    // ==========================================
    // INPUT HANDLING
    // ==========================================

    /**
     * Get input-specific action text (e.g., "Click" or "Press Space")
     */
    function getInputActionText() {
        return state.settings.inputMethod === 'mouse' ? 'Click' : 'Press Space';
    }

    /**
     * Get input-specific GO text (e.g., "CLICK!" or "NOW!")
     */
    function getInputGoText() {
        return state.settings.inputMethod === 'mouse' ? 'CLICK!' : 'NOW!';
    }

    /**
     * Get input-specific action verb (e.g., "click" or "react")
     */
    function getInputActionVerb() {
        return state.settings.inputMethod === 'mouse' ? 'click' : 'react';
    }

    /**
     * Update hint and instructions text based on input method
     */
    function updateInputMethodText() {
        const actionVerb = getInputActionVerb();
        DOM.testHint.innerHTML = `Wait for the <span class="hint-box hint-box-red"></span> red hold, then ${actionVerb} the instant it flashes <span class="hint-box hint-box-green"></span> <strong>${getInputGoText()}</strong>.`;

        // Update status text if in idle state
        if (state.status === 'idle') {
            DOM.testStatus.textContent = `${getInputActionText()} to start`;
        }
    }

    /**
     * Handle test area click/tap
     */
    function handleTestAreaInput() {
        // Only allow mouse input if mouse method is selected
        if (state.settings.inputMethod !== 'mouse') return;
        handleResponse();
    }

    /**
     * Handle keyboard input
     */
    function handleKeyDown(e) {
        const isSpaceKey = e.key === ' ';

        // Prevent default for space to avoid page scroll
        if (isSpaceKey && document.activeElement === DOM.testArea) {
            e.preventDefault();
        }

        // Only allow spacebar input if spacebar method is selected
        if (state.settings.inputMethod !== 'spacebar') return;

        // Don't hijack keys meant to activate a focused control (buttons, links).
        const active = document.activeElement;
        const onControl =
            active &&
            active !== DOM.testArea &&
            ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        if (onControl) return;

        if (isSpaceKey) {
            e.preventDefault();
            handleResponse();
        }
    }

    // ==========================================
    // UI UPDATES
    // ==========================================

    /**
     * Update test area visual state
     */
    function updateTestAreaState(newState) {
        const states = ['idle', 'waiting', 'go', 'result', 'false-start', 'session-complete'];
        states.forEach(s => {
            DOM.testArea.classList.remove(`state-${s}`);
        });
        DOM.testArea.classList.add(`state-${newState}`);

        // Remove rank classes when not in session-complete state
        if (newState !== 'session-complete') {
            const rankClasses = ['rank-elite', 'rank-pro', 'rank-advanced', 'rank-intermediate', 'rank-beginner'];
            rankClasses.forEach(rc => DOM.testArea.classList.remove(rc));
        }
    }

    /**
     * Update general UI elements
     */
    function updateUI() {
        // Update progress bar
        updateProgressBar();
    }

    /**
     * Update progress bar width based on current round
     */
    function updateProgressBar() {
        const progress = state.totalRounds > 0
            ? (state.currentRound / state.totalRounds) * 100
            : 0;
        DOM.progressBar.style.width = `${progress}%`;
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
