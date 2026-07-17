# Roadmap — da "Pratiche Edilizie Bologna" a piattaforma civica di quartiere

*Survey del catalogo ODS: 2026-07-05. 701 dataset totali su `opendata.comune.bologna.it`,
tutti sulla stessa Explore API v2.1 che l'app già parla.*

**Tesi.** L'app non è un "permit browser": è un **watcher local-first di dataset ODS**
(fetch → zod → normalize → SQLite → diff → notify). Le pratiche edilizie sono 3 righe in
`constants.ts`. L'evoluzione è aggiungere *sorgenti* alla stessa pipeline e ribrandizzare
attorno al valore reale: **"cosa cambia intorno a te"**.

---

## 1. Dataset testati (probe live su campi + freschezza)

### Tier A — integrare (event-like, quartiere/geo, freschi)

| Dataset | Records | Agg. | Campi chiave verificati | Perché |
|---|---|---|---|---|
| `lavori-pubblici` | 50 | quotidiano | `neighborhood1..3`, `address`, `status`, `effectivestartdate/enddate`, `trafficchangesmeasure` ("Divieto di transito veicolare"), `pinpoint` geo | Cantieri stradali in corso: tocca tutti ogni giorno (chiusure, parcheggio). 50 record → full sync banale, niente MAX_OFFSET |
| `istanze-commercio` | 111.586 | periodico | `data_richiesta`, `esito_pratica`, `tipo_intervento` ("Apertura somministrazione…"), `quartiere`, `esercizio_via`/`civico`, `geopoint` | **Stessa forma delle pratiche edilizie** (istanza→esito→quartiere). Nuovi negozi/ristoranti = alto interesse. Sweep per anno via `data_richiesta` (come `richiesta_anno_prot` oggi) |
| `eventi-bologna-agenda-cultura` | 30.133 | quotidiano | `start`/`end`, `date_multiple`, `title`, `description`, `url`, `categories_1..3`, `quartiere`, `zona_di_prossimita`, `coordinate` | Eventi culturali nel quartiere. Semantica *forward-looking*: sync solo finestra futura (`start >= oggi−7g`) → dataset effettivo piccolo |
| `segnalazioni-open-citizen-relationship-management-czrm` | 123.823 | quotidiano | catalogo: geo ✓, quartiere ✓, date ✓ (mappatura campi da confermare in implementazione) | Segnalazioni dei cittadini (buche, illuminazione, degrado). "Cosa è stato segnalato/risolto vicino a te" |

### Tier B — opzionali / secondi

| Dataset | Records | Note |
|---|---|---|
| `albopt` (immobili per rigenerazione urbana) | 93 | quartiere+geo+`data_ins`; nicchia, buono per verticale due-diligence |
| `patti-di-collaborazione` | 951 | civismo attivo, `zona_di_prossimita`+geo+date; piccolo, carino per il brand |
| `mercati-e-fiere` | 249 | **nessun campo data** → non watchable; utile come layer statico mappa (`giorni_svolgimento`) |
| `scia-segnalazioni-…-depositate` | 51.441 | già integrato (è la SCIA edilizia attuale) |

### Layer statici di contesto (per la fase mappa, non feed)

`farmacie`, `elenco-delle-scuole`, `zona-a-traffico-limitato`, `zone-30kmh-bologna`,
`mercati-e-fiere` — reference senza date; scaricare una tantum, mostrare su mappa/dettaglio.

### Esclusi, con motivo

| Dataset | Motivo |
|---|---|
| `c_a9447d…` **Welfare - Interventi** (421k) | **Privacy**: righe quasi-individuali (sesso, cittadinanza, ISEE, target utenza). Non ripubblicare in un'app consumer. Escluso a prescindere |
| Telemetria sensori: `parcheggi_dati_trento_trieste` (1,4M), `iperbole-wifi-*`, `varco-n-*` (250k+ cad.), `colonnine-conta-bici` | Stream ad alta frequenza, non eventi: sbagliati per sync+notify offline (storage/battería). Semmai lettura live on-demand, mai sync |
| `atti_di_concessione` (22k) | No geo, no quartiere → non mappa su "intorno a te". Verticale trasparenza, eventualmente poi |
| `alberi-manutenzioni` (86k), `un_gest`, `siepi` | **Registri/censimenti**, non stream di eventi (date = inventario 2006-2013). Diff su `data_agg` possibile ma valore basso; layer mappa semmai |

