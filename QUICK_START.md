# Quick Start Guide

## Railway + Vercel Hybrid Deployment

### TL;DR
1. **Railway:** Postgres DB + Background Worker (~$10/month)
2. **Vercel:** Next.js UI (Free)
3. **Both:** Connect to same database

### 5-Minute Setup

#### 1. Deploy Database (Railway)
```bash
1. Go to railway.app → New Project → PostgreSQL
2. Copy DATABASE_URL from Variables tab
```

#### 2. Deploy Worker (Railway)
```bash
1. Push code: git push origin main
2. Railway → New → GitHub Repo → scrapenation
3. Add environment variables (DATABASE_URL + API keys)
4. Worker starts automatically
```

#### 3. Deploy UI (Vercel)
```bash
1. vercel.com → New Project → Import scrapenation repo
2. Add environment variables (same DATABASE_URL + API keys)
3. Deploy
```

#### 4. Initialize Database
```bash
vercel env pull .env.local
npx prisma migrate deploy
npx prisma db seed
```

### Done! 🎉

- **Create jobs:** `https://your-app.vercel.app/jobs` (coming soon)
- **View businesses:** `https://your-app.vercel.app/businesses`
- **Monitor worker:** Railway dashboard → Logs

---

## How Jobs Work

```
User → Creates Job (Vercel) → Saved as PENDING in DB
                                       ↓
                            Railway Worker (polls every 5s)
                                       ↓
                              Executes full pipeline
                                       ↓
                            Updates job status in DB
                                       ↓
                              User sees results (Vercel)
```

---

## Environment Variables Needed

```bash
DATABASE_URL=postgresql://...
GOOGLE_PLACES_API_KEY=AIza...
GOOGLE_CUSTOM_SEARCH_API_KEY=AIza...
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=...
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
```

**Same variables in both Railway and Vercel!**

---

## Cost Estimate

### Fixed Costs
- Railway: $10/month (DB + Worker)
- Vercel: $0/month (Hobby plan)

### Variable Costs (per job)
- Google Places: $0.032 × ZIP codes
- Custom Search: $0.005 × businesses
- OpenAI: $0.001 × businesses
- **Target:** ~$0.02 per enriched email

### Example Job
- 100 ZIP codes in CA
- 2,000 businesses found
- **Cost:** ~$3.20 + $10 + $2 = **$15.20**
- **Result:** 2,000 enriched business records

---

## Quick Commands

```bash
# View logs
railway logs                 # Worker logs
vercel logs                  # UI logs

# Database access
npx prisma studio            # Visual DB browser

# Restart services
railway restart              # Restart worker
vercel --prod                # Redeploy UI

# Monitor jobs
# Go to Railway → Logs tab
# Watch for: [Worker] Starting job...
```

---

## Next Steps

1. **Create /jobs page** - UI for starting jobs (not yet implemented)
2. **Add job monitoring** - Real-time progress display
3. **Implement caching** - Reduce duplicate API calls
4. **Set up alerts** - API quota notifications

---

For detailed instructions, see:
- `RAILWAY_DEPLOYMENT.md` - Complete deployment guide
- `DEPLOYMENT.md` - Alternative deployment options
