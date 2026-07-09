# Firenze — scheda audit portale open data (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare ora, rivalutare
periodicamente. **Solo ricerca — zero codice** (nessun adapter, nessuna entry registry, nessuno
schema: la §4c passo 3 è gated su una città che supera la soglia).

Metodo = stesso probe LIVE che ha prodotto gli schemi di Bologna: ogni endpoint sotto è stato
interrogato realmente il 2026-07-09; i nomi campo citati vengono dalla risposta reale, non inventati.

## Portale & piattaforma

- **Portale:** https://opendata.comune.fi.it (front-end) — catalogo dati.
- **Piattaforma:** **CKAN**, ma con path API non standard e **senza DataStore**.
- **Base API CKAN:** `https://data.comune.fi.it/datastore/api/`
  - `package_list` → elenco di tutti i dataset id. ✔ risponde `{"success":true}`.
    Probe: `https://data.comune.fi.it/datastore/api/package_list`
  - `package_show?id=<id>` → metadati di un dataset. ✔ risponde.
  - `package_search?q=<term>` → ✔ risponde ma la ricerca è **debole**: query multi-termine
    (`edilizia permesso costruire scia`) → `count: 0`. Non affidabile per il discovery; ho usato
    `package_list` + grep sui nomi.
- **Doc sviluppatori:** https://opendata.comune.fi.it/sviluppatori — espone SOLO `package_list` e
  `package_show`; nessun `datastore_search` documentato.

### ⛔ Blocco di piattaforma #1 — nessun DataStore (no API per-riga paginata)

In **ogni** `package_show` probato i resource hanno **`datastore_active: false`**. Firenze NON
espone l'endpoint CKAN `datastore_search` (query SQL/JSON paginata per riga). Le risorse sono
**file da scaricare interi** (GeoJSON / KML / CSV / SHAPE / KMZ), con URL dietro un redirect 302
(`data.comune.fi.it/datastore/download.php?...` → `wwwext.comune.fi.it/opendata/files/<file>`).

Conseguenza per l'app: il transport attuale è ODS con **offset-paging** (`fetch-page` /
`paginate`, cap `MAX_OFFSET` 9900). Firenze richiederebbe non un "adapter CKAN datastore" (come
assunto in §4c) ma un **adapter file-download** diverso da entrambi: scaricare l'intero file e
parsarlo in memoria, seguendo il redirect. Prerequisito tecnico **più pesante** del previsto.

## Audit per categoria (le 5 dell'app)

| Categoria | Dataset live via API? | Data | Zona | Geopoint | Frequenza | Verdetto |
|---|---|---|---|---|---|---|
| **edilizia** (PDC/SCIA/CILA) | ❌ nessun dataset pratiche | — | — | — | — | **ASSENTE** |
| **cantieri** (lavori/strade) | ❌ nessun feed live | — | — | — | — | **ASSENTE** |
| **commercio** | ⚠️ solo storici congelati / KML statico | no | no | KML | congelato | **INSUFFICIENTE** |
| **eventi** | ✅ `eventi-a-firenze` | ✅ | ✅ | ✅ | **quotidiana** | **OK (unica)** |
| **segnalazioni** | ❌ nessun dataset | — | — | — | — | **ASSENTE** |

### edilizia — ASSENTE

Grep `package_list` per `edil|permess|costru|scia|cila|pratic`:
- `prenotazione_appuntamento_edilizia_urbanistica_gennaio_aprile_2019` (+ `maggio_agosto_2019`) —
  registri di **prenotazione appuntamenti allo sportello**, congelati al 2019. Non sono pratiche.
- `permessi-ztl-rilasciati-anno-2012` (+ 2013–2015) — permessi **ZTL**, non edilizi, congelati.
- Nessun dataset di permessi di costruire / SCIA / CILA. La categoria core dell'app **non esiste**
  come open data a Firenze (probabile: le pratiche edilizie passano da altro sistema non pubblicato).

### cantieri — ASSENTE

Grep `cantier|tramv|lavori|scavo|strada|viabilita`:
- I match `TdF-*` (`TdF-Viabilita-2706`, `TdF-Divieti-Sosta-2906`, `TdF-Percorso-2906`…) sono le
  chiusure per il **Grande Départ del Tour de France 2024** — evento una-tantum, non un feed di
  cantieri. `strade-da-riqualificare`, `po_infrastrutture-*` = pianificazione statica.
- La ricerca web menziona i cantieri della **tramvia** (linee 2/3) come elementi **areali
  SHAPE/statici**, non un feed aggiornato di roadworks tipo il `cantieri` di Bologna.
- Nessun feed live di lavori/scavi stradali. **ASSENTE** come categoria "quotidianamente utile".

### commercio — INSUFFICIENTE (congelato / statico)

Grep `commerci|esercizi|mercat|sportello|suolo`:
- `accessi-sportello-commercio-sede-fissa-2009-2011`, `accessi-sportello-suolo-pubblico-e-taxi`,
  `accessi-sportello-industria-artigianato-e-servizi` — serie storiche **2009–2011**, congelate.
