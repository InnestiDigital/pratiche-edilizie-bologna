# Milano — scheda audit portale open data (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare ora, rivalutare
periodicamente (è il candidato più vicino alla soglia visto finora). **Solo ricerca — zero codice**
(nessun adapter, nessuna entry registry, nessuno schema: la §4c passo 3 è gated su una città che
supera la soglia).

Metodo = stesso probe LIVE che ha prodotto gli schemi di Bologna: ogni endpoint sotto è stato
interrogato realmente il 2026-07-09; i nomi campo citati vengono dalla risposta reale, non inventati.

## Portale & piattaforma

- **Portale:** https://dati.comune.milano.it — "Open Data - Comune di Milano".
- **Piattaforma:** **CKAN 2.8.12** standard (path API canonico `action/…`, a differenza di Firenze).
  `status_show` → `ckan_version: "2.8.12"`, estensioni `stats`, `dcat`, `harvest`, `milan_theme`.
- **Base API CKAN:** `https://dati.comune.milano.it/api/3/`
  - `action/package_list` → **2598** dataset id. ✔ `success:true`.
  - `action/package_show?id=<id>` → metadati + resources con `datastore_active` e `format`.
  - `action/datastore_search?resource_id=<rid>` → ✔ **query per-riga paginata** (vedi sotto).

### ✅ Vantaggio di piattaforma — DataStore ATTIVO (a differenza di Firenze)

Il fattore che a Firenze ha bloccato tutto a monte (nessun `datastore_search`, solo file interi) qui
**non c'è**: le risorse **CSV** dei dataset probati hanno **`datastore_active: true`** e rispondono a
`datastore_search` (API SQL/JSON paginata per riga, con `total`, `fields`, `records`, `sort`). Le
gemelle JSON/GeoJSON restano `datastore_active:false` (solo download) ma la CSV indicizzata basta.

Conseguenza per l'app: se un giorno Milano superasse la soglia, il prerequisito tecnico è **l'adapter
CKAN datastore** ipotizzato in §4c (paginazione via `offset`/`limit` su `datastore_search`), NON
l'adapter file-download più pesante che servirebbe a Firenze. Milano è quindi tecnicamente il
candidato "pulito": il blocco è la **disponibilità dei dati**, non la piattaforma.

## Audit per categoria (le 5 dell'app)

| Categoria | Dataset live via API? | Data | Zona | Geopoint | Frequenza | Verdetto |
|---|---|---|---|---|---|---|
| **edilizia** (PDC/SCIA/CILA) | ❌ nessun feed pratiche | — | — | — | — | **ASSENTE** |
| **cantieri** (lavori/strade) | ✅ `ds925_avvisi-di-manomissione` | ✅ | ✅ | ✅ | **quotidiana** | **OK (unica)** |
| **commercio** | ⚠️ solo conteggi aggregati | anno | area | no | annuale/mai | **INSUFFICIENTE** |
| **eventi** | ❌ solo statistiche turismo | — | — | — | — | **ASSENTE** |
| **segnalazioni** | ❌ nessun dataset reclami | — | — | — | — | **ASSENTE** |

### cantieri — OK (categoria valida, forte)

**Il miglior feed non-bolognese trovato finora.** `ds925_avvisi-di-manomissione` = avvisi di
manomissione del suolo (scavi/lavori stradali di utility) = l'equivalente milanese del `cantieri` di
Bologna.

- **`package_show`:** `https://dati.comune.milano.it/api/3/action/package_show?id=ds925_avvisi-di-manomissione`
  → `title: "Avvisi di manomissione"`, **`frequency: DAILY`**, `metadata_modified: 2026-07-09`
  (rigenerato **oggi**). Risorse: **CSV** (`datastore_active:true`), JSON, **GeoJSON** (entrambe
  download-only).
