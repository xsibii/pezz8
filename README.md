# 🍿 StreamFlix • Web Streaming Netflix-Style

Una piattaforma di streaming web moderna e reattiva ispirata all'interfaccia di Netflix, progettata per funzionare su **Smart TV**, **PC Desktop/Laptop** e **Smartphone/Tablet**, con integrazione completa del servizio di streaming **[vixsrc.to](https://vixsrc.to/)**.

100% Statica e compatibile nativamente con **GitHub Pages**, senza necessità di server di backend o Node.js.

---

## 🌐 Pubblicazione su GitHub Pages (100% Statica)

Questa applicazione è pronta per essere pubblicata direttamente su GitHub Pages:

1. **Crea un repository su GitHub** (es. `pezz8` o `streamflix`).
2. **Carica tutti i file del progetto** nel branch principale (`main`):
   ```bash
   git init
   git add .
   git commit -m "Deploy StreamFlix static UI"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/TUO-REPO.git
   git push -u origin main
   ```
3. Vai su **Settings** del repository GitHub > **Pages**.
4. In **Build and deployment** seleziona:
   - Source: **Deploy from a branch**
   - Branch: **main** / folder: `/(root)`
   - Clicca **Save**.
5. In 1 minuto la tua istanza sarà attiva su `https://TUO-USERNAME.github.io/TUO-REPO/`!

> [!NOTE]
> Il file `.nojekyll` e `404.html` inclusi nel repository assicurano che tutte le risorse CSS, JS e i percorsi siano gestiti correttamente su GitHub Pages senza elaborazioni di terze parti.

---

## ✨ 3 Layout Dedicati (Riferimenti Netflix Ufficiali)

### 📺 1. Smart TV (10-Foot UI & Telecomando) — *Rif. Foto 1*
- **Sidebar Verticale Sinistra**: barra ad icone con Home, Cerca, Film, Serie TV, La mia lista, Riproduci con ID e Impostazioni.
- **Hero Billboard Panoramico**: riempie l'area destra dello schermo con titolo, trama in evidenza e pulsante Riproduci.
- **Navigazione Spaziale D-Pad**: compatibile al 100% con telecomandi Smart TV (Tizen Samsung, LG webOS, Android TV, Fire TV).
- **Focus Ring Netflix**: bordo bianco e glow rosso ad alta visibilità con zoom 1.1x per visione da 3+ metri.

### 📱 2. Smartphone & Mobile (iOS / Android) — *Rif. Foto 2*
- **Hero Banner Verticale**: locandina ad alto impatto con tag, titolo e riga d'azione centrata (`+ La mia lista`, `Riproduci`, `Info`).
- **Continua a guardare**: schede panoramiche con barra di avanzamento rossa e badge del tempo rimanente.
- **Mobile Bottom Navigation Bar**: barra inferiore traslucida a 5 tab (Home, Cerca, Film, Serie TV, La mia lista).
- **Modal Dettagli a Bottom-Sheet**: pannello a scomparsa dal basso con angoli arrotondati, ideale per l'interazione touch a una mano.

### 💻 3. PC Desktop & Laptop (Netflix Web) — *Rif. Foto 3*
- **Header Superiore Fisso**: logo STREAMFLIX rosso/bianco, collegamenti testuali di navigazione (Home, Serie TV, Film, La mia lista) e controlli rapidi sulla destra.
- **Billboard Cinema Wide**: testata con gradiente trasparente-nero su scroll, badge rating e pulsanti d'azione rapidi.
- **Caroselli Orizzontali con Frecce Hover**: scorrimento fluido con pulsanti laterali semi-trasparenti o rotella del mouse.
- **Card Hover Overlay**: zoom fluido con visualizzazione rapida di pulsante Play, Aggiungi alla lista e percentuali di compatibilità.

---

## 🎬 Funzionalità di Streaming (vixsrc.to & TMDB)

- **Embed Film & Serie**: generazione istantanea degli URL embed vixsrc.to con supporto a stagioni ed episodi.
- **Continua a Guardare Intelligente**: listener `postMessage` potenziato per `timeupdate`, `pause`, `seeked` ed `ended` con fallback al runtime TMDB e calcolo del tempo rimanente esatto.
- **Prossimo Episodio Automatico**: countdown overlay tra episodi consecutivi.
- **Riproduzione con ID Rapida**: riproduci qualsiasi film o serie inserendo il relativo ID TMDB o IMDb.
- **LocalStorage Nativo**: sincronizzazione di cronologia, tempo di visione e La Mia Lista sul dispositivo del browser.

---

## 📁 Struttura del Progetto

```
pezz8/
├── index.html              # Interfaccia statica Netflix (TV Sidebar, PC Header, Mobile Nav)
├── 404.html                # Redirect SPA per GitHub Pages
├── .nojekyll               # Disattiva Jekyll su GitHub Pages
├── README.md               # Documentazione e guida al deploy
├── css/
│   ├── style.css           # Design system Netflix (Hero, Card, Modali, Player, Sidebar)
│   └── responsive.css      # Regole responsive per TV, PC Desktop e Mobile Smartphone
└── js/
    ├── storage.js          # LocalStorage (Continua a guardare, La mia lista, Impostazioni)
    ├── api.js              # Client TMDB e vixsrc.to Catalog API
    ├── player.js           # Player vixsrc.to fullscreen, postMessage listener & Auto-next
    ├── tv-navigation.js    # Motore D-Pad per telecomandi Smart TV
    └── app.js              # Controller dell'applicazione
```
