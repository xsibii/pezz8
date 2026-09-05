/**
 * Player Manager for vixsrc.to Embed
 * Supports: Movies, Series (Season/Episode), Customization Params, PostMessage Events & Auto-Next
 */
const Player = {
    container: null,
    iframe: null,
    currentItem: null,
    currentSeason: 1,
    currentEpisode: 1,
    currentEpisodeName: null,
    totalEpisodes: 1,
    autoNextTimer: null,
    playbackCurrentTime: 0,
    hasReceivedPostMessage: false,
    lastProgressSaveTime: 0,

    init() {
        this.container = document.getElementById('playerModal');
        this.iframe = document.getElementById('playerIframe');

        // Setup Close & Control buttons
        const closeBtn = document.getElementById('playerCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        const nextBtn = document.getElementById('playerNextEpBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.playNextEpisode());
        }

        const fsBtn = document.getElementById('playerFsBtn');
        if (fsBtn) {
            fsBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Listen to vixsrc.to postMessage events
        window.addEventListener('message', (e) => this.handlePlayerMessage(e));
    },

    /**
     * Open player for a Movie
     */
    playMovie(item, startAt = null) {
        if (!item) return;
        this.currentItem = { ...item, media_type: 'movie' };
        this.currentSeason = null;
        this.currentEpisode = null;
        this.currentEpisodeName = null;
        this.hasReceivedPostMessage = false;

        const settings = window.Storage.getSettings();
        const primaryColor = settings.primaryColor || 'E50914';
        const secondaryColor = settings.secondaryColor || '141414';
        const lang = settings.lang || 'it';
        const autoplay = settings.autoplay !== false;

        // Check saved progress for resume
        const saved = window.Storage.getHistoryEntry(item.id);
        if (!startAt && saved && saved.currentTime > 10 && (saved.progress || 0) < 95) {
            startAt = saved.currentTime;
        }

        this.playbackCurrentTime = startAt ? Math.floor(startAt) : 0;

        let url = `https://vixsrc.to/movie/${item.id}?primaryColor=${primaryColor}&secondaryColor=${secondaryColor}&lang=${lang}&autoplay=${autoplay}`;
        if (startAt && startAt > 10) {
            url += `&startAt=${Math.floor(startAt)}`;
        }

        // Asynchronously ensure TMDB runtime is fetched if not present
        if (!this.currentItem.runtime) {
            window.API.getDetails('movie', item.id).then(details => {
                if (details && details.runtime) {
                    this.currentItem.runtime = details.runtime;
                    window.Storage.updateProgress(
                        this.currentItem,
                        this.playbackCurrentTime,
                        details.runtime * 60,
                        null,
                        null
                    );
                }
            }).catch(() => {});
        }

        // Record start in history immediately (guarantees "Continua a guardare" card is created)
        window.Storage.recordStart(this.currentItem);

        this.show(url, item.title || item.name);
        this.updatePlayerHeader(item.title || item.name, null);

        // Hide next episode button for movies
        const nextBtn = document.getElementById('playerNextEpBtn');
        if (nextBtn) nextBtn.style.display = 'none';
    },

    /**
     * Open player for a TV Episode
     */
    playEpisode(item, season = 1, episode = 1, totalEpisodesInSeason = 1, startAt = null, episodeName = null) {
        if (!item) return;
        this.currentItem = { ...item, media_type: 'tv' };
        this.currentSeason = parseInt(season) || 1;
        this.currentEpisode = parseInt(episode) || 1;
        this.currentEpisodeName = episodeName || null;
        this.totalEpisodes = parseInt(totalEpisodesInSeason) || 1;
        this.hasReceivedPostMessage = false;

        const settings = window.Storage.getSettings();
        const primaryColor = settings.primaryColor || 'E50914';
        const secondaryColor = settings.secondaryColor || '141414';
        const lang = settings.lang || 'it';
        const autoplay = settings.autoplay !== false;

        // Check saved progress for resume (only if same season/episode)
        const saved = window.Storage.getHistoryEntry(item.id);
        if (!startAt && saved && saved.season === this.currentSeason && saved.episode === this.currentEpisode
            && saved.currentTime > 10 && (saved.progress || 0) < 95) {
            startAt = saved.currentTime;
        }

        this.playbackCurrentTime = startAt ? Math.floor(startAt) : 0;

        let url = `https://vixsrc.to/tv/${item.id}/${this.currentSeason}/${this.currentEpisode}?primaryColor=${primaryColor}&secondaryColor=${secondaryColor}&lang=${lang}&autoplay=${autoplay}`;
        if (startAt && startAt > 10) {
            url += `&startAt=${Math.floor(startAt)}`;
        }

        // Asynchronously ensure TMDB runtime is fetched if not present
        if (!this.currentItem.runtime) {
            window.API.getDetails('tv', item.id).then(details => {
                if (details) {
                    const rt = details.runtime || (details.episode_run_time && details.episode_run_time[0]) || 45;
                    this.currentItem.runtime = rt;
                    window.Storage.updateProgress(
                        this.currentItem,
                        this.playbackCurrentTime,
                        rt * 60,
                        this.currentSeason,
                        this.currentEpisode,
                        this.currentEpisodeName
                    );
                }
            }).catch(() => {});
        }

        // Record start in history immediately
        window.Storage.recordStart(this.currentItem, this.currentSeason, this.currentEpisode, this.currentEpisodeName);

        const title = item.name || item.title;
        const subTitle = `Stagione ${this.currentSeason} • Episodio ${this.currentEpisode}${this.currentEpisodeName ? ' - ' + this.currentEpisodeName : ''}`;

        this.show(url, `${title} - S${this.currentSeason}E${this.currentEpisode}`);
        this.updatePlayerHeader(title, subTitle);

        // Show next episode button if TV
        const nextBtn = document.getElementById('playerNextEpBtn');
        if (nextBtn) nextBtn.style.display = 'inline-flex';
    },

    show(embedUrl, pageTitle = '') {
        if (!this.container) this.init();

        // Clear any previous auto-next timer
        if (this.autoNextTimer) {
            clearTimeout(this.autoNextTimer);
            this.autoNextTimer = null;
        }
        this.hideAutoNextOverlay();

        // Reset postMessage reception flag
        this.hasReceivedPostMessage = false;

        // Set iframe source
        this.iframe.src = embedUrl;
        this.container.classList.add('active');
        document.body.classList.add('no-scroll');

        // Focus the player modal for TV Remote navigation
        this.container.focus();

        console.log(`[Player] Loaded embed URL: ${embedUrl}`);
    },

    close() {
        if (!this.container) return;
        this.container.classList.remove('active');
        document.body.classList.remove('no-scroll');

        // Save final watched state if we have a current item and position
        if (this.currentItem && this.playbackCurrentTime > 0) {
            const rtMin = this.currentItem.runtime || (this.currentItem.media_type === 'tv' ? 45 : 110);
            const totalDur = rtMin * 60;
            window.Storage.updateProgress(
                this.currentItem,
                this.playbackCurrentTime,
                totalDur,
                this.currentSeason,
                this.currentEpisode,
                this.currentEpisodeName
            );
        }

        // Stop playback by clearing iframe src
        if (this.iframe) {
            this.iframe.src = 'about:blank';
        }

        if (this.autoNextTimer) {
            clearTimeout(this.autoNextTimer);
            this.autoNextTimer = null;
        }
        this.hideAutoNextOverlay();

        // Refresh continue watching row if on home page
        if (window.App && typeof window.App.refreshContinueWatching === 'function') {
            window.App.refreshContinueWatching();
        }
    },

    updatePlayerHeader(title, subTitle) {
        const titleEl = document.getElementById('playerTitle');
        const subtitleEl = document.getElementById('playerSubtitle');
        if (titleEl) titleEl.textContent = title || '';
        if (subtitleEl) {
            if (subTitle) {
                subtitleEl.textContent = subTitle;
                subtitleEl.style.display = 'block';
            } else {
                subtitleEl.style.display = 'none';
            }
        }
    },

    /**
     * Play next episode
     */
    playNextEpisode() {
        if (!this.currentItem || this.currentItem.media_type !== 'tv') return;
        this.playEpisode(this.currentItem, this.currentSeason, this.currentEpisode + 1);
    },

    /**
     * Handle vixsrc.to postMessage player events
     * Format:
     * {
     *   type: "PLAYER_EVENT",
     *   data: {
     *     event: "play" | "pause" | "seeked" | "ended" | "timeupdate",
     *     currentTime: number,
     *     duration: number,
     *     video_id: number
     *   }
     * }
     */
    /**
     * Enhanced universal postMessage listener for vixsrc.to and embedded video players.
     * Handles:
     * - JSON stringified messages as well as parsed objects
     * - Standard vixsrc format: { type: "PLAYER_EVENT", data: { event, currentTime, duration, video_id } }
     * - Flat format: { event, currentTime, duration }
     * - JWPlayer format: { event: "time", position, duration }
     * - Plyr format: { event, detail: { plyr: { currentTime, duration } } }
     * - Immediate save on 'pause' and 'seeked' (ensuring resume works even after skipping)
     * - Throttled save on 'timeupdate'
     * - Completion detection on 'ended'
     */
    handlePlayerMessage(e) {
        try {
            let msg = e.data;
            if (!msg) return;

            // 1. If payload is a JSON string, parse safely
            if (typeof msg === 'string') {
                try {
                    msg = JSON.parse(msg);
                } catch (_) {
                    return; // Ignore non-JSON strings (internal browser / extensions)
                }
            }

            if (typeof msg !== 'object' || msg === null) return;

            // 2. Extract event name and data payload from multiple player specifications
            let eventName = null;
            let currentTime = undefined;
            let duration = undefined;

            // Format A: vixsrc.to standard: { type: "PLAYER_EVENT", data: { event: "timeupdate", currentTime, duration } }
            if (msg.type === 'PLAYER_EVENT' && msg.data) {
                eventName = msg.data.event;
                currentTime = msg.data.currentTime;
                duration = msg.data.duration;
            }
            // Format B: flat event: { event: "timeupdate" | "pause" | "seeked", currentTime, duration }
            else if (msg.event) {
                eventName = msg.event;
                currentTime = msg.currentTime !== undefined ? msg.currentTime : (msg.position !== undefined ? msg.position : msg.seconds);
                duration = msg.duration;
            }
            // Format C: Plyr / Custom: { type: "timeupdate", detail: ... }
            else if (msg.type && (msg.currentTime !== undefined || msg.data)) {
                eventName = msg.type;
                const d = msg.data || msg.detail || msg;
                currentTime = d.currentTime !== undefined ? d.currentTime : d.seconds;
                duration = d.duration;
            }

            if (!eventName) return;

            // Normalize event name (e.g. "jwplayer:time" -> "timeupdate")
            const normalized = String(eventName).toLowerCase().replace(/^jwplayer:/, '');

            this.hasReceivedPostMessage = true;

            // Fallback duration to TMDB runtime if vixsrc didn't supply duration
            if ((!duration || duration <= 0) && this.currentItem) {
                const rtMin = this.currentItem.runtime || (this.currentItem.media_type === 'tv' ? 45 : 110);
                duration = rtMin * 60;
            }

            // Update current second if valid number
            if (currentTime !== undefined && !isNaN(currentTime) && currentTime >= 0) {
                this.playbackCurrentTime = Math.floor(currentTime);
            }

            console.log(`[Player postMessage] [${normalized}] @ ${this.playbackCurrentTime}s / ${duration ? Math.floor(duration) : 0}s`);

            // Event: Video Ended
            if (normalized === 'ended') {
                console.log('[Player postMessage] Video ended');
                if (this.currentItem) {
                    if (this.currentItem.media_type === 'tv') {
                        window.Storage.updateProgress(
                            this.currentItem,
                            duration || this.playbackCurrentTime,
                            duration || this.playbackCurrentTime,
                            this.currentSeason,
                            this.currentEpisode,
                            this.currentEpisodeName
                        );
                        this.triggerAutoNext();
                    } else {
                        window.Storage.markFinished(this.currentItem.id);
                        if (window.App && typeof window.App.refreshContinueWatching === 'function') {
                            window.App.refreshContinueWatching();
                        }
                    }
                }
                return;
            }

            // Event: Pause or Seeked -> Save immediately (stops timer during pause and updates after skipping forward/back)
            if (normalized === 'pause' || normalized === 'seeked' || normalized === 'seeking') {
                console.log(`[Player postMessage] Saved progress on ${normalized}: ${this.playbackCurrentTime}s`);
                if (this.currentItem && this.playbackCurrentTime !== undefined) {
                    window.Storage.updateProgress(
                        this.currentItem,
                        this.playbackCurrentTime,
                        duration || 0,
                        this.currentSeason,
                        this.currentEpisode,
                        this.currentEpisodeName
                    );
                }
                return;
            }

            // Event: Time Update / Playback progress -> Throttled save every 2 seconds
            if (normalized === 'timeupdate' || normalized === 'time' || normalized === 'play') {
                const now = Date.now();
                if (!this.lastProgressSaveTime || (now - this.lastProgressSaveTime) >= 2000) {
                    this.lastProgressSaveTime = now;
                    if (this.currentItem && this.playbackCurrentTime !== undefined) {
                        window.Storage.updateProgress(
                            this.currentItem,
                            this.playbackCurrentTime,
                            duration || 0,
                            this.currentSeason,
                            this.currentEpisode,
                            this.currentEpisodeName
                        );
                    }
                }
            }
        } catch (err) {
            console.warn('[Player postMessage] Error processing message:', err);
        }
    },

    triggerAutoNext() {
        this.showAutoNextOverlay(5, () => {
            this.playNextEpisode();
        });
    },

    showAutoNextOverlay(seconds, callback) {
        let remaining = seconds;
        const overlay = document.getElementById('playerAutoNextOverlay');
        const countdownEl = document.getElementById('autoNextCountdown');
        const nextTitleEl = document.getElementById('autoNextTitle');

        if (!overlay || !countdownEl) {
            callback();
            return;
        }

        if (nextTitleEl) {
            nextTitleEl.textContent = `Episodio ${this.currentEpisode + 1}`;
        }

        countdownEl.textContent = remaining;
        overlay.classList.add('active');

        this.autoNextTimer = setInterval(() => {
            remaining--;
            countdownEl.textContent = remaining;
            if (remaining <= 0) {
                clearInterval(this.autoNextTimer);
                this.autoNextTimer = null;
                this.hideAutoNextOverlay();
                callback();
            }
        }, 1000);

        // Cancel button
        const cancelBtn = document.getElementById('autoNextCancelBtn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                clearInterval(this.autoNextTimer);
                this.autoNextTimer = null;
                this.hideAutoNextOverlay();
            };
        }

        // Play Now button
        const playNowBtn = document.getElementById('autoNextPlayBtn');
        if (playNowBtn) {
            playNowBtn.onclick = () => {
                clearInterval(this.autoNextTimer);
                this.autoNextTimer = null;
                this.hideAutoNextOverlay();
                callback();
            };
        }
    },

    hideAutoNextOverlay() {
        const overlay = document.getElementById('playerAutoNextOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    toggleFullscreen() {
        const elem = this.container;
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        }
    }
};

window.Player = Player;