- `Esercizi-Commerciali-emergenza-covid19` — snapshot COVID, congelato.
- `mercati` (`package_show` → **"Mercati Storici"**): risorsa **KML** statica + WMS,
  `datastore_active: false`, `metadata_modified: 2023-02-23`, `frequency: AS_NEEDED`. È una mappa
  di posizione, non un feed di depositi/pratiche commerciali.
- Nessun equivalente del `commercio` di Bologna (filing d'impresa aggiornati). **INSUFFICIENTE.**

### eventi — OK (unica categoria valida)

- **Dataset:** `eventi-a-firenze` — `package_show`:
  `https://data.comune.fi.it/datastore/api/package_show?id=eventi-a-firenze`
- **Note (citazione dal portale):** *"Il dato contiene gli eventi in città dalla data odierna a 30
  giorni solari, come da programmazione ufficiale esposta sul sito www.FeelFlorence.it.
  **L'aggiornamento è quotidiano**…"* → frequenza **giornaliera** = ben oltre la soglia mensile,
  ed è una categoria **"quotidianamente utile"** ai sensi §4c.
- **Risorsa:** una risorsa etichettata `GeoJSON`, `datastore_active: false`, URL dietro redirect
  302 → `https://wwwext.comune.fi.it/opendata/files/eventi.json`.
- ⚠️ **Nota formato:** il file NON è un `FeatureCollection` GeoJSON malgrado l'etichetta — è un
  **array JSON di oggetti evento**. Le coordinate sono annidate (vedi sotto), non nella top-level
  `geometry`. Un normalizer dovrebbe leggerle da lì, non assumere GeoJSON standard.
- **Campi reali del primo record (citati, non inventati):** `id`, `name`, `desc_long`,
  `desc_short`, `macrocategory`, `category_main`, `category_sec`, `city`, **`florence_district`**
  (= zona/quartiere), `tags`, `child_friendly`, `websites`, `replicas`, **`last_updated`**.
  - **Data:** dentro `replicas[].timetable`: `date_since_to` (es. `"25/06/2025 , 26/06/2025"`),
    `time_since` (`"09:00"`), `time_to` (`"18:00"`).
  - **Geopoint:** dentro `replicas[].` → `poi_latitude` / `poi_longitude` (+ `poi_address`).
  - **Zona:** `florence_district`. ✔ data ✔ zona ✔ geopoint ✔ id ✔ aggiornamento quotidiano.

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie via API con freq ≥ mensile: **1** (solo `eventi`). ❌ (serve ≥2)
- Di cui quotidianamente utili: 1 (`eventi`). ✔ (ma irrilevante se la prima condizione fallisce)

**➡️ SOTTO SOGLIA.** Basta la sola `eventi`: manca la seconda categoria. In più il blocco di
piattaforma (no DataStore → serve un adapter file-download nuovo) aumenta il costo d'integrazione
anche volendo forzare.

## Raccomandazione

1. **Non integrare Firenze ora.** Una sola categoria live (eventi) + nessun feed edilizia/cantieri/
   segnalazioni + commercio congelato. L'edilizia — categoria core dell'app — è del tutto assente.
2. **Prerequisito reale se un giorno risalisse sopra soglia:** un **adapter file-download**
   (scarica intero GeoJSON/JSON/CSV seguendo il redirect 302 + parse in memoria), non l'adapter
   "CKAN datastore" ipotizzato in §4c — Firenze non ha DataStore. Questo raffina §4c: "adapter CKAN"
   ≠ garanzia di `datastore_search`; verificare `datastore_active` prima di assumere un'API per-riga.
3. **Rivalutare periodicamente** se Firenze pubblica pratiche edilizie o un feed cantieri/
   segnalazioni con API/aggiornamento regolare.
4. **Prossimo candidato (pass futuro, non questo):** provare **Milano** (`dati.comune.milano.it`,
   CKAN) — portale più grande; verificare per prima cosa se espone `datastore_search`
   (`datastore_active: true`), il fattore che qui ha bloccato Firenze a monte.

## Endpoint probati (per riproducibilità)

- `https://data.comune.fi.it/datastore/api/package_list` → `success:true`, lista completa id.
- `https://data.comune.fi.it/datastore/api/package_show?id=eventi-a-firenze` → GeoJSON, quotidiano,
  `datastore_active:false`.
- `https://data.comune.fi.it/datastore/api/package_show?id=mercati` → "Mercati Storici", KML,
  `metadata_modified:2023-02-23`.
- `https://data.comune.fi.it/datastore/api/package_search?q=edilizia+permesso+costruire+scia` →
  `count:0`.
- `https://wwwext.comune.fi.it/opendata/files/eventi.json` → array JSON di eventi (campi sopra).
- Doc: `https://opendata.comune.fi.it/sviluppatori`.
