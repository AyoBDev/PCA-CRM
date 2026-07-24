const registry = require('../../services/serviceRegistry');

describe('registry invalidation contract', () => {
  test('invalidate clears cache so next getServiceMap re-reads', async () => {
    await registry.getServiceMap();       // warm cache
    registry.invalidate();
    const map = await registry.getServiceMap(); // should rebuild without throwing
    expect(map.PCS).toBeDefined();
  });
});
