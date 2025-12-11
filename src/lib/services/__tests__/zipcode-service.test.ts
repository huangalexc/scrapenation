import { ZipCodeService } from '../zipcode-service';

describe('ZipCodeService', () => {
  let service: ZipCodeService;

  beforeEach(() => {
    service = new ZipCodeService();
  });

  test('should calculate search radius correctly', () => {
    // radius = sqrt(area / π)
    const area = 100;
    const expectedRadius = Math.sqrt(area / Math.PI);
    expect(service.calculateSearchRadius(area)).toBeCloseTo(expectedRadius, 5);
  });

  test('should load ZIP codes and get statistics', async () => {
    const stats = await service.getStatistics();
    expect(stats.totalZipCodes).toBeGreaterThan(0);
    expect(stats.totalStates).toBeGreaterThan(0);
    expect(stats.avgPopulation).toBeGreaterThan(0);
  });

  test('should filter ZIP codes by state', async () => {
    const results = await service.getZipCodesByStates(['CA'], 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((zip) => zip.state === 'CA')).toBe(true);
    // Should be sorted by population descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].population).toBeGreaterThanOrEqual(results[i + 1].population);
    }
  });

  test('should get nationwide ZIP codes', async () => {
    const results = await service.getNationwideZipCodes(5);
    expect(results.length).toBeGreaterThan(0);
    // Should be sorted by population descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].population).toBeGreaterThanOrEqual(results[i + 1].population);
    }
  });

  test('should get available states', async () => {
    const states = await service.getAvailableStates();
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('CA');
    expect(states).toContain('NY');
    // Should be sorted
    const sorted = [...states].sort();
    expect(states).toEqual(sorted);
  });

  test('should handle filter with states', async () => {
    const results = await service.getFilteredZipCodes({
      states: ['CA', 'NY'],
      topPercent: 20,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((zip) => ['CA', 'NY'].includes(zip.state))).toBe(true);
  });

  test('should handle filter with nationwide', async () => {
    const results = await service.getFilteredZipCodes({
      nationwide: true,
      topPercent: 10,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  test('should throw error when no filter provided', async () => {
    await expect(service.getFilteredZipCodes({})).rejects.toThrow(
      'Either states or nationwide flag must be provided'
    );
  });
});
