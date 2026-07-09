# Emilia-Romagna (portale REGIONALE) — scheda audit (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare. **Solo ricerca — zero
codice** (nessun adapter, nessuna entry registry, nessuno schema: la §4c passo 3 è gated su una fonte che
supera la soglia).

Questo audit chiude il **mandato #2 del director** (`.director/DIRECTION.md`, 2026-07-09): «ONE last probe
on a genuinely different hypothesis — a city on **Opendatasoft** (la piattaforma di Bologna) o
l'**Emilia-Romagna regional ODS**: stesso transport `fetch-page`/`ods-request`/`paginate`, NESSUN adapter
CKAN, dati probabilmente più ricchi». Non è una quinta città CKAN: è il **portale regionale aggregatore**,
un'ipotesi diversa che l'audit di Modena (una città) NON aveva testato. Metodo = probe LIVE reale: ogni
endpoint sotto è stato interrogato il 2026-07-09; i nomi campo e i verdetti vengono dalla risposta reale.

## La premessa del mandato #2 è FALSA: il portale regionale è CKAN, non Opendatasoft

- **Portale:** https://dati.emilia-romagna.it — `site_title: "CKAN Regione Emilia Romagna"`,
  `site_description: "Portale OpenData regionale"`.
- **Piattaforma:** **CKAN 2.8.9** — `status_show` → `ckan_version: "2.8.9"`, `success:true`,
  `extensions: ["datastore","stats","text_view","image_view","recline_v…", …]`. Il path Opendatasoft
  (`/api/explore/v2.1/catalog/datasets`, quello del transport attuale) risponde **404 HTML** — NON è ODS.
- **Conseguenza per il mandato #2:** l'ipotesi «ER regionale reachable col transport ODS attuale, zero
  adapter» è **smentita alla radice**. Come Milano/Modena/Roma, il portale regionale è CKAN → richiederebbe
  comunque un adapter di piattaforma. **Non esiste un portale Opendatasoft in Emilia-Romagna oltre a Bologna
  stessa** (probati anche `opendata.regione.emilia-romagna.it`, `dati.regione.emilia-romagna.it`,
  `opendata.cittametropolitana.bo.it` → NXDOMAIN; `dati.cittametropolitana.bo.it` → portale statico legacy,
  né ODS né CKAN-API).

## Il freno reale: è un aggregatore HARVEST di sole risorse file-download

Il portale regionale ha **2868 pacchetti** (`package_search?rows=0` → `count: 2868`), ma **non è una fonte
per-riga di prima parte**: è un **catalogo harvest** che raccoglie i metadati dei portali dei comuni
membri (Modena, Ferrara, Unione dei Comuni Valle del Savio, …) e ne espone le risorse come **download di
file** che puntano ai geoserver di origine — **nessun `datastore` sulle risorse civiche rilevanti**.

- `datastore_search` su una risorsa harvestata (es. Ferrara `esercizi-di-vicinato7`) →
  `success:false, error: "Internal Server Error"` — il DataStore non è popolato per le risorse aggregate.
- Ogni risorsa civica trovata ha **`datastore_active:false`**: solo CSV/JSON/ZIP/GML/MAP_SRVC verso i SIT
  comunali (`sit.comune.fe.it`, `servizisit.unionevallesavio.it`). Come Firenze/Torino servirebbe un
  **adapter file-download**, non l'adapter CKAN-datastore.
- Il `metadata_modified: 2026-07-08` diffuso è lo **stamp di sync dell'harvest**, non la freschezza del
  dato: il `last_modified` reale della risorsa Unione edilizia è `2026-01-17` (refresh file, non feed datato
  per-riga).

## Audit per categoria (le 5 dell'app) — via `package_search` sul catalogo regionale