---

## 2. Dove e come si integra (architettura)

Principio: **la pipeline resta identica**, cambia la configurazione. Un'aggiunta di
sorgente = 1 entry di registry + 1 schema zod + 1 normalizer + 1 card renderer.

### 2.1 Registry delle sorgenti (`lib/constants.ts` → `lib/sources.ts`)

Oggi: 3 dataset edilizi hardcoded. Diventa un registry tipizzato:

```ts
interface SourceConfig {
  slug: string;                    // dataset ODS
  category: Category;              // 'edilizia' | 'commercio' | 'cantieri' | 'eventi' | 'segnalazioni'
  schema: ZodType<RawRecord>;      // ingress (schemas.ts, uno per sorgente)
  normalize: (raw) => CivicItem;   // normalize.ts, per sorgente
  sweep: 'full' | { perYearField: string }; // MAX_OFFSET 9900 → sweep per anno se >9900
  syncWindow?: 'recent2y' | 'future';       // eventi = solo futuro
}
```

`switch` esaustivo su `Category` con `default: never` (regola già in CLAUDE.md).

### 2.2 Storage (`db.ts`)

`permits` → tabella generica `civic_items`: colonne comuni
(`source_id`, `category`, `title`, `address`, `zone`, `event_date`, `status`, `tags`,
`source_link`, `is_new`) + `extra` JSON per i campi specifici di categoria.
Migrazione SQLite additiva all'init (le pratiche esistenti si migrano dentro, `category='edilizia'`).
Indici feed esistenti replicati su (`category`, date).

### 2.3 Sync (`sync.ts`, `paginate.ts`, `retry.ts`, `fetch-page.ts`)

Invariati nel funzionamento; `syncRecent`/`syncFull` iterano il registry filtrato sugli
interessi utente. Note per sorgente:
- `lavori-pubblici`: full sync (50 righe), diff su `status`+`effectiveenddate`.
- `istanze-commercio`: per-anno su `data_richiesta` (stesso pattern `richiesta_anno_prot`).
- `eventi`: `where=start>=…` finestra mobile; upsert su `id`.
- `segnalazioni-czrm`: per-anno; confermare campo data in implementazione.

### 2.4 UI

- **Feed**: chips categoria accanto ai chips PDC/SCIA/CILA esistenti (che diventano
  sotto-filtri di "Edilizia"); card renderer per categoria (cantieri mostrano
  `trafficchangesmeasure`; eventi mostrano date+link biglietti).
- **Onboarding**: da "quartieri + tipi pratica" a "quartieri + **interessi**" (categorie).
- **Notifiche**: `notification-message.ts` già pluralizza; si estende per categoria
  ("3 nuovi cantieri e 5 eventi nel tuo quartiere").
- **Dettaglio**: template per categoria; link portale sorgente già previsto.

### 2.5 Preferenze

`preferences.ts`: aggiungi `interests: Category[]` (decode hardened come gli altri campi).

---

## 3. Fasi

