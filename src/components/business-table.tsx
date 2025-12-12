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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
