/**
 * The category-neutral noun for a record in the local database.
 *
 * The app browses 5 categories / 7 sources — edilizia filings (PdC/SCIA/CILA),
 * cantieri, commercio, eventi, segnalazioni. Only edilizia rows are genuinely
 * "pratiche" (filings). So any AGGREGATE, cross-category surface — the feed result
 * count, month-section headers, feed empty / search states, the sync composition +
 * monthly-activity + per-zone / per-stato stats, the Settings match-summary — must
 * NOT call a Cantiere / Evento / Segnalazione a "pratica". This is the single
 * neutral noun those surfaces share: "voce" / "voci" (entry / entries).
 *
 * "voce" is feminine — same gender as the old "pratica" — so every downstream
 * agreement (nuova/nuove · letta/lette · salvata · corrisponde/corrispondono)
 * carries over unchanged. It also avoids colliding with "scheda", which this app's
 * copy already uses to mean a tab/screen ("dalla scheda Aggiorna").
 *
 * Category-SPECIFIC copy stays "pratica": a permit detail's "Tipo di pratica", the
 * onboarding edilizia filing-type picker, the edilizia notification noun in
 * `CATEGORY_NOUNS` — those are genuinely about edilizia filings, not generic records.
 */
export const RECORD_NOUN = { singular: 'voce', plural: 'voci' } as const;

/** "1 voce" / "3 voci" — the neutral noun agreeing with the Italian plural rule. */
export function recordNoun(count: number): string {
  return count === 1 ? RECORD_NOUN.singular : RECORD_NOUN.plural;
}
