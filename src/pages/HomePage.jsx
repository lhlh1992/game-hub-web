import { useEffect, useState } from 'react'

const heroSlides = [
  {
    id: 0,
    type: 'welcome',
    cardBg: '',
  },
  {
    id: 1,
    eyebrow: '热门推荐',
    title: '五子棋 · 全球同服排位赛',
    description: '实时匹配，智能复盘，挑战更高段位。',
    cardBg: 'has-gomoku-bg',
    slideClass: 'slide-gomoku',
  },
  {
    id: 2,
    eyebrow: '本周精选',
    title: '中国跳棋 · 六角星对战',
    description: '经典棋盘、多人实时匹配，体验音乐与灯光的节奏感。',
    cardBg: 'has-chinese-checker-bg',
    slideClass: 'slide-chinese-checker',
  },
  {
    id: 3,
    eyebrow: '街区热度',
    title: '巷道狂奔 · 夜色竞速',
    description: '沉浸式霓虹街道，极速奔跑 + 技能冲刺，挑战排行榜。',
    cardBg: 'has-alley-runner-bg',
    slideClass: 'slide-alley-runner',
  },
]

const gameSections = [
  {
    title: '热门游戏',
    eyebrow: 'Top Games',
    cards: [
      {
        title: '五子棋',
        description: '支持 PVP / PVE、AI 复盘',
        badge: 'HOT',
        badgeClass: 'hot',
        image: '/images/games/gomoku-banner.png',
        cta: '开始',
        variant: 'primary',
      },
      {
        title: '中国跳棋',
        description: '经典六角星棋盘，支持多人同场对战',
        badge: 'WEEKLY',
        badgeClass: 'weekly',
        image: '/images/games/chinese-checker-logo.png',
        cta: '敬请期待',
      },
      {
        title: '巷道狂奔',
        description: '现代都市赛道中的极速跑酷挑战',
        badge: 'NEW',
        badgeClass: 'new',
        image: '/images/games/alley-runner.png',
        cta: '敬请期待',
      },
      {
        title: 'UNO',
        description: '多人卡牌，欢乐无限',
        badge: 'CLUB',
        badgeClass: 'club',
        thumbClass: 'gradient-orange',
        thumbText: 'UNO',
        cta: '敬请期待',
      },
    ],
  },
  {
    title: '新游戏',
    eyebrow: 'New Games',
    cards: [
      {
        title: '合成猫猫',
        description: '三消 + 养成，放松治愈',
        badge: 'DAILY',
        badgeClass: 'daily',
        thumbClass: 'gradient-green',
        thumbText: '合成猫猫',
        cta: '试玩',
        variant: 'primary',
      },
      {
        title: '花园消除',
        description: '连线拼图，打造梦想花园',
        badge: 'HOT',
        badgeClass: 'hot',
        thumbClass: 'gradient-emerald',
        thumbText: '花园消除',
        cta: '试玩',
        variant: 'primary',
      },
      {
        title: '幸运宾果',
        description: '多人竞速，刺激加倍',
        badge: '本月精选',
        badgeClass: 'monthly',
        thumbClass: 'gradient-candy',
        thumbText: '幸运宾果',
        cta: '敬请期待',
      },
    ],
  },
  {
    title: '策略 / 棋牌',
    eyebrow: 'Strategy & Board',
    cards: [
      {
        title: '中国象棋',
        description: '残局闯关，在线对战',
        thumbClass: 'gradient-sunset',
        thumbText: '中国象棋',
        cta: '开始',
        variant: 'primary',
      },
      {
        title: '围棋',
        description: '段位挑战，真人匹配',
        thumbClass: 'gradient-deep',
        thumbText: '围棋',
        cta: '敬请期待',
      },
      {
        title: '德州扑克',
        description: '好友房、自建桌局',
        thumbClass: 'gradient-berry',
        thumbText: '德州扑克',
        cta: '敬请期待',
      },
    ],
  },
]

