import React from 'react';

export default function Flashcard({ article, style, isTop, sourceCount, onExpandStory }) {
  // Generate a stable gradient based on the article ID
  const getGradient = (id = 'default') => {
    const colors = [
      ['#FF3CAC', '#784BA0', '#2B86C5'],
      ['#00DBDE', '#FC00FF'],
      ['#f093fb', '#f5576c'],
      ['#667eea', '#764ba2'],
      ['#2af598', '#009efd'],
      ['#ff0844', '#ffb199'],
      ['#96fbc4', '#f9f586'],
      ['#0093E9', '#80D0C7'],
      ['#8EC5FC', '#E0C3FC'],
      ['#FBAB7E', '#F7CE68']
    ];
    let hash = 0;
    const str = id.toString();
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const pair = colors[Math.abs(hash) % colors.length];
    return `linear-gradient(135deg, ${pair.join(', ')})`;
  };

  const cardStyle = {
    ...style,
    background: getGradient(article.id),
  };

  const titleSize = article.title?.length > 80 ? '1.4rem' : article.title?.length > 50 ? '1.6rem' : '1.8rem';
  const descSize = article.description?.length > 150 ? '0.85rem' : '1rem';

  const handleCardClick = (e) => {
    if (!isTop || !sourceCount || sourceCount <= 1 || !onExpandStory) return;
    // Don't intercept clicks on the "More Info" button
    if (e.target.closest('.more-info-btn')) return;
    onExpandStory();
  };

  return (
    <div
      className="flashcard"
      style={cardStyle}
      onClick={handleCardClick}
    >
      <div className="top-right-badges">
        {/* Source badge */}
        {sourceCount > 1 && (
          <div className="source-badge" title={`Covered by ${sourceCount} sources`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {sourceCount}
          </div>
        )}

        {/* Sensationalism badge */}
        {article.sensationalismLabel === 'sensational' ? (
          <div className="sensational-badge" title={`Likelihood of sensational language: ${Math.min(99, Math.round(article.sensationalismScore * 100))}%`}>
            ⚠️ May be sensational
          </div>
        ) : article.sensationalismLabel === 'non-sensational' || article.sensationalismLabel === 'neutral' ? (
          <div className="neutral-badge" title={`Likelihood of neutral language: ${Math.min(99, Math.round((1 - article.sensationalismScore) * 100))}%`}>
            ✅ Neutral
          </div>
        ) : null}

        {/* Political lean badge */}
        {article.politicalLeanLabel === 'left-leaning' && (
          <div className="lean-badge lean-left-badge" title="May lean left — based on source editorial position">
            🔵 May lean left
          </div>
        )}
        {article.politicalLeanLabel === 'right-leaning' && (
          <div className="lean-badge lean-right-badge" title="May lean right — based on source editorial position">
            🔴 May lean right
          </div>
        )}
      </div>

      {/* Source name label */}
      {article.source && (
        <div className="source-label">{article.source}</div>
      )}

      <div className="card-content full-card">
        <h3 className="card-title" style={{ fontSize: titleSize }}>{article.title}</h3>
        {article.description && (
          <p className="card-description" style={{ fontSize: descSize }}>{article.description}</p>
        )}
        
        <div className="card-spacer"></div>

        <div className="card-actions">
          {sourceCount > 1 ? (
            <button
              className="more-info-btn inverse perspectives-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onExpandStory) onExpandStory();
              }}
              style={{ pointerEvents: isTop ? 'auto' : 'none' }}
            >
              {sourceCount} Perspectives
            </button>
          ) : (
            <a 
              href={article.link} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="more-info-btn inverse"
              style={{ 
                pointerEvents: isTop ? 'auto' : 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
                borderColor: 'rgba(255, 255, 255, 0.3)'
              }}
            >
              More Info
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
