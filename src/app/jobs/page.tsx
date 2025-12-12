import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { tierLimitsService } from '@/lib/services/tier-limits-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Play, AlertCircle, CheckCircle, Clock, XCircle, PauseCircle } from 'lucide-react';

export default async function JobsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Get user's jobs
  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  // Get user's tier info
  const tierInfo = await tierLimitsService.getUserTierInfo(session.user.id);
  const canCreate = tierInfo ? tierInfo.jobsCreated < tierInfo.limits.maxJobs : false;

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">Jobs</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage your business discovery jobs
            </p>
          </div>
          <div className="flex gap-4">
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            {canCreate ? (
              <Button asChild size="lg">
                <Link href="/jobs/new">
                  <Play className="mr-2 h-4 w-4" />
                  Create Job
                </Link>
              </Button>
            ) : (
              <Button disabled size="lg">
                Job Limit Reached
              </Button>
            )}
          </div>
        </div>

        {!canCreate && tierInfo?.tier === 'FREE' && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-900">
                    You've reached your free tier limit
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    Free accounts are limited to {tierInfo.limits.maxJobs} job. Upgrade to Pro for unlimited jobs.
                  </p>
                  <Button asChild className="mt-3" size="sm">
                    <Link href="/upgrade">Upgrade to Pro</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {jobs.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No jobs yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first job to start discovering businesses
                </p>
                {canCreate && (
                  <Button asChild>
                    <Link href="/jobs/new">Create Your First Job</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">{job.businessType}</CardTitle>
                        <JobStatusBadge status={job.status} />
                      </div>
                      <CardDescription className="mt-2">
                        {job.geography.join(', ')} • Created {new Date(job.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/jobs/${job.id}`}>View Details</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">ZIP Codes</p>
                      <p className="text-2xl font-semibold">
                        {job.zipsProcessed}/{job.totalZips}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Businesses Found</p>
                      <p className="text-2xl font-semibold">{job.businessesFound}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Enriched</p>
                      <p className="text-2xl font-semibold">{job.businessesEnriched}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Est. Cost</p>
                      <p className="text-2xl font-semibold">${job.estimatedCost.toFixed(2)}</p>
                    </div>
                  </div>
                  {job.status === 'RUNNING' && job.totalZips > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {Math.round((job.zipsProcessed / job.totalZips) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{
                            width: `${(job.zipsProcessed / job.totalZips) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const config = {
    PENDING: { icon: Clock, label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
    RUNNING: { icon: Play, label: 'Running', className: 'bg-blue-100 text-blue-800' },
    COMPLETED: { icon: CheckCircle, label: 'Completed', className: 'bg-green-100 text-green-800' },
    FAILED: { icon: XCircle, label: 'Failed', className: 'bg-red-100 text-red-800' },
    PAUSED: { icon: PauseCircle, label: 'Paused', className: 'bg-gray-100 text-gray-800' },
    CANCELLED: { icon: XCircle, label: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
  };

  const { icon: Icon, label, className } = config[status as keyof typeof config] || config.PENDING;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
