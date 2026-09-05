/**
 * StreamFlix - Cloud & Device Synchronization Manager
 * Solution 1: 6-character PIN Cloud Pairing & Background Sync
 * Compatible with 100% static hosting on GitHub Pages (CORS-enabled REST)
 */

(function () {
    'use strict';

    const Sync = {
        KEYS: {
            PIN: 'streamflix_sync_pin',
            DB_URL: 'streamflix_sync_db',
            LAST_SYNC: 'streamflix_last_sync'
        },

        // Default Firebase Realtime Database URL (user can override in Settings / Advanced)
        DEFAULT_DB_URL: 'https://streamflix-sync-default-rtdb.europe-west1.firebasedatabase.app',

        pin: null,
        dbUrl: null,
        pushTimer: null,
        isPushing: false,
        isPulling: false,
        lastSyncTimestamp: null,

        init() {
            // Load saved PIN and DB URL from storage
            this.pin = localStorage.getItem(this.KEYS.PIN) || null;
            this.dbUrl = localStorage.getItem(this.KEYS.DB_URL) || this.DEFAULT_DB_URL;
            const savedLastSync = localStorage.getItem(this.KEYS.LAST_SYNC);
            if (savedLastSync) this.lastSyncTimestamp = parseInt(savedLastSync, 10);

            // Handle URL Hash for 1-click QR code pairing (e.g. #sync_pin=SF-1234&sync_db=...)
            this.handleUrlHashPairing();

            // Auto-pull on app startup if a PIN is already paired
            if (this.pin) {
                console.log(`[Sync] Dispositivo associato al codice: ${this.pin}`);
                this.pull(true);
            } else {
                console.log('[Sync] Nessun codice cloud associato. Modalità locale.');
            }

            // Auto-sync when user returns to this tab / app window
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.pin) {
                    this.pull(false);
                }
            });

            // Re-sync on network reconnect
            window.addEventListener('online', () => {
                if (this.pin) {
                    console.log('[Sync] Rete ripristinata, avvio sincronizzazione...');
                    this.pull(false);
                }
            });
        },

        /**
         * Check if URL has #sync_pin=... from scanning a QR code
         */
        handleUrlHashPairing() {
            if (!window.location.hash) return;
            try {
                const hashStr = window.location.hash.substring(1);
                const params = new URLSearchParams(hashStr);
                const hashPin = params.get('sync_pin') || params.get('pin');
                const hashDb = params.get('sync_db') || params.get('db');

                if (hashPin) {
                    console.log(`[Sync] Rilevato codice di pairing da URL: ${hashPin}`);
                    if (hashDb) {
                        this.setDbUrl(hashDb);
                    }
                    this.linkDevice(hashPin).then(success => {
                        if (success) {
                            // Clean hash from address bar without reloading
                            history.replaceState(null, document.title, window.location.pathname + window.location.search);
                            if (window.App && typeof window.App.showToast === 'function') {
                                window.App.showToast('✅ Dispositivo collegato con successo!');
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('[Sync] Errore analisi hash di pairing:', e);
            }
        },

        /**
         * Returns normalized endpoint for a given PIN
         */
        getEndpoint(pin) {
            let base = (this.dbUrl || this.DEFAULT_DB_URL).trim();
            if (base.endsWith('/')) base = base.slice(0, -1);
            const safePin = encodeURIComponent((pin || this.pin || '').trim().toUpperCase());
            return `${base}/stmflx_sync/${safePin}.json`;
        },

        /**
         * Generates a human-friendly 6-character code (SF-XXXX)
         */
        generatePin() {
            const digits = Math.floor(1000 + Math.random() * 9000);
            const newPin = `SF-${digits}`;
            this.pin = newPin;
            localStorage.setItem(this.KEYS.PIN, newPin);

            // Immediately push local data to initialize the cloud slot
            this.pushNow().then(() => {
                this.updateUI();
            });

            return newPin;
        },

        /**
         * Pair this device to an existing PIN
         */
        async linkDevice(inputPin) {
            if (!inputPin) return false;
            const cleanPin = inputPin.trim().toUpperCase();
            if (cleanPin.length < 4) {
                alert('Inserisci un codice valido (es. SF-4829).');
                return false;
            }

            this.updateStatusText('Collegamento in corso...');

            try {
                const endpoint = this.getEndpoint(cleanPin);
                const res = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store'
                });

                if (!res.ok && res.status !== 404) {
                    throw new Error(`Errore HTTP ${res.status}`);
                }

                const remote = await res.json();
                this.pin = cleanPin;
                localStorage.setItem(this.KEYS.PIN, cleanPin);

                if (remote && (remote.history || remote.myList)) {
                    // Merge remote data into local storage
                    const changes = window.Storage.mergeData(remote);
                    this.lastSyncTimestamp = Date.now();
                    localStorage.setItem(this.KEYS.LAST_SYNC, String(this.lastSyncTimestamp));

                    if (window.App && typeof window.App.onSyncUpdated === 'function') {
                        window.App.onSyncUpdated(changes);
                    }
                } else {
                    // Cloud record was empty, initialize with current local data
                    await this.pushNow();
                }

                this.updateUI();
                return true;
            } catch (err) {
                console.error('[Sync] Errore associazione dispositivo:', err);
                alert(`Impossibile collegarsi al cloud: ${err.message || 'Verifica la connessione o l\'URL del database.'}`);
                this.updateUI();
                return false;
            }
        },

        /**
         * Unlink device (clears PIN from local device)
         */
        unlinkDevice() {
            if (!confirm('Vuoi scollegare questo dispositivo dalla sincronizzazione cloud? I dati rimarranno comunque salvati in locale.')) {
                return;
            }
            this.pin = null;
            localStorage.removeItem(this.KEYS.PIN);
            this.updateUI();
            console.log('[Sync] Dispositivo scollegato.');
        },

        /**
         * Debounced push - calls pushNow after 2 seconds
         */
        push() {
            if (!this.pin) return;
            clearTimeout(this.pushTimer);
            this.pushTimer = setTimeout(() => {
                this.pushNow();
            }, 2000);
        },

        /**
         * Push local data to cloud immediately
         */
        async pushNow() {
            if (!this.pin || this.isPushing) return;
            this.isPushing = true;
            this.updateStatusText('Salvataggio nel cloud...');

            const payload = {
                pin: this.pin,
                history: window.Storage.getHistory(),
                myList: window.Storage.getMyList(),
                updatedAt: Date.now(),
                device: navigator.userAgent.includes('TV') ? 'Smart TV' : (window.innerWidth <= 768 ? 'Mobile' : 'Desktop')
            };

            try {
                const endpoint = this.getEndpoint(this.pin);
                const res = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    this.lastSyncTimestamp = Date.now();
                    localStorage.setItem(this.KEYS.LAST_SYNC, String(this.lastSyncTimestamp));
                    console.log(`[Sync] Dati inviati al cloud con successo (${payload.history.length} cronologia, ${payload.myList.length} preferiti).`);
                } else {
                    console.warn('[Sync] Risposta non OK dal server:', res.status);
                }
            } catch (err) {
                console.warn('[Sync] Errore salvataggio cloud (il dispositivo continuerà a funzionare offline):', err);
            } finally {
                this.isPushing = false;
                this.updateUI();
            }
        },

        /**
         * Pull latest data from cloud and merge
         */
        async pull(isInitial = false) {
            if (!this.pin || this.isPulling) return;
            this.isPulling = true;
            if (!isInitial) this.updateStatusText('Sincronizzazione in corso...');

            try {
                const endpoint = this.getEndpoint(this.pin);
                const res = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store'
                });

                if (!res.ok) {
                    if (res.status === 404) {
                        // Not found yet on remote, initialize
                        await this.pushNow();
                    }
                    return;
                }

                const remote = await res.json();
                if (remote && (remote.history || remote.myList)) {
                    const changes = window.Storage.mergeData(remote);
                    this.lastSyncTimestamp = Date.now();
                    localStorage.setItem(this.KEYS.LAST_SYNC, String(this.lastSyncTimestamp));

                    if (changes.historyChanged || changes.listChanged) {
                        console.log('[Sync] Ricevuti nuovi dati dal cloud, interfaccia aggiornata.');
                        if (window.App && typeof window.App.onSyncUpdated === 'function') {
                            window.App.onSyncUpdated(changes);
                        }
                    }
                }
            } catch (err) {
                console.warn('[Sync] Errore pull dal cloud (offline o errore rete):', err);
            } finally {
                this.isPulling = false;
                this.updateUI();
            }
        },

        /**
         * Set custom Firebase DB URL
         */
        setDbUrl(url) {
            const cleanUrl = (url || '').trim();
            if (!cleanUrl) {
                this.dbUrl = this.DEFAULT_DB_URL;
                localStorage.removeItem(this.KEYS.DB_URL);
            } else {
                this.dbUrl = cleanUrl;
                localStorage.setItem(this.KEYS.DB_URL, cleanUrl);
            }
            console.log('[Sync] URL Database impostato:', this.dbUrl);
        },

        /**
         * Formats relative time (e.g. "Pochi secondi fa", "2 min fa")
         */
        formatLastSyncTime() {
            if (!this.lastSyncTimestamp) return 'Mai';
            const diffSec = Math.floor((Date.now() - this.lastSyncTimestamp) / 1000);
            if (diffSec < 15) return 'Pochi secondi fa';
            if (diffSec < 60) return `${diffSec} sec fa`;
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `${diffMin} min fa`;
            const diffHours = Math.floor(diffMin / 60);
            if (diffHours < 24) return `${diffHours} h fa`;
            return new Date(this.lastSyncTimestamp).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        },

        /**
         * Updates UI elements in the sync modal
         */
        updateUI() {
            const badge = document.getElementById('syncStatusBadge');
            const pinDisplay = document.getElementById('syncCurrentPin');
            const lastSyncEl = document.getElementById('syncLastUpdateText');
            const unlinkBtn = document.getElementById('syncUnlinkBtn');
            const generateBtn = document.getElementById('syncGenerateBtn');
            const dbInput = document.getElementById('syncDbUrlInput');

            if (dbInput) {
                dbInput.value = localStorage.getItem(this.KEYS.DB_URL) || '';
            }

            if (this.pin) {
                if (badge) {
                    badge.className = 'sync-status-badge connected';
                    badge.innerHTML = '<span class="status-dot"></span> Sincronizzato con il cloud';
                }
                if (pinDisplay) {
                    pinDisplay.textContent = this.pin;
                    pinDisplay.classList.remove('empty');
                }
                if (unlinkBtn) unlinkBtn.style.display = 'inline-flex';
                if (generateBtn) generateBtn.textContent = 'Rigenera Codice';
                if (lastSyncEl) lastSyncEl.textContent = `Ultimo sync: ${this.formatLastSyncTime()}`;

                // Render QR code for this PIN
                this.renderQrCode();
            } else {
                if (badge) {
                    badge.className = 'sync-status-badge disconnected';
                    badge.innerHTML = '<span class="status-dot"></span> Dispositivo Locale (Non sincronizzato)';
                }
                if (pinDisplay) {
                    pinDisplay.textContent = 'NON ASSOCIATO';
                    pinDisplay.classList.add('empty');
                }
                if (unlinkBtn) unlinkBtn.style.display = 'none';
                if (generateBtn) generateBtn.textContent = 'Genera Codice di Sincronizzazione';
                if (lastSyncEl) lastSyncEl.textContent = 'Attiva la sincronizzazione per salvare i tuoi progressi nel cloud.';

                // Clear QR code
                const qrContainer = document.getElementById('syncQrContainer');
                if (qrContainer) {
                    qrContainer.innerHTML = '<div class="qr-placeholder">Genera un codice PIN per mostrare il QR Code</div>';
                }
            }
        },

        updateStatusText(msg) {
            const lastSyncEl = document.getElementById('syncLastUpdateText');
            if (lastSyncEl) lastSyncEl.textContent = msg;
        },

        /**
         * QR Code generator using standard QR API
         */
        renderQrCode() {
            const container = document.getElementById('syncQrContainer');
            if (!container || !this.pin) return;

            const origin = window.location.origin;
            const path = window.location.pathname;
            const customDb = localStorage.getItem(this.KEYS.DB_URL);
            let shareUrl = `${origin}${path}#sync_pin=${encodeURIComponent(this.pin)}`;
            if (customDb) {
                shareUrl += `&sync_db=${encodeURIComponent(customDb)}`;
            }

            const encodedData = encodeURIComponent(shareUrl);
            const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodedData}&bgcolor=ffffff&color=141414&margin=2`;

            container.innerHTML = `
                <div class="qr-wrapper">
                    <img src="${qrImgUrl}" alt="QR Code Sincronizzazione" class="qr-image" />
                    <p class="qr-instruction">Inquadra con la fotocamera dello smartphone per collegare istantaneamente il profilo!</p>
                    <button class="btn btn-secondary btn-sm" id="syncCopyLinkBtn" style="margin-top:8px;">
                        📋 Copia Link di Associazione
                    </button>
                </div>
            `;

            const copyBtn = document.getElementById('syncCopyLinkBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        copyBtn.textContent = '✅ Link Copiato!';
                        setTimeout(() => copyBtn.textContent = '📋 Copia Link di Associazione', 2500);
                    }).catch(() => {
                        prompt('Copia questo link:', shareUrl);
                    });
                };
            }
        },

        /**
         * Manual Backup: Export all user data to a downloadable JSON file
         */
        exportBackup() {
            const data = {
                app: 'StreamFlix',
                version: 2,
                exportedAt: new Date().toISOString(),
                history: window.Storage.getHistory(),
                myList: window.Storage.getMyList(),
                settings: window.Storage.getSettings()
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `streamflix_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        /**
         * Manual Backup: Import user data from JSON file
         */
        importBackup(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    if (!parsed || (!parsed.history && !parsed.myList)) {
                        throw new Error('Formato backup non valido.');
                    }
                    const changes = window.Storage.mergeData(parsed);
                    if (parsed.settings) {
                        const current = window.Storage.getSettings();
                        window.Storage.saveSettings({ ...current, ...parsed.settings });
                    }
                    if (window.App && typeof window.App.onSyncUpdated === 'function') {
                        window.App.onSyncUpdated(changes);
                    }
                    if (this.pin) this.pushNow();
                    alert('✅ Backup importato con successo!');
                    this.updateUI();
                } catch (err) {
                    alert('❌ Impossibile importare il backup: ' + err.message);
                }
            };
            reader.readAsText(file);
        }
    };

    window.Sync = Sync;
})();