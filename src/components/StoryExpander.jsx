import React from 'react';

/**
 * StoryExpander — A slide-up panel showing all articles in a story cluster.
 * Shows multiple perspectives from different sources covering the same story.
 */
export default function StoryExpander({ story, articles, onClose }) {
  if (!story || !articles || articles.length === 0) return null;

  return (
    <div className="story-expander-overlay" onClick={onClose}>
      <div className="story-expander-panel" onClick={e => e.stopPropagation()}>
        <div className="story-expander-header">
          <div className="story-expander-meta">
            <span className="story-source-count">{story.source_count} source{story.source_count !== 1 ? 's' : ''}</span>
            <span className="story-category-tag">{story.category}</span>
          </div>
          <button className="story-expander-close" onClick={onClose}>&times;</button>
        </div>

        <h2 className="story-expander-title">{story.representative_title}</h2>

        <div className="story-perspectives-list">
          {articles.map((article, i) => (
            <a
              key={article.id || i}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="perspective-card"
            >
              <div className="perspective-source">{article.source}</div>
              <div className="perspective-title">{article.title}</div>
              {article.description && (
                <div className="perspective-desc">{article.description.substring(0, 120)}{article.description.length > 120 ? '...' : ''}</div>
              )}
              <div className="perspective-footer">
                <span className="perspective-date">
                  {article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : ''}
                </span>
                <span className="perspective-link-hint">Read →</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
