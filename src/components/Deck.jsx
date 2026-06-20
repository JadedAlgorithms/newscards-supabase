import React, { useState, useEffect, useRef } from 'react';
import Flashcard from './Flashcard';

export default function Deck({ articles, activeIndex, onNext, onPrev, direction, stories, allArticles, onExpandStory }) {
  const [rotations, setRotations] = useState([]);
  const [exitingCard, setExitingCard] = useState(null);
  const [animatingDir, setAnimatingDir] = useState(direction);
  
  const [deckHeight, setDeckHeight] = useState(600);
  const [measureWidth, setMeasureWidth] = useState(400);
  const measurementRef = useRef(null);
  
  const prevIndexRef = useRef(activeIndex);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 600;
      setMeasureWidth(isMobile ? 340 : 400);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Precalculate the uniform height needed for all articles
  useEffect(() => {
    if (measurementRef.current && articles.length > 0) {
      const isMobile = window.innerWidth <= 600;
      let maxHeight = isMobile ? 340 : 400; // Base height to maintain square ratio
      
      const vh = window.innerHeight;
      const limit = isMobile ? vh - 280 : vh - 250;

      const nodes = measurementRef.current.childNodes;
      nodes.forEach(node => {
        if (node.offsetHeight > maxHeight) {
          maxHeight = node.offsetHeight;
        }
      });
      
      // Apply the limit
      const finalHeight = Math.min(maxHeight, limit);
      
      // Add some padding for the deck effect and safe margins
      setDeckHeight(finalHeight + 20);
    }
  }, [articles, measureWidth]);

  useEffect(() => {
    // Generate random rotations for each article to simulate a stacked deck
    const newRots = articles.map(() => (Math.random() * 8) - 4); // -4deg to 4deg
    setRotations(newRots);
  }, [articles]);

  useEffect(() => {
    if (prevIndexRef.current !== activeIndex) {
      const oldIdx = prevIndexRef.current % articles.length;
      if (articles[oldIdx]) {
        setExitingCard(articles[oldIdx]);
        setAnimatingDir(direction);
        const timer = setTimeout(() => setExitingCard(null), 400);
        prevIndexRef.current = activeIndex;
        return () => clearTimeout(timer);
      }
      prevIndexRef.current = activeIndex;
    }
  }, [activeIndex, articles, direction]);

  if (!articles || articles.length === 0) {
    return <div className="empty-state">No news available in this category.</div>;
  }

  const onTouchStart = (e) => {
    setTouchEnd(null); // otherwise the swipe is fired even with usual touch events
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      onNext();
    } else if (isRightSwipe) {
      onPrev();
    }
  };

  /**
   * Get the source count for an article by looking up its story.
   */
  const getSourceCount = (article) => {
    if (!stories || !article.story_id) return 1;
    const story = stories.find(s => s.id === article.story_id);
    return story ? story.source_count : 1;
  };

  const currentIdx = activeIndex % articles.length;

  const renderCards = () => {
    const cardsToRender = [];
    
    // Render cards in stack
    for (let i = 3; i >= 0; i--) {
      const targetIdx = (currentIdx + i) % articles.length;
      if (articles[targetIdx]) {
        const isTop = i === 0;
        
        let scale = 1 - (i * 0.05); 
        let translateY = i * 15;
        let rotation = rotations[targetIdx] || 0;
        
        if (isTop) rotation = 0; 
        else rotation += (i % 2 === 0 ? 3 : -3);

        const style = {
          transform: `translateY(${translateY}px) scale(${scale}) rotate(${rotation}deg)`,
          opacity: 1 - (i * 0.25),
          zIndex: 10 - i,
          filter: isTop ? 'none' : `blur(${i * 1.5}px)`,
          height: `${deckHeight}px`
        };

        const article = articles[targetIdx];
        const sourceCount = getSourceCount(article);

        cardsToRender.push(
          <Flashcard 
            key={article.id || `article-${targetIdx}`} 
            article={article} 
            style={style}
            isTop={isTop}
            sourceCount={sourceCount}
            onExpandStory={isTop && sourceCount > 1 ? () => onExpandStory(article) : undefined}
          />
        );
      }
    }

    // Add exiting card on top if it exists
    if (exitingCard) {
      const exitStyle = {
        zIndex: 20,
        transform: animatingDir === 'next' 
          ? 'translateX(-150%) rotate(-20deg)' 
          : 'translateX(150%) rotate(20deg)',
        opacity: 0,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        height: `${deckHeight}px`
      };
      
      cardsToRender.push(
        <Flashcard 
          key={`exiting-${exitingCard.id}`} 
          article={exitingCard} 
          style={exitStyle}
          isTop={false} 
          sourceCount={1}
        />
      );
    }

    return cardsToRender;
  };

  return (
    <div className="deck-container" style={{ '--deck-height': `${deckHeight}px` }}>
      {/* Hidden measurement div to precalculate height */}
      <div 
        ref={measurementRef} 
        style={{ 
          position: 'absolute', 
          visibility: 'hidden', 
          width: `${measureWidth}px`, 
          pointerEvents: 'none',
          zIndex: -1000
        }}
        className="measurement-layer"
      >
        {articles.map((article, idx) => (
          <Flashcard 
            key={`measure-${article.id || idx}`} 
            article={article} 
            style={{ position: 'relative', height: 'auto', visibility: 'hidden' }}
            sourceCount={1}
          />
        ))}
      </div>
      <button className="nav-btn prev" onClick={onPrev}>&#8592;</button>
      
      <div 
        className="card-stack"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEndHandler}
      >
        {renderCards()}
      </div>

      <button className="nav-btn next" onClick={onNext}>&#8594;</button>

      {/* Bias Info Overlay - Moved to App.jsx for better layout flow */}
    </div>
  );
}
