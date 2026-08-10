import { useState, type PointerEvent } from 'react';
import {
ArrowRight, ArrowUpRight, BookOpen, Braces, Check, Code2,
Layers3, Play, ScanLine, ScanText, ShieldCheck,
} from 'lucide-react';
import './landing.css';

const interactionFamilies = [
  { name: 'FillBlank', index: '01', detail: 'Typed responses mapped to source-backed blank regions.' },
  { name: 'Choice', index: '02', detail: 'Focused option selection with authoritative feedback.' },
  { name: 'ChoiceGrid', index: '03', detail: 'Row-aware decisions without flattening workbook structure.' },
  { name: 'SentenceOrdering', index: '04', detail: 'Reorderable fragments that preserve exercise intent.' },
  { name: 'Matching', index: '05', detail: 'Pair relationships rendered as a direct manipulation task.' },
  { name: 'FreeText', index: '06', detail: 'Open responses stay neutral when no authority exists.' },
] as const;

const architecture = [
  { id: 'vision', label: 'External Vision', meta: 'AI-only production analysis', detail: 'A concrete external Vision provider returns a strict, versioned PageAnalysis contract. Local OCR stays development-only.' },
  { id: 'service', label: 'Spring Boot', meta: 'Books, profiles, correction', detail: 'The application core owns book state, page profiles, correction authority, and the public read-only boundary.' },
  { id: 'projection', label: 'Lesson projection', meta: 'Source-backed transformation', detail: 'A deterministic projection turns supported page structures into focused lesson steps without inventing content.' },
  { id: 'reader', label: 'React reader', meta: 'Interactive + Classic', detail: 'One product surface provides guided practice and a source-faithful fallback, including keyboard, touch, and responsive layouts.' },
] as const;

