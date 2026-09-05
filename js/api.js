/**
 * API Service for TMDB & vixsrc.to
 */
const API = {
    DEFAULT_KEY: '8265bd1679663a7ea12ac168da84d2e8',
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_BASE: 'https://image.tmdb.org/t/p',
    VIXSRC_BASE: 'https://vixsrc.to',

    cache: new Map(),

    getApiKey() {
        const settings = window.Storage ? window.Storage.getSettings() : {};
        return settings.tmdbKey || this.DEFAULT_KEY;
    },

    getLanguage() {
        const settings = window.Storage ? window.Storage.getSettings() : {};
        return (settings.lang === 'it' ? 'it-IT' : 'en-US');
    },

    async fetchTMDB(endpoint, params = {}) {
        const apiKey = this.getApiKey();
        const lang = this.getLanguage();
        const queryParams = new URLSearchParams({
            api_key: apiKey,
            language: lang,
            include_adult: 'false',
            ...params
        });

        const url = `${this.BASE_URL}${endpoint}?${queryParams.toString()}`;
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
            const data = await res.json();
            this.cache.set(url, data);
            return data;
        } catch (err) {
            console.warn(`Failed fetching TMDB [${endpoint}]:`, err);
            // Fallback for language if Italian is missing
            if (lang !== 'en-US') {
                try {
                    const fallbackParams = new URLSearchParams({
                        api_key: apiKey,
                        language: 'en-US',
                        include_adult: 'false',
                        ...params
                    });
                    const fallbackRes = await fetch(`${this.BASE_URL}${endpoint}?${fallbackParams.toString()}`);
                    if (fallbackRes.ok) return await fallbackRes.json();
                } catch (e) {
                    console.error('Fallback failed:', e);
                }
            }
            return null;
        }
    },

    // --- Image URL Helpers ---
    getImageUrl(path, size = 'w500') {
        if (!path) return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect fill="%23222" width="500" height="750"/><text fill="%23666" font-family="sans-serif" font-size="24" dy="10.5" font-weight="bold" x="50%" y="50%" text-anchor="middle">No Image</text></svg>';
        return `${this.IMG_BASE}/${size}${path}`;
    },

    getBackdropUrl(path, size = 'original') {
        if (!path) return '';
        return `${this.IMG_BASE}/${size}${path}`;
    },

    // --- Content Endpoints ---
    async getTrending(timeWindow = 'day') {
        const data = await this.fetchTMDB(`/trending/all/${timeWindow}`);
        return (data && data.results) ? data.results.filter(i => i.backdrop_path || i.poster_path) : [];
    },

    async getPopularMovies(page = 1) {
        const data = await this.fetchTMDB('/movie/popular', { page });
        return (data && data.results) ? data.results.map(m => ({ ...m, media_type: 'movie' })) : [];
    },

    async getTopRatedMovies() {
        const data = await this.fetchTMDB('/movie/top_rated');
        return (data && data.results) ? data.results.map(m => ({ ...m, media_type: 'movie' })) : [];
    },

    async getPopularTV(page = 1) {
        const data = await this.fetchTMDB('/tv/popular', { page });
        return (data && data.results) ? data.results.map(s => ({ ...s, media_type: 'tv' })) : [];
    },

    async getTopRatedTV() {
        const data = await this.fetchTMDB('/tv/top_rated');
        return (data && data.results) ? data.results.map(s => ({ ...s, media_type: 'tv' })) : [];
    },

    async getByGenre(mediaType = 'movie', genreId) {
        const data = await this.fetchTMDB(`/discover/${mediaType}`, {
            with_genres: genreId,
            sort_by: 'popularity.desc'
        });
        return (data && data.results) ? data.results.map(i => ({ ...i, media_type: mediaType })) : [];
    },

    async getDetails(mediaType, id) {
        const data = await this.fetchTMDB(`/${mediaType}/${id}`, {
            append_to_response: 'credits,videos,recommendations,similar'
        });
        if (data) {
            data.media_type = mediaType;
        }
        return data;
    },

    async getSeasonDetails(tvId, seasonNumber) {
        return await this.fetchTMDB(`/tv/${tvId}/season/${seasonNumber}`);
    },

    async search(query, page = 1) {
        if (!query || !query.trim()) return [];
        const data = await this.fetchTMDB('/search/multi', {
            query: encodeURIComponent(query),
            page
        });
        return (data && data.results) ? data.results.filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && (i.poster_path || i.backdrop_path)) : [];
    },

    // --- Genre Catalogs ---
    MOVIE_GENRES: [
        { id: 'all', name: 'Tutti i generi' },
        { id: 28, name: 'Azione' },
        { id: 12, name: 'Avventura' },
        { id: 16, name: 'Animazione' },
        { id: 35, name: 'Commedia' },
        { id: 80, name: 'Crime / Poliziesco' },
        { id: 99, name: 'Documentario' },
        { id: 18, name: 'Drammatico' },
        { id: 10751, name: 'Famiglia' },
        { id: 14, name: 'Fantasy' },
        { id: 27, name: 'Horror' },
        { id: 9648, name: 'Mistero' },
        { id: 10749, name: 'Romantico' },
        { id: 878, name: 'Fantascienza' },
        { id: 53, name: 'Thriller' },
        { id: 37, name: 'Western' }
    ],

    TV_GENRES: [
        { id: 'all', name: 'Tutti i generi' },
        { id: 10759, name: 'Azione e Avventura' },
        { id: 16, name: 'Animazione' },
        { id: 35, name: 'Commedia' },
        { id: 80, name: 'Crime / Poliziesco' },
        { id: 99, name: 'Documentario' },
        { id: 18, name: 'Drammatico' },
        { id: 10751, name: 'Famiglia' },
        { id: 10762, name: 'Bambini' },
        { id: 9648, name: 'Mistero' },
        { id: 10765, name: 'Sci-Fi & Fantasy' },
        { id: 10768, name: 'Guerra & Politica' },
        { id: 37, name: 'Western' }
    ],

    // --- Official YouTube Trailer Finder ---
    async getTrailer(mediaType, id, preloadedVideos = null) {
        let videos = preloadedVideos;
        if (!videos) {
            const data = await this.fetchTMDB(`/${mediaType}/${id}/videos`);
            videos = data && data.results ? data.results : [];
        }

        if (!videos || videos.length === 0) {
            // Prova fallback in lingua inglese
            try {
                const enData = await this.fetchTMDB(`/${mediaType}/${id}/videos`, { language: 'en-US' });
                videos = enData && enData.results ? enData.results : [];
            } catch (e) {
                videos = [];
            }
        }

        const ytVideos = videos.filter(v => v.site === 'YouTube');
        if (ytVideos.length === 0) return null;

        // 1. Cerca trailer in italiano
        const itTrailer = ytVideos.find(v => v.iso_639_1 === 'it' && v.type === 'Trailer');
        if (itTrailer) return itTrailer.key;

        // 2. Cerca teaser in italiano
        const itTeaser = ytVideos.find(v => v.iso_639_1 === 'it');
        if (itTeaser) return itTeaser.key;

        // 3. Cerca trailer ufficiale in lingua originale
        const officialTrailer = ytVideos.find(v => v.type === 'Trailer' && (v.official === true || (v.name && v.name.toLowerCase().includes('official'))));
        if (officialTrailer) return officialTrailer.key;

        // 4. Qualsiasi trailer
        const anyTrailer = ytVideos.find(v => v.type === 'Trailer');
        if (anyTrailer) return anyTrailer.key;

        // 5. Primo video YouTube disponibile
        return ytVideos[0].key;
    },

    // --- vixsrc.to Catalog API ---
    async getVixsrcCatalog(type = 'movie', lang = 'it') {
        const url = `${this.VIXSRC_BASE}/api/list/${type}?lang=${lang}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`vixsrc API error: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.warn(`Could not reach vixsrc API directly (likely CORS in browser):`, err);
            return null;
        }
    }
};

window.API = API;
