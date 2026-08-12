import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Braces, Code2, Menu, ScanLine,
  ShieldCheck, X,
} from 'lucide-react';
import InteractionShowcase from './InteractionShowcase';
import VideoPlayer from './VideoPlayer';
import './landing.css';

type PublicRoute = '/' | '/product' | '/how-it-works' | '/engineering';

const routes: Array<{ href: PublicRoute; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/product', label: 'Product' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/engineering', label: 'Engineering' },
];

function currentRoute(): PublicRoute {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return routes.some((route) => route.href === path) ? path as PublicRoute : '/';
}

function RouteLink({ href, children, className, onNavigate }: {
  href: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || !href.startsWith('/') || href.startsWith('/demo')
    ) return;
    event.preventDefault();
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onNavigate?.();
  };
  return <a href={href} className={className} onClick={handleClick}>{children}</a>;
}

function SiteHeader({ route }: { route: PublicRoute }) {
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [route]);

  return (
    <header className="site-header">
      <RouteLink className="site-wordmark" href="/">
        <span className="site-mark" aria-hidden="true">L</span><span>Lexora</span>
      </RouteLink>
      <button className="site-menu-button" type="button" aria-expanded={open}
        aria-controls="site-navigation" onClick={() => setOpen((value) => !value)}>
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        <span className="sr-only">{open ? 'Close navigation' : 'Open navigation'}</span>
      </button>
      <nav id="site-navigation" aria-label="Public navigation" data-open={open}>
        {routes.map((item) => (
          <RouteLink key={item.href} href={item.href} onNavigate={() => setOpen(false)}>
            <span aria-current={route === item.href ? 'page' : undefined}>{item.label}</span>
          </RouteLink>
        ))}
      </nav>
      <a className="site-demo-link" href="/demo">Open demo <ArrowUpRight size={15} aria-hidden="true" /></a>
    </header>
  );
}

function ProductFrame({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={`product-frame${compact ? ' product-frame-compact' : ''}`}>
      <img src="/release/lexora-interactive.webp" width="1440" height="900"
        alt="Lexora Interactive mode presenting a source-backed German exercise"
        fetchPriority={compact ? undefined : 'high'} />
    </figure>
  );
}

