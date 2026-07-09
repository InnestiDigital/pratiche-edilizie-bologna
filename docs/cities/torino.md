# Torino — scheda audit portale open data (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare ora, rivalutare
periodicamente. **Solo ricerca — zero codice** (nessun adapter, nessuna entry registry, nessuno
schema: la §4c passo 3 è gated su una città che supera la soglia).

Metodo = stesso probe LIVE che ha prodotto gli schemi di Bologna: ogni endpoint sotto è stato
interrogato realmente il 2026-07-09; i nomi campo / date citati vengono dalla risposta reale, non
inventati.

## Portale & piattaforma

- **Portale:** https://aperto.comune.torino.it — "aperTO — Sito degli Open Data del Comune di Torino".
- **Piattaforma:** **CKAN 2.9.11** standard (path API canonico `action/…`, come Milano; più recente
  del 2.8.12 milanese e del 2.8.x fiorentino). `status_show` → `ckan_version: "2.9.11"`, `locale_default:
  "it"`, forte stack **DCAT-AP_IT** (`dcatapit_*`, molte estensioni di harvesting/vocabolario).
- **Base API CKAN:** `https://aperto.comune.torino.it/api/3/`
  - `action/package_search?rows=0` → **2090** dataset. ✔ `success:true`.
  - `action/package_show?id=<id>` → metadati + resources con `format` (**mai** `datastore_active:true`).
  - ⚠️ **`action/datastore_search` NON esiste** → risposta `"Action name not known: datastore_search"`.

### ❌ Freno di piattaforma — DataStore ASSENTE (come Firenze, a differenza di Milano)

Il fattore che a Firenze ha bloccato tutto a monte si ripete qui: **`datastore` NON è tra le estensioni
attive** (`status_show.extensions` elenca `stats, harvest, spatial_*, multilang, dcat, dcatapit_*, …`
ma **nessun `datastore`/`datastore_search`**), e ogni risorsa probata ha `datastore_active: None`.
`datastore_search` risponde `"Richiesta non valida - Action name not known: datastore_search"`.

Conseguenza per l'app: le risorse sono **file interi** (CSV, spesso zippati in `ZIP (CSV)`/`ZIP (SHP)`,
oltre a XLS/XLSX). Un'eventuale integrazione richiederebbe l'**adapter file-download** (scaricare l'intero
file, non paginare per riga), NON l'adapter `datastore_search` più leggero. "CKAN" da solo non predice il
transport: Torino conferma il raffinamento §4c già emerso a Firenze/Milano — **verificare sempre
`datastore_active`/estensione `datastore` prima di assumere l'adapter**.

## Audit per categoria (le 5 dell'app)

| Categoria | Dataset live via API? | Data | Zona | Geopoint | Frequenza | Verdetto |
|---|---|---|---|---|---|---|
| **edilizia** (PDC/SCIA/CILA) | ❌ nessun feed pratiche | — | — | — | — | **ASSENTE** |
| **cantieri** (lavori/strade) | ⚠️ `cantieri-attivi` congelato 2019 | — | — | (SHP) | IRREG (fermo) | **INSUFFICIENTE** |
| **commercio** | ⚠️ solo archivi annuali per-anno | anno | — | no | annuale/fermo | **INSUFFICIENTE** |
| **eventi** | ❌ solo prenotazioni sale/patrocini fino 2018 | — | — | — | — | **ASSENTE** |
| **segnalazioni** | ❌ solo riepiloghi PM aggregati fino 2018 | — | — | — | — | **ASSENTE** |

### cantieri — INSUFFICIENTE (esiste ma congelato + file-only)

`cantieri-attivi` (`package_show?id=cantieri-attivi`) è il candidato più vicino: *"tutti i cantieri
attivi presenti sul territorio del Comune di Torino, distinti in intervento, guasto o allacciamento"* —
concettualmente l'equivalente del `cantieri` di Bologna. Ma:

- **`frequency: IRREG`**, **`metadata_modified: 2019-05-17`** → fermo da ~7 anni, non un feed vivo.
- Risorse = **`ZIP (CSV)`** + **`ZIP (SHP)`**, entrambe **`datastore_active: None`** → nessuna query
  per-riga; l'adapter dovrebbe scaricare + scompattare + parsare l'intero archivio.
- Nessuna delle due condizioni della soglia (API per-riga + aggiornamento ≥ mensile) è soddisfatta.

