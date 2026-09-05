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
    isDrawerOpen: false,
    tvSeriesDetails: null,
    cachedSeasonEpisodes: {},

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

        // Setup Quick Episodes Drawer buttons
        const episodesBtn = document.getElementById('playerEpisodesBtn');
        if (episodesBtn) {
            episodesBtn.addEventListener('click', () => this.toggleEpisodesDrawer());
        }

        const episodesCloseBtn = document.getElementById('playerEpisodesCloseBtn');
        if (episodesCloseBtn) {
            episodesCloseBtn.addEventListener('click', () => this.closeEpisodesDrawer());
        }

        const episodesBackdrop = document.getElementById('playerEpisodesBackdrop');
        if (episodesBackdrop) {
            episodesBackdrop.addEventListener('click', () => this.closeEpisodesDrawer());
        }

        const seasonSelect = document.getElementById('playerSeasonSelect');
        if (seasonSelect) {
            seasonSelect.addEventListener('change', (e) => {
                this.loadDrawerSeason(parseInt(e.target.value));
            });
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

        // Hide next episode and episodes list button for movies
        const nextBtn = document.getElementById('playerNextEpBtn');
        if (nextBtn) nextBtn.style.display = 'none';

        const episodesBtn = document.getElementById('playerEpisodesBtn');
        if (episodesBtn) episodesBtn.style.display = 'none';

        this.closeEpisodesDrawer();
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

        // Show next episode and quick episodes list buttons
        const nextBtn = document.getElementById('playerNextEpBtn');
        if (nextBtn) nextBtn.style.display = 'inline-flex';

        const episodesBtn = document.getElementById('playerEpisodesBtn');
        if (episodesBtn) episodesBtn.style.display = 'inline-flex';

        // Preload / cache TV details for drawer seasons
        this.ensureTvDetails(item);

        // Update active badge in drawer if open
        if (this.isDrawerOpen) {
            this.highlightActiveDrawerEpisode();
        }
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

        this.closeEpisodesDrawer();

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
     * Quick Episodes Drawer Methods
     */
    toggleEpisodesDrawer() {
        if (this.isDrawerOpen) {
            this.closeEpisodesDrawer();
        } else {
            this.openEpisodesDrawer();
        }
    },

    async openEpisodesDrawer() {
        if (!this.currentItem || this.currentItem.media_type !== 'tv') return;

        const drawer = document.getElementById('playerEpisodesDrawer');
        if (!drawer) return;

        this.isDrawerOpen = true;
        drawer.classList.add('active');
        if (this.container) this.container.classList.add('drawer-open');

        // Ensure TV details (with seasons list) are loaded
        const tvData = await this.ensureTvDetails(this.currentItem);
        this.setupDrawerSeasons(tvData);

        // Load the currently playing season
        const activeSeason = this.currentSeason || 1;
        await this.loadDrawerSeason(activeSeason);
    },

    closeEpisodesDrawer() {
        const drawer = document.getElementById('playerEpisodesDrawer');
        if (drawer) {
            drawer.classList.remove('active');
        }
        if (this.container) {
            this.container.classList.remove('drawer-open');
        }
        this.isDrawerOpen = false;
    },

    async ensureTvDetails(item) {
        if (this.tvSeriesDetails && this.tvSeriesDetails.id === item.id && this.tvSeriesDetails.seasons) {
            return this.tvSeriesDetails;
        }

        if (item.seasons && item.seasons.length > 0) {
            this.tvSeriesDetails = item;
            return item;
        }

        try {
            const fullDetails = await window.API.getDetails('tv', item.id);
            if (fullDetails) {
                this.tvSeriesDetails = { ...item, ...fullDetails };
                return this.tvSeriesDetails;
            }
        } catch (err) {
            console.warn('[Player] Impossibile recuperare dettagli serie per drawer:', err);
        }

        this.tvSeriesDetails = item;
        return item;
    },

    setupDrawerSeasons(tvData) {
        const seasonSelect = document.getElementById('playerSeasonSelect');
        if (!seasonSelect) return;

        seasonSelect.innerHTML = '';
        const seasons = (tvData && tvData.seasons) ? tvData.seasons.filter(s => s.season_number > 0) : [];

        if (seasons.length === 0) {
            const opt = document.createElement('option');
            opt.value = this.currentSeason || 1;
            opt.textContent = `Stagione ${this.currentSeason || 1}`;
            seasonSelect.appendChild(opt);
            return;
        }

        seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.season_number;
            opt.textContent = `${s.name || 'Stagione ' + s.season_number} (${s.episode_count} ep.)`;
            if (s.season_number === this.currentSeason) {
                opt.selected = true;
            }
            seasonSelect.appendChild(opt);
        });

        seasonSelect.value = this.currentSeason || 1;
    },

    async loadDrawerSeason(seasonNumber) {
        const listEl = document.getElementById('playerEpisodesList');
        if (!listEl) return;

        listEl.innerHTML = '<div class="loading-spinner" style="padding:40px; text-align:center; color:#aaa;">Caricamento episodi...</div>';

        const tvId = this.currentItem.id;
        const cacheKey = `${tvId}_s${seasonNumber}`;

        let seasonData = this.cachedSeasonEpisodes[cacheKey];
        if (!seasonData) {
            try {
                seasonData = await window.API.getSeasonDetails(tvId, seasonNumber);
                if (seasonData) {
                    this.cachedSeasonEpisodes[cacheKey] = seasonData;
                }
            } catch (err) {
                console.warn('[Player] Errore caricamento stagione drawer:', err);
            }
        }

        listEl.innerHTML = '';

        if (!seasonData || !seasonData.episodes || seasonData.episodes.length === 0) {
            listEl.innerHTML = '<p style="color:#aaa; text-align:center; padding:40px 10px;">Nessun episodio trovato per questa stagione.</p>';
            return;
        }

        const episodes = seasonData.episodes;
        const totalEpCount = episodes.length;

        episodes.forEach(ep => {
            const isPlaying = (this.currentSeason === seasonNumber && this.currentEpisode === ep.episode_number);
            const card = document.createElement('div');
            card.className = `player-ep-card focusable ${isPlaying ? 'is-active' : ''}`;
            card.tabIndex = 0;
            card.dataset.season = seasonNumber;
            card.dataset.episode = ep.episode_number;

            const stillUrl = window.API.getImageUrl(
                ep.still_path || (this.tvSeriesDetails && this.tvSeriesDetails.backdrop_path),
                'w300'
            );

            card.innerHTML = `
                <div class="player-ep-thumb-wrapper">
                    <img src="${stillUrl}" alt="${ep.name}" class="player-ep-thumb" loading="lazy" />
                    <span class="player-ep-num-badge">EP ${ep.episode_number}</span>
                    <div class="player-ep-play-overlay">
                        <div class="player-ep-play-icon">&#9658;</div>
                    </div>
                </div>
                <div class="player-ep-info">
                    ${isPlaying ? '<span class="player-ep-active-label"><span>&#9654;</span> In riproduzione</span>' : ''}
                    <h4 class="player-ep-title">${ep.name || 'Episodio ' + ep.episode_number}</h4>
                    <div class="player-ep-meta">
                        <span>Ep. ${ep.episode_number}</span>
                        ${ep.runtime ? `<span>• ${ep.runtime}m</span>` : ''}
                    </div>
                    ${ep.overview ? `<p class="player-ep-desc">${ep.overview}</p>` : ''}
                </div>
            `;

            card.addEventListener('click', () => {
                const epRuntime = ep.runtime || (this.tvSeriesDetails && this.tvSeriesDetails.episode_run_time ? this.tvSeriesDetails.episode_run_time[0] : 45);
                this.closeEpisodesDrawer();
                this.playEpisode(
                    { ...(this.tvSeriesDetails || this.currentItem), runtime: epRuntime },
                    seasonNumber,
                    ep.episode_number,
                    totalEpCount,
                    null,
                    ep.name
                );
            });

            listEl.appendChild(card);
        });

        // Scroll active episode into view
        const activeCard = listEl.querySelector('.player-ep-card.is-active');
        if (activeCard) {
            setTimeout(() => {
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                if (document.body.classList.contains('tv-mode')) {
                    activeCard.focus();
                }
            }, 100);
        }
    },

    highlightActiveDrawerEpisode() {
        const listEl = document.getElementById('playerEpisodesList');
        if (!listEl) return;

        listEl.querySelectorAll('.player-ep-card').forEach(card => {
            const s = parseInt(card.dataset.season);
            const e = parseInt(card.dataset.episode);
            const isPlaying = (s === this.currentSeason && e === this.currentEpisode);
            if (isPlaying) {
                card.classList.add('is-active');
                if (!card.querySelector('.player-ep-active-label')) {
                    const info = card.querySelector('.player-ep-info');
                    if (info) {
                        const label = document.createElement('span');
                        label.className = 'player-ep-active-label';
                        label.innerHTML = '<span>&#9654;</span> In riproduzione';
                        info.insertBefore(label, info.firstChild);
                    }
                }
            } else {
                card.classList.remove('is-active');
                const label = card.querySelector('.player-ep-active-label');
                if (label) label.remove();
            }
        });
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