const HomePage = () => {
  useEffect(() => {
    document.body.classList.add('home')
    return () => document.body.classList.remove('home')
  }, [])

  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = heroSlides[activeIndex]

  const goToSlide = (nextIndex) => {
    const total = heroSlides.length
    const normalized = (nextIndex + total) % total
    setActiveIndex(normalized)
  }

  return (
    <main className="gh-main-inner">
      <div className="home-layout">
        <div className="hero-column">
          <div className={`hero-card hero-slider ${activeSlide.cardBg}`} data-slider>
            <button
              className="slider-nav prev"
              type="button"
              aria-label="上一张"
              data-slider-prev
              onClick={() => goToSlide(activeIndex - 1)}
            >
              ‹
            </button>
            <button
              className="slider-nav next"
              type="button"
              aria-label="下一张"
              data-slider-next
              onClick={() => goToSlide(activeIndex + 1)}
            >
              ›
            </button>
            <div
              className="slider-track"
              data-slider-track
              style={{ transform: `translateX(-${activeIndex * 100}%)` }}
            >
              {heroSlides.map((slide, idx) => (
                <HeroSlide key={slide.id} slide={slide} isActive={idx === activeIndex} index={idx} />
              ))}
            </div>
            <div className="slider-dots" data-slider-dots>
              {heroSlides.map((slide, idx) => (
                <button
                  key={slide.id}
                  className={`slider-dot ${idx === activeIndex ? 'is-active' : ''}`}
                  type="button"
                  aria-label={`切换到第 ${idx + 1} 张`}
                  data-slider-dot={idx}
                  onClick={() => goToSlide(idx)}
                />
              ))}
            </div>
          </div>

          <section className="game-sections">
            {gameSections.map((section) => (
              <div key={section.title} className="game-section">
                <div className="section-header">
                  <div>
                    <p className="section-eyebrow">{section.eyebrow}</p>
                    <h3>{section.title}</h3>
                  </div>
                  <button className="section-link" type="button">
                    查看全部
                  </button>
                </div>
                <div className="game-row">
                  {section.cards.map((card) => (
                    <GameCard key={card.title} {...card} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  )
}

export default HomePage

const HeroSlide = ({ slide, isActive, index }) => {
  if (slide.type === 'welcome') {
    return (
      <article className={`slider-slide hero-welcome ${isActive ? 'is-active' : ''}`} data-slide-index={index}>
        <div className="slide-content">
          <div className="welcome-logo" aria-hidden="true">
            <img src="/images/game-logo.png" alt="GameHub Joker logo" />
            <span className="hero-logo-caption">LET&apos;S PLAY!</span>
          </div>
            <div className="welcome-text">
            <h1>欢迎来到 GameHub</h1>
            <p>与好友一起享受游戏的乐趣</p>
          </div>
        </div>
        <div className="slide-visual" aria-hidden="true" />
      </article>
    )
  }

  return (
    <article
      className={`slider-slide ${slide.slideClass || ''} ${isActive ? 'is-active' : ''}`}
      data-slide-index={index}
    >
      <div className="slide-content">
        {slide.eyebrow && <p className="slide-eyebrow">{slide.eyebrow}</p>}
        <h2>{slide.title}</h2>
        <p>{slide.description}</p>
      </div>
      <div className="slide-visual" aria-hidden="true" />
    </article>
  )
}

const GameCard = ({ title, description, badge, badgeClass, image, thumbClass, thumbText, cta, variant }) => {
  return (
    <article className={`game-card ${badgeClass ? `card-${badgeClass}` : ''}`}>
      <div className={`game-thumb ${thumbClass || ''}`}>
        {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
        {image ? <img src={image} alt={title} /> : thumbText ? <span className="thumb-text">{thumbText}</span> : null}
      </div>
      <div className="game-details">
        <div className="game-text">
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <div className="game-actions">
          <button className={variant === 'primary' ? 'play-btn' : 'play-outline'} type="button">
            {cta}
          </button>
          {variant === 'primary' && (
            <button className="icon-btn" type="button" aria-label="收藏">
              ♡
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

