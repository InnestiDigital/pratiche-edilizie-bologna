# P4 — Mappa + raggio: memo decisionale

*Redatto 2026-07-06 (Master @ d5baa05) da PraticheEdiliziLoop, mandato direttore #3.
Estende ROADMAP §4b con probe LIVE dell'API ODS e verifica del codice attuale. **Nessun
codice in questo slice** — la decisione libreria va fatta QUI prima che una dipendenza nativa
tocchi il repo (un build EAS parte dal commit git, vedi CLAUDE.md § Deploy).*

Regola invariata: **niente backend, niente account, niente geocoding esterno.** Tutto on-device.

---

## 0. TL;DR — le tre decisioni

1. **Libreria mappa → `react-native-maps` (Apple Maps su iOS).** Zero API key, privacy-first,
   binario più leggero di MapLibre, allineato all'app iOS-first. Costo: config-plugin + **un
   nuovo build EAS** (dipendenza nativa). Vedi §1.
2. **Coordinate: oggi NON sono in `extra`.** Tutte e 4 le sorgenti geo-dotate le ricevono nel
   raw payload ma i normalizer le SCARTANO (`compactExtra` tiene solo stringhe non vuote; le
   coord sono oggetti). Edilizia non ha coord affatto. → P4 deve estendere i normalizer per
   scrivere `lat`/`lon` (stringhe) in `extra`. Verificato nel codice, §2.
3. **Geocoding on-device → dataset `rifter_civici_pt` ("Numeri civici").** 77.596 civici,
   aggiornato quotidianamente, con `geo_point_2d` + `codvia` + `civico` + `quartiere`.
   Download-una-tantum (~13.8 MB JSON slim, ~5–7 MB in SQLite). Geocoda sia l'indirizzo di
   casa dell'utente SIA — bonus — le righe **edilizia** senza coord, via il loro `codvia`+`civico`.
   Probe LIVE, §3.

---

## 1. Scelta libreria (decidere per prima — condiziona tutto)

| | `react-native-maps` | `@maplibre/maplibre-react-native` |
|---|---|---|
| Provider tile | Apple Maps (iOS nativo) | tile vettoriali open (serve uno style URL / tile source) |
| API key | **nessuna** su iOS | nessuna se self-host/style pubblico; molti style richiedono una key di terzi |
| Peso binario | leggero (usa il framework di sistema) | più pesante (motore di rendering vettoriale bundled) |
| Privacy | tile servite da Apple (no tracker di terzi) | dipende dal tile provider scelto |
| Config | config-plugin Expo + rebuild EAS | config-plugin + rebuild EAS |
| Web (screenshot) | non funziona → serve shim `*.web.ts` | non funziona → serve shim `*.web.ts` |
| Offline | degrada (nessuna tile cached di default) | tile offline possibili ma pesanti (fuori scope P4.1) |

**Raccomandazione: `react-native-maps`.** Motivi, in ordine di peso:
- **Zero chiavi di terzi** = rispetta la regola no-backend/no-tracking senza compromessi (con
  MapLibre uno style "bello" tipicamente porta a un provider con key/quota).
- **iOS-first**: Apple Maps è già sul device, binario minimo su i3/8GB e su telefoni utente.
- Android (export futuro) userà Google Maps via la stessa libreria — serve `Androidmanifest`
  API key SOLO quando arriva l'export Android, non ora → non blocca iOS.