| Fase | Contenuto | Dipende da | Stima |
|---|---|---|---|
| ✅ **P0 — Registry** *(fatto, lug 2026)* | `sources.ts`, migrazione additiva su `permits` (niente rename), categoria in feed/query/prefs. Zero nuove sorgenti, comportamento identico | — | il grosso del lavoro concettuale; tutto testabile in vitest |
| ✅ **P1 — Cantieri + Commercio** *(fatto, lug 2026)* | `lavori-pubblici` (banale) + `istanze-commercio` (stesso shape dell'edilizia). Feed multi-categoria, notifiche estese | P0 | 2 schemi + 2 normalizer + card |
| ✅ **P2 — Eventi + Segnalazioni** *(fatto, lug 2026)* | `eventi-agenda-cultura` (sync futuro, ordinati per data di scoperta) + `segnalazioni-czrm`. Qui l'app diventa quotidianamente utile a chiunque | P0 | semantica sync nuova (futuro) |
| ✅ **P3 — Rebrand "Civico"** *(fatto in 2.0.0; icona poi ripristinata alle Due Torri, vedi nota)* | Nome, copy, config città, listing ASC | P1 | checklist in §4 |
| ✅ **P4 — Mappa** *(fatto, ago 2026)* | Tab mappa (react-native-maps/Apple Maps), "Nei dintorni", layer statici (farmacie, scuole, mercati), tracker/Novità | P1-P2 | contesto in §4b |
| ❌ **P5 — Multi-città — CHIUSA (ago 2026)** | Decisione finale del proprietario: l'app resta **solo Bologna**. Il protocollo in §4c resta come riferimento storico; nessun audit, nessun adapter CKAN | — | non si fa |

Regola invariata: **niente backend, niente account, niente analytics.** È il
differenziatore (privacy, costi zero, offline). Tutte le fasi lo rispettano.

**Residuo noto post-P2:** con tutti e 5 gli interessi attivi, il sync in background di
commercio+segnalazioni (~400 richieste sequenziali sulla finestra recente) può eccedere il
budget iOS (~30s) — il primo popolamento va fatto dal tab Aggiorna (foreground). Mitigazione
futura se serve: sync incrementale per data di ultimo sync invece della finestra fissa 2 anni.

**Manutenzione pendente (SDK 54, lug 2026):** `expo-background-fetch` è deprecato a favore di
`expo-background-task` (WorkManager/BGTaskScheduler). Funziona ancora in SDK 54; migrare
deliberatamente (tocca `background-sync.ts`, gli entitlements in `app.json` e il contratto
`BackgroundFetchResult`) — non in drive-by, e testare su build reale (non Expo Go, dove il
background non gira comunque).

---

## 4. Rebrand — da "Pratiche Edilizie Bologna" a brand civico

### Vincoli tecnici (verificati questa sessione)

- **Bundle id `it.innesti.praticheediliziebologna` NON può cambiare** su un'app App Store
  esistente — cambiarlo = nuova app, si perdono recensioni/installazioni. Va bene: è
  invisibile all'utente. Si cambia solo il **display name**.
- Il nome App Store si cambia contestualmente a una release nuova (campo "Nome" in ASC).
- `slug`/`projectId` EAS: **non toccare** (rompe il linking EAS). Cambia solo
  `expo.name` in `app.json`.
- `scheme` deep-link: aggiungerne uno nuovo, mantenere `pratiche-bologna` come alias.

### Nome — DECISO: **Civico** (confermato dal proprietario, lug 2026)

Doppio senso: *civico* (cittadino) + *numero civico* (casa tua). Corto, italiano, regge il
multi-città ("Civico Bologna", "Civico Torino"). Prima di pubblicare: verificare collisioni
marchio/App Store per "Civico" in categoria News/Utility Italia.

Tagline: *"Cosa cambia intorno a te"* / *"La tua città, sotto casa"*.

### P3 — checklist di esecuzione (per l'automazione, in ordine)

1. `app.json` → `expo.name: "Civico"`. Nome ASC: "Civico — Bologna" (ricercabilità). NON
   toccare: `bundleIdentifier`, `slug`, `projectId`, `owner`. `scheme`: aggiungere `civico`,
   tenere `pratiche-bologna` come alias.
2. Config città (`lib/city.ts` o simile): `{ nome: 'Bologna', accento: '#9B2335', QUARTIERI,
   portale ODS }` — estrarre da `constants.ts` ciò che è fatto-di-Bologna, il brand resta
   neutro. Le 7 sorgenti restano in `sources.ts` (diventeranno per-città solo in P5).
3. Copy sweep: grep "Pratiche Edilizie Bologna" / "pratiche edilizie" in `app/`, `assets/lang/`,
   README; parametrizzare i riferimenti a Bologna dove appaiono come brand (non dove indicano
   la città dei dati). Tono invariato (vedi `onboarding.tsx`).
4. Icona/splash: nuovo segno neutro (pin + isolato stilizzato), colorway Bologna. 1024px
   `assets/icon.png` + `adaptive-icon.png` + `splash.png`. Se la generazione dell'artwork non è
   automatizzabile con qualità sufficiente, fermarsi e chiedere — NON pubblicare con l'icona
   Due Torri sotto il nome Civico.
5. Store: nuovi screenshot via il flusso documentato in CLAUDE.md (§ Deploy), "Novità" che
   annuncia le 5 categorie, testo promozionale aggiornato, versione minor bump (1.2.0).
6. Gate completo + revisione avversariale prima della release (come P1/P2).

### Cosa è Bologna-hardcoded oggi (sweep da fare in P3)

1. `app.json` → `name`, splash/icon (torri), colore `#9B2335` (rosso Bologna)
2. `constants.ts` → lista `QUARTIERI`, slugs dataset, base URL portale
3. Copy nelle screen (tono ok, riferimenti "Bologna" da parametrizzare)
4. `assets/lang/it.json` (InfoPlist), README, listing ASC (nome, descrizione,
   screenshot, testo promozionale, privacy)

### Design "clever": la città come tema, non come brand

- Il **brand** è neutro (Civico); la **città è una config**: `{ nome, colore accento,
  quartieri, sorgenti }`. Bologna resta rosso `#9B2335` *come accento della città*, non
  del brand → il rebrand non butta l'identità visiva esistente, la degrada a tema.
- L'onboarding diventa: *(1) scegli la città [oggi solo Bologna] → (2) quartieri →
  (3) interessi*. Il passo 1 con una sola città sembra vuoto ma comunica la visione e
  rende P5 un'aggiunta di config, non un redesign.
- Icona: dalla sagoma delle Due Torri a un segno che regga multi-città (pin +
  isolato/quartiere stilizzato), con colorway per città.

---

## 4b. P4 — Mappa + raggio: contesto per l'automazione

> **Memo decisionale con probe LIVE + verifica codice: [`docs/P4-map-radius.md`](P4-map-radius.md)**
> (2026-07-06). Decide la libreria (`react-native-maps`), documenta che le coordinate NON sono
> oggi in `extra`, identifica il gazetteer `rifter_civici_pt` per il geocoding on-device, e
> sequenzia gli slice puri (loop-shippabili) prima del rebuild nativo (Matteo-gated).

La ricerca e l'implementazione sono delegate all'automazione. Contesto necessario:

**Scelta libreria mappa (decidere per prima, condiziona tutto):**
- Candidate: `react-native-maps` (Apple Maps su iOS — zero API key, ma config plugin +
  rebuild EAS) vs `@maplibre/maplibre-react-native` (tile vettoriali open, stile
  personalizzabile, più pesante). Entrambe = dipendenza NATIVA → serve un nuovo build EAS
  (vedi CLAUDE.md § Deploy: il build parte dal commit git). Nessuna delle due funziona nel
  build web degli screenshot → serve uno shim `*.web.ts` che renda un placeholder statico.
- Criterio: privacy-first (niente chiavi/tracking di terzi), peso binario, resa offline.
  Tile offline NON richiesti in prima battuta: la mappa può degradare con un messaggio
  quando offline (i dati pin restano locali).

**Dati geografici già in casa:** ogni riga ha `geopoint`/lat-lon dove la sorgente li
fornisce (cantieri `pinpoint`, commercio `geopoint`, eventi `coordinate`, segnalazioni
`geopoint`; edilizia NO — solo `codvia`+`zone`). La colonna `extra` NON contiene oggi le
coordinate per tutte le sorgenti: verificare per-sorgente e, se mancano, aggiungerle a
`extra` nei normalizer (migrazione non necessaria, `extra` è già JSON).

**Geocoding on-device (alert raggio "entro 300 m"):** cercare nel catalogo ODS Bologna il
gazzetteer vie/civici con coordinate (probe: `suggest("civici")` / `suggest("numeri
civici")` / `suggest("vie")` su
`https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets`). L'indirizzo
dell'utente si geocoda contro quel dataset scaricato in locale — NIENTE servizi di
geocoding esterni (regola no-backend/no-tracking). Distanza: haversine pura in `lib/`,
testabile in vitest.

**Layer statici (fase 2 di P4):** `farmacie`, `elenco-delle-scuole`,
`zona-a-traffico-limitato`, `mercati-e-fiere` — reference senza date, download una tantum,
solo vista mappa, NON entrano nel feed né nelle notifiche.

---

## 4c. P5 — Multi-città: protocollo data-driven — **CHIUSA, solo Bologna** (ago 2026)

> **Decisione finale (ago 2026):** l'app resta focalizzata su Bologna. Con questa decisione
> l'icona è tornata alle **Due Torri** originali (il vincolo "segno neutro multi-città" non
> esiste più: le Torri SONO l'identità). Il protocollo sotto resta solo come riferimento.

Decisione del proprietario: non vincolare l'app a una città — **se i dati di altre città
lo permettono, supportarle**. Il vincolo reale non è il codice (P0-P2 ha reso il costo
marginale minimo: 1 sorgente = 1 entry registry + 1 schema zod + 1 normalizer): è che i
dati NON sono standardizzati. Tre problemi concreti:

1. **Piattaforme diverse.** Bologna = Opendatasoft (ODS); la maggioranza delle città
   italiane (Milano, Torino, Roma, Firenze…) = CKAN; API/paginazione/query diverse. Il
   transport attuale (`fetch-page`/`ods-request`/`paginate`, cap `MAX_OFFSET` 9900) è
   ODS-only → una seconda piattaforma richiede un adapter CKAN (prerequisito tecnico).
2. **Schemi diversi ovunque.** Anche a parità di piattaforma ogni città inventa i propri
   campi. Gli schemi di Bologna sono nati da probe LIVE dell'API (es. la scoperta di
   `n_e_anno_prot_domanda` senza campo id). Ogni città × ogni categoria = un ciclo
   probe→schema→normalizer→test. Non automatizzabile alla cieca: verificare sempre contro
   l'API reale.
