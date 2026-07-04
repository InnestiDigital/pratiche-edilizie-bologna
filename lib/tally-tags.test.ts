import { describe, it, expect } from 'vitest';
import { tallyTags } from './tally-tags';

const p = (tags: string[]) => ({ tags: JSON.stringify(tags) });

describe('tallyTags', () => {
  it('counts a single tag across permits', () => {
    expect(tallyTags([p(['con_lavori']), p(['con_lavori']), p(['sanatoria'])])).toEqual({
      con_lavori: 2,
      sanatoria: 1,
    });
  });

  it('counts every tag a multi-tag permit carries (+1 each, not one per permit)', () => {
    expect(tallyTags([p(['con_lavori', 'parziale'])])).toEqual({
      con_lavori: 1,
      parziale: 1,
    });
  });

  it('returns an empty map for no permits', () => {
    expect(tallyTags([])).toEqual({});
  });

  it('ignores permits with an empty tag array', () => {
    expect(tallyTags([p([]), p(['deroga'])])).toEqual({ deroga: 1 });
  });

  it('skips a permit whose tags column is malformed JSON', () => {
    expect(tallyTags([{ tags: 'not json' }, p(['con_lavori'])])).toEqual({ con_lavori: 1 });
  });

  it('skips a tags column that is valid JSON but not an array', () => {
    expect(tallyTags([{ tags: '{"con_lavori":1}' }, p(['parziale'])])).toEqual({ parziale: 1 });
  });

  it('skips non-string elements but keeps the valid siblings', () => {
    expect(tallyTags([{ tags: JSON.stringify(['con_lavori', 3, null, 'deroga']) }])).toEqual({
      con_lavori: 1,
      deroga: 1,
    });
  });
});
