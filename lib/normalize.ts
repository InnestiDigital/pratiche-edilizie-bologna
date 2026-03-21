import {
  DATASETS,
  TAG_RULES,
  STATUS_PATTERNS,
  BOLOGNA_PORTAL_BASE,
  type DatasetKey,
} from "./constants";
import codviaMap from "../assets/data/codvia_to_zone.json";

const zoneMap = codviaMap as Record<string, string>;

export interface RawRecord {
  richiesta_ndeg_prot: number;
  richiesta_anno_prot: string;
  richiesta_data: string | null;
  procedimento: string | null;
  esito_pratica: string | null;
  chiusura_pratica_data: string | null;
  codvia: number | null;
  civico: number | null;
  esponenteciv: string | null;
  localizzazioni_lista: string | null;
}

export interface NormalizedPermit {
  dataset: string;
  source_id: string;
  filing_type: string;
  source_updated_at: string | null;
  address: string | null;
  zone: string | null;
  codvia: number | null;
  procedimento: string | null;
  date_issued: string | null;
  status: string;
  status_raw: string;
  tags: string;
  source_link: string;
}

export function makeSourceId(datasetKey: DatasetKey, record: RawRecord): string {
  return `${datasetKey}-${record.richiesta_anno_prot}-${record.richiesta_ndeg_prot}`;
}

export function normalizeStatus(raw: string | null): string {
  if (!raw) return "altro";
  const s = raw.trim().toLowerCase();
  for (const [statusName, patterns] of STATUS_PATTERNS) {
    for (const pattern of patterns) {
      if (s.includes(pattern)) return statusName;
    }
  }
  return "altro";
}

export function extractTags(procedimento: string | null): string[] {
  if (!procedimento) return [];
  const upper = procedimento.toUpperCase();
  const tags: string[] = [];
  for (const [tag, pattern] of Object.entries(TAG_RULES)) {
    if (upper.includes(pattern)) tags.push(tag);
  }
  if (upper.startsWith("URB ") && !tags.includes("urbanistica")) {
    tags.push("urbanistica");
  }
  return tags;
}

export function deriveZone(codvia: number | null): string | null {
  if (codvia === null) return null;
  return zoneMap[String(codvia)] ?? null;
}

export function makeSourceLink(
  datasetKey: DatasetKey,
  anno: string,
  prot: number,
): string {
  const slug = DATASETS[datasetKey].slug;
  return BOLOGNA_PORTAL_BASE.replace("{slug}", slug)
    .replace("{anno}", anno)
    .replace("{prot}", String(prot));
}

export function normalizeRecord(
  datasetKey: DatasetKey,
  raw: RawRecord,
): NormalizedPermit {
  const statusRaw = raw.esito_pratica ?? "";
  const procedimento = raw.procedimento ?? "";
  const tags = extractTags(procedimento);

  return {
    dataset: datasetKey,
    source_id: makeSourceId(datasetKey, raw),
    filing_type: DATASETS[datasetKey].filingType,
    source_updated_at: raw.richiesta_data,
    address: raw.localizzazioni_lista,
    zone: deriveZone(raw.codvia),
    codvia: raw.codvia,
    procedimento,
    date_issued: raw.chiusura_pratica_data,
    status: normalizeStatus(statusRaw),
    status_raw: statusRaw,
    tags: JSON.stringify(tags),
    source_link: makeSourceLink(
      datasetKey,
      String(raw.richiesta_anno_prot),
      raw.richiesta_ndeg_prot,
    ),
  };
}