3. **Disponibilità diseguale + fatti locali.** Bologna è tra le migliori d'Italia (701
   dataset, aggiornamenti quotidiani); molte città non hanno un dataset pratiche, o solo
   CSV annuali senza API. E ogni città porta i suoi fatti: lista quartieri, gazzetteer,
   normalizzazione nomi zona.

**Protocollo (l'automazione può eseguire i passi 1-2 da subito):**

1. **Audit città candidata** (solo ricerca, zero codice): identificare il portale open data,
   la piattaforma (ODS/CKAN/altro), e per ognuna delle 5 categorie: esiste un dataset? ha
   API? campo data? campo quartiere/zona? geopoint? frequenza di aggiornamento? Output: una
   scheda per città in `docs/cities/<città>.md` con punteggio.
2. **Soglia di ammissione:** ≥2 categorie disponibili via API con aggiornamento almeno
   mensile, di cui almeno una "quotidianamente utile" (cantieri o segnalazioni o eventi).
   Sotto soglia → la città non si integra (si rivaluta periodicamente).
3. **Integrazione** (solo per città sopra soglia): eventuale adapter piattaforma (una
   volta per piattaforma), config città (`lib/city.ts` da P3), N sorgenti nel registry con
   schema+normalizer probati live, gazzetteer quartieri, test per sorgente. Stessa
   disciplina di P1/P2 (design → implementazione → revisione avversariale).

## 5. Cosa NON fare (deciso ora, per non ridiscuterlo)

- Niente sync di telemetria sensori (parcheggi/wifi/varchi/bici) — stream, non eventi.
- Niente dataset con dati quasi-personali (welfare) — mai, nemmeno "anonimizzati".
- Niente backend/accounts — se una feature lo richiede, la feature è sbagliata.
- Niente i18n runtime finché non c'è la seconda lingua reale (l'app resta italiana).