- MapLibre vince solo se serve uno **stile custom pesante** o **tile offline**: nessuno dei
  due è richiesto in P4.1 (ROADMAP §4b: "Tile offline NON richiesti in prima battuta; la
  mappa può degradare con un messaggio quando offline — i dati pin restano locali").

**Conseguenza operativa (gate):** `react-native-maps` è una **dipendenza nativa** → il primo
slice che la installa NON è verificabile dal harness screenshot (web) né dal gate vitest/tsc/lint
da solo; richiede un **build EAS** (Matteo-gated, § Deploy). Quindi P4 si separa in due tronchi:
tutta la logica **pura** (geocoding, haversine, gazetteer, filtro raggio, estrazione coord nei
normalizer) è testabile in vitest e shippabile dalla loop **senza** la mappa; il componente
`<MapView>` + i pin sono l'ultimo slice, dietro il gate del rebuild nativo.

---

## 2. Realtà geopoint per-sorgente (verificato nel codice, 2026-07-06)

`lib/source-shared.ts::compactExtra` tiene **solo valori stringa non-null e non-vuoti**. Una
coordinata ODS è un OGGETTO (`geo_point_2d: {lat, lon}`) → NON è una stringa → **non entrerebbe
comunque**. E di fatto nessun normalizer la passa a `compactExtra`. Stato attuale dell'`extra`
persistito:

| Sorgente | Coord nel raw payload | Chiavi in `extra` OGGI | Coord persistite? |
|---|---|---|---|
| cantieri (`lavori-pubblici`) | `pinpoint`/geo ✓ | `trafficchangesmeasure` | **NO** |
| commercio (`istanze-commercio`) | `geopoint` ✓ | `area`, `sottoarea`, `tipo_pratica` | **NO** |
| eventi (`agenda-cultura`) | `coordinate` ✓ | (start, url, …) | **NO** |
| segnalazioni (`czrm`) | `geopoint`/`latitude`/`longitude` ✓ | (…) | **NO** |
| edilizia (PDC/SCIA/CILA) | **assenti** — solo `codvia`+`zone` | (edilizia-specific) | N/A |

**Implicazione P4:** primo slice puro = estendere i 4 normalizer geo-dotati per estrarre
`lat`/`lon` (come STRINGHE, così `compactExtra` le tiene e il decoder `permit-extra.ts` le
rilegge) in `extra`. Nessuna migrazione SQLite (`extra` è già JSON). Righe già in DB restano
senza coord finché non ri-sincronizzate — accettabile (una risync le popola; oppure un bump di
sync forzato). `permit-extra.ts` va esteso con un getter coord difensivo (parse numerico
guardato, non zod: è il boundary storage on-device). Test vitest per ciascun normalizer +
decoder. **Edilizia non ha coord dalla sorgente** → si geocoda via gazetteer (§3), non da `extra`.

---

## 3. Geocoding on-device — gazetteer `rifter_civici_pt`

Probe LIVE del catalogo ODS (`suggest("toponomastica")`) → dataset **`rifter_civici_pt`**,
titolo **"Numeri civici"**. Metriche misurate 2026-07-06:

- **Record:** 77.596 numeri civici di Bologna.
- **Freschezza:** `modified` = 2026-07-06 (aggiornamento quotidiano).
- **Campi utili:** `geo_point_2d {lat, lon}`, `codvia`, `civico`, `indirizzo_completo`,
  `quartiere`, `zona`, `zona_nome`, `zona_pross`, `cap`.
- **Peso:** select slim (`codvia,civico,geo_point_2d,quartiere,indirizzo_completo`) = 18.686
  byte / 100 record → **≈ 13.8 MB JSON raw** per l'intero dataset. In SQLite, tenendo solo
  `codvia`(int) + `civico`(int) + `lat`(real) + `lon`(real) + `quartiere`(text) e droppando
  `indirizzo_completo`, la tabella scende a **~5–7 MB** — download-una-tantum accettabile
  (una richiesta paginata via il transport ODS esistente, cap `MAX_OFFSET` 9900 → ~8 pagine).

**Due usi, uno gratis:**
1. **Geocoda l'indirizzo di casa dell'utente** (input onboarding/settings): match su
   `indirizzo_completo` / (`codvia`+`civico`) contro il gazetteer scaricato → lat/lon di casa.
   Nessun servizio esterno.
2. **Bonus — geocoda le righe EDILIZIA senza coord**: l'edilizia porta `codvia` (+ civico nella
   `extra`, da verificare in impl.) → join contro `rifter_civici_pt` per `codvia`(+`civico`)
   dà la coordinata. Così anche l'unica categoria coord-less finisce sulla mappa **senza**
   nuova sorgente API. `codvia` è la chiave di join: presente sia in edilizia sia nel gazetteer.

**Distanza:** haversine puro in `lib/geo-distance.ts` (nuovo), testato in vitest — nessun modulo
nativo. Alert raggio = filtro `haversine(casa, riga) <= soglia_m` sul set locale già in SQLite.

---

## 4. Web shim (harness screenshot)

Il build web (`lib/*.web.ts`) non può montare `<MapView>` nativo. Serve un `map-view.web.tsx`
(o shim del componente schermata mappa) che renda un **placeholder statico** — es. un box con i
pin come marker CSS su un fondo neutro, o semplicemente la lista — così l'export web continua a
buildare e il harness resta verde. Come per `db.web.ts`/`sync.web.ts`: superficie export
allineata alla versione nativa, inerte su device. Aggiornare `screenshot-fixtures.ts` con
coordinate fixture così lo screenshot mostra pin popolati.

---

## 5. Sequenza slice consigliata (dalla loop, salvo l'ultimo)

| # | Slice | Tipo | Gate |
|---|---|---|---|
| 1 | Estrai `lat`/`lon` (stringa) in `extra` nei 4 normalizer geo + getter coord in `permit-extra.ts` | puro | vitest/tsc/lint |
| 2 | `lib/geo-distance.ts` haversine + `lib/geo-radius.ts` filtro raggio puro | puro | vitest |
| 3 | Gazetteer: fetch-una-tantum `rifter_civici_pt` → tabella SQLite `civici`; geocoder `codvia`(+`civico`)→lat/lon; geocoda l'indirizzo utente | quasi-puro (glue DB) | vitest sul geocoder puro |
| 4 | Onboarding/settings: input indirizzo di casa + soglia raggio (300 m default) in `preferences` (decode hardened) | UI + puro | vitest + screenshot |
| 5 | **`react-native-maps` + `<MapView>` + pin per-categoria + shim `*.web.ts`** | **NATIVO** | **build EAS (Matteo-gated)** |

Slice 1–4 danno valore da soli (alert "vicino a casa" testuale nel feed) **senza** la mappa
grafica. Lo slice 5 è l'unico che richiede il rebuild nativo.

---

## 6. Gate Matteo / decisioni aperte

- **Rebuild EAS nativo** (slice 5): richiede build+submit manuale (gated). La loop può shippare
  1–4 su Master; 5 aspetta il build.
- **Layer statici (P4.2)** — `farmacie`, `elenco-delle-scuole`, `zona-a-traffico-limitato`,
  `mercati-e-fiere`: reference senza date, download-una-tantum, SOLO vista mappa (non feed, non
  notifiche). Rimandati a dopo P4.1 (mappa + raggio funzionanti).
- **Conferma libreria**: `react-native-maps` è la raccomandazione; se Matteo preferisce lo
  stile MapLibre, cambia solo lo slice 5 (la logica pura 1–4 è libreria-agnostica).
