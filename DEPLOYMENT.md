# Deployment Guide - ScrapENation

## Deploy to Vercel (All-in-One Solution)

**No separate backend needed!** Everything runs on Vercel serverless functions.

### Step 1: Database Setup

**Option A: Vercel Postgres (Recommended - Easiest)**
1. Go to your Vercel project dashboard
2. Click "Storage" → "Create Database" → "Postgres"
3. Vercel automatically sets `DATABASE_URL` environment variable
4. Database is ready to use!

**Option B: External Postgres (Railway/Neon/Supabase)**
1. Create a Postgres database on your provider
2. Get the connection string
3. Add `DATABASE_URL` to Vercel environment variables

### Step 2: Push Code to GitHub

```bash
git add .
git commit -m "Complete ScrapENation implementation"
git push origin main
```

### Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Vercel auto-detects Next.js settings

### Step 4: Add Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

```
DATABASE_URL=<auto-set if using Vercel Postgres>
GOOGLE_PLACES_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<your_engine_id>
OPENAI_API_KEY=<your_key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
```

### Step 5: Run Database Migrations

After first deployment, you need to initialize the database:

**Option A: Using Vercel CLI (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link to your project
vercel link

# Run migrations
vercel env pull .env.local
npx prisma migrate deploy
npx prisma db seed
```

**Option B: Using Vercel Dashboard**
1. Go to your project → Deployments
2. Find a deployment → three dots → Redeploy
3. Check "Use existing Build Cache" → Redeploy

Then connect to database manually via Prisma Studio or SQL client.

### Step 6: Verify Deployment

Visit your Vercel URL (e.g., `https://scrapenation.vercel.app`)

## Important Vercel Configuration

### Build Settings
- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (already includes `prisma generate`)
- **Output Directory:** `.next` (auto-detected)
- **Install Command:** `npm install` (triggers `postinstall` → `prisma generate`)

### Function Configuration

Vercel serverless functions have limits:
- **Max Duration:** 10 seconds (Hobby), 60 seconds (Pro), 300 seconds (Enterprise)
- **Max Payload:** 4.5 MB

**Important:** Long-running jobs (scraping pipeline) will need timeout handling:

```typescript
// In vercel.json (create if needed)
{
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 60  // Pro plan required for >10 seconds
    }
  }
}
```

### Recommended Approach for Long Jobs

Since the pipeline can take minutes/hours, use **background job processing**:

1. **Job Creation** - Quick serverless function creates job in DB
2. **Pipeline Execution** - Runs asynchronously (already implemented!)
3. **Status Polling** - Frontend polls job status

Current implementation already supports this pattern:
```typescript
// Creates job and returns immediately
const jobId = await jobOrchestratorService.startJob(config);

// Pipeline runs in background via runPipeline()
```

**Note:** On Vercel Hobby plan (10s limit), the pipeline will timeout. Solutions:
- Upgrade to **Vercel Pro** ($20/month) for 60s timeout
- Use **Vercel Cron Jobs** to process in chunks
- Move pipeline to **separate worker** (Inngest, Trigger.dev, or Railway)

## Alternative: Hybrid Deployment

If you need longer execution times without upgrading Vercel:

### Option 1: Inngest (Recommended - Free tier available)
```bash
npm install inngest
```
- Serverless background jobs
- Automatic retries
- Great free tier

### Option 2: Railway for Background Worker
- Deploy job orchestrator as separate service
- Keep Next.js UI on Vercel
- Use Postgres on Railway
- ~$5/month

## Cost Estimation

### Vercel Costs
- **Hobby:** Free (10s function timeout)
- **Pro:** $20/month (60s timeout, better for this app)
- **Enterprise:** Custom (300s timeout)

### Database Costs
- **Vercel Postgres:** Free tier → $0.30/GB storage
- **Railway:** $5/month minimum
- **Neon:** Generous free tier

### API Costs (Per Job)
- Google Places: ~$0.032/call × ZIPs
- Custom Search: ~$0.005/query × businesses
- OpenAI: ~$0.001/call × businesses
- **Target:** ~$0.02 per enriched email ✅

## Deployment Checklist

- [ ] Database created and `DATABASE_URL` set
- [ ] All environment variables configured
- [ ] Code pushed to GitHub
- [ ] Project deployed to Vercel
- [ ] Database migrations run (`prisma migrate deploy`)
- [ ] Database seeded (`prisma db seed`)
- [ ] Test job creation at `/jobs`
- [ ] Test business browsing at `/businesses`
- [ ] Test CSV export
- [ ] Monitor function execution times (upgrade plan if needed)

## Monitoring & Debugging

### View Logs
- Vercel Dashboard → Deployments → Click deployment → Functions tab
- Real-time logs for each serverless function

### Database Access
```bash
# Via Prisma Studio
npx prisma studio

# Via Vercel CLI
vercel env pull .env.local
npx prisma studio
```

### Performance Monitoring
- Vercel Analytics (built-in)
- Monitor API quota usage in Google Cloud Console
- Track OpenAI costs in OpenAI dashboard

## Production Optimizations

1. **Enable Edge Caching** for static pages
2. **Use Vercel Edge Functions** for faster response times
3. **Implement rate limiting** for API routes
4. **Add request queuing** if hitting API limits
5. **Set up alerts** for quota/cost thresholds

---

**Ready to deploy!** 🚀

For questions or issues, check:
- [Vercel Docs](https://vercel.com/docs)
- [Prisma Deployment Guides](https://www.prisma.io/docs/guides/deployment)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
