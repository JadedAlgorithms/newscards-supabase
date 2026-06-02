import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Deck from './components/Deck';
import './App.css';

// Fallback data in case Supabase is empty or fails


const CATEGORIES = ['national', 'international', 'business', 'science', 'tech', 'sports'];

function App() {
  const [activeCategory, setActiveCategory] = useState('national');
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  // Track active index globally so the parent can give the "More Info" button the correct link
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState('next');

  const currentCategoryNews = news.filter(item => {
    // Normalizing to lowercase to match the button categories
    return item.category && item.category.toLowerCase() === activeCategory;
  });

  const lastFetched = currentCategoryNews.length > 0
    ? new Date(Math.max(...currentCategoryNews.map(a => a.pubDate ? new Date(a.pubDate).getTime() : 0))).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

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
          biasScore: row.bias_score
        };
      });

      if (fetchedNews.length === 0) {
        setError('No news articles found. Please check back later.');
      } else {
        setNews(fetchedNews);
      }
    } catch (err) {
      console.error('Error fetching from Supabase:', err);
      setError('Failed to load news. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    setActiveIndex(0); // reset position when switching category
    setDirection('next');
  };

  const handleNext = () => {
    setDirection('next');
    setActiveIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    setDirection('prev');
    setActiveIndex(prev => prev === 0 ? currentCategoryNews.length - 1 : prev - 1);
  };

  useEffect(() => {
    fetchNews();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
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
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentCategoryNews.length, activeCategory]); // Re-bind if context changes

  // Ensure we wrap for infinite iteration
  const safeIndex = currentCategoryNews.length > 0 ? (Math.abs(activeIndex) % currentCategoryNews.length) : 0;
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

      {(() => {
        const article = currentCategoryNews[safeIndex];
        if (!article || typeof article.biasScore === 'undefined') return null;
        const absScore = Math.abs(article.biasScore);
        if (absScore <= 0.5) return null;

        const isRight = article.biasScore > 0;
        const biasType = absScore > 1.5 ? (isRight ? 'Strongly Right-leaning' : 'Strongly Left-leaning') : (isRight ? 'Right-leaning' : 'Left-leaning');
        const biasDesc = isRight ? 'This article may favor conservative or traditional perspectives.' : 'This article may favor liberal or progressive perspectives.';

        return (
          <div className={`bias-info-box ${isRight ? 'right' : 'left'}`}>
            <div className="bias-type">
              {biasType} <span className="bias-score-value">({article.biasScore})</span>
            </div>
            <div className="bias-description">{biasDesc}</div>
          </div>
        );
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
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
                <strong>Technical Note:</strong> The "Bias" detection uses simplified sentiment analysis (AFINN-165) and keyword-based categorization. Because it relies on word frequency rather than deep semantic understanding, it may occasionally misinterpret nuance, sarcasm, or neutral reporting as biased. Treat the bias scores as experimental indicators rather than absolute facts.
              </p>
            </div>

            <div className="modal-section">
              <h3>Quick Keybinds</h3>
              <ul>
                <li><strong>← / →</strong> Navigate cards</li>
                <li><strong>Shift + ← / →</strong> Switch categories</li>
                <li><strong>i</strong> Toggle this info box</li>
              </ul>
            </div>

            <div className="modal-section modal-footer">
              <p>Made with love by <a href="https://github.com/simonknowsstuff" target="_blank" rel="noopener noreferrer">simonknowsstuff</a> &lt;3</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
