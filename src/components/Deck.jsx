import React, { useState } from 'react';
import Flashcard from './Flashcard';

/**
 * Deck — Single card display with touch swipe support.
 */
export default function Deck({ articles, activeIndex, onNext, onPrev }) {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  if (!articles || articles.length === 0) {
    return <div className="empty-state">No news available in this category.</div>;
  }

  const currentIdx = activeIndex % articles.length;
  const article = articles[currentIdx];

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) onNext();
    else if (distance < -minSwipeDistance) onPrev();
  };

  return (
    <div
      className="deck-container"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEndHandler}
    >
      <Flashcard
        key={article.id || `card-${currentIdx}`}
        article={article}
      />
    </div>
  );
}
