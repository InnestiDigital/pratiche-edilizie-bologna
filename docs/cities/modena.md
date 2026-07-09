# Modena — scheda audit portale open data (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare. **Solo ricerca — zero
codice** (nessun adapter, nessuna entry registry, nessuno schema: la §4c passo 3 è gated su una città
che supera la soglia).

Prima città **Emilia-Romagna** auditata (le 4 precedenti — Firenze, Milano, Torino, Roma — erano i
grandi CKAN nazionali). Metodo = stesso probe LIVE che ha prodotto gli schemi di Bologna: ogni endpoint
sotto è stato interrogato realmente il 2026-07-09; i nomi campo citati vengono dalla risposta reale.

## Portale & piattaforma

- **Portale:** https://opendata.comune.modena.it — "Open Data - Comune di Modena".
- **Piattaforma:** **CKAN 2.8.9** con **DataStore ATTIVO** (estensioni `datastore`, `datapusher`,
  `stats`, `dcat`, `harvest`, `spatial_query`, `modenatheme` + il pacchetto `dcatapit_*`/`multilang`).
  `status_show` → `ckan_version: "2.8.9"`, `success:true`. **NON è Opendatasoft** (mandato #2 elencava
  Modena come città ER accettabile a prescindere dalla piattaforma).
- **Base API CKAN:** `https://opendata.comune.modena.it/api/3/`
  - `action/package_list` → **146** dataset id. ✔ `success:true`.
  - `action/package_show?id=<id>` → metadati + resources con `datastore_active` e `format`.
  - `action/datastore_search?resource_id=<rid>` → ✔ query per-riga paginata (dove `datastore_active`).

### La piattaforma NON è il freno — lo è la manutenzione

Come Milano, Modena ha CKAN + DataStore: dove una risorsa CSV ha `datastore_active:true` risponde a
`datastore_search` (adapter CKAN datastore ipotizzato in §4c, non il file-download di Firenze). Il freno
qui è ancora più netto: le categorie giuste **esistono** (Modena è l'UNICA città auditata con un dataset
`pratiche edilizie`), ma i feed civici sono **congelati** — pubblicazione interrotta anni fa. La §4c
richiede aggiornamento **almeno mensile**: un dataset fermo al 2023/2024 non è una categoria "live".

## Audit per categoria (le 5 dell'app)

| Categoria | Dataset via API? | Data | Zona | Geopoint | Freq. dichiarata | Freq. reale | Verdetto |
|---|---|---|---|---|---|---|---|
| **edilizia** (PDC/SCIA) | ⚠️ esiste ma solo download | ✅ | civico | civico/catasto | WEEKLY | **ferma 02/2023** | **CONGELATO** |
| **cantieri** (lavori/scavi) | ❌ nessun dataset | — | — | — | — | — | **ASSENTE** |
| **commercio** | ⚠️ CSV datastore | reg. | no | no | WEEKLY | **ferma 09/2022** | **CONGELATO** |
| **eventi** | ⚠️ CSV datastore | ✅ | no | ✅ lat/lon | WEEKLY | **ferma 03/2024** | **CONGELATO** |
| **segnalazioni** | ❌ nessun dataset | — | — | — | — | — | **ASSENTE** |

### edilizia — CONGELATO (categoria core presente ma morta)

