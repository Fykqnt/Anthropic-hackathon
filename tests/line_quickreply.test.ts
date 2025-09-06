import { describe, it, expect } from 'vitest';
import { buildTreatmentQuickReply, TREATMENTS } from '../src/line/templates';

describe('buildTreatmentQuickReply', () => {
  it('produces stable quick reply items matching treatments list', () => {
    const qr = buildTreatmentQuickReply();
    expect(qr.items.length).toBe(TREATMENTS.length);
    const simplified = qr.items.map((it) => ({
      label: (it.action as any).label,
      data: (it.action as any).data,
    }));
    expect(simplified).toEqual(
      TREATMENTS.map((t) => ({ label: t.label, data: JSON.stringify({ t: t.id }) })),
    );
  });
});
