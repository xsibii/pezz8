/**
 * Storage Manager for Netflix-style Streaming App
 * Handles: My List (Favorites), Continue Watching, and Settings
 */
const Storage = {
    KEYS: {
        MY_LIST: 'streamflix_my_list',
        HISTORY: 'streamflix_watch_history',
        SETTINGS: 'streamflix_settings'
    },

    DEFAULT_SETTINGS: {
        primaryColor: 'E50914', // Netflix Red
        secondaryColor: '141414', // Netflix Dark Grey
        lang: 'it',
        autoplay: true,
        tvMode: false
    },

    // --- Settings ---
    getSettings() {
        try {
            const raw = localStorage.getItem(this.KEYS.SETTINGS);
            return raw ? { ...this.DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...this.DEFAULT_SETTINGS };
        } catch (e) {
            console.error('Error reading settings', e);
            return { ...this.DEFAULT_SETTINGS };
        }
    },

    saveSettings(settings) {
        try {
            localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
        } catch (e) {
            console.error('Error saving settings', e);
        }
    },

    // --- My List (Favorites) ---
    getMyList() {
        try {
            const raw = localStorage.getItem(this.KEYS.MY_LIST);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Error reading My List', e);
            return [];
        }
    },

    isInMyList(id) {
        const list = this.getMyList();
        return list.some(item => String(item.id) === String(id));
    },

    toggleMyList(item) {
        let list = this.getMyList();
        const index = list.findIndex(i => String(i.id) === String(item.id));
        if (index >= 0) {
            list.splice(index, 1);
            localStorage.setItem(this.KEYS.MY_LIST, JSON.stringify(list));
            return false; // Removed
        } else {
            const entry = {
                id: item.id,
                title: item.title || item.name,
                name: item.name || item.title,
                media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                vote_average: item.vote_average,
                overview: item.overview,
                release_date: item.release_date || item.first_air_date
            };
            list.unshift(entry);
            localStorage.setItem(this.KEYS.MY_LIST, JSON.stringify(list));
            return true; // Added
        }
    },

    // --- Continue Watching (History) ---
    getHistory() {
        try {
            const raw = localStorage.getItem(this.KEYS.HISTORY);
            const list = raw ? JSON.parse(raw) : [];
            // Sanitize existing corrupted entries where a movie was tagged as 'tv' without season
            return list.map(entry => {
                if (entry && entry.media_type === 'tv' && (!entry.season || entry.season === null) && !entry.first_air_date && (entry.title || !entry.name)) {
                    entry.media_type = 'movie';
                    delete entry.season;
                    delete entry.episode;
                }
                return entry;
            });
        } catch (e) {
            console.error('Error reading history', e);
            return [];
        }
    },

    /**
     * Get the active (non-finished) continue-watching list.
     * Movies with progress >= 95% are hidden.
     * TV shows are always shown (so user can pick next episode).
     */
    getContinueWatching() {
        return this.getHistory().filter(h => {
            if (h.media_type === 'tv' || (typeof h.season === 'number' && h.season > 0)) return true;
            // For movies, hide if finished (>= 95%)
            return (h.progress || 0) < 95;
        });
    },

    /**
     * Return the stored history entry for a given item id, or null.
     */
    getHistoryEntry(id) {
        const history = this.getHistory();
        return history.find(h => String(h.id) === String(id)) || null;
    },

    /**
     * Save or update watch progress for a movie or series episode.
     * Called by the player on every timeupdate/pause/play event and also
     * proactively when the user opens the player.
     */
    updateProgress(item, currentTime, duration, season = null, episode = null, episodeName = null) {
        if (!item || !item.id) return;
        // Don't save if currentTime is zero and we already have real progress
        if (currentTime <= 0 && duration <= 0) {
            const existing = this.getHistoryEntry(item.id);
            if (existing && existing.currentTime > 0) return; // don't overwrite with zeros
        }

        let history = this.getHistory();
        const idStr = String(item.id);

        // Find existing index
        const index = history.findIndex(h => String(h.id) === idStr);
        const existing = index >= 0 ? history[index] : {};

        // TMDB runtime fallback: item runtime, existing runtime, or smart default
        const hasValidSeason = (typeof season === 'number' && season > 0);
        const isTV = (item.media_type === 'tv') || hasValidSeason || (existing.media_type === 'tv' && typeof existing.season === 'number' && existing.season > 0);
        const defaultRuntimeMin = isTV ? 45 : 110;
        const runtimeMinutes = item.runtime || existing.runtime || defaultRuntimeMin;

        // Effective duration in seconds
        const effectiveDuration = duration > 0 ? duration : (runtimeMinutes * 60);
        const progress = effectiveDuration > 0 ? Math.min(100, Math.round((currentTime / effectiveDuration) * 100)) : 0;

        let resolvedType = 'movie';
        if (item.media_type === 'tv' || hasValidSeason) {
            resolvedType = 'tv';
        } else if (item.media_type === 'movie') {
            resolvedType = 'movie';
        } else if (existing.media_type === 'movie') {
            resolvedType = 'movie';
        } else if (existing.media_type === 'tv' && typeof existing.season === 'number' && existing.season > 0) {
            resolvedType = 'tv';
        } else if (item.first_air_date || (item.name && !item.title)) {
            resolvedType = 'tv';
        } else {
            resolvedType = 'movie';
        }

        const entry = {
            ...existing,
            id: item.id,
            title: item.title || item.name || existing.title,
            name: item.name || item.title || existing.name,
            media_type: resolvedType,
            poster_path: item.poster_path || existing.poster_path,
            backdrop_path: item.backdrop_path || existing.backdrop_path,
            vote_average: item.vote_average || existing.vote_average,
            runtime: runtimeMinutes,  // TMDB runtime in minutes (always guaranteed)
            currentTime: Math.floor(currentTime),
            duration: Math.floor(effectiveDuration),
            progress: progress,
            season: hasValidSeason ? season : (resolvedType === 'tv' ? existing.season : null),
            episode: hasValidSeason ? episode : (resolvedType === 'tv' ? existing.episode : null),
            episodeName: hasValidSeason ? episodeName : (resolvedType === 'tv' ? existing.episodeName : null),
            updatedAt: Date.now()
        };

        if (index >= 0) {
            history.splice(index, 1);
        }
        history.unshift(entry);

        // Keep last 50 entries
        if (history.length > 50) history = history.slice(0, 50);

        try {
            localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Error saving history', e);
        }
    },

    /**
     * Record that the user started watching an item. Creates a minimal
     * history entry even before any postMessage arrives from the player,
     * so that "Continua a guardare" appears as soon as the player opens.
     */
    recordStart(item, season = null, episode = null, episodeName = null) {
        if (!item || !item.id) return;
        const existing = this.getHistoryEntry(item.id);
        const currentTime = existing ? (existing.currentTime || 0) : 0;
        const duration = existing ? (existing.duration || 0) : 0;
        this.updateProgress(item, currentTime, duration, season, episode, episodeName);
    },

    /**
     * Mark a movie as finished (100%) so it's hidden from continue-watching.
     */
    markFinished(id) {
        let history = this.getHistory();
        const index = history.findIndex(h => String(h.id) === String(id));
        if (index >= 0) {
            history[index].progress = 100;
            history[index].updatedAt = Date.now();
            try {
                localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
            } catch (e) { /* ignore */ }
        }
    },

    removeFromHistory(id) {
        let history = this.getHistory().filter(h => String(h.id) !== String(id));
        try {
            localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Error removing from history', e);
        }
    }
};

window.Storage = Storage;
