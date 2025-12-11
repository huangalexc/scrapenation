'use client';

import { Business } from '@prisma/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';

interface BusinessTableProps {
  businesses: Business[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function BusinessTable({ businesses, sortBy, sortOrder, onSort }: BusinessTableProps) {
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

  const ConfidenceBadge = ({ value }: { value: number | null }) => {
    if (!value) return <span className="text-muted-foreground">-</span>;

    const variant = value >= 80 ? 'default' : value >= 60 ? 'secondary' : 'outline';

    return <Badge variant={variant}>{value.toFixed(0)}%</Badge>;
  };

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
            <TableHead>
              <SortButton field="name" label="Name" />
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
            <TableHead>SERP Domain</TableHead>
            <TableHead>SERP Email</TableHead>
            <TableHead>
              <SortButton field="serpDomainConfidence" label="Email Conf." />
            </TableHead>
            <TableHead>Domain Email</TableHead>
            <TableHead>Domain Phone</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {businesses.map((business) => (
            <TableRow key={business.id}>
              <TableCell className="font-medium">{business.name}</TableCell>
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
                {business.serpDomain ? (
                  <a
                    href={`https://${business.serpDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {business.serpDomain}
                  </a>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {business.serpEmail || '-'}
              </TableCell>
              <TableCell>
                <ConfidenceBadge value={business.serpEmailConfidence} />
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {business.domainEmail || '-'}
              </TableCell>
              <TableCell>{business.domainPhone || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
