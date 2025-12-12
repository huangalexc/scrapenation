'use client';

import { useEffect, useState } from 'react';
import { BusinessTable } from '@/components/business-table';
import { BusinessFilters } from '@/components/business-filters';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBusinessFilterStore } from '@/lib/stores/business-filter-store';
import { getBusinesses, getAvailableStates } from '@/app/actions/business-actions';
import type { Business } from '@prisma/client';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export default function BusinessesPage() {
  const { filters, setFilter } = useBusinessFilterStore();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [availableStates, setAvailableStates] = useState<string[]>([]);

  // Load available states
  useEffect(() => {
    getAvailableStates().then((result) => {
      if (result.success && result.data) {
        setAvailableStates(result.data);
      }
    });
  }, []);

  // Load businesses when filters change
  useEffect(() => {
    setLoading(true);
    getBusinesses(filters)
      .then((result) => {
        if (result.success && result.data) {
          setBusinesses(result.data.businesses);
          setTotal(result.data.total);
          setTotalPages(result.data.totalPages);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filters]);

  const handleSort = (field: string) => {
    if (filters.sortBy === field) {
      // Toggle sort order
      setFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Change sort field, default to ascending
      setFilter('sortBy', field as any);
      setFilter('sortOrder', 'asc');
    }
  };

  const handleExport = () => {
    // Build query string from filters
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && key !== 'page' && key !== 'pageSize') {
        params.append(key, String(value));
      }
    });

    // Open export URL
    window.open(`/api/businesses/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Businesses</h1>
        <p className="text-muted-foreground mt-2">
          Browse and filter enriched business data
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <BusinessFilters
            availableStates={availableStates}
            onExport={handleExport}
          />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Results Summary */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <>
                      Showing <strong>{businesses.length}</strong> of{' '}
                      <strong>{total.toLocaleString()}</strong> businesses
                    </>
                  )}
                </p>

                {/* Pagination Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilter('page', filters.page - 1)}
                    disabled={filters.page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <span className="text-sm">
                    Page {filters.page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilter('page', filters.page + 1)}
                    disabled={filters.page >= totalPages || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Table */}
          {loading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <BusinessTable
              businesses={businesses}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onSort={handleSort}
            />
          )}
        </div>
      </div>
    </div>
  );
}
