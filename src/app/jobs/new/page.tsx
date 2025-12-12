'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob } from '@/app/actions/job-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const BUSINESS_TYPES = [
  'Restaurant',
  'Cafe',
  'Bar',
  'Hotel',
  'Gym',
  'Salon',
  'Spa',
  'Dentist',
  'Doctor',
  'Lawyer',
  'Accountant',
  'Real Estate Agent',
  'Plumber',
  'Electrician',
  'Contractor',
  'Auto Repair',
  'Veterinarian',
  'Pet Store',
  'Florist',
  'Bakery',
  'Hardware Store',
  'Pharmacy',
  'Optometrist',
  'Chiropractor',
  'Physical Therapist',
];

export default function NewJobPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [zipPercentage, setZipPercentage] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleState(stateCode: string) {
    setSelectedStates(prev =>
      prev.includes(stateCode)
        ? prev.filter(s => s !== stateCode)
        : [...prev, stateCode]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const finalBusinessType = businessType === 'custom' ? customBusinessType : businessType;

    if (!finalBusinessType) {
      setError('Please enter a business type');
      setIsLoading(false);
      return;
    }

    if (selectedStates.length === 0) {
      setError('Please select at least one state');
      setIsLoading(false);
      return;
    }

    try {
      const result = await createJob({
        businessType: finalBusinessType,
        geography: selectedStates,
        zipPercentage,
      });

      if (!result.success) {
        setError(result.error || 'Failed to create job');
        setIsLoading(false);
        return;
      }

      // Redirect to job details page
      router.push(`/jobs/${result.data!.jobId}`);
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jobs
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create New Job</CardTitle>
            <CardDescription>
              Configure your business discovery job. Free tier: 1 job, 5 ZIP codes max, single state only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-md">
                  {error}
                </div>
              )}

              {/* Business Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Business Type</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="">Select a business type...</option>
                  {BUSINESS_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  <option value="custom">Custom (enter your own)</option>
                </select>
              </div>

              {businessType === 'custom' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom Business Type</label>
                  <input
                    type="text"
                    value={customBusinessType}
                    onChange={(e) => setCustomBusinessType(e.target.value)}
                    placeholder="e.g., Coffee Shop, Pet Grooming, etc."
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              )}

              {/* State Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Select States ({selectedStates.length} selected)
                  <span className="text-xs text-muted-foreground ml-2">
                    Free tier: 1 state only
                  </span>
                </label>
                <div className="border border-input rounded-md p-4 max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {US_STATES.map(state => (
                      <label
                        key={state.code}
                        className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStates.includes(state.code)}
                          onChange={() => toggleState(state.code)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{state.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* ZIP Percentage */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  ZIP Code Coverage: Top {zipPercentage}% by population
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={zipPercentage}
                  onChange={(e) => setZipPercentage(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Higher percentages cover more ZIP codes but increase cost. Free tier is limited to 5 ZIP codes total.
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? 'Creating Job...' : 'Create Job'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
