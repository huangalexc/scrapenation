import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Play, Search } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="container mx-auto py-16">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          ScrapeNation
        </h1>
        <p className="text-xl text-muted-foreground">
          Discover and enrich businesses across the United States using Google Places, DataForSEO SERP API, and AI-powered data extraction.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <Play className="h-10 w-10 mb-2 text-primary" />
            <CardTitle>Start a Job</CardTitle>
            <CardDescription>
              Create a new scraping job to discover businesses by type and geography
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/jobs">Go to Jobs</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Search className="h-10 w-10 mb-2 text-primary" />
            <CardTitle>Browse Businesses</CardTitle>
            <CardDescription>
              Filter, sort, and export enriched business data with contact information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link href="/businesses">View Businesses</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Database className="h-10 w-10 mb-2 text-primary" />
            <CardTitle>Pipeline Features</CardTitle>
            <CardDescription>
              Parallel processing, SERP enrichment, and domain scraping at scale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Places API integration</li>
              <li>• GPT-4o-mini extraction</li>
              <li>• Parallel scraping</li>
              <li>• CSV export</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  1
                </span>
                <div>
                  <strong>Select ZIP Codes</strong> - Choose states or nationwide, filter by population
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  2
                </span>
                <div>
                  <strong>Search Places</strong> - Query Google Places API in parallel across ZIP codes
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  3
                </span>
                <div>
                  <strong>SERP Enrichment</strong> - Extract domain, email, phone using DataForSEO + GPT
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  4
                </span>
                <div>
                  <strong>Domain Scraping</strong> - Verify contact info from high-confidence domains
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  5
                </span>
                <div>
                  <strong>Browse & Export</strong> - Filter results and export to CSV
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
