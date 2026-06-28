import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import Deck from './components/Deck';
import StoryExpander from './components/StoryExpander';
import './App.css';

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

    const deduped = [];
    const seenStoryIds = new Set();

    for (const story of categoryStories) {
      if (seenStoryIds.has(story.id)) continue;
      seenStoryIds.add(story.id);
      const rep = currentCategoryNews.find(a => a.story_id === story.id);
      if (rep) deduped.push(rep);
    }

    const unclusteredArticles = currentCategoryNews.filter(a => !a.story_id);
    currentCategoryNews = [...deduped, ...unclusteredArticles];
  }

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: fetchError } = await supabase
        .from('news')
        .select('*');

      if (fetchError) throw fetchError;

      let fetchedNews = rows.map(row => {
        let title = row.title || '';
        let description = row.description || '';

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
    setActiveIndex(0);
    setDirection('next');
  }, []);

  const handleNext = useCallback(() => {
    setDirection('next');
    setActiveIndex(prev => {
      const len = currentCategoryNews.length;
      return len > 0 ? (prev + 1) % len : 0;
    });
  }, [currentCategoryNews.length]);

  const handlePrev = useCallback(() => {
    setDirection('prev');
    setActiveIndex(prev => {
      const len = currentCategoryNews.length;
      return len > 0 ? (prev - 1 + len) % len : 0;
    });
  }, [currentCategoryNews.length]);

  const handleExpandStory = useCallback((article) => {
    if (!article || !article.story_id) return;
    const story = stories.find(s => s.id === article.story_id);
    if (!story) return;

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
      if (e.key === 'Escape' && expandedStory) {
        handleCloseExpander();
        return;
      }

      if (e.key === 'Escape' && showInfo) {
        setShowInfo(false);
        return;
      }

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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCategoryNews.length, activeCategory, expandedStory, showInfo, handleCategoryChange, handleNext, handlePrev, handleCloseExpander]);

  // Safe modular index
  const safeIndex = currentCategoryNews.length > 0
    ? ((activeIndex % currentCategoryNews.length) + currentCategoryNews.length) % currentCategoryNews.length
    : 0;

  // Trending count
  const trendingCount = stories.filter(s => s.category === activeCategory && s.source_count > 1).length;

  // Progress
  const progressPct = currentCategoryNews.length > 1
    ? (safeIndex / (currentCategoryNews.length - 1)) * 100
    : 0;

  // ── Bottom bar metadata (derived from current article) ──
  const currentArticle = currentCategoryNews.length > 0 ? currentCategoryNews[safeIndex] : null;

  // Date has been moved to Flashcard.jsx

  const biasLabel = (() => {
    if (!currentArticle?.politicalLeanLabel) return null;
    const l = currentArticle.politicalLeanLabel;
    if (l === 'left-leaning') return 'L';
    if (l === 'right-leaning') return 'R';
    return 'N';
  })();

  const currentSourceCount = (() => {
    if (!stories?.length || !currentArticle?.story_id) return 1;
    const story = stories.find(s => s.id === currentArticle.story_id);
    return story ? story.source_count : 1;
  })();

  const showNav = !loading && !error && currentCategoryNews.length > 0;

  return (
    <div className="app-container">
      {/* ── TOP BAR: Classifications ── */}
      <div className="top-bar">
        <div className="top-bar-inner">
          <div className="pub-logo" onClick={() => handleCategoryChange('national')}>
            News<em>cards</em>
          </div>
          <div className="logo-divider"></div>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`cat-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
          {trendingCount > 0 && (
            <button
              className={`cat-btn trending ${trendingMode ? 'active' : ''}`}
              onClick={() => { setTrendingMode(prev => !prev); setActiveIndex(0); }}
              title="Show trending stories (T)"
            >
              ↗ Trending
              {!trendingMode && <span className="trend-count">{trendingCount}</span>}
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN: [Prev] [Card] [Next] ── */}
      <div className="main-content">
        {showNav && (
          <button className="side-nav side-prev" onClick={handlePrev} aria-label="Previous article">
            ←
          </button>
        )}

        <div className={`center-stage ${!showNav ? 'center-stage--full' : ''}`}>
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
            />
          )}
        </div>

        {showNav && (
          <button className="side-nav side-next" onClick={handleNext} aria-label="Next article">
            →
          </button>
        )}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="bottom-bar">
        <div className="bottom-left">
        </div>
        <div className="bottom-center">
          {showNav && (
            <>
              {currentArticle?.link && (
                <a
                  href={currentArticle.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="more-info-link"
                >
                  More Info →
                </a>
              )}
              {currentSourceCount > 1 && (
                <button
                  className="perspectives-link"
                  onClick={() => handleExpandStory(currentArticle)}
                >
                  {currentSourceCount} Perspectives
                </button>
              )}
              <div className="bottom-progress">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
                </div>
                <span className="progress-label">{safeIndex + 1} / {currentCategoryNews.length}</span>
              </div>
            </>
          )}
        </div>
        <div className="bottom-right">
          <button className="about-btn" onClick={() => setShowInfo(true)}>About</button>
        </div>
      </div>

      {/* ── INFO MODAL ── */}
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

      {/* ── STORY EXPANDER ── */}
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