`banca-dati-pratiche-edilizie` — **il primo dataset di pratiche edilizie trovato fuori Bologna** (in tutte
le 4 audit precedenti l'edilizia era del tutto ASSENTE). Sarebbe esattamente la categoria core dell'app.

- **`package_show`:** `title: "Banca dati pratiche edilizie"`; notes: «elenco di permessi di costruire e
  SCIA rilasciate, così come pubblicati presso l'Albo Pretorio». **Il servizio di pubblicazione è stato
  interrotto il 20/02/2023** per cambi al sistema software (dichiarato nelle notes stesse). `frequency`
  dichiarata `WEEKLY` ma le risorse hanno `last_modified: 2023-03-08` — ferme da oltre 3 anni.
- **Risorse:** WFS + 2 CSV (`Pratiche edilizie 1900-1999`, `2000-ad oggi`) — **tutte
  `datastore_active:false`**: solo download di file interi, **nessun `datastore_search`** per-riga. Come
  Firenze servirebbe un adapter file-download, non l'adapter datastore.
- Le notes indicano che sarebbe georeferenziabile via civici/riferimenti catastali (schema promettente),
  ma è irrilevante: il feed è **fermo dal 2023**. **CONGELATO.**

### eventi — CONGELATO (schema perfetto, feed morto)

`eventi-su-monet` — eventi pubblicati sul portale comunale MONET. Sulla carta **il feed non-bolognese con
lo schema migliore visto finora**: CSV con `datastore_active:true` (resource
`ae234156-2a1a-46e7-a15d-7a13928b0aa1`) → `datastore_search` per-riga.

- **Campi reali (citati, non inventati):** `_id`, `FID`, `TITOLO`, `INDIRIZZO_WEB`, `DESCRIZIONE`,
  **`DATA_INIZIO`**, **`DATA_FINE`**, `ORARI`, `SEDE`, `INDIRIZZO`, `CAP`, `CITY`, `CONTATTI`,
  `DATA_CREAZIONE`, `DATA_MODIFICA`, **`LATITUDINE`**, **`LONGITUDINE`**, `SHAPE`.
  - ✔ data (inizio+fine evento) ✔ geopoint (lat/lon + SHAPE WKT) ✔ id (`FID`) — ✗ zona (nessun campo
    quartiere/circoscrizione; solo coordinate + indirizzo).
- **`datastore_search` (`sort=_id desc`):** `total: 500`, ma la riga più recente ha
  `DATA_MODIFICA: 2024-03-26` e `DATA_INIZIO` degli ultimi eventi = **2024-03-30**. `metadata_modified`
  del pacchetto = `2025-03-04`. Nonostante `frequency: WEEKLY`, il contenuto è **fermo a marzo 2024** (~2
  anni). Un calendario eventi fermo a 2 anni fa non è "quotidianamente utile". **CONGELATO.**

### commercio — CONGELATO / registro (non un feed datato)

`esercizi-commerciali-ok` — «elenco aggiornato settimanalmente delle strutture adibite a esercizi
commerciali dai dati gestionali SUAP». CSV con `datastore_active:true` (`758937f7-…`).

- `frequency: WEEKLY` dichiarata, ma `metadata_modified: 2022-09-26` e le risorse `last_modified:
  2022-09-26` — **ferme da ~4 anni.** È inoltre un **registro** di esercizi attivi (anagrafica SUAP), non
  un feed di pratiche datate per-riga tipo il `commercio` di Bologna. **CONGELATO + registro.**
- Analoghi congelati/registro: `attivita-artigianali-ok`, `esercizi-per-somministrazione-alimenti-e-bevande`,
  `ristoranti`, `strutture-ricettive`, `spettacolo-viaggiante-e-giostrai` (licenze spettacolo viaggiante,
  non un calendario) — stessa classe anagrafica SUAP, nessuno un feed civico datato + aggiornato.

### cantieri — ASSENTE

`package_list` (146 id) + `package_search` (OR `cantieri`/`scavi`/`manomissione`/`lavori`/`strade`/
`mobilita`/`traffico`) → **nessun dataset** di cantieri/scavi/lavori stradali. **ASSENTE.**

### segnalazioni — ASSENTE

`package_search` (OR `segnalazioni`/`reclami`/`urp`) → `count: 0`. Nessun dataset di reclami/disservizi
cittadini tipo il `segnalazioni` di Bologna. **ASSENTE.**

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie via API con freq **reale** ≥ mensile: **0**. Tutte e tre le categorie presenti (edilizia,
  eventi, commercio) sono **congelate** (ultimo aggiornamento reale 2023 / 2024 / 2022); cantieri e
  segnalazioni assenti. ❌ (serve ≥2 live)
- Di cui quotidianamente utili e live: **0**. ❌

**➡️ SOTTO SOGLIA.** Modo di fallimento **diverso** da Milano: lì mancava la *copertura* (una sola
categoria live); qui la copertura **esiste** (edilizia + eventi + commercio, schemi giusti, geopoint,
date) ma è **abbandonata** — nessun feed è più aggiornato. La §4c passo-2 filtra sulla freschezza, e
Modena non ha nemmeno un feed live.

## Raccomandazione

1. **Non integrare Modena.** Zero categorie live ≥ mensile. Anche l'edilizia — presente solo qui — è
   ferma dal 2023 e senza `datastore_search`.
2. **Insight P5:** Modena dimostra che il vincolo P5 non è solo "la categoria esiste?" ma **"il feed è
   ancora vivo?"**. È la città con la **miglior copertura di categorie** vista (unica con pratiche
   edilizie + un eventi con date+geopoint), eppure fallisce perché i comuni pubblicano un dataset una
   volta e poi lo lasciano marcire. Raffinamento §4c: verificare sempre la **data reale dell'ultima riga**
   via `datastore_search sort=_id desc`, non la `frequency` dichiarata (Modena dichiara `WEEKLY` su feed
   fermi da anni).
