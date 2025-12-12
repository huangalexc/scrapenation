'use client';

import { useState } from 'react';
import { Business } from '@prisma/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import { deleteBusiness } from '@/app/actions/business-actions';
import { useToast } from '@/hooks/use-toast';

interface BusinessTableProps {
  businesses: Business[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onDelete?: () => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function BusinessTable({
  businesses,
  sortBy,
  sortOrder,
  onSort,
  onDelete,
  selectedIds: externalSelectedIds,
  onSelectionChange
}: BusinessTableProps) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Use external selected IDs if provided, otherwise use internal state
  const selectedIds = externalSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === businesses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(businesses.map((b) => b.id)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this business?')) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteBusiness(id);
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Business deleted successfully',
        });
        onDelete?.();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to delete business',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const SortButton = ({ field, label }: { field: string; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className="hover:bg-muted"
    >
      {label}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  if (businesses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No businesses found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.size === businesses.length && businesses.length > 0}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>
              <SortButton field="name" label="Name" />
            </TableHead>
            <TableHead>
              <SortButton field="businessType" label="Business Type" />
            </TableHead>
            <TableHead>
              <SortButton field="city" label="City" />
            </TableHead>
            <TableHead>
              <SortButton field="state" label="State" />
            </TableHead>
            <TableHead>
              <SortButton field="rating" label="Rating" />
            </TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {businesses.map((business) => {
            // Coalesce email: prefer domainEmail, fallback to serpEmail
            const email = business.domainEmail || business.serpEmail || null;
            // Coalesce phone: prefer domainPhone, fallback to serpPhone
            const phone = business.domainPhone || business.serpPhone || null;
            // Prefer serpDomain if available
            const domain = business.serpDomain || null;

            return (
              <TableRow key={business.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(business.id)}
                    onCheckedChange={() => toggleSelection(business.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{business.name}</TableCell>
                <TableCell>{business.businessType || '-'}</TableCell>
                <TableCell>{business.city || '-'}</TableCell>
                <TableCell>{business.state || '-'}</TableCell>
                <TableCell>
                  {business.rating ? (
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">★</span>
                      {business.rating.toFixed(1)}
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {domain ? (
                    <a
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {domain}
                    </a>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {email || '-'}
                </TableCell>
                <TableCell>{phone || '-'}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(business.id)}
                    disabled={isDeleting}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
