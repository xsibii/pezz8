/**
 * StreamFlix Main Application Controller
 */
const App = {
    currentCategory: 'all',
    heroItem: null,
    heroTimer: null,
    searchDebounce: null,
    rawSearchResults: [],
    searchFilter: 'all',
    searchSort: 'pop',

    async init() {
        console.log('[App] Initializing StreamFlix...');

        // Initialize Player & TV Navigation
        if (window.Player) window.Player.init();
        if (window.TVNav) window.TVNav.init();

        this.setupEventListeners();
        this.setupSettingsUI();

        // Load initial content
        await this.loadHomeContent();

        // Check if there are URL parameters (e.g. ?play=movie&id=123)
        this.handleUrlParams();

        // Check PWA Standalone Mode (Home Screen Web App)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
            document.body.classList.add('pwa-mode');
            console.log('[PWA] Standalone mode attiva');
        }

        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then(() => {
                    console.log('[PWA] Service Worker attivo');
                }).catch(err => {
                    console.warn('[PWA] Service Worker non registrato:', err);
                });
            });
        }
    },

    setupEventListeners() {
        // Navigation links (Desktop & Mobile)
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.dataset.target;
                this.switchTab(target, link);
            });
        });

        // Search trigger
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.openSearch());
        }

        const searchCloseBtn = document.getElementById('searchCloseBtn');
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => this.closeSearch());
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchDebounce);
                this.searchDebounce = setTimeout(() => this.performSearch(e.target.value), 350);
            });
        }

        // Quick ID Play button
        const quickIdBtn = document.getElementById('quickIdBtn');
        if (quickIdBtn) {
            quickIdBtn.addEventListener('click', () => this.openQuickIdModal());
        }

        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }

        // Detail modal close
        const detailCloseBtn = document.getElementById('detailCloseBtn');
        if (detailCloseBtn) {
            detailCloseBtn.addEventListener('click', () => this.closeDetailModal());
        }

        // Trailer modal close
        const trailerCloseBtn = document.getElementById('trailerCloseBtn');
        if (trailerCloseBtn) {
            trailerCloseBtn.addEventListener('click', () => this.closeTrailerModal());
        }

        // Search Filter Pills
        document.querySelectorAll('.search-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.search-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.searchFilter = pill.dataset.filter || 'all';
                this.renderFilteredSearchResults();
            });
        });

        // Search Sort Select
        const searchSortSelect = document.getElementById('searchSortSelect');
        if (searchSortSelect) {
            searchSortSelect.addEventListener('change', (e) => {
                this.searchSort = e.target.value;
                this.renderFilteredSearchResults();
            });
        }

        // Header background transition on scroll
        window.addEventListener('scroll', () => {
            const header = document.getElementById('mainHeader');
            if (header) {
                if (window.scrollY > 40) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            }
        });
    },

    async loadHomeContent() {
        this.showLoading(true);
        try {
            // 1. Fetch Trending for Hero
            const trending = await window.API.getTrending('day');
            if (trending && trending.length > 0) {
                this.setupHero(trending);
            }

            // 2. Render Rows Container
            const container = document.getElementById('rowsContainer');
            if (!container) return;
            container.innerHTML = '';

            // 3. Continue Watching (if exists)
            this.renderContinueWatchingRow(container);

            // 4. My List (if exists)
            this.renderMyListRow(container);

            // 5. Top 10 Netflix Row
            if (trending && trending.length >= 5) {
                this.renderTop10Row(container, trending.slice(0, 10));
            }

            // 6. Trending Row
            if (trending && trending.length > 0) {
                this.createRow(container, 'Trending Now • I più visti oggi', trending);
            }

            // 6. Popular Movies
            const popMovies = await window.API.getPopularMovies();
            this.createRow(container, 'Film Popolari', popMovies);

            // 7. Popular TV Series
            const popTV = await window.API.getPopularTV();
            this.createRow(container, 'Serie TV del Momento', popTV);

            // 8. Top Rated Movies
            const topMovies = await window.API.getTopRatedMovies();
            this.createRow(container, 'I Film più Acclamati dalla Critica', topMovies);

            // 9. Genre: Action (28)
            const action = await window.API.getByGenre('movie', 28);
            this.createRow(container, 'Azione e Avventura Adrenalinica', action);

            // 10. Genre: Comedy (35)
            const comedy = await window.API.getByGenre('movie', 35);
            this.createRow(container, 'Commedie e Risate', comedy);

            // 11. Genre: Sci-Fi & Fantasy (878)
            const scifi = await window.API.getByGenre('movie', 878);
            this.createRow(container, 'Fantascienza ed Altri Mondi', scifi);

            // 12. Genre: Thriller (53)
            const thriller = await window.API.getByGenre('movie', 53);
            this.createRow(container, 'Thriller e Suspense', thriller);

        } catch (err) {
            console.error('[App] Error loading content:', err);
        } finally {
            this.showLoading(false);
            if (window.TVNav && window.TVNav.isTVMode) {
                window.TVNav.focusFirstAvailable();
            }
        }
    },

    setupHero(items) {
        if (!items || items.length === 0) return;
        const heroSection = document.getElementById('heroBanner');
        if (!heroSection) return;

        let index = 0;
        const validItems = items.filter(i => i.backdrop_path && (i.overview || i.title || i.name));
        if (validItems.length === 0) return;

        const updateHero = (item) => {
            this.heroItem = item;
            const bgUrl = window.API.getBackdropUrl(item.backdrop_path, 'original');
            heroSection.style.backgroundImage = `url('${bgUrl}')`;

            const title = item.title || item.name;
            const titleEl = document.getElementById('heroTitle');
            if (titleEl) titleEl.textContent = title;

            const overviewEl = document.getElementById('heroOverview');
            if (overviewEl) overviewEl.textContent = item.overview || 'Guarda ora in streaming su StreamFlix con vixsrc.to.';

            const typeLabel = document.getElementById('heroTypeLabel');
            if (typeLabel) {
                typeLabel.textContent = (item.media_type === 'tv' || !!item.first_air_date) ? 'SERIE TV' : 'FILM';
            }

            const ratingEl = document.getElementById('heroRating');
            if (ratingEl) {
                ratingEl.textContent = item.vote_average ? '★ ' + item.vote_average.toFixed(1) : '';
            }

            const yearEl = document.getElementById('heroYear');
            if (yearEl) {
                const yr = (item.release_date || item.first_air_date || '').substring(0, 4);
                yearEl.textContent = yr;
            }

            // Setup Buttons
            const playBtn = document.getElementById('heroPlayBtn');
            if (playBtn) {
                playBtn.onclick = () => this.handlePlayItem(item);
            }

            const infoBtn = document.getElementById('heroInfoBtn');
            if (infoBtn) {
                infoBtn.onclick = () => this.openDetailModal(item);
            }
        };

        updateHero(validItems[0]);

        // Auto rotate hero banner every 25 seconds
        if (this.heroTimer) clearInterval(this.heroTimer);
        this.heroTimer = setInterval(() => {
            index = (index + 1) % validItems.length;
            updateHero(validItems[index]);
        }, 25000);
    },

    createRow(container, title, items) {
        if (!items || items.length === 0) return;

        const rowWrapper = document.createElement('section');
        rowWrapper.className = 'content-row';

        const titleEl = document.createElement('h2');
        titleEl.className = 'row-title';
        titleEl.textContent = title;
        rowWrapper.appendChild(titleEl);

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'row-cards';

        // Prev & Next Buttons for PC Desktop
        const prevBtn = document.createElement('button');
        prevBtn.className = 'row-nav-btn prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.setAttribute('aria-label', 'Scorri a sinistra');
        prevBtn.onclick = () => cardsContainer.scrollBy({ left: -window.innerWidth * 0.7, behavior: 'smooth' });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'row-nav-btn next';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.setAttribute('aria-label', 'Scorri a destra');
        nextBtn.onclick = () => cardsContainer.scrollBy({ left: window.innerWidth * 0.7, behavior: 'smooth' });

        rowWrapper.appendChild(prevBtn);
        rowWrapper.appendChild(nextBtn);

        items.forEach(item => {
            const card = this.createCard(item);
            cardsContainer.appendChild(card);
        });

        rowWrapper.appendChild(cardsContainer);
        container.appendChild(rowWrapper);
    },

    createCard(item) {
        const card = document.createElement('div');
        card.className = 'card focusable';
        card.tabIndex = 0;

        const posterUrl = window.API.getImageUrl(item.poster_path || item.backdrop_path, 'w500');
        const title = item.title || item.name;
        const rating = item.vote_average ? Math.round(item.vote_average * 10) : null;
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);

        const isTv = item.media_type === 'tv' || !!item.first_air_date;

        card.innerHTML = `
            <span class="card-type-tag">${isTv ? 'SERIE' : 'FILM'}</span>
            <img src="${posterUrl}" alt="${title}" loading="lazy" class="card-poster" />
            <div class="card-overlay">
                <div class="card-actions">
                    <button class="card-btn play-btn" title="Riproduci">&#9658;</button>
                    <button class="card-btn list-btn" title="La mia lista">${window.Storage.isInMyList(item.id) ? '&#10003;' : '+'}</button>
                    <button class="card-btn info-btn" title="Dettagli">&#9432;</button>
                </div>
                <h3 class="card-title">${title}</h3>
                <div class="card-meta">
                    ${rating ? `<span class="card-match">${rating}% Match</span>` : ''}
                    ${year ? `<span class="card-year">${year}</span>` : ''}
                    <span class="card-badge">HD</span>
                </div>
            </div>
        `;

        // Card Click opens details
        card.addEventListener('click', (e) => {
            if (e.target.closest('.play-btn')) {
                this.handlePlayItem(item);
            } else if (e.target.closest('.list-btn')) {
                const btn = e.target.closest('.list-btn');
                const added = window.Storage.toggleMyList(item);
                btn.innerHTML = added ? '&#10003;' : '+';
                this.refreshMyList();
            } else {
                this.openDetailModal(item);
            }
        });

        return card;
    },

    renderContinueWatchingRow(container) {
        const history = window.Storage.getContinueWatching();
        if (!history || history.length === 0) return;

        const rowWrapper = document.createElement('section');
        rowWrapper.className = 'content-row continue-watching-row';
        rowWrapper.id = 'continueWatchingRow';

        const titleEl = document.createElement('h2');
        titleEl.className = 'row-title';
        titleEl.textContent = '⏯ Continua a guardare';
        rowWrapper.appendChild(titleEl);

        // Desktop nav arrows
        const prevBtn = document.createElement('button');
        prevBtn.className = 'row-nav-btn prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.setAttribute('aria-label', 'Scorri a sinistra');

        const nextNavBtn = document.createElement('button');
        nextNavBtn.className = 'row-nav-btn next';
        nextNavBtn.innerHTML = '&#10095;';
        nextNavBtn.setAttribute('aria-label', 'Scorri a destra');

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'row-cards';

        prevBtn.onclick = () => cardsContainer.scrollBy({ left: -window.innerWidth * 0.7, behavior: 'smooth' });
        nextNavBtn.onclick = () => cardsContainer.scrollBy({ left: window.innerWidth * 0.7, behavior: 'smooth' });

        rowWrapper.appendChild(prevBtn);
        rowWrapper.appendChild(nextNavBtn);

        history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card continue-card focusable';
            card.tabIndex = 0;

            const bgUrl = window.API.getImageUrl(item.backdrop_path || item.poster_path, 'w500');
            const title = item.title || item.name;

            // Build info line
            let infoLine = '';
            if (item.media_type === 'tv' && item.season) {
                infoLine = `S${item.season}:E${item.episode}`;
                if (item.episodeName) infoLine += ` • ${item.episodeName}`;
            }

            // TMDB runtime fallback: item runtime, or 45m (TV) / 110m (Movie)
            const isTV = item.media_type === 'tv' || item.season !== null;
            const defaultRuntime = isTV ? 45 : 110;
            const runtimeMinutes = item.runtime || defaultRuntime;
            const totalSecs = (item.duration && item.duration > 0)
                ? item.duration
                : (runtimeMinutes * 60);
            const watchedSecs = item.currentTime || 0;

            let timeText = '';
            const remainingSecs = Math.max(0, totalSecs - watchedSecs);

            if (remainingSecs >= 3600) {
                const h = Math.floor(remainingSecs / 3600);
                const m = Math.floor((remainingSecs % 3600) / 60);
                timeText = m > 0 ? `${h}h ${m}m rimanenti` : `${h}h rimanenti`;
            } else if (remainingSecs >= 60) {
                const m = Math.floor(remainingSecs / 60);
                timeText = `${m}m rimanenti`;
            } else if (remainingSecs > 0) {
                timeText = `< 1m rimanente`;
            } else {
                timeText = `${runtimeMinutes}m`;
            }

            // Calculate progress percentage with fallback to 5% min so bar is visible
            const effectiveProgress = (item.progress && item.progress > 0)
                ? item.progress
                : (watchedSecs > 0 && totalSecs > 0 ? Math.min(100, Math.round((watchedSecs / totalSecs) * 100)) : 5);
            const progressPct = Math.max(5, Math.min(100, effectiveProgress));
            const mediaIcon = isTV ? '📺' : '🎬';

            card.innerHTML = `
                <img src="${bgUrl}" alt="${title}" loading="lazy" class="card-poster" />
                <div class="continue-time-badge" title="Tempo rimanente">⏱ ${timeText}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                </div>
                <div class="card-overlay continue-overlay">
                    <div class="card-actions">
                        <button class="card-btn play-btn" title="Riprendi riproduzione">&#9658;</button>
                        <button class="card-btn info-btn" title="Dettagli">&#9432;</button>
                        <button class="card-btn remove-btn" title="Rimuovi dalla cronologia">&times;</button>
                    </div>
                    <h3 class="card-title">${mediaIcon} ${title}</h3>
                    ${infoLine ? `<span class="card-ep">${infoLine}</span>` : ''}
                    <span class="card-time-remaining">⏱ ${timeText}</span>
                </div>
            `;

            // Background fetch TMDB details if item lacks runtime
            if (!item.runtime) {
                window.API.getDetails(isTV ? 'tv' : 'movie', item.id).then(details => {
                    if (details) {
                        const rt = details.runtime || (details.episode_run_time && details.episode_run_time[0]);
                        if (rt) {
                            item.runtime = rt;
                            window.Storage.updateProgress(item, item.currentTime || 0, rt * 60, item.season, item.episode, item.episodeName);
                            const badge = card.querySelector('.continue-time-badge');
                            const overlayText = card.querySelector('.card-time-remaining');
                            const rem = Math.max(0, (rt * 60) - (item.currentTime || 0));
                            let updatedText = '';
                            if (rem >= 3600) {
                                const h = Math.floor(rem / 3600);
                                const m = Math.floor((rem % 3600) / 60);
                                updatedText = m > 0 ? `${h}h ${m}m rimanenti` : `${h}h rimanenti`;
                            } else if (rem >= 60) {
                                updatedText = `${Math.floor(rem / 60)}m rimanenti`;
                            } else {
                                updatedText = `${rt}m`;
                            }
                            if (badge) badge.textContent = `⏱ ${updatedText}`;
                            if (overlayText) overlayText.textContent = `⏱ ${updatedText}`;
                        }
                    }
                }).catch(() => {});
            }

            card.addEventListener('click', (e) => {
                if (e.target.closest('.remove-btn')) {
                    e.stopPropagation();
                    window.Storage.removeFromHistory(item.id);
                    this.refreshContinueWatching();
                } else if (e.target.closest('.info-btn')) {
                    e.stopPropagation();
                    this.openDetailModal(item);
                } else {
                    this.handleResumePlay(item);
                }
            });

            cardsContainer.appendChild(card);
        });

        rowWrapper.appendChild(cardsContainer);
        container.insertBefore(rowWrapper, container.firstChild);
    },

    refreshContinueWatching() {
        const existing = document.getElementById('continueWatchingRow');
        if (existing) existing.remove();
        const container = document.getElementById('rowsContainer');
        if (container) {
            this.renderContinueWatchingRow(container);
        }
    },

    renderMyListRow(container) {
        const list = window.Storage.getMyList();
        if (!list || list.length === 0) return;

        const rowWrapper = document.createElement('section');
        rowWrapper.className = 'content-row my-list-row';
        rowWrapper.id = 'myListRow';

        const titleEl = document.createElement('h2');
        titleEl.className = 'row-title';
        titleEl.textContent = 'La mia lista';
        rowWrapper.appendChild(titleEl);

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'row-cards';

        list.forEach(item => {
            const card = this.createCard(item);
            cardsContainer.appendChild(card);
        });

        rowWrapper.appendChild(cardsContainer);
        // Insert after continue watching if present, or as first
        const continueRow = document.getElementById('continueWatchingRow');
        if (continueRow && continueRow.nextSibling) {
            container.insertBefore(rowWrapper, continueRow.nextSibling);
        } else {
            container.insertBefore(rowWrapper, container.firstChild);
        }
    },

    refreshMyList() {
        const existing = document.getElementById('myListRow');
        if (existing) existing.remove();
        const container = document.getElementById('rowsContainer');
        if (container) {
            this.renderMyListRow(container);
        }
    },

    renderTop10Row(container, items) {
        if (!items || items.length === 0) return;

        const rowWrapper = document.createElement('section');
        rowWrapper.className = 'top10-row';

        const titleEl = document.createElement('h2');
        titleEl.className = 'row-title';
        titleEl.textContent = 'Top 10 dei titoli più visti oggi in Italia';
        rowWrapper.appendChild(titleEl);

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'top10-cards';

        items.slice(0, 10).forEach((item, index) => {
            const rank = index + 1;
            const card = document.createElement('div');
            card.className = 'top10-card focusable';
            card.tabIndex = 0;

            const posterUrl = window.API.getImageUrl(item.poster_path || item.backdrop_path, 'w500');
            const title = item.title || item.name;
            const rating = item.vote_average ? Math.round(item.vote_average * 10) : null;
            const isTv = item.media_type === 'tv' || !!item.first_air_date;

            card.innerHTML = `
                <div class="top10-rank">${rank}</div>
                <div class="card-poster-wrapper">
                    <span class="card-type-tag">${isTv ? 'SERIE' : 'FILM'}</span>
                    <img src="${posterUrl}" alt="${title}" loading="lazy" class="card-poster" />
                    <div class="card-overlay">
                        <div class="card-actions">
                            <button class="card-btn play-btn" title="Riproduci">&#9658;</button>
                            <button class="card-btn list-btn" title="La mia lista">${window.Storage.isInMyList(item.id) ? '&#10003;' : '+'}</button>
                            <button class="card-btn info-btn" title="Dettagli">&#9432;</button>
                        </div>
                        <h3 class="card-title">${title}</h3>
                        <div class="card-meta">
                            ${rating ? `<span class="card-match">${rating}% Match</span>` : ''}
                            <span class="card-badge">TOP 10</span>
                        </div>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.play-btn')) {
                    this.handlePlayItem(item);
                } else if (e.target.closest('.list-btn')) {
                    const btn = e.target.closest('.list-btn');
                    const added = window.Storage.toggleMyList(item);
                    btn.innerHTML = added ? '&#10003;' : '+';
                    this.refreshMyList();
                } else {
                    this.openDetailModal(item);
                }
            });

            cardsContainer.appendChild(card);
        });

        rowWrapper.appendChild(cardsContainer);
        container.appendChild(rowWrapper);
    },

    async handlePlayItem(item) {
        if (!item) return;
        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');

        // Fetch TMDB details to get runtime
        let runtime = item.runtime || null;
        if (!runtime) {
            try {
                const details = await window.API.getDetails(mediaType, item.id);
                if (details) {
                    runtime = details.runtime || (details.episode_run_time && details.episode_run_time[0]) || null;
                    // Merge extra fields into item for richer storage
                    if (details.runtime) item.runtime = details.runtime;
                    if (details.poster_path && !item.poster_path) item.poster_path = details.poster_path;
                    if (details.backdrop_path && !item.backdrop_path) item.backdrop_path = details.backdrop_path;
                }
            } catch (e) { /* non-blocking */ }
        }

        if (mediaType === 'tv') {
            // Check if there is history for this show (resume last episode)
            const lastWatched = window.Storage.getHistoryEntry(item.id);
            const season = (lastWatched && lastWatched.season) ? lastWatched.season : 1;
            const episode = (lastWatched && lastWatched.episode) ? lastWatched.episode : 1;
            window.Player.playEpisode(item, season, episode, 10);
        } else {
            window.Player.playMovie(item);
        }
    },

    handleResumePlay(historyItem) {
        if (historyItem.media_type === 'tv') {
            window.Player.playEpisode(
                historyItem,
                historyItem.season || 1,
                historyItem.episode || 1,
                20,
                historyItem.currentTime
            );
        } else {
            window.Player.playMovie(historyItem, historyItem.currentTime);
        }
    },

    // --- Detail Modal ---
    async openDetailModal(item) {
        const modal = document.getElementById('detailModal');
        if (!modal) return;

        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const bgUrl = window.API.getBackdropUrl(item.backdrop_path || item.poster_path, 'original');
        const title = item.title || item.name;
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const match = item.vote_average ? Math.round(item.vote_average * 10) : 95;

        document.getElementById('detailBackdrop').style.backgroundImage = `linear-gradient(to top, #141414 5%, rgba(20,20,20,0.6) 50%, transparent 100%), url('${bgUrl}')`;
        document.getElementById('detailTitle').textContent = title;
        document.getElementById('detailMatch').textContent = `${match}% Compatibile`;
        document.getElementById('detailYear').textContent = year;
        document.getElementById('detailOverview').textContent = item.overview || 'Nessuna sinossi disponibile.';

        // Setup Play Button in Detail
        const playBtn = document.getElementById('detailPlayBtn');
        if (playBtn) {
            playBtn.onclick = () => {
                this.closeDetailModal();
                this.handlePlayItem(item);
            };
        }

        // Setup List Button in Detail
        const listBtn = document.getElementById('detailListBtn');
        if (listBtn) {
            listBtn.innerHTML = window.Storage.isInMyList(item.id) ? '&#10003; Nella mia lista' : '+ La mia lista';
            listBtn.onclick = () => {
                const added = window.Storage.toggleMyList(item);
                listBtn.innerHTML = added ? '&#10003; Nella mia lista' : '+ La mia lista';
                this.refreshMyList();
            };
        }

        modal.classList.add('active');
        document.body.classList.add('no-scroll');

        // Fetch extra details (cast, seasons, episodes, similar)
        this.loadExtraDetails(item, mediaType);

        if (window.TVNav && window.TVNav.isTVMode) {
            setTimeout(() => {
                const firstBtn = modal.querySelector('button');
                if (firstBtn) window.TVNav.setFocus(firstBtn);
            }, 100);
        }
    },

    async loadExtraDetails(item, mediaType) {
        const seasonsSection = document.getElementById('detailSeasonsSection');
        const similarSection = document.getElementById('detailSimilarSection');

        try {
            const fullDetails = await window.API.getDetails(mediaType, item.id);
            if (!fullDetails) return;

            // Genres & Cast
            const genresEl = document.getElementById('detailGenres');
            if (genresEl && fullDetails.genres) {
                genresEl.textContent = fullDetails.genres.map(g => g.name).join(', ');
            }

            const castEl = document.getElementById('detailCast');
            if (castEl && fullDetails.credits && fullDetails.credits.cast) {
                castEl.textContent = fullDetails.credits.cast.slice(0, 5).map(c => c.name).join(', ');
            }

            // TV Series Seasons & Episodes
            if (mediaType === 'tv' && fullDetails.seasons && fullDetails.seasons.length > 0) {
                seasonsSection.style.display = 'block';
                this.renderSeasonsAndEpisodes(fullDetails);
            } else {
                seasonsSection.style.display = 'none';
            }

            // Similar titles
            if (fullDetails.similar && fullDetails.similar.results && fullDetails.similar.results.length > 0) {
                similarSection.style.display = 'block';
                const grid = document.getElementById('detailSimilarGrid');
                grid.innerHTML = '';
                fullDetails.similar.results.slice(0, 8).forEach(sim => {
                    const card = this.createCard(sim);
                    grid.appendChild(card);
                });
            } else {
                similarSection.style.display = 'none';
            }

            // Official YouTube Trailer
            const trailerBtn = document.getElementById('detailTrailerBtn');
            if (trailerBtn) {
                const trailerKey = await window.API.getTrailer(mediaType, item.id, fullDetails.videos ? fullDetails.videos.results : null);
                if (trailerKey) {
                    trailerBtn.style.display = 'inline-flex';
                    trailerBtn.onclick = () => {
                        this.openTrailerModal(fullDetails.title || fullDetails.name, trailerKey);
                    };
                } else {
                    trailerBtn.style.display = 'none';
                }
            }

        } catch (e) {
            console.error('Error fetching full details:', e);
        }
    },

    openTrailerModal(title, key) {
        const modal = document.getElementById('trailerModal');
        const iframe = document.getElementById('trailerIframe');
        const titleEl = document.getElementById('trailerTitle');
        if (!modal || !iframe) return;

        if (titleEl) titleEl.textContent = `🎬 Trailer: ${title}`;
        iframe.src = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`;
        modal.style.display = 'flex';
        modal.classList.add('active');
    },

    closeTrailerModal() {
        const modal = document.getElementById('trailerModal');
        const iframe = document.getElementById('trailerIframe');
        if (!modal) return;

        modal.style.display = 'none';
        modal.classList.remove('active');
        if (iframe) iframe.src = 'about:blank';
    },

    closeDetailModal() {
        this.closeTrailerModal();
        const modal = document.getElementById('detailModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    },

    async renderSeasonsAndEpisodes(tvDetails) {
        const seasonSelect = document.getElementById('seasonSelect');
        const episodesList = document.getElementById('episodesList');
        if (!seasonSelect || !episodesList) return;

        seasonSelect.innerHTML = '';
        const validSeasons = tvDetails.seasons.filter(s => s.season_number > 0);

        validSeasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.season_number;
            opt.textContent = `${s.name || 'Stagione ' + s.season_number} (${s.episode_count} ep.)`;
            seasonSelect.appendChild(opt);
        });

        const loadSeason = async (seasonNumber) => {
            episodesList.innerHTML = '<div class="loading-spinner">Caricamento episodi...</div>';
            const seasonData = await window.API.getSeasonDetails(tvDetails.id, seasonNumber);
            episodesList.innerHTML = '';

            if (!seasonData || !seasonData.episodes || seasonData.episodes.length === 0) {
                episodesList.innerHTML = '<p class="empty-msg">Nessun episodio trovato per questa stagione.</p>';
                return;
            }

            seasonData.episodes.forEach(ep => {
                const epCard = document.createElement('div');
                epCard.className = 'episode-card focusable';
                epCard.tabIndex = 0;

                const stillUrl = window.API.getImageUrl(ep.still_path || tvDetails.backdrop_path, 'w300');
                epCard.innerHTML = `
                    <div class="ep-num">${ep.episode_number}</div>
                    <div class="ep-thumb-wrapper">
                        <img src="${stillUrl}" alt="${ep.name}" class="ep-thumb" loading="lazy" />
                        <span class="ep-play-icon">&#9658;</span>
                    </div>
                    <div class="ep-info">
                        <div class="ep-header">
                            <h4 class="ep-title">${ep.name}</h4>
                            <span class="ep-duration">${ep.runtime ? ep.runtime + 'm' : ''}</span>
                        </div>
                        <p class="ep-overview">${ep.overview || 'Sinossi non disponibile.'}</p>
                    </div>
                `;

                epCard.addEventListener('click', () => {
                    this.closeDetailModal();
                    const epRuntime = ep.runtime || (tvDetails && tvDetails.episode_run_time ? tvDetails.episode_run_time[0] : 45);
                    window.Player.playEpisode(
                        { ...tvDetails, runtime: epRuntime },
                        seasonNumber,
                        ep.episode_number,
                        seasonData.episodes.length,
                        null,
                        ep.name
                    );
                });

                episodesList.appendChild(epCard);
            });
        };

        seasonSelect.onchange = (e) => loadSeason(e.target.value);
        if (validSeasons.length > 0) {
            loadSeason(validSeasons[0].season_number);
        }
    },

    // --- Search ---
    openSearch() {
        const overlay = document.getElementById('searchOverlay');
        if (overlay) {
            overlay.classList.add('active');
            document.body.classList.add('no-scroll');
            const input = document.getElementById('searchInput');
            if (input) {
                input.focus();
                if (input.value) this.performSearch(input.value);
            }
        }
    },

    closeSearch() {
        const overlay = document.getElementById('searchOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    },

    async performSearch(query) {
        const resultsGrid = document.getElementById('searchResultsGrid');
        if (!resultsGrid) return;

        if (!query || query.trim().length < 2) {
            this.rawSearchResults = [];
            resultsGrid.innerHTML = '<p class="search-placeholder">Cerca tra migliaia di film e serie TV...</p>';
            return;
        }

        resultsGrid.innerHTML = '<div class="loading-spinner">Ricerca in corso...</div>';
        const results = await window.API.search(query);
        this.rawSearchResults = results || [];
        this.renderFilteredSearchResults();
    },

    renderFilteredSearchResults() {
        const resultsGrid = document.getElementById('searchResultsGrid');
        if (!resultsGrid) return;

        let list = [...this.rawSearchResults];

        // 1. Filtro Tipo (All / Movie / TV)
        if (this.searchFilter === 'movie') {
            list = list.filter(i => i.media_type === 'movie');
        } else if (this.searchFilter === 'tv') {
            list = list.filter(i => i.media_type === 'tv');
        }

        // 2. Ordinamento
        if (this.searchSort === 'vote') {
            list.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        } else if (this.searchSort === 'date') {
            list.sort((a, b) => {
                const dateA = a.release_date || a.first_air_date || '';
                const dateB = b.release_date || b.first_air_date || '';
                return dateB.localeCompare(dateA);
            });
        }
        // default: popolarità (già ordinato da TMDB)

        if (list.length === 0) {
            resultsGrid.innerHTML = '<p class="search-placeholder">Nessun titolo trovato con i filtri selezionati.</p>';
            return;
        }

        resultsGrid.innerHTML = '';
        list.forEach(item => {
            const card = this.createCard(item);
            resultsGrid.appendChild(card);
        });
    },

    // --- Quick ID Player Modal ---
    openQuickIdModal() {
        const modal = document.getElementById('quickIdModal');
        if (!modal) return;
        modal.classList.add('active');
        document.body.classList.add('no-scroll');

        const typeSelect = document.getElementById('quickType');
        const tvFields = document.getElementById('quickTvFields');

        typeSelect.onchange = () => {
            tvFields.style.display = typeSelect.value === 'tv' ? 'flex' : 'none';
        };

        const form = document.getElementById('quickIdForm');
        form.onsubmit = (e) => {
            e.preventDefault();
            const type = typeSelect.value;
            const id = document.getElementById('quickIdInput').value.trim();
            const season = document.getElementById('quickSeasonInput').value;
            const episode = document.getElementById('quickEpisodeInput').value;

            if (!id) return;

            this.closeQuickIdModal();

            const pseudoItem = {
                id: id,
                title: `${type === 'tv' ? 'Serie TV' : 'Film'} (ID: ${id})`,
                media_type: type
            };

            if (type === 'tv') {
                window.Player.playEpisode(pseudoItem, season || 1, episode || 1);
            } else {
                window.Player.playMovie(pseudoItem);
            }
        };

        const closeBtn = document.getElementById('quickIdCloseBtn');
        if (closeBtn) closeBtn.onclick = () => this.closeQuickIdModal();
    },

    closeQuickIdModal() {
        const modal = document.getElementById('quickIdModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    },

    // --- Settings Modal ---
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (!modal) return;
        modal.classList.add('active');
        document.body.classList.add('no-scroll');

        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) closeBtn.onclick = () => this.closeSettings();
    },

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    },

    setupSettingsUI() {
        const settings = window.Storage.getSettings();

        const langSelect = document.getElementById('settingsLang');
        if (langSelect) {
            langSelect.value = settings.lang || 'it';
            langSelect.onchange = (e) => {
                settings.lang = e.target.value;
                window.Storage.saveSettings(settings);
                window.API.cache.clear();
                this.loadHomeContent();
            };
        }

        const colorSelect = document.getElementById('settingsColor');
        if (colorSelect) {
            colorSelect.value = settings.primaryColor || 'E50914';
            colorSelect.onchange = (e) => {
                settings.primaryColor = e.target.value;
                window.Storage.saveSettings(settings);
            };
        }

        const autoplayCheck = document.getElementById('settingsAutoplay');
        if (autoplayCheck) {
            autoplayCheck.checked = settings.autoplay !== false;
            autoplayCheck.onchange = (e) => {
                settings.autoplay = e.target.checked;
                window.Storage.saveSettings(settings);
            };
        }

        const tvModeCheck = document.getElementById('settingsTvMode');
        if (tvModeCheck) {
            tvModeCheck.checked = settings.tvMode === true;
            tvModeCheck.onchange = (e) => {
                settings.tvMode = e.target.checked;
                window.Storage.saveSettings(settings);
                if (settings.tvMode) {
                    window.TVNav.enableTVMode(true);
                } else {
                    document.body.classList.remove('tv-mode');
                }
            };
        }

        const tmdbInput = document.getElementById('settingsTmdbKey');
        if (tmdbInput) {
            tmdbInput.value = settings.tmdbKey || '';
            tmdbInput.onchange = (e) => {
                settings.tmdbKey = e.target.value.trim();
                window.Storage.saveSettings(settings);
                window.API.cache.clear();
                this.loadHomeContent();
            };
        }
    },

    // --- Tab Switching (Film, Serie, Nuovi, La mia lista) ---
    async switchTab(target, clickedElement) {
        document.querySelectorAll('[data-target]').forEach(l => {
            if (l.dataset.target === target) {
                l.classList.add('active');
            } else {
                l.classList.remove('active');
            }
        });

        const hero = document.getElementById('heroBanner');
        const container = document.getElementById('rowsContainer');
        const genreBar = document.getElementById('genreFilterBar');
        if (!container) return;

        this.showLoading(true);

        try {
            if (target === 'home') {
                if (hero) {
                    hero.classList.remove('hidden');
                    hero.style.display = 'flex';
                }
                if (genreBar) genreBar.style.display = 'none';
                document.body.classList.remove('no-hero');
                await this.loadHomeContent();
            } else if (target === 'movies') {
                if (hero) {
                    hero.classList.remove('hidden');
                    hero.style.display = 'flex';
                }
                document.body.classList.remove('no-hero');
                this.setupGenreDropdown('movie');
                container.innerHTML = '';
                const popular = await window.API.getPopularMovies();
                if (popular && popular.length > 0) {
                    this.setupHero(popular);
                }
                this.createRow(container, 'Film Più Visti', popular);
                const action = await window.API.getByGenre('movie', 28);
                this.createRow(container, 'Azione e Avventura', action);
                const comedy = await window.API.getByGenre('movie', 35);
                this.createRow(container, 'Commedie', comedy);
                const scifi = await window.API.getByGenre('movie', 878);
                this.createRow(container, 'Fantascienza', scifi);
                const thriller = await window.API.getByGenre('movie', 53);
                this.createRow(container, 'Thriller e Suspense', thriller);
                const horror = await window.API.getByGenre('movie', 27);
                this.createRow(container, 'Horror e Terrore', horror);
            } else if (target === 'series') {
                if (hero) {
                    hero.classList.remove('hidden');
                    hero.style.display = 'flex';
                }
                document.body.classList.remove('no-hero');
                this.setupGenreDropdown('tv');
                container.innerHTML = '';
                const popular = await window.API.getPopularTV();
                if (popular && popular.length > 0) {
                    this.setupHero(popular);
                }
                this.createRow(container, 'Serie TV Popolari', popular);
                const top = await window.API.getTopRatedTV();
                this.createRow(container, 'Serie TV Più Votate', top);
                const drama = await window.API.getByGenre('tv', 18);
                this.createRow(container, 'Serie Drammatiche', drama);
                const comedy = await window.API.getByGenre('tv', 35);
                this.createRow(container, 'Serie Comiche', comedy);
                const scifi = await window.API.getByGenre('tv', 10765);
                this.createRow(container, 'Fantascienza & Fantasy', scifi);
            } else if (target === 'mylist') {
                if (hero) {
                    hero.classList.add('hidden');
                    hero.style.display = 'none';
                }
                if (genreBar) genreBar.style.display = 'none';
                document.body.classList.add('no-hero');
                container.innerHTML = '';
                const list = window.Storage.getMyList();
                if (!list || list.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <h3>Non hai ancora aggiunto titoli a La Mia Lista</h3>
                            <p>Premi il pulsante <strong>+</strong> su qualsiasi film o serie per ritrovarlo qui.</p>
                        </div>
                    `;
                } else {
                    const section = document.createElement('section');
                    section.className = 'grid-section';
                    section.innerHTML = `<h2 class="section-title">I Tuoi Preferiti (${list.length})</h2>`;
                    const grid = document.createElement('div');
                    grid.className = 'content-grid';
                    list.forEach(i => grid.appendChild(this.createCard(i)));
                    section.appendChild(grid);
                    container.appendChild(section);
                }
            }
        } catch (e) {
            console.error('Error switching tabs:', e);
        } finally {
            this.showLoading(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (window.TVNav && window.TVNav.isTVMode) {
                window.TVNav.focusFirstAvailable();
            }
        }
    },

    setupGenreDropdown(mediaType) {
        const bar = document.getElementById('genreFilterBar');
        const heading = document.getElementById('categoryHeading');
        const select = document.getElementById('genreSelect');
        if (!bar || !select) return;

        bar.style.display = 'flex';
        if (heading) {
            heading.textContent = mediaType === 'tv' ? 'Serie TV' : 'Film';
        }

        const genres = mediaType === 'tv' ? window.API.TV_GENRES : window.API.MOVIE_GENRES;
        select.innerHTML = genres.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

        select.onchange = async (e) => {
            const genreId = e.target.value;
            const container = document.getElementById('rowsContainer');
            if (!container) return;

            this.showLoading(true);
            container.innerHTML = '';

            try {
                if (genreId === 'all') {
                    await this.switchTab(mediaType === 'tv' ? 'series' : 'movies');
                } else {
                    const selectedGenre = genres.find(g => String(g.id) === String(genreId));
                    const genreName = selectedGenre ? selectedGenre.name : 'In evidenza';
                    const items = await window.API.getByGenre(mediaType === 'tv' ? 'tv' : 'movie', genreId);

                    if (items && items.length > 0) {
                        this.setupHero(items);
                        this.createRow(container, `${genreName} • Più Popolari`, items);

                        const moreData = await window.API.fetchTMDB(`/discover/${mediaType === 'tv' ? 'tv' : 'movie'}`, {
                            with_genres: genreId,
                            sort_by: 'vote_average.desc',
                            'vote_count.gte': 50
                        });
                        if (moreData && moreData.results) {
                            const mapped = moreData.results.map(i => ({ ...i, media_type: mediaType === 'tv' ? 'tv' : 'movie' }));
                            this.createRow(container, `${genreName} • Più Votati`, mapped);
                        }
                    } else {
                        container.innerHTML = '<div class="empty-state"><h3>Nessun titolo trovato per questa categoria</h3></div>';
                    }
                }
            } catch (err) {
                console.error('Error loading genre:', err);
            } finally {
                this.showLoading(false);
            }
        };
    },

    showLoading(show) {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
        }
    },

    handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const playType = params.get('play');
        const id = params.get('id');
        const season = params.get('season') || 1;
        const episode = params.get('episode') || 1;

        if (playType && id) {
            const item = { id: id, title: `Titolo ${id}`, media_type: playType };
            if (playType === 'tv') {
                window.Player.playEpisode(item, season, episode);
            } else {
                window.Player.playMovie(item);
            }
        }
    }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.App.init();
});
