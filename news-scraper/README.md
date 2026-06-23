# News Scraper Backend

This is a standalone Node.js script designed to scrape news from Indian newspapers (starting with **The Hindu**) and sync them directly to your Supabase database.

## Features
- Scrapes RSS feeds for reliable data.
- Extracts images and descriptions.
- Cleans and updates Supabase automatically.
- Designed for 24/7 server deployment (via Cron).

## Setup

1. **Install Dependencies**:
   ```bash
   cd news-scraper
   npm install
   ```

2. **Environment Variables**:
   - Create a `.env` file from the example:
     ```bash
     cp .env.example .env
     ```
   - Configure the variables inside `.env`:
     - Set `SUPABASE_URL` to your Supabase project URL.
     - Set `SUPABASE_SERVICE_ROLE_KEY` to your Supabase service role key (needed to bypass RLS and perform database insertions).

3. **Database Setup / Migrations**:
   - Run the migration check script to ensure the required database schema exists:
     ```bash
     node migrate.js
     ```
     This script will verify your database connection and guide you on running the SQL migration if tables are missing.

4. **Test Run**:
   ```bash
   npm start
   ```

## Deployment as a Cron Job

To run this every hour on a Linux server:

1. Open crontab:
   ```bash
   crontab -e
   ```

2. Add the following line (adjust paths):
   ```bash
   0 * * * * /usr/bin/node /path/to/newscards/news-scraper/index.js >> /path/to/newscards/news-scraper/scraper.log 2>&1
   ```

## Categories
Currently scrapes:
- National
- International
- Business

using thehindu.com's RSS feeds.