export default function Landing() {
  const [activeFamily, setActiveFamily] = useState(0);
  const [activeArchitecture, setActiveArchitecture] = useState('vision');

  const handleEvidencePointer = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty('--evidence-x', x.toFixed(3));
    event.currentTarget.style.setProperty('--evidence-y', y.toFixed(3));
  };

  const resetEvidencePointer = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--evidence-x', '0');
    event.currentTarget.style.setProperty('--evidence-y', '0');
  };

  const selectedArchitecture = architecture.find((item) => item.id === activeArchitecture)
    ?? architecture[0];

  return (
    <div className="landing-shell">
      <a className="landing-skip" href="#landing-main">Skip to content</a>
      <header className="landing-nav">
        <a className="landing-wordmark" href="#top">
          <span className="landing-mark" aria-hidden="true">L</span><span>Lexora</span>
        </a>
        <nav aria-label="Landing navigation">
          <a href="#modes">Modes</a>
          <a href="#interactions">Interactions</a>
          <a href="#architecture">Engineering</a>
          <a href="#video">Video</a>
        </nav>
        <a className="landing-nav-cta" href="/demo">
          Open demo <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>

      <main id="landing-main">
        <section className="landing-hero" id="top" aria-labelledby="landing-title">
          <div className="hero-copy">
            <p className="landing-kicker"><span>01</span> Source-faithful language practice</p>
            <h1 id="landing-title">Scanned workbooks.<br /><em>Structured practice.</em></h1>
            <p className="hero-deck">
              Lexora turns workbook pages into focused interactive lessons, and keeps the
              original source in a source-faithful Classic Mode whenever fidelity matters
              more than transformation.
            </p>
            <div className="hero-actions" aria-label="Project actions">
              <a className="landing-button landing-button-primary" href="/demo">
                Try the curated demo <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a className="landing-button landing-button-secondary"
                href="https://github.com/darroyo083/Lexora" target="_blank" rel="noreferrer">
                <Code2 size={17} aria-hidden="true" /> View source
              </a>
            </div>
            <p className="hero-boundary">
              <ShieldCheck size={15} aria-hidden="true" /> Public demo runs real product UI on a curated, pre-analyzed dataset.
            </p>
          </div>

          <figure className="hero-evidence" onPointerMove={handleEvidencePointer}
            onPointerLeave={resetEvidencePointer} tabIndex={0}
            aria-label="Real Lexora Interactive lesson showing a correct fill-in-the-blank response">
            <div className="evidence-rail">
              <span>REAL UI / PUBLIC-SAFE FIXTURE</span><span>INTERACTIVE / CORRECT</span>
            </div>
            <div className="evidence-window">
              <img src="/release/lexora-interactive.webp" width="1440" height="900"
                alt="Lexora Interactive mode with the answer lerne marked correct"
                fetchPriority="high" />
            </div>
            <figcaption><span>Guided step 02 / 08</span><span>Source-backed correction</span></figcaption>
          </figure>
        </section>

        <section className="landing-transform" aria-labelledby="transform-title">
          <div className="section-heading compact">
            <p className="landing-kicker"><span>02</span> The transformation</p>
            <h2 id="transform-title">One source. Two trustworthy ways to learn.</h2>
          </div>
          <ol className="transform-rail">
            <li><ScanLine aria-hidden="true" /><span className="transform-index">INPUT</span>
              <strong>Scanned page</strong><p>Original layout and context</p></li>
            <li><Braces aria-hidden="true" /><span className="transform-index">CONTRACT</span>
              <strong>Structured analysis</strong><p>Versioned, bounded page data</p></li>
            <li><Layers3 aria-hidden="true" /><span className="transform-index">OUTPUT</span>
              <strong>Guided lesson</strong><p>One focused interaction at a time</p></li>
          </ol>
        </section>

        <section className="landing-modes" id="modes" aria-labelledby="modes-title">
          <div className="section-heading">
            <p className="landing-kicker"><span>03</span> Product modes</p>
            <h2 id="modes-title">Transformation with an escape hatch.</h2>
            <p>Interactive makes practice deliberate. Classic protects source truth.</p>
          </div>

          <article className="mode-feature mode-interactive">
            <div className="mode-number">A</div>
            <div className="mode-copy">
              <p className="mode-label">Interactive Mode</p>
              <h3>Attention stays on the exercise, not the page chrome.</h3>
              <p>A viewport-native player sequences source context, six interaction families,
                progress, and correction into one clear next action.</p>
              <ul>
                <li><Check size={15} aria-hidden="true" /> Focused, saved steps</li>
                <li><Check size={15} aria-hidden="true" /> Authoritative feedback</li>
                <li><Check size={15} aria-hidden="true" /> Keyboard and touch complete</li>
              </ul>
            </div>
            <figure className="mode-image mode-image-mobile">
              <img src="/release/lexora-mobile.webp" width="390" height="844"
                alt="Lexora lesson player adapted to a mobile viewport" loading="lazy" />
            </figure>
          </article>

          <article className="mode-feature mode-classic">
            <div className="mode-number">B</div>
            <figure className="mode-image mode-image-classic">
              <img src="/release/lexora-classic.webp" width="1440" height="900"
                alt="Lexora Classic mode preserving the synthetic workbook page and contextual exercise rail"
                loading="lazy" />
            </figure>
            <div className="mode-copy">
              <p className="mode-label">Classic Mode</p>
              <h3>The source is a feature, not a fallback of last resort.</h3>
              <p>Unsupported or ambiguous content stays grounded in the original page. Learners
                retain context; the product avoids pretending that uncertain structure is known.</p>
              <a href="/demo">Compare both modes <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </article>
        </section>

        <section className="landing-interactions" id="interactions" aria-labelledby="interactions-title">
          <div className="section-heading split">
            <div><p className="landing-kicker"><span>04</span> Interaction system</p>
              <h2 id="interactions-title">Six families.<br />One correction model.</h2></div>
            <p>Hover, focus, or tap an interaction. The public demo carries every family in one
              synthetic workbook, so the evidence is reproducible without private material.</p>
          </div>
          <div className="interaction-index">
            <div className="interaction-list" aria-label="Supported interaction families">
              {interactionFamilies.map((family, index) => (
                <button key={family.name} type="button"
                  className={activeFamily === index ? 'active' : ''}
                  aria-pressed={activeFamily === index}
                  onMouseEnter={() => setActiveFamily(index)}
                  onFocus={() => setActiveFamily(index)}
                  onClick={() => setActiveFamily(index)}>
                  <span>{family.index}</span><strong>{family.name}</strong>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="interaction-detail" aria-live="polite">
              <ScanText size={22} aria-hidden="true" />
              <p className="mode-label">Selected family</p>
              <h3>{interactionFamilies[activeFamily].name}</h3>
              <p>{interactionFamilies[activeFamily].detail}</p>
              <span>Available in the public demo</span>
            </div>
          </div>
        </section>

        <section className="landing-architecture" id="architecture" aria-labelledby="architecture-title">
          <div className="section-heading split">
            <div><p className="landing-kicker"><span>05</span> Engineering signal path</p>
              <h2 id="architecture-title">AI at the boundary.<br />Determinism downstream.</h2></div>
            <p>The provider may infer page structure. Product behavior after that boundary is
              contract-driven, testable, and deliberately conservative.</p>
          </div>
          <div className="architecture-map">
            <ol>
              {architecture.map((item, index) => (
                <li key={item.id}>
                  <button type="button" className={activeArchitecture === item.id ? 'active' : ''}
                    aria-pressed={activeArchitecture === item.id}
                    onMouseEnter={() => setActiveArchitecture(item.id)}
                    onFocus={() => setActiveArchitecture(item.id)}
                    onClick={() => setActiveArchitecture(item.id)}>
                    <span>0{index + 1}</span><strong>{item.label}</strong><small>{item.meta}</small>
                  </button>
                  {index < architecture.length - 1 && <ArrowRight aria-hidden="true" />}
                </li>
              ))}
            </ol>
            <div className="architecture-readout" aria-live="polite">
              <span>ACTIVE NODE / {selectedArchitecture.id.toUpperCase()}</span>
              <p>{selectedArchitecture.detail}</p>
            </div>
          </div>
          <div className="engineering-proof">
            <article><span>PRODUCTION</span><h3>External Vision only</h3>
              <p>No PaddleOCR, local model, or CPU-heavy fallback in the production image.</p></article>
            <article><span>TRUST</span><h3>Fail-closed correction</h3>
              <p>Ambiguous and unmapped answers remain neutral instead of becoming false authority.</p></article>
            <article><span>PUBLIC DEMO</span><h3>Zero inference spend</h3>
              <p>Pre-analyzed synthetic content blocks anonymous upload, processing, and extraction.</p></article>
          </div>
        </section>

        <section className="landing-video" id="video" aria-labelledby="video-title">
          <div className="section-heading split">
            <div><p className="landing-kicker"><span>06</span> Product film</p>
              <h2 id="video-title">The complete trust story.<br />In 66 seconds.</h2></div>
            <p>A silent-safe walkthrough of the real curated demo: transformation, four native
              interaction families, grounded correction, Classic Mode, and responsive behavior.</p>
          </div>
          <div className="video-preview">
            <div className="video-rail">
              <span>REMOTION / 1920 × 1080</span><span>REAL UI EVIDENCE / NO PRIVATE MATERIAL</span>
            </div>
            <video controls preload="metadata" playsInline
              poster="/release/lexora-demo-poster.png"
              aria-label="Lexora product demo video, 66 seconds"
              width="1920" height="1080">
              <source src="/release/lexora-demo.mp4" type="video/mp4" />
              Your browser does not support embedded video. The same real product states are
              available throughout this page and in the curated demo.
            </video>
            <div className="video-caption"><span>Caption-led / understandable without sound</span>
              <a href="/release/lexora-demo.mp4" download>Download MP4 <ArrowRight size={14} aria-hidden="true" /></a></div>
          </div>
        </section>

        <section className="landing-safety" aria-labelledby="safety-title">
          <div className="safety-icon"><ShieldCheck size={32} aria-hidden="true" /></div>
          <div><p className="landing-kicker"><span>07</span> Grounded by design</p>
            <h2 id="safety-title">Useful without pretending certainty.</h2></div>
          <p>Lexora preserves provenance, uses authoritative correction only when a mapping exists,
            and publishes no private workbook pages, OCR dumps, or answer-key material.</p>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <BookOpen size={38} aria-hidden="true" />
          <p className="landing-kicker"><span>08</span> See the system work</p>
          <h2 id="final-title">From source page to deliberate practice.</h2>
          <p>Explore all six interaction families in a bounded, public-safe workbook.</p>
          <div className="hero-actions">
            <a className="landing-button landing-button-primary" href="/demo">
              Open the demo <Play size={16} fill="currentColor" aria-hidden="true" /></a>
            <a className="landing-button landing-button-secondary"
              href="https://github.com/darroyo083/Lexora" target="_blank" rel="noreferrer">
              Review the code <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-wordmark" href="#top"><span className="landing-mark" aria-hidden="true">L</span>Lexora</a>
        <p>Source-faithful interactive workbook practice.</p>
        <a href="https://github.com/darroyo083/Lexora" target="_blank" rel="noreferrer">
          GitHub <ArrowUpRight size={13} aria-hidden="true" /></a>
      </footer>
    </div>
  );
}
