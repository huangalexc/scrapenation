'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
        {(() => {
          const activeFilterCount = [
            filters.state,
            filters.businessType,
            filters.hasEmail,
            filters.hasPhone,
          ].filter((v) => v !== undefined && v !== '' && v !== false).length;

          return activeFilterCount > 0 ? (
            <div>
              <Badge variant="secondary">
                {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
              </Badge>
            </div>
          ) : null;
        })()}
      </CardContent>
    </Card>
  );
}