3. **Rivalutare solo se Modena riprende la pubblicazione** — se `banca-dati-pratiche-edilizie` tornasse
   live E guadagnasse un `datastore` (o eventi ripartisse), il costo d'integrazione resterebbe adapter
   CKAN datastore (come Milano). Ma è un "se" a monte fuori dal nostro controllo.

## 🅿️ P5 audit track — PARCHEGGIATO (5 città, 0 promosse)

Con Modena l'audit multi-città arriva a **5 città auditate, 0 sopra soglia**: Firenze (no DataStore),
Milano (1 sola categoria live), Torino (0 categorie live, portale ad aggregati), Roma (sotto soglia),
Modena (categorie presenti ma tutte congelate). Il pattern è deciso: **fuori Bologna, i feed civici
per-record datati+aggiornati non esistono o sono abbandonati** — nessuna città replica la ricchezza+
freschezza dell'open data di Bologna. Per direttiva (mandato #2, 2026-07-09): **il track P5 audit è
PARCHEGGIATO — non accodare altre città** finché non emerge un segnale reale (una città che riprende a
pubblicare feed live) o Matteo redirige. Il tedium-veto governa: multi-città ha valore solo se una città
supera davvero la §4c.

## Endpoint probati (per riproducibilità)

- `https://opendata.comune.modena.it/api/3/action/status_show` → `ckan_version:"2.8.9"`, estensioni
  `datastore`/`datapusher`/`spatial_query`/`modenatheme`.
- `…/action/package_list` → 146 id (grep categorie → `banca-dati-pratiche-edilizie`, `eventi-su-monet`,
  `esercizi-commerciali-ok`, `attivita-artigianali-ok`, `ristoranti`, `strutture-ricettive`,
  `spettacolo-viaggiante-e-giostrai`; nessun cantieri/segnalazioni).
- `…/action/package_show?id=banca-dati-pratiche-edilizie` → `frequency:WEEKLY`, notes «pubblicazione
  interrotta il 20/02/2023», risorse WFS+2×CSV tutte `datastore_active:false`, `last_modified:2023-03-08`.
- `…/action/package_show?id=eventi-su-monet` → `frequency:WEEKLY`, `metadata_modified:2025-03-04`, CSV
  `ae234156-…` `datastore_active:true`.
- `…/action/datastore_search?resource_id=ae234156-2a1a-46e7-a15d-7a13928b0aa1&sort=_id desc` → `total:500`,
  campi incl. `DATA_INIZIO`/`DATA_FINE`/`LATITUDINE`/`LONGITUDINE`; riga più recente `DATA_MODIFICA:
  2024-03-26`, eventi al `2024-03-30`.
- `…/action/package_show?id=esercizi-commerciali-ok` → `frequency:WEEKLY`, `metadata_modified:2022-09-26`,
  CSV `758937f7-…` `datastore_active:true`.
- `…/action/package_search?q=segnalazioni OR reclami OR cantieri OR scavi OR manomissione OR urp` →
  `count:0`.
