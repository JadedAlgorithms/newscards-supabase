# Newscards
This project is more of a personal project that I don't intend to fully make public or display anywhere in my website. This project was developed to create a convenient way for me to read news from The Hindu in a flashcard format. I could probably add other newspapers as well but I'm not sure if I'll ever get around to doing that.

## Overview

The project consists of three main components:
- **Frontend**: A React + Vite application for the card-based UI.
- **Backend**: Supabase for data management.
- **News Scraper**: A standalone Node.js service that scrapes news from RSS feeds and syncs them to Supabase.

## Project Structure

```text
.
├── src/                # React frontend source code
├── news-scraper/       # Node.js scraper service
├── public/             # Static assets
└── package.json        # Main project dependencies and scripts
```

## Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)

### 1. Repository Setup
```bash
git clone <repository-url>
cd newscards
npm install
```

### 2. Frontend Setup
Create a `.env` file in the root directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. News Scraper Setup
Detailed instructions can be found in the [News Scraper README](./news-scraper/README.md).
```bash
cd news-scraper
npm install
# Configure your .env file as per the sub-directory README
cd ..
```

## Local Development

Start the frontend development server:
```bash
npm run dev
```

### Other Commands
- **Frontend only**: `npm run dev`
- **Linting**: `npm run lint`

## Deployment

### News Scraper
The news scraper is designed to be run as a cron job on a server. See the [Scraper Documentation](./news-scraper/README.md) for more details.

## License
MIT
