# Pratiche Edilizie Bologna

App mobile per consultare le pratiche edilizie del Comune di Bologna (PdC, SCIA, CILA), basata sui dati aperti pubblicati su [opendata.comune.bologna.it](https://opendata.comune.bologna.it).

## Scopo educativo

Questo progetto nasce come esercizio didattico per esplorare:

- **React Native con Expo** — sviluppo mobile cross-platform
- **NativeWind (Tailwind CSS)** — styling dichiarativo in ambiente mobile
- **Expo Router** — navigazione file-based
- **expo-sqlite** — persistenza locale con database SQLite
- **Open Data e API pubbliche** — integrazione con i dataset aperti del Comune di Bologna
- **Notifiche locali e background fetch** — aggiornamenti automatici senza server

I dati sono pubblicati dal Comune di Bologna sotto licenza **CC BY 4.0**.

## Funzionalità

- **Sincronizzazione offline** dei dati dal portale Open Data Bologna
- **Feed** con ricerca testuale, filtri per quartiere, tipo pratica, stato e ordinamento
- **Dettaglio pratica** con tutte le informazioni disponibili e link alla fonte
- **Notifiche automatiche** — controllo periodico in background e notifica locale per nuove pratiche
- **Onboarding** guidato alla prima apertura
- **Condivisione** dei dettagli di una pratica

## Dataset utilizzati

| Dataset | Tipo | Fonte |
|---------|------|-------|
| [Permessi di costruire](https://opendata.comune.bologna.it/explore/dataset/permessi-di-costruire-rilasciati/) | PdC | Comune di Bologna |
| [SCIA](https://opendata.comune.bologna.it/explore/dataset/scia-segnalazioni-certificate-di-inizio-attivita-depositate/) | SCIA | Comune di Bologna |
| [CILA](https://opendata.comune.bologna.it/explore/dataset/cila-comunicazioni-inizio-lavori/) | CILA | Comune di Bologna |

## Requisiti

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS 15+ o Android 12+

## Avvio rapido

```bash
# Installazione dipendenze
npm install

# Avvio in modalità sviluppo
npx expo start
```

Scansionare il QR code con **Expo Go** (Android) o la fotocamera (iOS).

## Struttura del progetto

```
app/
├── _layout.tsx          # Layout radice con routing onboarding
├── onboarding.tsx       # Schermata di prima configurazione
├── (tabs)/
│   ├── _layout.tsx      # Configurazione tab bar
│   ├── index.tsx        # Feed pratiche con filtri
│   ├── sync.tsx         # Sincronizzazione dati
│   └── settings.tsx     # Impostazioni e filtri
└── permit/
    └── [id].tsx         # Dettaglio singola pratica

lib/
├── background-sync.ts  # Task di sincronizzazione in background
├── constants.ts         # Costanti, dataset, quartieri
├── db.ts               # Database SQLite locale
├── normalize.ts        # Normalizzazione dati API
├── notifications.ts    # Gestione notifiche locali
├── preferences.ts      # Preferenze utente
├── queries.ts          # Query database con filtri e ordinamento
└── sync.ts             # Logica di sincronizzazione API
```

## Licenza

Codice sorgente: MIT

Dati: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — Comune di Bologna
