export const DATASETS = {
  pdc: {
    slug: 'permessi-di-costruire-rilasciati',
    filingType: 'PDC' as const,
    label: 'Permesso di Costruire',
  },
  scia: {
    slug: 'scia-segnalazioni-certificate-di-inizio-attivita-depositate',
    filingType: 'SCIA' as const,
    label: 'SCIA',
  },
  cila: {
    slug: 'cila-comunicazioni-inizio-lavori',
    filingType: 'CILA' as const,
    label: 'CILA',
  },
} as const;

export type DatasetKey = keyof typeof DATASETS;
export type FilingType = 'PDC' | 'SCIA' | 'CILA';

export const FILING_TYPE_ORDER: FilingType[] = ['PDC', 'SCIA', 'CILA'];

// Reverse of DATASETS: a filing type → its dataset key ('pdc' | 'scia' | 'cila').
// getStats().byDataset is keyed by the lowercase dataset key, but the UI works in
// FilingType ('PDC'…); this derives the bridge from DATASETS so the mapping stays
// a single source of truth (add a dataset → it's wired automatically).
export const FILING_DATASET_KEY = Object.fromEntries(
  (Object.entries(DATASETS) as [DatasetKey, (typeof DATASETS)[DatasetKey]][]).map(([key, d]) => [
    d.filingType,
    key,
  ])
) as Record<FilingType, DatasetKey>;

export const FILING_TYPE_LABELS: Record<FilingType, string> = {
  PDC: 'Permesso di Costruire',
  SCIA: 'SCIA',
  CILA: 'CILA',
};

// The per-filing-type brand palette used for badges/dots across every screen
// (feed cards, detail header, settings). `bg` is the soft badge fill, `text` is
// the saturated accent (also used as the dot color). Single source of truth so
// the three filing colors never drift between screens.
export const FILING_COLORS: Record<FilingType, { bg: string; text: string }> = {
  PDC: { bg: '#FDF3E3', text: '#8B5E1A' },
  SCIA: { bg: '#E8EEE6', text: '#3D5C38' },
  CILA: { bg: '#E6E8F0', text: '#3A4A82' },
};

// The unabbreviated names of the three filing types, so the detail screen can
// spell out what SCIA / CILA stand for (the feed only has room for the acronym).
export const FILING_TYPE_FULL_NAMES: Record<FilingType, string> = {
  PDC: 'Permesso di Costruire',
  SCIA: 'Segnalazione Certificata di Inizio Attività',
  CILA: 'Comunicazione Inizio Lavori Asseverata',
};

// Plain-Italian explainers for the detail screen. Comune di Bologna open-permit
// data is jargon-heavy; a resident browsing it rarely knows how PDC, SCIA and
// CILA differ. One neutral sentence each, no legal references — just enough to
// tell the three procedures apart at a glance.
export const FILING_TYPE_DESCRIPTIONS: Record<FilingType, string> = {
  PDC: 'Titolo rilasciato dal Comune per gli interventi edilizi di maggiore rilevanza, come nuove costruzioni o ristrutturazioni importanti.',
  SCIA: 'Il tecnico assevera che l’intervento rispetta le norme: i lavori di media entità possono iniziare subito, senza attendere un permesso.',
  CILA: 'Comunicazione per interventi edilizi minori che non riguardano le parti strutturali né i prospetti dell’edificio.',
};

export const BOLOGNA_API_BASE =
  'https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/{slug}/records';

export const BOLOGNA_PORTAL_BASE =
  'https://opendata.comune.bologna.it/explore/dataset/{slug}/table/?refine.richiesta_anno_prot={anno}&q={prot}';

export const API_LIMIT = 100;

export const TAG_RULES: Record<string, string> = {
  non_residenziale: 'NON RESIDENZIALE',
  sanatoria: 'SANATORIA',
  deroga: 'IN DEROGA',
  urbanizzazione: 'URBANIZZAZIONE',
  telefonia: 'TELEFONIA',
  con_lavori: 'CON LAVORI',
  condizionata: 'CONDIZIONATA',
  parziale: 'PARZIALE',
  urbanistica: 'URBANISTICA',
};

