import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import Deck from './components/Deck';
import StoryExpander from './components/StoryExpander';
import './App.css';

// Fallback data in case Supabase is empty or fails


const CATEGORIES = ['national', 'international', 'business', 'science', 'tech', 'sports', 'entertainment'];

function App() {
  const [activeCategory, setActiveCategory] = useState('national');
  const [news, setNews] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [trendingMode, setTrendingMode] = useState(false);
  const [expandedStory, setExpandedStory] = useState(null);
  const [expandedArticles, setExpandedArticles] = useState([]);

  // Track active index globally so the parent can give the "More Info" button the correct link
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState('next');

  // Get articles for the current category
  let currentCategoryNews = news.filter(item => {
    return item.category && item.category.toLowerCase() === activeCategory;
  });

  // In trending mode: deduplicate by story, show only representative articles, sorted by trend score
  if (trendingMode && stories.length > 0) {
    const categoryStories = stories
      .filter(s => s.category === activeCategory)
      .sort((a, b) => b.trend_score - a.trend_score);

    // For each story, pick the first matching article as representative
    const deduped = [];
    const seenStoryIds = new Set();

    for (const story of categoryStories) {
      if (seenStoryIds.has(story.id)) continue;
      seenStoryIds.add(story.id);
      const rep = currentCategoryNews.find(a => a.story_id === story.id);
      if (rep) deduped.push(rep);
    }

    // Also include articles without a story_id (unclustered)
    const unclusteredArticles = currentCategoryNews.filter(a => !a.story_id);
    currentCategoryNews = [...deduped, ...unclusteredArticles];
  }

  const lastFetched = currentCategoryNews.length > 0
    ? new Date(Math.max(...currentCategoryNews.map(a => a.pubDate ? new Date(a.pubDate).getTime() : 0))).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch articles
      const { data: rows, error: fetchError } = await supabase
        .from('news')
        .select('*');

      if (fetchError) throw fetchError;

      let fetchedNews = rows.map(row => {
        let title = row.title || '';
        let description = row.description || '';

        // Filter out trailing "Reuters" found in existing data
        const reutersRegex = /\s*[-–—]?\s*Reuters\s*$/i;
        if (title) title = title.replace(reutersRegex, '').trim();
        if (description) description = description.replace(reutersRegex, '').trim();

        return {
          id: row.id,
          title,
          description,
          link: row.link,
          pubDate: row.pub_date,
          source: row.source,
          category: row.category,
          biasScore: row.bias_score,
          sensationalismScore: row.sensationalism_score,
          sensationalismLabel: row.sensationalism_label,
          politicalLeanScore: row.political_lean_score,
          politicalLeanLabel: row.political_lean_label,
          story_id: row.story_id || null
        };
      });

      if (fetchedNews.length === 0) {
        setError('No news articles found. Please check back later.');
      } else {
        setNews(fetchedNews);
      }

      // Fetch stories (gracefully handle if table doesn't exist yet)
      try {
        const { data: storyRows, error: storyError } = await supabase
          .from('stories')
          .select('*');

        if (!storyError && storyRows) {
          setStories(storyRows);
        }
      } catch (e) {
        console.warn('Stories table not available yet:', e.message);
      }

    } catch (err) {
      console.error('Error fetching from Supabase:', err);
      setError('Failed to load news. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = useCallback((cat) => {
    setActiveCategory(cat);
    setActiveIndex(0); // reset position when switching category
    setDirection('next');
  }, []);

  const handleNext = useCallback(() => {
    setDirection('next');
    setActiveIndex(prev => prev + 1);
  }, []);

  const handlePrev = useCallback(() => {
    setDirection('prev');
    setActiveIndex(prev => prev === 0 ? currentCategoryNews.length - 1 : prev - 1);
  }, [currentCategoryNews.length]);

  const handleExpandStory = useCallback((article) => {
    if (!article.story_id) return;
    const story = stories.find(s => s.id === article.story_id);
    if (!story) return;

    // Get all articles in this story
    const storyArticles = news.filter(a => a.story_id === article.story_id);
    setExpandedStory(story);
    setExpandedArticles(storyArticles);
  }, [stories, news]);

  const handleCloseExpander = useCallback(() => {
    setExpandedStory(null);
    setExpandedArticles([]);
  }, []);

  useEffect(() => {
    fetchNews();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Close story expander on Escape
      if (e.key === 'Escape' && expandedStory) {
        handleCloseExpander();
        return;
      }

      // If Shift is held, arrows switch categories
      if (e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const currentIndex = CATEGORIES.indexOf(activeCategory);
          const nextIndex = (currentIndex + 1) % CATEGORIES.length;
          handleCategoryChange(CATEGORIES[nextIndex]);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const currentIndex = CATEGORIES.indexOf(activeCategory);
          const prevIndex = (currentIndex - 1 + CATEGORIES.length) % CATEGORIES.length;
          handleCategoryChange(CATEGORIES[prevIndex]);
        }
      } else {
        // Normal arrow behavior for cards
        if (currentCategoryNews.length === 0) return;
        if (e.key === 'ArrowRight') {
          handleNext();
        } else if (e.key === 'ArrowLeft') {
          handlePrev();
        } else if (e.key.toLowerCase() === 'i') {
          setShowInfo(prev => !prev);
        } else if (e.key.toLowerCase() === 't') {
          setTrendingMode(prev => !prev);
          setActiveIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentCategoryNews.length, activeCategory, expandedStory, handleCategoryChange, handleNext, handlePrev, handleCloseExpander]); // Re-bind if context changes

  // Ensure we wrap for infinite iteration
  const safeIndex = currentCategoryNews.length > 0 ? (Math.abs(activeIndex) % currentCategoryNews.length) : 0;

  // Count trending stories in current category
  const trendingCount = stories.filter(s => s.category === activeCategory && s.source_count > 1).length;

  return (
    <div className="app-container">
      <header className="header">

        <div className="category-picker">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Trending toggle */}
      {trendingCount > 0 && (
        <div className="trending-toggle-bar">
          <button
            className={`trending-toggle ${trendingMode ? 'active' : ''}`}
            onClick={() => { setTrendingMode(prev => !prev); setActiveIndex(0); }}
            title="Show trending stories covered by multiple sources (T)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            {trendingMode ? 'Trending' : 'Trending'}
            {!trendingMode && <span className="trending-count">{trendingCount}</span>}
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Fetching latest news...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <p>{error}</p>
          <button className="retry-btn" onClick={fetchNews}>Retry</button>
        </div>
      ) : currentCategoryNews.length === 0 ? (
        <div className="empty-state">
          <p>No news in the <strong>{activeCategory}</strong> category today.</p>
        </div>
      ) : (
        <Deck
          articles={currentCategoryNews}
          activeIndex={safeIndex}
          direction={direction}
          onNext={handleNext}
          onPrev={handlePrev}
          stories={stories}
          onExpandStory={handleExpandStory}
        />
      )}

      {(() => {
        const article = currentCategoryNews[safeIndex];
        if (!article) return null;

        const badges = [];

        if (article.sensationalismLabel === 'sensational') {
          const confidence = Math.min(99, Math.round(article.sensationalismScore * 100));
          badges.push(
            <div className="bias-info-box sensational" key="sensational">
              <div className="bias-type">
                ⚠️ May be sensational <span className="bias-score-value">({confidence}% confidence)</span>
              </div>
              <div className="bias-description">This article may be using emotional or exaggerated language common in clickbait.</div>
            </div>
          );
        }

        if (article.politicalLeanLabel === 'left-leaning') {
          badges.push(
            <div className="bias-info-box lean-left" key="lean">
              <div className="bias-type">
                🔵 May lean left
              </div>
              <div className="bias-description">Based on the source's historical editorial position and language framing. Not a fact — a possibility.</div>
            </div>
          );
        } else if (article.politicalLeanLabel === 'right-leaning') {
          badges.push(
            <div className="bias-info-box lean-right" key="lean">
              <div className="bias-type">
                🔴 May lean right
              </div>
              <div className="bias-description">Based on the source's historical editorial position and language framing. Not a fact — a possibility.</div>
            </div>
          );
        }

        if (badges.length === 0) return null;

        return <div className="bias-info-stack">{badges}</div>;
      })()}

      {lastFetched && (
        <footer className="footer">
          <div className="footer-content">
            <p>Latest {activeCategory} news from {lastFetched}</p>
            <button className="info-btn" onClick={() => setShowInfo(true)} title="Project Info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
          </div>
        </footer>
      )}

      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInfo(false)}>&times;</button>
            <h2>About Newscards</h2>

            <div className="modal-section">
              <h3>Purpose</h3>
              <p>Designed for a distraction-free, convenient way to read news in a tactile flashcard format.</p>
            </div>

            <div className="modal-section">
              <h3>How it works</h3>
              <p>
                A background service scrapes news from major RSS feeds and processes them using basic Natural Language Processing (NLP).
                Articles are automatically clustered into stories using TF-IDF similarity — so you can see the same event from multiple perspectives.
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
                <strong>Technical Note:</strong> The "Sensationalism" detection uses a Naive Bayes classifier trained on ~38,000 headlines to identify clickbait and emotionally exaggerated language. It runs 100% offline via a custom Supabase Edge Function without relying on third-party LLM APIs.
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
                <strong>Political Lean:</strong> The "May lean left/right" indicator is source-heavy — it primarily uses each outlet's known editorial position from established media bias charts, with a minor secondary signal from unambiguous political framing keywords. It skips tech, science, sports, and entertainment entirely.
              </p>
            </div>

            <div className="modal-section">
              <h3>Quick Keybinds</h3>
              <ul>
                <li><strong>← / →</strong> Navigate cards</li>
                <li><strong>Shift + ← / →</strong> Switch categories</li>
                <li><strong>t</strong> Toggle trending mode</li>
                <li><strong>i</strong> Toggle this info box</li>
                <li><strong>Esc</strong> Close panels</li>
              </ul>
            </div>

            <div className="modal-section modal-footer">
              <p>Made with love by <a href="https://github.com/simonknowsstuff" target="_blank" rel="noopener noreferrer">simonknowsstuff</a> &lt;3</p>
            </div>
          </div>
        </div>
      )}

      {/* Story Expander */}
      {expandedStory && (
        <StoryExpander
          story={expandedStory}
          articles={expandedArticles}
          onClose={handleCloseExpander}
        />
      )}
    </div>
  );
}

export default App;
