const { reviewSummary } = require('../src/services/requirementService');

describe('reviewSummary (pure)', () => {
  it('returns approved when every required item is approved', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 2, optional: false, reviewStatus: 'approved' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'approved', rejectedIds: [] });
  });

  it('returns changes_requested with the rejected ids when any required item is rejected', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 2, optional: false, reviewStatus: 'rejected' },
      { id: 3, optional: false, reviewStatus: 'pending' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'changes_requested', rejectedIds: [2] });
  });

  it('ignores optional items entirely', () => {
    const reqs = [
      { id: 1, optional: false, reviewStatus: 'approved' },
      { id: 9, optional: true, reviewStatus: 'rejected' },
    ];
    expect(reviewSummary(reqs)).toEqual({ outcome: 'approved', rejectedIds: [] });
  });

  it('treats a not-yet-decided required item as blocking approval (still not rejected → changes only on rejection)', () => {
    const reqs = [{ id: 1, optional: false, reviewStatus: 'pending' }];
    // No rejection, but not all approved: outcome should NOT be approved.
    expect(reviewSummary(reqs).outcome).toBe('changes_requested');
    expect(reviewSummary(reqs).rejectedIds).toEqual([]);
  });
});
