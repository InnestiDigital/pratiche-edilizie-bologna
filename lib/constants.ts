export const DATASETS = {
  pdc: {
    slug: "permessi-di-costruire-rilasciati",
    filingType: "PDC" as const,
    label: "Permesso di Costruire",
  },
  scia: {
    slug: "scia-segnalazioni-certificate-di-inizio-attivita-depositate",
    filingType: "SCIA" as const,
    label: "SCIA",
  },
  cila: {
    slug: "cila-comunicazioni-inizio-lavori",
    filingType: "CILA" as const,
    label: "CILA",
  },
} as const;

export type DatasetKey = keyof typeof DATASETS;
export type FilingType = "PDC" | "SCIA" | "CILA";

export const FILING_TYPE_ORDER: FilingType[] = ["PDC", "SCIA", "CILA"];

export const FILING_TYPE_LABELS: Record<FilingType, string> = {
  PDC: "Permesso di Costruire",
  SCIA: "SCIA",
  CILA: "CILA",
};

export const BOLOGNA_API_BASE =
  "https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/{slug}/records";

export const BOLOGNA_PORTAL_BASE =
  "https://opendata.comune.bologna.it/explore/dataset/{slug}/table/?refine.richiesta_anno_prot={anno}&q={prot}";

export const API_LIMIT = 100;

export const TAG_RULES: Record<string, string> = {
  non_residenziale: "NON RESIDENZIALE",
  sanatoria: "SANATORIA",
  deroga: "IN DEROGA",
  urbanizzazione: "URBANIZZAZIONE",
  telefonia: "TELEFONIA",
  con_lavori: "CON LAVORI",
  condizionata: "CONDIZIONATA",
  parziale: "PARZIALE",
  urbanistica: "URBANISTICA",
};

export const STATUS_PATTERNS: [string, string[]][] = [
  ["rilasciata_con_prescrizioni", ["rilasciata con prescrizioni", "condizionata"]],
  ["rilasciata", ["rilasciata", "esito positivo", "efficace"]],
  ["diniegata", ["diniegata", "negativo", "improcedibile"]],
  ["annullata", ["annullata"]],
  ["archiviata", ["archiviata", "archiviazione"]],
  ["decaduta", ["decaduta"]],
  ["rinunciata", ["rinunciata"]],
  ["in_attesa", ["attesa", "acquisita"]],
  ["concluso", ["concluso"]],
];

export const QUARTIERI = [
  "Borgo Panigale-Reno",
  "Navile",
  "Porto-Saragozza",
  "San Donato-San Vitale",
  "Santo Stefano",
  "Savena",
] as const;

export type Quartiere = (typeof QUARTIERI)[number];

export const TAG_LABELS: Record<string, string> = {
  non_residenziale: "Non residenziale",
  sanatoria: "Sanatoria",
  deroga: "In deroga",
  urbanizzazione: "Urbanizzazione",
  telefonia: "Telefonia",
  con_lavori: "Con lavori",
  condizionata: "Condizionata",
  parziale: "Parziale",
  urbanistica: "Urbanistica",
};

export const STATUS_LABELS: Record<string, string> = {
  rilasciata: "Rilasciata",
  rilasciata_con_prescrizioni: "Rilasciata con prescrizioni",
  diniegata: "Diniegata",
  annullata: "Annullata",
  archiviata: "Archiviata",
  decaduta: "Decaduta",
  rinunciata: "Rinunciata",
  in_attesa: "In attesa",
  concluso: "Concluso",
  altro: "Altro",
};