export const STATUS_PATTERNS: [string, string[]][] = [
  ['rilasciata_con_prescrizioni', ['rilasciata con prescrizioni', 'condizionata']],
  ['rilasciata', ['rilasciata', 'esito positivo', 'efficace']],
  ['diniegata', ['diniegata', 'negativo', 'improcedibile']],
  ['annullata', ['annullata']],
  ['archiviata', ['archiviata', 'archiviazione']],
  ['decaduta', ['decaduta']],
  ['rinunciata', ['rinunciata']],
  ['in_attesa', ['attesa', 'acquisita']],
  ['concluso', ['concluso']],
];

export const QUARTIERI = [
  'Borgo Panigale-Reno',
  'Navile',
  'Porto-Saragozza',
  'San Donato-San Vitale',
  'Santo Stefano',
  'Savena',
] as const;

export type Quartiere = (typeof QUARTIERI)[number];

export const TAG_LABELS: Record<string, string> = {
  non_residenziale: 'Non residenziale',
  sanatoria: 'Sanatoria',
  deroga: 'In deroga',
  urbanizzazione: 'Urbanizzazione',
  telefonia: 'Telefonia',
  con_lavori: 'Con lavori',
  condizionata: 'Condizionata',
  parziale: 'Parziale',
  urbanistica: 'Urbanistica',
};

// Statuses whose request→closing span is a meaningful "time to release" — the
// positive-outcome procedures (granted / concluded). A denied, archived, lapsed,
// or withdrawn permit's closing date is not a release, so those are excluded from
// the sync-screen "Tempi di rilascio" aggregate (see `processing-stats.ts`).
export const RELEASED_STATUSES = ['rilasciata', 'rilasciata_con_prescrizioni', 'concluso'] as const;

export const STATUS_LABELS: Record<string, string> = {
  rilasciata: 'Rilasciata',
  rilasciata_con_prescrizioni: 'Rilasciata con prescrizioni',
  diniegata: 'Diniegata',
  annullata: 'Annullata',
  archiviata: 'Archiviata',
  decaduta: 'Decaduta',
  rinunciata: 'Rinunciata',
  in_attesa: 'In attesa',
  concluso: 'Concluso',
  // Cantieri (public-works) statuses: a roadwork site is either underway or closed.
  in_corso: 'In corso',
  // Eventi: a cultural event carries a constant, never-time-derived status.
  in_programma: 'In programma',
  altro: 'Altro',
};

// Plain-Italian one-liner explaining what each permit status means for the
// citizen reading it — the labels alone ("Decaduta", "Diniegata") are bureaucratic
// jargon. Rendered under the status pill on the detail screen (mirrors the
// filing-type explainer). Keyed by the normalized status; 'altro' is deliberately
// omitted (a catch-all bucket has no single honest meaning) so it shows no caption
// rather than a vague one, and an unknown status simply yields `undefined`.
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  rilasciata: 'Il titolo edilizio è stato concesso dal Comune: i lavori possono essere eseguiti.',
  rilasciata_con_prescrizioni:
    'Il titolo è stato concesso, ma con condizioni o prescrizioni da rispettare durante i lavori.',
  diniegata:
    'Il Comune ha respinto la richiesta: l’intervento non può essere realizzato così com’era stato presentato.',
  annullata: 'La pratica è stata annullata e non ha più validità.',
  archiviata: 'La pratica è stata chiusa e archiviata dagli uffici senza un esito attivo.',
  decaduta:
    'Il titolo ha perso efficacia, di norma perché i lavori non sono iniziati o conclusi nei termini previsti.',
  rinunciata: 'Il richiedente ha rinunciato alla pratica prima della sua conclusione.',
  in_attesa: 'La pratica è stata presentata ed è in corso di esame da parte degli uffici comunali.',
  concluso: 'L’iter della pratica si è concluso.',
  in_corso: 'I lavori del cantiere sono attualmente in corso.',
  in_programma: 'L’evento è in programma e deve ancora svolgersi.',
};
