# Roma Capitale — scheda audit portale open data (P5 §4c, passi 1–2)

**Data audit:** 2026-07-09 · **Esito:** ❌ **SOTTO SOGLIA** — non integrare ora, ma **candidato #1 da
rivalutare** (miglior piattaforma vista finora + una categoria *quotidianamente utile* realmente viva).
**Solo ricerca — zero codice** (nessun adapter, nessuna entry registry, nessuno schema: la §4c passo 3 è
gated su una città che supera la soglia *e* richiede comunque l'adapter CKAN — decisione di Matteo).

Metodo = stesso probe LIVE che ha prodotto gli schemi di Bologna: ogni endpoint sotto è stato interrogato
realmente il 2026-07-09; i nomi campo / date citati vengono dalla risposta reale, non inventati.

## Portale & piattaforma

- **Portale:** https://dati.comune.roma.it — "Open Data — Roma Capitale". 365 dataset (`package_search`),
  11 aree tematiche. Piattaforma **riusata dalla Regione Lazio** (`dati.lazio.it`, stesso stack CKAN).
- **Piattaforma:** **CKAN 2.9.5** (`status_show.ckan_version`), stack **DCAT-AP_IT** (`dcatapit_*`), tema
  custom `roma_theme`, SSO custom (`simplesso`).

### ⚠️ TRAPPOLA DI ACCESSO — l'API pubblica è sotto il prefisso `/catalog/`, NON su root

La radice `dati.comune.roma.it/` risponde 200, ma **`/api/3/action/…` e `/dataset` su root fanno 302 →
`sso.comune.roma.it` (login SSO)** — un probe ingenuo della root conclude erroneamente "serve login". Il
CKAN pubblico è montato sotto **`/catalog/`**: la base API reale, accessibile **in anonimo**, è

```
https://dati.comune.roma.it/catalog/api/3/action/…
```

(le pagine dataset pubbliche stanno su `/catalog/it/dataset/…`). Nota di riproducibilità come il 403-UA di
Torino: verificare il prefisso montaggio prima di dichiarare un portale "chiuso".

### ✅ Freno di piattaforma ASSENTE — DataStore ATTIVO (come Milano, a differenza di Firenze/Torino)

`status_show.extensions` include **`datastore`**; `datastore_search` funziona live (es. resource CzRM
`a43137d5-…` → `success:true`, `total:7053`, `fields` reali). Le risorse per-mese hanno
`datastore_active:true` → **query per-riga paginabile** = adapter CKAN `datastore_search` pulito, NON
l'adapter file-download che servirebbe a Firenze/Torino. Il blocco di Roma è **copertura dati**, non
piattaforma.

## Audit per categoria (le 5 dell'app)

| Categoria | Dataset live via API? | Data | Zona | Geopoint | Frequenza | Verdetto |
|---|---|---|---|---|---|---|
| **edilizia** (PDC/SCIA/CILA) | ❌ 0 risultati (`edilizia`/`permesso costruire`/`scia`) | — | — | — | — | **ASSENTE** |
| **cantieri** (lavori/strade) | ❌ 0 risultati (`cantieri`/`scavi`/`manomission`/`opere`/`lavori pubblici`) | — | — | — | — | **ASSENTE** |
| **commercio** | ⚠️ 35 hit ma archivi congelati 2020–2023 + anagrafica mercati | anno | — | no | fermo | **INSUFFICIENTE** |
| **eventi** | ❌ 1 solo dataset, fermo 2020 | — | — | — | fermo | **INSUFFICIENTE** |
| **segnalazioni** (CzRM) | ✅ `datastore_search`, per-mese, dati 2026 reali | ✔ | Municipio | no | **MENSILE** | **DISPONIBILE** |

### segnalazioni — ✅ DISPONIBILE (l'unica categoria realmente viva, e quotidianamente utile)

**CzRM di Roma Capitale — Dati delle segnalazioni** (Sistema Unico di Segnalazione, il "CRM" cittadino):
dataset **per anno** `crm2021 … crm2025` + `czrm-di-roma-capitale-dati-delle-segnalazioni-anno-2026`, ognuno
con **risorse per-mese** (`Casi Aperti Gennaio`, `Casi Chiusi Gennaio`, `… Febbraio`, …), tutte
`datastore_active:true`.

- **`frequency: MONTHLY`**; `crm2026` mod `2026-05-07`, contiene già Gennaio + Febbraio 2026 → feed
  **vivo dell'anno corrente** (in ritardo di ~mesi, ma cadenza mensile reale, non archivio congelato).
- **Campi reali** (probe `datastore_search` su `crm2024`): `Data di Presentazione`, `Municipio di
  riferimento`, `Tipo di segnalazione - Descrizione`, `Descrizione Area Tematica`, `Descrizione Argomento`,
  `Descrizione tipo arrivo`. `crm2024` resource Gennaio → `MIN/MAX Data di Presentazione` = 2024-01-01 …
  2024-01-31, `total 7053` → una risorsa = un mese di segnalazioni per-record datate.
- **Zona = `Municipio`** (15 municipi): più grossolana dei quartieri di Bologna → servirebbe un gazetteer
  municipi. **Nessun geopoint** → geocoding indirizzo on-device (come il glue P4). Concettualmente = il
  `segnalazioni` di Bologna. Categoria **quotidianamente utile** ✔.

### ⚠️ d102 OSP — la trappola "mod-date fresca ≠ dati nuovi" (NON conta come categoria viva)

`d102 — Elenco domande di OSP relative all'occupazione di suolo pubblico **per emergenza COVID-19**`
sembra il candidato più forte a prima vista, ed è istruttivo perché **inganna**:

- ✅ `frequency: MONTHLY`, **mod `2026-07-06`** (3 giorni fa), risorse per-mese fino a **`Aprile_2026`**,
  `datastore_active:true`, forma per-record ideale: `PROTOCOLLO` (id!), `DATA_PRESENTAZIONE`,
  `TIPO_PROCEDIMENTO`, `MUNICIPIO`, `DESCRIZIONE_VIA` + `NUMERO_CIVICO`, `DA_MQ_OSP`/`A_MQ_OSP`.
- ❌ **MA i record sono congelati all'emergenza COVID (2020–2022):** un campione di `Aprile_2026`
  (`datastore_search`) restituisce righe con `DATA_PRESENTAZIONE` **2022-12** e `TIPO_PROCEDIMENTO =
  "… EMERGENZA COVID-19"`. Ogni "Estrazione <mese>" è una **ri-pubblicazione mensile dello stesso corpus
  storico COVID**, non un flusso di pratiche nuove. Per l'app (allertare su pratiche NUOVE vicino a casa)
  surfacerebbe permessi dehors del 2020–2022. → **INSUFFICIENTE**, malgrado data-mod fresca + DataStore.

> **Raffinamento §4c (nuovo, da questo audit):** la freschezza va misurata sui **record**
> (`MAX(data)` reale), non sulla `metadata_modified` della risorsa né sull'etichetta del mese: un dataset
> a evento chiuso può essere ri-estratto mensilmente e sembrare vivo. Verificare sempre le date dei dati.

### edilizia — ASSENTE

`edilizia`, `permesso costruire`, `scia`, `cila` → **0 risultati**. Le pratiche edilizie passano dallo
SUE/SUAP e non sono pubblicate come open data per-record. La categoria core dell'app **non esiste** — come
a Firenze, Milano, Torino. **ASSENTE.**

### cantieri — ASSENTE

`cantieri`, `scavi`, `manomission`, `opere`, `lavori pubblici` → **0 risultati**. Nessun feed lavori/strade
per-record (a differenza di Milano, che qui aveva il suo unico punto forte). L'unico affine è d102 OSP, che
è però suolo-pubblico COVID congelato (sopra). **ASSENTE.**

### commercio — INSUFFICIENTE (archivi congelati + anagrafica)

`commercio` (35 hit) / `mercati` (1): `datastore_active:true` ma **fermi**: `d107` (2023-01), `d874`
(2020-12), `d877` (2021-12), `d714`/`d148`/`d757` (2020) = archivi/anagrafiche per anno; `d881 — Dati sui
Mercati Rionali` (mod 2023-09) = anagrafica statica dei mercati (reference, non feed). Nessun equivalente
del `commercio` di Bologna (pratiche d'impresa aggiornate per-riga con data+zona). **INSUFFICIENTE.**

### eventi — INSUFFICIENTE

`eventi` (1 hit, `d358`, mod 2020-06, XML/ODS) / `manifestazioni` (0): un solo dataset congelato al 2020,
non un calendario eventi vivo. **INSUFFICIENTE.**

## Punteggio vs soglia di ammissione (§4c passo 2)

Soglia = **≥2 categorie** disponibili via API con aggiornamento **almeno mensile**, di cui **≥1
"quotidianamente utile"** (cantieri / segnalazioni / eventi).

- Categorie con feed per-record vivo (record realmente aggiornati) + freq ≥ mensile: **1** — solo
  `segnalazioni` (CzRM). ❌ (serve ≥2)
- Di cui quotidianamente utili: **1** (segnalazioni). ✔ su questa metà — ma manca la seconda categoria.
- d102 OSP fallisce sul contenuto (record COVID 2020–2022 ri-pubblicati); commercio/eventi congelati;
  edilizia/cantieri assenti.

**➡️ SOTTO SOGLIA** (1 categoria viva su ≥2). Ma è il **miglior candidato finora**: piattaforma pulita
(DataStore + `datastore_search`, come Milano; meglio di Firenze/Torino) *e* una categoria quotidianamente
utile realmente viva (segnalazioni), non solo aggregati. Il blocco è **copertura** (una sola categoria),
non piattaforma né forma-dati.

## Raccomandazione

1. **Non integrare Roma ora** — una sola categoria viva sotto la soglia ≥2; e comunque l'integrazione (§4c
   passo 3) richiederebbe il **primo adapter CKAN `datastore_search`** (prerequisito piattaforma) = un
   build gated su Matteo (design → implementazione → revisione, non un drive-by).
2. **Candidato #1 da rivalutare.** A differenza di Torino (doppio freno: dati sbagliati + no DataStore) e
   Firenze (no DataStore), Roma ha **solo** un problema di copertura: se pubblicasse un secondo feed vivo
   per-record (es. un vero flusso cantieri/manomissioni o commercio), scatterebbe sopra soglia con
   `segnalazioni` già pronto come prima sorgente. È anche la città che meglio ripaga l'investimento
   dell'adapter CKAN (poi riusabile per Milano, che condivide DataStore + una categoria viva).
3. **Se/quando si costruisce l'adapter CKAN** (per Roma o Milano), `segnalazioni`-Roma è una prima sorgente
   pronta: probare live i campi `Data di Presentazione` / `Municipio` / `Tipo`, costruire il gazetteer dei
   15 municipi, geocoding indirizzo on-device. Zona municipio (grossolana) + nessun geopoint = accettabile
   (come Bologna geocodifica on-device).
4. **Prossimo candidato §4c (un city per pass):** **Napoli** (`dati.comune.napoli.it`) — probare
   piattaforma + `datastore_active` + **date reali dei record** (non solo mod-date) PRIMA, come per
   Milano/Firenze/Torino/Roma.

## Endpoint probati (per riproducibilità)

> Nota accesso: la base API pubblica è sotto **`/catalog/`** (`…/catalog/api/3/action/…`); root `/api` e
> `/dataset` reindirizzano al login SSO — non è un portale chiuso, è un prefisso di montaggio.

- `…/catalog/api/3/action/status_show` → `ckan_version:"2.9.5"`, extensions **con `datastore`** + `roma_theme`.
- `…/action/package_search?rows=0` → `count:365`.
- `…/action/package_search?q=edilizia` → `0`; `q=cantieri`/`scavi`/`manomission`/`opere` → `0`.
- `…/action/package_search?q=commercio` → 35 (tutti mod 2020–2023); `q=mercati` → `d881` (2023-09).
- `…/action/package_search?q=eventi` → 1 (`d358`, 2020-06).
- `…/action/package_show?id=czrm-di-roma-capitale-dati-delle-segnalazioni-anno-2026` → `frequency:MONTHLY`,
  mod 2026-05-07, risorse `Casi Aperti/Chiusi Gennaio+Febbraio`, `datastore_active:true`.
- `…/action/datastore_search?resource_id=a43137d5-…&limit=1` (crm2024 Gennaio) → `total:7053`, fields
  `Data di Presentazione` / `Municipio di riferimento` / `Tipo di segnalazione - Descrizione` / …
- `…/action/datastore_search_sql?sql=SELECT MAX/MIN("Data di Presentazione")…` (crm2024) →
  2024-01-01 … 2024-01-31 (una risorsa = un mese).
- `…/action/package_show?id=d102` → OSP-COVID, `frequency:MONTHLY`, mod 2026-07-06, risorse per-mese →
  `Aprile_2026`, `datastore_active:true`; campo id `PROTOCOLLO` + `DATA_PRESENTAZIONE` + `MUNICIPIO` +
  `DESCRIZIONE_VIA`. **Ma** `datastore_search` su `Aprile_2026` → record `DATA_PRESENTAZIONE` 2022-12,
  `TIPO_PROCEDIMENTO "… EMERGENZA COVID-19"` (corpus storico ri-pubblicato).
