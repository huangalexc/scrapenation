# Railway Deployment Guide - Background Worker

This guide sets up a **hybrid architecture**:
- **Vercel:** Next.js UI, API routes, server actions
- **Railway:** Background worker for long-running scraping jobs
- **Shared Database:** Both connect to the same Postgres database

## Architecture Overview

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Vercel (UI)    │◄────►│  Postgres DB     │
│  - Next.js      │      │  (Railway)       │
│  - API Routes   │      └──────────────────┘
│  - Server       │               ▲
│    Actions      │               │
└─────────────────┘               │
         │                        │
         │ Create Job             │
         │ (Status=PENDING)       │
         ▼                        │
┌─────────────────┐               │
│  Railway Worker │───────────────┘
│  - Polls DB     │
│  - Executes     │
│  - Updates      │
└─────────────────┘
```

**How it works:**
1. User creates job via Vercel UI → Job saved as `PENDING` in database
2. Railway worker polls database every 5 seconds
3. Worker picks up `PENDING` jobs and executes pipeline
4. Worker updates job status in database as it progresses
5. UI polls job status and shows progress

---

## Part 1: Set Up Database on Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy PostgreSQL"

### Step 2: Get Database Connection String
1. Click on your Postgres service
2. Go to "Variables" tab
3. Copy the `DATABASE_URL` value

**Format:** `postgresql://user:password@host:port/database`

**Save this - you'll use it for both Vercel and Railway worker!**

---

## Part 2: Deploy Railway Background Worker

### Step 1: Files Already Created ✅

The worker files have been created for you:
- `worker/index.ts` - Main worker service
- `worker/package.json` - Worker dependencies
- `railway.json` - Railway configuration
- `nixpacks.toml` - Build configuration

### Step 2: Push Code to GitHub

```bash
git add .
git commit -m "Add Railway background worker"
git push origin main
```

### Step 3: Deploy Worker to Railway

1. Go to Railway dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `scrapenation` repository
5. Railway will auto-detect the project

### Step 4: Configure Railway Service

1. Click on your deployed service
2. Go to "Settings" tab
3. Under "Root Directory", leave empty (uses root)
4. Under "Start Command", it should show: `cd worker && npm start`

### Step 5: Add Environment Variables

Go to "Variables" tab and add:

```bash
DATABASE_URL=<your_postgres_url_from_step_2>
GOOGLE_PLACES_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<your_engine_id>
OPENAI_API_KEY=<your_key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
```

### Step 6: Deploy

Railway will automatically deploy after adding variables. Monitor the logs:
1. Go to "Deployments" tab
2. Click on latest deployment
3. View build and runtime logs
4. Look for: `[Worker] Starting Railway background worker...`

---

## Part 3: Deploy Next.js UI to Vercel

### Step 1: Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Vercel auto-detects Next.js

### Step 2: Add Environment Variables

In Vercel dashboard → Settings → Environment Variables:

```bash
DATABASE_URL=<same_postgres_url_from_railway>
GOOGLE_PLACES_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_API_KEY=<your_key>
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<your_engine_id>
OPENAI_API_KEY=<your_key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
```

**Important:** Use the **same** `DATABASE_URL` as Railway worker!

### Step 3: Deploy

Vercel automatically deploys. After deployment:

1. Go to your Vercel URL (e.g., `scrapenation.vercel.app`)
2. Navigate to `/businesses` - should be empty initially
3. You're ready to create jobs!

---

## Part 4: Initialize Database

After both services are deployed, initialize the database:

### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login and link project
vercel login
vercel link

# Pull environment variables (including DATABASE_URL)
vercel env pull .env.production

# Run migrations
npx prisma migrate deploy

# Seed database (optional - for testing)
npx prisma db seed
```

### Option B: Using Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Run migrations in Railway environment
railway run npx prisma migrate deploy

# Seed database (optional)
railway run npx prisma db seed
```

### Option C: Manual via Prisma Studio

```bash
# Set DATABASE_URL in local .env
echo "DATABASE_URL=<your_railway_postgres_url>" > .env.local

# Run migrations
npx prisma migrate deploy

# Open Prisma Studio to view database
npx prisma studio
```

---

## Part 5: Testing the Setup

### Test 1: Verify Worker is Running

1. Go to Railway dashboard
2. Click on worker service → "Logs" tab
3. You should see:
   ```
   [Worker] Starting Railway background worker...
   [Worker] Polling interval: 5000 ms
   [Worker] Max concurrent jobs: 3
   ```

### Test 2: Create a Test Job

Via the Vercel UI or using curl:

```bash
# Replace with your Vercel URL
curl -X POST https://scrapenation.vercel.app/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "businessType": "restaurant",
    "geography": ["CA"],
    "zipPercentage": 10
  }'
```

### Test 3: Monitor Job Progress

1. **Railway Logs:** Watch worker execute the pipeline
2. **Vercel Logs:** See API calls and database queries
3. **Database:** Check via Prisma Studio

```bash
npx prisma studio
# Navigate to "jobs" table to see job status
# Navigate to "businesses" table to see results
```

---

## Cost Breakdown

### Railway
- **Database:** $5/month (500 MB included)
- **Worker Service:** $5/month (512 MB RAM, always on)
- **Total:** ~$10/month

### Vercel
- **Hobby Plan:** Free (perfect for UI)
- **Pro Plan:** $20/month (if you need more)
- **Recommended:** Start with Free

### API Costs (Variable)
- Google Places: $32 per 1,000 calls
- Custom Search: $5 per 1,000 queries
- OpenAI GPT-4o-mini: ~$1 per 1,000 calls
- **Target:** ~$0.02 per enriched email

---

## Troubleshooting

### Worker Not Picking Up Jobs

**Check:**
1. Railway logs show worker is running
2. `DATABASE_URL` is correctly set in Railway
3. Database migration completed
4. Job status is `PENDING` in database

**Fix:**
```bash
# Restart Railway worker
railway restart
```

### Database Connection Errors

**Check:**
1. `DATABASE_URL` format is correct
2. Same URL used in both Vercel and Railway
3. Prisma client generated

**Fix:**
```bash
# Regenerate Prisma client
npx prisma generate

# Redeploy both services
vercel --prod
railway up
```

### Job Stuck in RUNNING

**Check:**
1. Railway worker logs for errors
2. API quota limits not exceeded

**Fix:**
```bash
# Manually mark job as failed
npx prisma studio
# Update job status to FAILED
```

---

## Monitoring & Maintenance

### View Logs

**Railway Worker:**
```bash
railway logs
# Or via dashboard: Service → Logs tab
```

**Vercel:**
```bash
vercel logs
# Or via dashboard: Deployments → Function Logs
```

### Database Backup

Railway auto-backs up Postgres. To manually backup:

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

### Scaling

**Increase Worker Concurrency:**

Edit `worker/index.ts`:
```typescript
const MAX_CONCURRENT_JOBS = 5; // Increase from 3
```

**Add More Workers:**

In Railway, duplicate the worker service for horizontal scaling.

---

## Production Checklist

- [ ] Database created on Railway
- [ ] Migrations run (`prisma migrate deploy`)
- [ ] Railway worker deployed and running
- [ ] Vercel UI deployed
- [ ] Both services use same `DATABASE_URL`
- [ ] All environment variables set
- [ ] Test job created and completed
- [ ] Monitoring set up (logs, alerts)
- [ ] Database backups configured
- [ ] API quota alerts configured (Google Cloud, OpenAI)

---

**You're all set! 🚀**

Create jobs via Vercel UI → Railway worker processes them → Results appear in UI!

For questions:
- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
