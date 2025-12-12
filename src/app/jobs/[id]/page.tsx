import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface JobDetailPageProps {
  params: {
    id: string;
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: { email: true, tier: true },
      },
    },
  });

  if (!job) {
    notFound();
  }

  // Ensure user owns this job
  if (job.userId !== session.user.id) {
    redirect('/jobs');
  }

  const progressPercent = job.totalZips > 0
    ? Math.round((job.zipsProcessed / job.totalZips) * 100)
    : 0;

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
          {job.status === 'RUNNING' && (
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-2xl font-bold">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-4 pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">ZIP Codes</p>
                      <p className="text-xl font-semibold">
                        {job.zipsProcessed}/{job.totalZips}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Businesses Found</p>
                      <p className="text-xl font-semibold">{job.businessesFound}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Enriched</p>
                      <p className="text-xl font-semibold">{job.businessesEnriched}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Scraped</p>
                      <p className="text-xl font-semibold">{job.businessesScraped}</p>
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
