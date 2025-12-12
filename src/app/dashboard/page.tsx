import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { tierLimitsService } from '@/lib/services/tier-limits-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const tierInfo = await tierLimitsService.getUserTierInfo(session.user.id);

  if (!tierInfo) {
    return <div>Error loading user information</div>;
  }

  const { tier, jobsCreated, limits } = tierInfo;
  const isFree = tier === 'FREE';
  const jobsRemaining = isFree ? Math.max(0, limits.maxJobs - jobsCreated) : Infinity;

  return (
    <div className="container mx-auto py-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Account Tier</CardTitle>
              <CardDescription>Your current subscription plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{tier}</p>
                  {isFree && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Upgrade to Pro for unlimited access
                    </p>
                  )}
                </div>
                {isFree && (
                  <Button asChild>
                    <Link href="/upgrade">Upgrade</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jobs Created</CardTitle>
              <CardDescription>Your job usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-3xl font-bold">
                  {jobsCreated} / {isFree ? limits.maxJobs : '∞'}
                </p>
                {isFree && jobsRemaining > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {jobsRemaining} job{jobsRemaining !== 1 ? 's' : ''} remaining
                  </p>
                )}
                {isFree && jobsRemaining === 0 && (
                  <p className="text-sm text-red-600">
                    You've reached your job limit. Upgrade to Pro to create more jobs.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Tier Limits</CardTitle>
            <CardDescription>What's included in your plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">Maximum Jobs</span>
                <span className="text-muted-foreground">
                  {isFree ? limits.maxJobs : 'Unlimited'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">ZIP Codes per Job</span>
                <span className="text-muted-foreground">
                  {isFree ? `${limits.maxZipsPerJob} maximum` : 'Unlimited'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">States per Job</span>
                <span className="text-muted-foreground">
                  {isFree ? `${limits.maxStatesPerJob} state only` : 'Unlimited (including nationwide)'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="font-medium">Business Enrichment</span>
                <span className="text-muted-foreground">
                  {isFree ? 'Limited to job results' : 'Unlimited'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button asChild size="lg">
            <Link href="/jobs">
              {jobsRemaining > 0 ? 'Create a Job' : 'View Jobs'}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/businesses">Browse Businesses</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