| Categoria | Dataset nel catalogo? | DataStore/API per-riga | Piattaforma origine | Verdetto |
|---|---|---|---|---|
| **edilizia** | 2 (Modena `banca-dati-pratiche-edilizie` + Unione V. Savio `procedure-edilizie`) | ❌ tutte `datastore_active:false` | file-download | **NO API / già congelato** |
| **cantieri** | **0** (`q=cantieri OR lavori pubblici OR scavi OR occupazione suolo` → count 0) | — | — | **ASSENTE** |
| **commercio** | 3 (Modena `esercizi-commerciali` + Ferrara `procedimenti-suap-commercio` / `esercizi-di-vicinato`) | ❌ tutte `datastore_active:false` | file-download | **registro / no API** |
| **eventi** | 1 (Modena `eventi-di-monet`) | ❌ `datastore_active:false` sul catalogo regionale | file-download | **già congelato 03/2024** |
| **segnalazioni** | **0** (`q=segnalazioni OR reclami OR sportello cittadino` → count 0) | — | — | **ASSENTE** |

Note per riga:

- **edilizia** — i due hit sono (a) Modena `banca-dati-pratiche-edilizie`, **già auditato** in
  `docs/cities/modena.md` = pubblicazione interrotta 20/02/2023, e (b) Unione dei Comuni Valle del Savio
  `procedure-edilizie`, risorse CSV+JSON `datastore_active:false` (download da `servizisit.unionevallesavio.it`,
  `last_modified: 2026-01-17`). Nessuna delle due espone un `datastore_search` per-riga.
- **commercio** — Ferrara (comune non ancora auditato singolarmente) compare con `procedimenti-suap-commercio`
  e `esercizi-di-vicinato`: entrambi **registri anagrafici SUAP** (elenco esercizi attivi, non un feed di
  pratiche datate per-riga) e **`datastore_active:false`** (CSV/ZIP/GML/MAP_SRVC verso `sit.comune.fe.it`).
  Stessa classe del commercio congelato di Modena.
- **eventi / edilizia già coperti** dall'audit Modena; il regionale non aggiunge un feed vivo, li ri-espone.

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API (per-riga) con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie con un `datastore_search` per-riga funzionante: **0** (tutte le risorse civiche rilevanti sono
  `datastore_active:false`; il portale è un indice harvest su file-download).
- Categorie "quotidianamente utili" vive: **0** (cantieri ASSENTE, segnalazioni ASSENTE, eventi = il feed
  Modena già congelato a 03/2024).

**0 su 2 richieste ⇒ SOTTO SOGLIA**, in modo ancora più netto delle singole città: qui manca perfino il
`datastore` (Milano/Modena almeno lo avevano su alcune risorse). Il valore aggiunto del regionale sarebbe
l'aggregazione multi-comune, ma tecnicamente è **solo un catalogo di metadati su download di file** che
ri-espone dati comunali già auditati e per lo più congelati.

## Conclusione — mandato #2 chiuso, TRACK P5 PARCHEGGIATO (HARD stop del director)

Il director aveva fissato lo stop: «if this ODS/ER probe also comes back below threshold, DECLARE the P5
audit track exhausted and PARK it». La probe è tornata **decisamente sotto soglia** e ha anche **smentito la
sua premessa tecnica** (il regionale è CKAN-harvest file-download, non ODS). Pattern definitivo su **6 audit**
(Firenze, Milano, Torino, Roma, Modena, ER-regionale): **fuori Bologna, feed civici per-riga datati +
aggiornati non esistono o sono abbandonati.** Non accodare altre città finché non arriva un segnale reale
(una città che riprende la pubblicazione live) o una redirezione di Matteo.

**Unico spunto residuo, NON accodato ora:** Ferrara compare con SIT proprio (`sit.comune.fe.it`) — un
eventuale audit del suo portale di primo livello (non l'harvest regionale) potrebbe avere un `datastore`
proprio; ma i dataset visti sono registri anagrafici, non feed civici quotidiani → probabilità bassa,
coerente col PARK. Riaprire solo se Matteo lo indica.
