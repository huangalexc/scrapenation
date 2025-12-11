'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Download } from 'lucide-react';
import { useBusinessFilterStore } from '@/lib/stores/business-filter-store';

interface BusinessFiltersProps {
  availableStates: string[];
  onExport: () => void;
}

export function BusinessFilters({ availableStates, onExport }: BusinessFiltersProps) {
  const { filters, setFilter, resetFilters } = useBusinessFilterStore();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Filters</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* State Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">State</label>
          <Select value={filters.state || 'all'} onValueChange={(v) => setFilter('state', v === 'all' ? undefined : v)}>
            <SelectTrigger>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {availableStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Business Type Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Business Type</label>
          <Input
            placeholder="Filter by type..."
            value={filters.businessType || ''}
            onChange={(e) => setFilter('businessType', e.target.value || undefined)}
          />
        </div>

        {/* Rating Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Rating: {filters.minRating ? filters.minRating.toFixed(1) : 'Any'}
          </label>
          <Slider
            value={[filters.minRating || 0]}
            onValueChange={([v]) => setFilter('minRating', v > 0 ? v : undefined)}
            max={5}
            step={0.5}
            className="w-full"
          />
        </div>

        {/* Domain Confidence */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Domain Confidence: {filters.minDomainConfidence || 0}%
          </label>
          <Slider
            value={[filters.minDomainConfidence || 0]}
            onValueChange={([v]) => setFilter('minDomainConfidence', v > 0 ? v : undefined)}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        {/* Email Confidence */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Email Confidence: {filters.minEmailConfidence || 0}%
          </label>
          <Slider
            value={[filters.minEmailConfidence || 0]}
            onValueChange={([v]) => setFilter('minEmailConfidence', v > 0 ? v : undefined)}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        {/* Phone Confidence */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Phone Confidence: {filters.minPhoneConfidence || 0}%
          </label>
          <Slider
            value={[filters.minPhoneConfidence || 0]}
            onValueChange={([v]) => setFilter('minPhoneConfidence', v > 0 ? v : undefined)}
            max={100}
            step={5}
            className="w-full"
          />
        </div>

        {/* Has Email/Phone */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.hasEmail || false}
              onChange={(e) => setFilter('hasEmail', e.target.checked || undefined)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">Has Email</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.hasPhone || false}
              onChange={(e) => setFilter('hasPhone', e.target.checked || undefined)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">Has Phone</span>
          </label>
        </div>

        {/* Active Filters Count */}
        {Object.values(filters).filter((v) => v !== undefined && v !== '' && v !== 1 && v !== 20 && v !== 'name' && v !== 'asc').length > 0 && (
          <div>
            <Badge variant="secondary">
              {Object.values(filters).filter((v) => v !== undefined && v !== '' && v !== 1 && v !== 20 && v !== 'name' && v !== 'asc').length} active filters
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