- **`datastore_search`** (CSV `resource_id=4ed6ff36-6d1b-469a-8f57-9b1b292089fb`): `total: 280`
  (finestra corrente rotante). Riga più recente per `_id desc` = **`Data protocollo ingresso:
  2026-07-08`** → feed genuinamente vivo, non congelato.
- **Campi reali (citati, non inventati):** `Feature_ID`, `Numero di protocollo ingresso`
  (es. `300240/2021`), **`Data protocollo ingresso`**, **`Data prevista inizio lavori`**,
  **`Data prevista fine lavori`**, `Totale giorni previsti di lavori`, `Superficie occupata in mq`,
  `Pavimentazione area occupata`, `Tipologia area coinvolta`,
  `Impresa proprietaria area concessione/autorizzazione` (es. `MM Spa`), `Tipo di utility/attività`
  (es. `Acqua potabile`), **`Nome via`** + `Civico … Inizio/Fine intervento`, `Coefficiente
  microzona`, **`Municipio`** (1–9), `CAP`, **`ID_NIL`** + **`NIL`** (es. `ISOLA`, `BICOCCA`),
  **`LONG_X_4326`** / **`LAT_Y_4326`** (WGS84) + `Location`.
  - ✔ data (3 campi data) ✔ zona (`Municipio` + `NIL`) ✔ geopoint (lat/lon 4326) ✔ id
    (`Numero di protocollo ingresso`) ✔ aggiornamento **quotidiano**. Qualità pari a Bologna.

### edilizia — ASSENTE

Grep `package_list` per `edil|permess|costru|scia|cila|pratic|titoli-abilit`:
- `ds…-rilevazione-qualita-servizio-richieste-visure-fascicoli-edilizi-*` (decine, mensili/annuali) —
  sono **indagini di customer-satisfaction** sullo sportello visure, NON le pratiche stesse.
- `ds2983_edilizia-fabbricati-destinati-a-collettivita`, `ds2984-edilizia-nuovi-fabbricati…`,
  `ds2985_edilizia-ampliamenti-fabbricati…` — **statistiche ISTAT aggregate** sui fabbricati, non
  singole pratiche PDC/SCIA/CILA con data/zona.
- `ds1681/ds1682-edilizia-scolastica-*` = arredi/appalti scuole. Nessun feed di titoli edilizi.
- La categoria core dell'app **non esiste** come open data a Milano (le pratiche passano da SUE/portali
  non pubblicati come dataset). **ASSENTE.**

### commercio — INSUFFICIENTE (solo aggregati)

Grep `commerci|esercizi|impres|attivit|vicinato|mercat`:
- `ds2954-attivita-commerciali-serie-storica` — `datastore_search` `total: 88`, campi
  `Anno, Macro Area, Area di Competenza, Stato, N. attivita commerciali` → **conteggi aggregati**
  (es. 2023, "AGENZIA - Viaggi", 474 attività), `frequency: NEVER`. Non sono filing per-esercizio.
- `ds512_commercio-al-dettaglio-…-2003-2025` — `frequency: ANNUAL`, aggregati esercizi/superficie.
- `ds49-…-esercizi-vicinato-sede-fissa`, `ds58/ds59-…-pubblici-esercizi-in/fuori-piano`,
  serie ricettive/extra-alberghiere 2003–2019 = tutte **congelate o aggregate**.
- Nessun equivalente del `commercio` di Bologna (depositi/pratiche d'impresa aggiornati per-riga con
  data e zona). **INSUFFICIENTE.**

### eventi — ASSENTE

Grep `eventi|manifestazioni|spettacol|agenda|turismo`:
- `ds157-cultura-ingressi-spettacoli-manifestazione-1995-2010` = serie storica congelata.
- `ds2468_eventi-digitali-della-milano-digital-week-2023` = snapshot 2023.
- `ds210…ds374-turismotempolibero-*` = **statistiche arrivi/presenze** turistiche, non un calendario
  eventi. Gli eventi live di Milano vivono su YesMilano (non open data). **ASSENTE.**

