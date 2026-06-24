-- Add sensationalism tracking columns to news table
ALTER TABLE news
ADD COLUMN sensationalism_score float,
ADD COLUMN sensationalism_label text;
