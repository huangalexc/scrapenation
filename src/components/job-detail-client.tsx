'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface Job {
  id: string;
  businessType: string;
  geography: string[];
  zipPercentage: number;
  status: string;
  totalZips: number;
  zipsProcessed: number;
  businessesFound: number;
  businessesEnriched: number;
  businessesScraped: number;
  placesApiCalls: number;
  customSearchCalls: number;
  openaiCalls: number;
  estimatedCost: number;
  placesSearchTime: number | null;
  enrichmentTime: number | null;
  scrapingTime: number | null;
  errorsEncountered: number;
  errorLog: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobDetailClientProps {
  initialJob: Job;
}

// Helper function to format time in seconds to human-readable format
function formatTime(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function JobDetailClient({ initialJob }: JobDetailClientProps) {
  const [job, setJob] = useState<Job>(initialJob);
  const [isPolling, setIsPolling] = useState(
    initialJob.status === 'PENDING' || initialJob.status === 'RUNNING'
  );

  useEffect(() => {
    if (!isPolling) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`);
        if (response.ok) {
          const updatedJob = await response.json();
          setJob(updatedJob);

          // Stop polling if job is no longer running
          if (updatedJob.status !== 'PENDING' && updatedJob.status !== 'RUNNING') {
            setIsPolling(false);
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [job.id, isPolling]);

  // Calculate progress for each pipeline step
  const placesProgress = job.totalZips > 0
    ? Math.round((job.zipsProcessed / job.totalZips) * 100)
    : 0;

  const enrichmentProgress = job.businessesFound > 0
    ? Math.round((job.businessesEnriched / job.businessesFound) * 100)
    : 0;

  const scrapingProgress = job.businessesEnriched > 0
    ? Math.round((job.businessesScraped / job.businessesEnriched) * 100)
    : 0;

  // Overall progress based on completed steps
  const overallProgress = Math.round(
    (placesProgress * 0.3 + enrichmentProgress * 0.4 + scrapingProgress * 0.3)
  );

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jobs
            </Link>
          </Button>
        </div>

        <div className="space-y-6">
          {/* Job Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-3xl mb-2">{job.businessType}</CardTitle>
                  <CardDescription>
                    Created {new Date(job.createdAt).toLocaleString()} • {job.geography.join(', ')}
                  </CardDescription>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
            </CardHeader>
          </Card>

          {/* Progress Card */}
          {(job.status === 'RUNNING' || job.status === 'PENDING') && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Progress</CardTitle>
                  {isPolling && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Live updating...
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Overall Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Overall Progress</span>
                      <span className="text-2xl font-bold">{overallProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3">
                      <div
                        className="bg-primary h-3 rounded-full transition-all duration-500"
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Pipeline Step Progress Bars */}
                  <div className="space-y-4 pt-4 border-t">
                    {/* Places Search Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          1. Places Search ({job.zipsProcessed}/{job.totalZips} ZIPs)
                          {job.placesSearchTime && (
                            <span className="ml-2 text-xs text-primary">({formatTime(job.placesSearchTime)})</span>
                          )}
                        </span>
                        <span className="font-medium">{placesProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${placesProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Enrichment Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          2. SERP Enrichment ({job.businessesEnriched}/{job.businessesFound} businesses)
                          {job.enrichmentTime && (
                            <span className="ml-2 text-xs text-primary">({formatTime(job.enrichmentTime)})</span>
                          )}
                        </span>
                        <span className="font-medium">{enrichmentProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${enrichmentProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Scraping Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          3. Domain Scraping ({job.businessesScraped}/{job.businessesEnriched} domains)
                          {job.scrapingTime && (
                            <span className="ml-2 text-xs text-primary">({formatTime(job.scrapingTime)})</span>
                          )}
                        </span>
                        <span className="font-medium">{scrapingProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${scrapingProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">Total ZIP Codes</span>
                  <span className="font-semibold">{job.totalZips}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">ZIP Codes Processed</span>
                  <span className="font-semibold">{job.zipsProcessed}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">Businesses Found</span>
                  <span className="font-semibold">{job.businessesFound}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">Businesses Enriched</span>
                  <span className="font-semibold">{job.businessesEnriched}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">Domains Scraped</span>
                  <span className="font-semibold">{job.businessesScraped}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm">Errors Encountered</span>
                  <span className="font-semibold text-red-600">{job.errorsEncountered}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Usage & Cost</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">Places API Calls</span>
                  <span className="font-semibold">{job.placesApiCalls}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">SERP API Calls</span>
                  <span className="font-semibold">{job.customSearchCalls}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm">OpenAI API Calls</span>
                  <span className="font-semibold">{job.openaiCalls}</span>
                </div>
                <div className="flex justify-between items-center py-2 pt-4 border-t-2">
                  <span className="font-medium">Estimated Cost</span>
                  <span className="text-2xl font-bold text-primary">
                    ${job.estimatedCost.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Job Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Business Type</p>
                  <p className="font-semibold mt-1">{job.businessType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Geography</p>
                  <p className="font-semibold mt-1">{job.geography.join(', ')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">ZIP Coverage</p>
                  <p className="font-semibold mt-1">Top {job.zipPercentage}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Log */}
          {job.errorLog && (
            <Card className="border-red-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-red-900">Error Log</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-red-50 p-4 rounded-md overflow-x-auto text-red-900">
                  {job.errorLog}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            {job.status === 'COMPLETED' && job.businessesFound > 0 && (
              <Button asChild size="lg">
                <Link href={`/businesses?jobId=${job.id}`}>
                  View Results ({job.businessesFound} businesses)
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="lg">
              <Link href="/jobs">Back to Jobs</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const config = {
    PENDING: { icon: Clock, label: 'Pending', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    RUNNING: { icon: Play, label: 'Running', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    COMPLETED: { icon: CheckCircle, label: 'Completed', className: 'bg-green-100 text-green-800 border-green-200' },
    FAILED: { icon: XCircle, label: 'Failed', className: 'bg-red-100 text-red-800 border-red-200' },
    PAUSED: { icon: Clock, label: 'Paused', className: 'bg-gray-100 text-gray-800 border-gray-200' },
    CANCELLED: { icon: XCircle, label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  };

  const { icon: Icon, label, className } = config[status as keyof typeof config] || config.PENDING;

  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${className}`}>
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}
