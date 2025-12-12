import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { ZipCodeData, ZipCodeFilter } from '../types/zipcode';

export class ZipCodeService {
  private zipCodes: ZipCodeData[] = [];
  private initialized = false;

  /**
   * Load ZIP code data from CSV file
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try multiple possible paths for the CSV file
    // 1. From project root (for Next.js app)
    // 2. From worker directory (for Railway worker service)
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'zip_codes.csv'),
      path.join(process.cwd(), '..', 'data', 'zip_codes.csv'),
      path.resolve(__dirname, '../../../data/zip_codes.csv'),
    ];

    let csvPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        csvPath = p;
        break;
      }
    }

    if (!csvPath) {
      throw new Error(
        `Could not find zip_codes.csv. Tried paths:\n${possiblePaths.join('\n')}`
      );
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      cast: true,
    });

    this.zipCodes = records.map((record: any) => ({
      zipCode: record.zip_code,
      population: parseFloat(record.population) || 0,
      areaSqMi: parseFloat(record.area_sqmi) || 0,
      city: record.city,
      state: record.state,
      latitude: parseFloat(record.lat),
      longitude: parseFloat(record.lon),
      radiusMi: parseFloat(record.radius_mi),
    }));

    this.initialized = true;
  }

  /**
   * Calculate search radius from land area
   * Formula: radius = sqrt(area / π)
   */
  calculateSearchRadius(areaSqMi: number): number {
    return Math.sqrt(areaSqMi / Math.PI);
  }

  /**
   * Get ZIP codes filtered by states and population percentage
   */
  async getZipCodesByStates(
    states: string[],
    topPercent: number = 30
  ): Promise<ZipCodeData[]> {
    await this.initialize();

    // Filter by states
    const filtered = this.zipCodes.filter((zip) =>
      states.map((s) => s.toUpperCase()).includes(zip.state.toUpperCase())
    );

    // Sort by population descending
    const sorted = filtered.sort((a, b) => b.population - a.population);

    // Select top N%
    const count = Math.ceil((sorted.length * topPercent) / 100);
    return sorted.slice(0, count);
  }

  /**
   * Get nationwide ZIP codes filtered by population percentage
   */
  async getNationwideZipCodes(topPercent: number = 30): Promise<ZipCodeData[]> {
    await this.initialize();

    // Sort all ZIP codes by population descending
    const sorted = [...this.zipCodes].sort((a, b) => b.population - a.population);

    // Select top N%
    const count = Math.ceil((sorted.length * topPercent) / 100);
    return sorted.slice(0, count);
  }

  /**
   * Get ZIP codes based on filter criteria
   */
  async getFilteredZipCodes(filter: ZipCodeFilter): Promise<ZipCodeData[]> {
    const { states, topPercent = 30, nationwide = false } = filter;

    if (nationwide) {
      return this.getNationwideZipCodes(topPercent);
    }

    if (!states || states.length === 0) {
      throw new Error('Either states or nationwide flag must be provided');
    }

    return this.getZipCodesByStates(states, topPercent);
  }

  /**
   * Get all unique states from ZIP code data
   */
  async getAvailableStates(): Promise<string[]> {
    await this.initialize();
    const states = new Set(this.zipCodes.map((zip) => zip.state));
    return Array.from(states).sort();
  }

  /**
   * Get statistics about ZIP code data
   */
  async getStatistics(): Promise<{
    totalZipCodes: number;
    totalStates: number;
    avgPopulation: number;
    totalPopulation: number;
  }> {
    await this.initialize();

    const states = new Set(this.zipCodes.map((zip) => zip.state));
    const totalPopulation = this.zipCodes.reduce((sum, zip) => sum + zip.population, 0);

    return {
      totalZipCodes: this.zipCodes.length,
      totalStates: states.size,
      avgPopulation: totalPopulation / this.zipCodes.length,
      totalPopulation,
    };
  }
}

// Export singleton instance
export const zipCodeService = new ZipCodeService();
