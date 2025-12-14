import { z } from 'zod';

export const createJobSchema = z.object({
  businessType: z.string().min(1, 'Business type is required').max(100),
  geography: z
    .array(z.string())
    .min(1, 'At least one state or "nationwide" is required')
    .refine(
      (geo) => {
        if (geo.length === 1 && geo[0].toLowerCase() === 'nationwide') {
          return true;
        }
        return geo.every((state) => state.length === 2);
      },
      { message: 'Geography must be either ["nationwide"] or array of 2-letter state codes' }
    ),
  zipPercentage: z.number().min(1).max(100).optional().default(30),
  minDomainConfidence: z.number().min(0).max(100).optional().default(70),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const businessFilterSchema = z.object({
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(100).optional().default(20),
  state: z.string().optional(),
  businessType: z.string().optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  sortBy: z
    .enum(['name', 'city', 'state', 'rating', 'serpDomainConfidence'])
    .optional()
    .default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type BusinessFilterInput = z.infer<typeof businessFilterSchema>;