function PageIntro({ eyebrow, title, copy, children }: {
  eyebrow?: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        {eyebrow && <p className="site-kicker">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{copy}</p>
        {children}
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="home-copy">
          <p className="site-kicker">Source-faithful language practice</p>
          <h1>Turn workbook exercises into focused practice.</h1>
          <p>Lexora rebuilds each source exercise as one coherent learner task, with the original page always within reach.</p>
          <div className="site-actions">
            <a className="site-button site-button-primary" href="/demo">Try the demo <ArrowRight size={17} aria-hidden="true" /></a>
            <RouteLink className="site-button site-button-secondary" href="/product">Explore the product</RouteLink>
          </div>
        </div>
        <ProductFrame />
      </section>
      <section className="home-trust" aria-labelledby="home-trust-title">
        <h2 id="home-trust-title">One source. Two trustworthy views.</h2>
        <div className="trust-points">
          <article><strong>Interactive</strong><p>Complete the full exercise, check it once, then move forward.</p></article>
          <article><strong>Classic</strong><p>Return to the original workbook page whenever source context matters.</p></article>
          <article><strong>Grounded</strong><p>Ambiguous answers stay neutral. Lexora never invents correction authority.</p></article>
        </div>
      </section>
      <section className="home-route-grid" aria-label="Explore Lexora">
        <RouteLink href="/product"><span>Product</span><strong>See complete exercise interactions</strong><ArrowUpRight aria-hidden="true" /></RouteLink>
        <RouteLink href="/how-it-works"><span>How it works</span><strong>Follow the source-to-lesson path</strong><ArrowUpRight aria-hidden="true" /></RouteLink>
        <RouteLink href="/engineering"><span>Engineering</span><strong>Review the deterministic boundary</strong><ArrowUpRight aria-hidden="true" /></RouteLink>
      </section>
    </>
  );
}

function ProductPage() {
  return (
    <>
      <PageIntro eyebrow="Product" title="The exercise stays whole."
        copy="Interactive Mode preserves the source exercise boundary, while Classic Mode preserves the page itself.">
        <div className="site-actions"><a className="site-button site-button-primary" href="/demo">Practice now <ArrowRight size={17} aria-hidden="true" /></a></div>
      </PageIntro>
      <section className="mode-comparison" aria-labelledby="mode-comparison-title">
        <div className="section-copy"><h2 id="mode-comparison-title">Two views of the same material.</h2><p>Switch modes without losing the page or your orientation.</p></div>
        <article><div><span>Interactive</span><h3>Work through a complete task.</h3><p>Related blanks, questions, rows, tokens, or pairs remain together.</p></div><img src="/release/lexora-interactive.webp" width="1440" height="900" alt="Interactive Mode showing a focused exercise workspace" /></article>
        <article><img src="/release/lexora-classic.webp" width="1440" height="900" alt="Classic Mode showing the original synthetic workbook page" /><div><span>Classic</span><h3>Check the source at any time.</h3><p>The workbook remains the authority for layout, wording, and uncertain structure.</p></div></article>
      </section>
      <InteractionShowcase />
    </>
  );
}

function HowItWorksPage() {
  return (
    <>
      <PageIntro eyebrow="How it works" title="Understanding first. Rendering second."
        copy="Multimodal AI identifies source structure. Lexora validates it, groups complete exercises, and renders a consistent learning interface." />
      <section className="signal-path" aria-label="Lexora transformation path">
        <article><ScanLine aria-hidden="true" /><span>Source</span><h2>Visual workbook page</h2><p>Original content, order, and geometry remain traceable.</p></article>
        <article><Braces aria-hidden="true" /><span>Understanding</span><h2>Semantic exercise data</h2><p>Bounded analysis identifies titles, instructions, related items, and evidence.</p></article>
        <article><BookOpen aria-hidden="true" /><span>Experience</span><h2>Deterministic lesson</h2><p>Lexora controls layout, correction, navigation, accessibility, and fallback.</p></article>
      </section>
      <section className="film-section" aria-labelledby="film-title">
        <div className="section-copy"><h2 id="film-title">See the product in motion.</h2><p>The current short walkthrough covers Interactive, correction, Classic, and responsive behavior.</p></div>
        <VideoPlayer />
      </section>
      <section className="public-private" aria-labelledby="runtime-title">
        <h2 id="runtime-title">Private analysis. Public certainty.</h2>
        <div><article><span>Local workflow</span><p>An owner PDF is rasterized, analyzed, and validated through the private runtime.</p></article><article><span>Public demo</span><p>Frozen validated analysis is read-only. Visitors trigger zero provider inference.</p></article></div>
      </section>
    </>
  );
}

function EngineeringPage() {
  return (
    <>
      <PageIntro eyebrow="Engineering" title="AI at the boundary. Determinism after it."
        copy="The model may understand document structure. Product behavior remains contract-driven, testable, conservative, and source-backed." />
      <section className="engineering-flow" aria-label="Engineering architecture">
        {[
          ['Private analysis', 'A bounded page image enters the multimodal workflow.'],
          ['Validated contract', 'PageAnalysis rejects malformed, invented, or mismatched structures.'],
          ['Exercise projection', 'Semantic groups become stable Lexora exercise families.'],
          ['Reader', 'Interactive and Classic share source, answers, and correction.'],
        ].map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h2>{title}</h2><p>{copy}</p></article>)}
      </section>
      <section className="engineering-invariants" aria-labelledby="invariants-title">
        <ShieldCheck size={34} aria-hidden="true" /><h2 id="invariants-title">The public boundary stays small.</h2>
        <ul><li>No provider credential</li><li>No AI service</li><li>No arbitrary upload</li><li>No process endpoint</li><li>Demo book only</li><li>Fail-closed grading</li></ul>
      </section>
      <section className="engineering-source"><div><h2>Inspect the implementation.</h2><p>Architecture, tests, and the synthetic public dataset are available in the repository.</p></div><a className="site-button site-button-secondary" href="https://github.com/darroyo083/Lexora" target="_blank" rel="noreferrer"><Code2 size={17} aria-hidden="true" /> View source</a></section>
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <RouteLink className="site-wordmark" href="/"><span className="site-mark" aria-hidden="true">L</span><span>Lexora</span></RouteLink>
      <nav aria-label="Footer navigation">{routes.slice(1).map((route) => <RouteLink key={route.href} href={route.href}>{route.label}</RouteLink>)}</nav>
      <a href="https://github.com/darroyo083/Lexora" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} aria-hidden="true" /></a>
    </footer>
  );
}

export default function Landing() {
  const [route, setRoute] = useState<PublicRoute>(currentRoute);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(currentRoute());
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const titles: Record<PublicRoute, string> = {
      '/': 'Lexora | Source-faithful workbook practice',
      '/product': 'Product | Lexora',
      '/how-it-works': 'How it works | Lexora',
      '/engineering': 'Engineering | Lexora',
    };
    document.title = titles[route];
  }, [route]);

  return (
    <div className="site-shell">
      <a className="site-skip" href="#site-main">Skip to content</a>
      <SiteHeader route={route} />
      <main id="site-main">
        {route === '/' && <HomePage />}
        {route === '/product' && <ProductPage />}
        {route === '/how-it-works' && <HowItWorksPage />}
        {route === '/engineering' && <EngineeringPage />}
      </main>
      <SiteFooter />
    </div>
  );
}
