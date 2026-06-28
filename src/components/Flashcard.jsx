import React from 'react';

/**
 * Flashcard — Simplified card: Title, Description, Source.
 */
export default function Flashcard({ article }) {
  const titleLen = article.title?.length || 0;
  const titleSize = titleLen > 100 ? '22px' : titleLen > 60 ? '26px' : '32px';

  const articleDate = article?.pubDate
    ? new Date(article.pubDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const biasInfo = (() => {
    if (!article?.politicalLeanLabel) return null;
    const l = article.politicalLeanLabel;
    if (l === 'left-leaning') return { pos: '18%', text: 'Left-leaning' };
    if (l === 'right-leaning') return { pos: '82%', text: 'Right-leaning' };
    return { pos: '50%', text: 'Centrist' };
  })();

  const isSensational = article?.sensationalismLabel === 'sensational';

  return (
    <div className="center-card">
      <div className="card-title-area">
        <h1 className="card-headline" style={{ fontSize: titleSize }}>
          {article.title || '—'}
        </h1>
      </div>

      <div className="card-desc-area">
        <p className="card-body-text">
          {article.description || 'No description available.'}
        </p>
      </div>

      <div className="card-source-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-source-label">{article.source || '—'}</span>
          {articleDate && (
            <>
              <span style={{ color: 'var(--muted)', fontSize: '10px' }}>•</span>
              <span className="card-source-label" style={{ color: 'var(--muted)' }}>{articleDate}</span>
            </>
          )}
        </div>
        {isSensational && (
          <div className="sensational-badge">
            <span className="badge-icon">⚠️</span>
            <span className="badge-text">Sensational</span>
            <div className="badge-tooltip">
              This article may be using sensational or emotionally charged language.
            </div>
          </div>
        )}
      </div>

      {biasInfo && (
        <div className="card-bias-module">
          <div className="bias-strip">
            <div className="bias-marker" style={{ left: biasInfo.pos }}></div>
          </div>
          <div className="bias-ends">
            <span>Left</span>
            <span>Center</span>
            <span>Right</span>
          </div>
        </div>
      )}
    </div>
  );
}
