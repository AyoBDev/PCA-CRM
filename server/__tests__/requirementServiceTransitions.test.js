const { isOnboardingComplete } = require('../src/services/requirementService');

describe('isOnboardingComplete', () => {
  it('is false when a required document is not submitted', () => {
    expect(isOnboardingComplete([
      { kind: 'document', status: 'required' },
      { kind: 'policy', status: 'approved' },
    ])).toBe(false);
  });
  it('is true when all docs/certs submitted+ and policies approved', () => {
    expect(isOnboardingComplete([
      { kind: 'document', status: 'submitted' },
      { kind: 'certification', status: 'approved' },
      { kind: 'policy', status: 'approved' },
    ])).toBe(true);
  });
  it('is false when a policy is unacknowledged', () => {
    expect(isOnboardingComplete([{ kind: 'policy', status: 'required' }])).toBe(false);
  });
});