I dataset **freschi** in area lavori/opere pubbliche (i più recenti dell'intero portale, `metadata_modified
2026-07-01/03`) sono **aggregati statistici, non feed per-cantiere**:
- `interventi-pnrr-pnc` (`IRREG`, 2026-07-01) — *"riepilogo degli interventi PNRR e PNC"*, 8 risorse **XLSX**
  (nessuna datastore).
- `indicatori-delle-opere-pubbliche-2026` / `-2025` (`ANNUAL`) — *"indicatori di realizzazione delle opere
  pubbliche … per ogni mese dell'anno"*, risorse **XLS** aggregate.
- `servizi-tecnici-attinenti-all-ingegneria-e-all-architettura-2019…2025` — bandi/servizi tecnici
  (procurement), non pratiche/cantieri geolocalizzati.

Il portale è quindi **manutenuto attivamente** (commit 2026-07), ma solo su statistiche/appalti aggregati:
nessun feed cantieri per-record datato+zonato+geo. **INSUFFICIENTE.**

### edilizia — ASSENTE

Ricerche `edilizia` (13), `permessi`/`costruzioni`/`scia`/`cila` (0 pertinenti):
- `indicatori-di-performance-dei-servizi-di-sportello-urbanistica-edilizia-2018` (+ occupazioni suolo
  pubblico 2016–2018) = **indicatori di customer-satisfaction/performance** dello sportello, non le pratiche.
- `maglie-archivio-edilizio` = griglia geografica dell'archivio (reference geometrico), non un feed di titoli.
- `annuario-statistico-*` = statistiche aggregate cittadine.
- Nessun feed PDC/SCIA/CILA per-pratica con data/zona (le pratiche passano dallo SUE, non pubblicate come
  open data). La categoria core dell'app **non esiste** — come a Firenze e Milano. **ASSENTE.**

### commercio — INSUFFICIENTE (archivi annuali per-anno)

Ricerca `commercio` (78) / `esercizi` (32) / `mercati` (33): tutti dataset **stampigliati per anno**:
- `attivita-commerciali-presenti-2019`, `attivita-commerciali-chiuse-2015…2018` — `frequency: ANNUAL`,
  `metadata_modified` 2020, aggregati/archivio per anno (non filing per-esercizio aggiornato per-riga).
- `esercizi-turistici-1994-2018`, `esercizi-turistici-per-qualifica-2015…2018` = serie storiche congelate.
- `mercati` / `mercati-tematici-per-quartiere` (`IRREG`, 2019, CSV senza datastore) = anagrafica statica
  dei mercati, reference non-feed.
- Nessun equivalente del `commercio` di Bologna (pratiche d'impresa aggiornate per-riga con data e zona).
  **INSUFFICIENTE.**

### eventi — ASSENTE

Ricerca `eventi` (7) / `manifestazioni` (0): `prenotazioni-sale-auliche-2016…2018`, `patrocini-2016…2018`
= registri amministrativi congelati al 2018, e comunque non un calendario eventi pubblico. Nessuna agenda
eventi live. **ASSENTE.**

### segnalazioni — ASSENTE

Ricerca `segnalazioni` (10) / `reclami` (1) / `disservizi` (0) / `decoro` (0): solo
`esposti-e-segnalazioni-polizia-municipale-2017`, `riepilogo-segnalazioni-contact-center-polizia-municipale-2015…2018`
= **riepiloghi aggregati** delle segnalazioni alla PM, congelati al 2018, senza singola segnalazione
datata/geolocalizzata. Nessun feed reclami/disservizi tipo il `segnalazioni` di Bologna. **ASSENTE.**

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie via API con dati per-record e freq ≥ mensile: **0** (cantieri esiste ma congelato 2019 +
  file-only; tutto il resto è aggregato o storico). ❌ (serve ≥2)
- Di cui quotidianamente utili: **0**. ❌

**➡️ SOTTO SOGLIA** — l'esito più netto finora. Peggio di Milano (che aveva 1 categoria live, cantieri
quotidiano) e allineato a Firenze sul freno di piattaforma (nessun DataStore → adapter file-download).

## Raccomandazione

1. **Non integrare Torino ora.** Zero categorie con feed per-record vivo; la categoria core (edilizia) è
   assente e persino i `cantieri-attivi` sono congelati al 2019.
2. **Doppio freno, non solo copertura.** A differenza di Milano (piattaforma pulita, blocco = solo dati),
   Torino somma **(a)** dati non feed-shaped **e (b)** nessun DataStore → l'eventuale integrazione futura
   richiederebbe *sia* un feed nuovo *sia* l'adapter file-download più pesante. Candidato debole.
3. **Cosa cambierebbe l'esito:** se Torino pubblicasse un feed cantieri/segnalazioni per-record aggiornato
   (come il suo portale già fa, ma solo per statistiche aggregate) scatterebbe verso la soglia — ma
   servirebbe comunque l'adapter file-download (nessun `datastore_search`). Improbabile a breve.
4. **Rivalutare periodicamente**, priorità bassa: il portale è vivo e ben strutturato (CKAN 2.9.11,
   DCAT-AP_IT), ma pubblica il tipo sbagliato di dato per l'app (indicatori/appalti, non feed civici).
5. **Prossimo candidato §4c (un city per pass):** **Roma** (`dati.comune.roma.it` / dati aperti Roma
   Capitale) — probare piattaforma + `datastore_active` PRIMA, come per Milano/Firenze/Torino.

## Endpoint probati (per riproducibilità)

> Nota: aperTO risponde **403 nginx** a `curl` senza `User-Agent` browser — le probe usano un UA Chrome.

- `https://aperto.comune.torino.it/api/3/action/status_show` → `ckan_version:"2.9.11"`, extensions **senza
  `datastore`**.
- `…/action/package_search?rows=0` → `count:2090`.
- `…/action/package_show?id=cantieri-attivi` → `frequency:IRREG`, `metadata_modified:2019-05-17`, risorse
  `ZIP (CSV)` + `ZIP (SHP)`, `datastore_active:None`.
- `…/action/datastore_search?resource_id=…` → `"Action name not known: datastore_search"` (DataStore off).
- `…/action/package_search?q=*:*&sort=metadata_modified desc&rows=10` → i più freschi (2026-07) =
  `servizi-tecnici-…-ingegneria-architettura-*`, `indicatori-delle-opere-pubbliche-2025/2026`,
  `interventi-pnrr-pnc` — tutti XLS/XLSX aggregati.
- `…/action/package_show?id=interventi-pnrr-pnc` → `IRREG`, 8 risorse **XLSX**, `datastore_active:None`.
- `…/action/package_show?id=indicatori-delle-opere-pubbliche-2026` → `ANNUAL`, risorse **XLS** aggregate.
- `…/action/package_show?id=attivita-commerciali-presenti-2019` → `ANNUAL`, CSV `datastore_active:None`.
