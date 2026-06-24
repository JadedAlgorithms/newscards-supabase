-- Add political lean tracking columns to news table
ALTER TABLE news
ADD COLUMN political_lean_score float,
ADD COLUMN political_lean_label text;
