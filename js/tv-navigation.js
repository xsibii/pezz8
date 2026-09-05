/**
 * TV Navigation Engine (Spatial D-Pad for Smart TV, Android TV, Fire TV & Keyboards)
 * Supports: Arrow keys, Enter/OK, Back/Escape, Media keys, Row auto-scrolling
 */
const TVNav = {
    enabled: true,
    currentFocus: null,
    isTVMode: false,

    init() {
        // Detect TV User Agents (e.g. SmartTV, Tizen, Web0S, Android TV, Apple TV)
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('smarttv') || ua.includes('tizen') || ua.includes('webos') || ua.includes('netcast') || ua.includes('crkey') || ua.includes('googletv') || ua.includes('aft') || ua.includes('appletv')) {
            this.enableTVMode(true);
        }

        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // When mouse moves significantly, allow mouse focus
        let mouseTimer;
        window.addEventListener('mousemove', () => {
            if (this.isTVMode && !this.isForcedTV()) {
                clearTimeout(mouseTimer);
                mouseTimer = setTimeout(() => {
                    document.body.classList.remove('tv-mode');
                }, 500);
            }
        });
    },

    isForcedTV() {
        const s = window.Storage ? window.Storage.getSettings() : {};
        return s.tvMode === true;
    },

    enableTVMode(force = false) {
        this.isTVMode = true;
        document.body.classList.add('tv-mode');
        if (!this.currentFocus) {
            this.focusFirstAvailable();
        }
    },

    handleKeyDown(e) {
        if (!this.enabled) return;

        const code = e.keyCode || e.which;
        const key = e.key;

        // Keys: ArrowUp (38), ArrowDown (40), ArrowLeft (37), ArrowRight (39), Enter (13), Esc (27), Backspace (8)
        // SmartTV remote keys: 10009 (Tizen Back), 461 (webOS Back), 10182 (Exit)
        const isDpad = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key) ||
            [37, 38, 39, 40, 13].includes(code);

        const isBack = ['Escape', 'Backspace'].includes(key) ||
            [27, 8, 10009, 461, 10182].includes(code);

        if (isDpad || isBack) {
            this.enableTVMode();
        }

        // Active Player or Modals Handle Back First
        if (isBack) {
            if (window.Player && window.Player.container && window.Player.container.classList.contains('active')) {
                e.preventDefault();
                window.Player.close();
                return;
            }

            const detailModal = document.getElementById('detailModal');
            if (detailModal && detailModal.classList.contains('active')) {
                e.preventDefault();
                window.App.closeDetailModal();
                return;
            }

            const searchOverlay = document.getElementById('searchOverlay');
            if (searchOverlay && searchOverlay.classList.contains('active')) {
                e.preventDefault();
                window.App.closeSearch();
                return;
            }

            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal && settingsModal.classList.contains('active')) {
                e.preventDefault();
                window.App.closeSettings();
                return;
            }
        }

        // Fullscreen toggle key (F)
        if ((key === 'f' || key === 'F') && !e.target.matches('input, textarea')) {
            e.preventDefault();
            if (window.Player && window.Player.container && window.Player.container.classList.contains('active')) {
                window.Player.toggleFullscreen();
            }
            return;
        }

        // If player is active, let iframe or back button receive controls
        if (window.Player && window.Player.container && window.Player.container.classList.contains('active')) {
            if (isBack) {
                window.Player.close();
            }
            return;
        }

        // Navigation directions
        switch (key) {
            case 'ArrowLeft':
            case 'Left':
                e.preventDefault();
                this.navigate('left');
                break;
            case 'ArrowRight':
            case 'Right':
                e.preventDefault();
                this.navigate('right');
                break;
            case 'ArrowUp':
            case 'Up':
                e.preventDefault();
                this.navigate('up');
                break;
            case 'ArrowDown':
            case 'Down':
                e.preventDefault();
                this.navigate('down');
                break;
            case 'Enter':
                if (this.currentFocus && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    this.currentFocus.click();
                }
                break;
        }
    },

    getFocusableContainer() {
        // Scoped to active modal if any is open
        const player = document.getElementById('playerModal');
        if (player && player.classList.contains('active')) return player;

        const detail = document.getElementById('detailModal');
        if (detail && detail.classList.contains('active')) return detail;

        const search = document.getElementById('searchOverlay');
        if (search && search.classList.contains('active')) return search;

        const settings = document.getElementById('settingsModal');
        if (settings && settings.classList.contains('active')) return settings;

        return document.body;
    },

    getFocusableElements() {
        const container = this.getFocusableContainer();
        const selector = 'button:not([disabled]), [tabindex="0"], a[href], input:not([disabled]), .card, .focusable';
        const raw = Array.from(container.querySelectorAll(selector));

        return raw.filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   rect.width > 0 &&
                   rect.height > 0;
        });
    },

    navigate(direction) {
        const focusables = this.getFocusableElements();
        if (focusables.length === 0) return;

        if (!this.currentFocus || !document.body.contains(this.currentFocus)) {
            this.setFocus(focusables[0]);
            return;
        }

        const currentRect = this.currentFocus.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minScore = Infinity;

        focusables.forEach(target => {
            if (target === this.currentFocus) return;

            const rect = target.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            const dx = center.x - currentCenter.x;
            const dy = center.y - currentCenter.y;

            let valid = false;
            let primaryDist = 0;
            let secondaryDist = 0;

            if (direction === 'left' && dx < -10) {
                valid = true;
                primaryDist = Math.abs(dx);
                secondaryDist = Math.abs(dy);
            } else if (direction === 'right' && dx > 10) {
                valid = true;
                primaryDist = Math.abs(dx);
                secondaryDist = Math.abs(dy);
            } else if (direction === 'up' && dy < -10) {
                valid = true;
                primaryDist = Math.abs(dy);
                secondaryDist = Math.abs(dx);
            } else if (direction === 'down' && dy > 10) {
                valid = true;
                primaryDist = Math.abs(dy);
                secondaryDist = Math.abs(dx);
            }

            if (valid) {
                // Heavily penalize distance in the non-primary axis
                const score = primaryDist + (secondaryDist * 2.5);
                if (score < minScore) {
                    minScore = score;
                    bestCandidate = target;
                }
            }
        });

        if (bestCandidate) {
            this.setFocus(bestCandidate);
        }
    },

    setFocus(element) {
        if (!element) return;

        if (this.currentFocus) {
            this.currentFocus.classList.remove('tv-focused');
        }

        this.currentFocus = element;
        this.currentFocus.classList.add('tv-focused');
        this.currentFocus.focus({ preventScroll: true });

        // Smoothly scroll parent row or page to keep focused item in comfortable view
        this.scrollIntoViewSmart(element);
    },

    scrollIntoViewSmart(element) {
        // Horizontal scroll inside row
        const row = element.closest('.row-cards') || element.closest('.horizontal-scroll');
        if (row) {
            const rowRect = row.getBoundingClientRect();
            const elemRect = element.getBoundingClientRect();

            if (elemRect.left < rowRect.left + 50 || elemRect.right > rowRect.right - 50) {
                const targetScroll = row.scrollLeft + (elemRect.left - rowRect.left) - (rowRect.width / 2 - elemRect.width / 2);
                row.scrollTo({ left: targetScroll, behavior: 'smooth' });
            }
        }

        // Vertical scroll for page or modal
        const modalBody = element.closest('.modal-body') || element.closest('.modal-content');
        if (modalBody) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    },

    focusFirstAvailable() {
        const focusables = this.getFocusableElements();
        if (focusables.length > 0) {
            this.setFocus(focusables[0]);
        }
    }
};

window.TVNav = TVNav;