### segnalazioni — ASSENTE

Grep `segnal|reclam|urp|decoro|buche|municipio`: i match `municipio` sono anagrafe/proiezioni
demografiche e registri associazioni (`ds1333…ds1351`), non segnalazioni cittadine. Nessun dataset di
reclami/disservizi tipo il `segnalazioni` di Bologna. **ASSENTE.**

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie via API con freq ≥ mensile: **1** (solo `cantieri` = ds925, quotidiana). ❌ (serve ≥2)
- Di cui quotidianamente utili: 1 (`cantieri`). ✔ (ma irrilevante se la prima condizione fallisce)

**➡️ SOTTO SOGLIA.** Manca la seconda categoria: edilizia/eventi/segnalazioni assenti, commercio solo
aggregato. Diversamente da Firenze il **freno non è tecnico** (Milano ha DataStore) ma di copertura.

## Raccomandazione

1. **Non integrare Milano ora.** Una sola categoria live (cantieri) < soglia ≥2. L'edilizia — categoria
   core dell'app — è del tutto assente, come a Firenze.
2. **Milano è però il candidato tecnicamente migliore finora:** CKAN standard + `datastore_search`
   attivo + un feed cantieri quotidiano di qualità pari a Bologna (geo, Municipio, NIL, date). Se un
   giorno pubblicasse **una** seconda categoria live (es. un feed segnalazioni/eventi, o pratiche
   edilizie) scatterebbe sopra soglia con costo d'integrazione basso: **adapter CKAN datastore**
   (paginazione `datastore_search`, come già ipotizzato in §4c), non un adapter file-download.
3. **Nota gazzetteer per l'eventuale integrazione:** Milano usa **Municipio** (9 zone amministrative) +
   **NIL** (Nuclei di Identità Locale, ~88 quartieri fini) — il campo zona/quartiere naturale per il
   feed è `NIL`, con `Municipio` come raggruppamento grosso. Il gazzetteer civici esiste (i dataset
   `stradario-abbinamento-numeri-civici-sezioni` elettorali) se servisse il geocoding raggio.
4. **Rivalutare periodicamente** — con un portale a 2598 dataset e DataStore attivo, Milano è il primo
   candidato da riesaminare appena aggiunge una seconda categoria feed-shaped.
5. **Raffinamento §4c confermato:** verificare **sempre `datastore_active` per-risorsa** prima di
   assumere l'adapter. Firenze (CKAN, no DataStore) → file-download; Milano (CKAN, DataStore) →
   `datastore_search`. "CKAN" da solo non predice la strategia di transport.

## Endpoint probati (per riproducibilità)

- `https://dati.comune.milano.it/api/3/action/status_show` → `ckan_version:"2.8.12"`.
- `https://dati.comune.milano.it/api/3/action/package_list` → 2598 id.
- `https://dati.comune.milano.it/api/3/action/package_show?id=ds925_avvisi-di-manomissione` →
  `frequency:DAILY`, CSV `datastore_active:true`, GeoJSON, `metadata_modified:2026-07-09`.
- `…/action/datastore_search?resource_id=4ed6ff36-6d1b-469a-8f57-9b1b292089fb&limit=1` → 23 campi,
  `total:280`; `&sort=_id desc` → riga più recente `Data protocollo ingresso: 2026-07-08`.
- `…/action/package_show?id=ds2954-attivita-commerciali-serie-storica` → `frequency:NEVER`, aggregato.
- `…/action/datastore_search?resource_id=fbda2a91-6591-4cab-9d62-9eb6b0b95c0a&limit=2` → `total:88`,
  campi `Anno, Macro Area, Area di Competenza, Stato, N. attivita commerciali`.
- `…/action/package_show?id=ds512_commercio-al-dettaglio-…-2003-avanti` → `frequency:ANNUAL`, aggregato.
