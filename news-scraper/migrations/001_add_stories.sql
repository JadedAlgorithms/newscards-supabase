-- News Clustering Migration
-- Creates the stories table and adds story_id to news

-- 1. Create stories table
CREATE TABLE IF NOT EXISTS stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  representative_title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'national',
  trend_score INTEGER NOT NULL DEFAULT 1,
  source_count INTEGER NOT NULL DEFAULT 1,
  sources TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add story_id column to news table
ALTER TABLE news ADD COLUMN IF NOT EXISTS story_id UUID REFERENCES stories(id) ON DELETE SET NULL;

-- 3. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_news_story_id ON news(story_id);
CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_trend_score ON stories(trend_score DESC);

-- 4. Enable RLS on stories table (match news table pattern)
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- 5. Allow public read access to stories (same as news)
CREATE POLICY "Allow public read access to stories"
  ON stories FOR SELECT
  USING (true);

-- 6. Allow service role full access to stories
CREATE POLICY "Allow service role full access to stories"
  ON stories FOR ALL
  USING (true)
  WITH CHECK (true);
