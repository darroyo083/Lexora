import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const colors = {
  bg: '#0a0b0a',
  surface: '#111410',
  raised: '#171b16',
  line: '#334034',
  ink: '#f2f3ed',
  muted: '#a3ada1',
  dim: '#707a70',
  sage: '#98c49c',
};

const base: CSSProperties = {
  backgroundColor: colors.bg,
  color: colors.ink,
  fontFamily: 'Inter, Arial, sans-serif',
};

const fade = (frame: number, duration: number) => interpolate(
  frame,
  [0, 18, duration - 18, duration],
  [0, 1, 1, 0],
  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
);

const Label = ({children}: {children: ReactNode}) => (
  <div style={{
    color: colors.sage,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  }}>
    {children}
  </div>
);

const CornerMarks = () => (
  <>
    <div style={{position: 'absolute', left: -12, top: -12, width: 34, height: 34,
      borderLeft: `2px solid ${colors.sage}`, borderTop: `2px solid ${colors.sage}`}} />
    <div style={{position: 'absolute', right: -12, bottom: -12, width: 34, height: 34,
      borderRight: `2px solid ${colors.sage}`, borderBottom: `2px solid ${colors.sage}`}} />
  </>
);

const Evidence = ({src, duration, crop = 'cover', mode = 'INTERACTIVE'}: {
  src: string;
  duration: number;
  crop?: CSSProperties['objectFit'];
  mode?: 'INTERACTIVE' | 'CLASSIC';
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, duration], [1.015, 1.05], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={{position: 'relative', padding: 12, border: `1px solid ${colors.line}`,
      background: '#080908', boxShadow: '0 42px 120px rgba(0,0,0,.46)'}}>
      <CornerMarks />
      <div style={{height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 8px', color: colors.dim, fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', letterSpacing: 1.2}}>
        <span>REAL UI / PUBLIC-SAFE FIXTURE</span><span>LEXORA · {mode}</span>
      </div>
      <div style={{overflow: 'hidden', aspectRatio: '16 / 10', border: `1px solid ${colors.line}`}}>
        <Img src={staticFile(`evidence/${src}`)} style={{width: '100%', height: '100%',
          objectFit: crop, transform: `scale(${scale})`}} />
      </div>
    </div>
  );
};

const Caption = ({index, eyebrow, title, body}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  body: string;
}) => (
  <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
    <Label>{index} &nbsp; {eyebrow}</Label>
    <h2 style={{margin: '28px 0 24px', fontSize: 72, lineHeight: .98,
      letterSpacing: -3.6, maxWidth: 660}}>{title}</h2>
    <p style={{margin: 0, maxWidth: 610, color: colors.muted, fontSize: 27, lineHeight: 1.52}}>{body}</p>
  </div>
);

const SplitScene = ({duration, image, index, eyebrow, title, body, imageLeft = false, mode}: {
  duration: number;
  image: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  body: string;
  imageLeft?: boolean;
  mode?: 'INTERACTIVE' | 'CLASSIC';
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 18, stiffness: 85}});
  const caption = <Caption index={index} eyebrow={eyebrow} title={title} body={body} />;
  const evidence = <Evidence src={image} duration={duration} mode={mode} />;
  return (
    <AbsoluteFill style={{...base, padding: '94px 112px', opacity: fade(frame, duration)}}>
      <div style={{display: 'grid', gridTemplateColumns: imageLeft ? '1.18fr .82fr' : '.82fr 1.18fr',
        gap: 86, height: '100%', alignItems: 'center', transform: `translateY(${(1 - entrance) * 24}px)`}}>
        {imageLeft ? <>{evidence}{caption}</> : <>{caption}{evidence}</>}
      </div>
    </AbsoluteFill>
  );
};

const Intro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 20, stiffness: 70}});
  return (
    <AbsoluteFill style={{...base, padding: 120}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <div style={{width: 54, height: 54, display: 'grid', placeItems: 'center',
          border: `1px solid ${colors.line}`, color: colors.sage, fontFamily: 'Georgia, serif', fontSize: 24}}>L</div>
        <strong style={{fontSize: 28}}>Lexora</strong>
      </div>
      <div style={{marginTop: 150, opacity: enter, transform: `translateY(${(1 - enter) * 28}px)`}}>
        <Label>Source-faithful language practice</Label>
        <h1 style={{margin: '34px 0 30px', fontSize: 116, lineHeight: .92,
          letterSpacing: -7, maxWidth: 1320}}>Scanned workbooks.<br />
          <em style={{color: colors.sage, fontFamily: 'Georgia, serif', fontWeight: 400}}>Structured practice.</em>
        </h1>
        <p style={{fontSize: 31, color: colors.muted, margin: 0}}>The original source stays one click away.</p>
      </div>
      <div style={{position: 'absolute', bottom: 80, right: 112, color: colors.dim,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 16}}>00:00 — 00:05</div>
    </AbsoluteFill>
  );
};

const Pipeline = () => {
  const frame = useCurrentFrame();
  const steps = [
    ['01', 'Source page', 'Synthetic workbook PDF'],
    ['02', 'Vision analysis', 'Typed, grounded structure'],
    ['03', 'React lesson', 'One focused activity'],
  ];
  return (
    <AbsoluteFill style={{...base, padding: '110px 120px', opacity: fade(frame, 240)}}>
      <Label>Transformation, without hiding the source</Label>
      <h2 style={{fontSize: 82, letterSpacing: -4.5, lineHeight: 1, margin: '30px 0 90px'}}>One page. Three trustworthy states.</h2>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${colors.line}`}}>
        {steps.map(([n, title, detail], i) => {
          const reveal = spring({frame: frame - i * 16, fps: 30, config: {damping: 18}});
          return <div key={n} style={{minHeight: 360, padding: 42, borderRight: i < 2 ? `1px solid ${colors.line}` : 0,
            background: i === 2 ? colors.surface : colors.bg, opacity: reveal,
            transform: `translateY(${(1 - reveal) * 26}px)`}}>
            <span style={{fontFamily: 'monospace', color: colors.sage, fontSize: 18}}>{n}</span>
            <h3 style={{fontSize: 38, margin: '126px 0 18px'}}>{title}</h3>
            <p style={{fontSize: 22, color: colors.muted, margin: 0}}>{detail}</p>
          </div>;
        })}
      </div>
    </AbsoluteFill>
  );
};

const Montage = ({duration, image, family, position}: {
  duration: number;
  image: string;
  family: string;
  position: string;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{...base, padding: '70px 100px', opacity: fade(frame, duration)}}>
      <div style={{position: 'absolute', left: 100, top: 70, zIndex: 2}}><Label>{position} / Interaction family</Label></div>
      <div style={{position: 'absolute', right: 100, top: 58, fontSize: 60, fontWeight: 760,
        letterSpacing: -3}}>{family}</div>
      <div style={{marginTop: 66}}><Evidence src={image} duration={duration} /></div>
    </AbsoluteFill>
  );
};

const DesktopMobile = () => {
  const frame = useCurrentFrame();
  const desktopScale = interpolate(frame, [0, 270], [1.02, 1.055]);
  return (
    <AbsoluteFill style={{...base, padding: '84px 110px', opacity: fade(frame, 270)}}>
      <Caption index="07" eyebrow="Responsive by construction" title={<>The lesson fits<br />the learner.</>}
        body="Viewport-native interaction on desktop and touch—without losing source fidelity." />
      <div style={{position: 'absolute', width: 1050, right: 110, top: 170, border: `1px solid ${colors.line}`,
        padding: 10, background: colors.surface, transform: `scale(${desktopScale})`, transformOrigin: 'right center'}}>
        <Img src={staticFile('evidence/interactive-correct.webp')} style={{width: '100%', display: 'block'}} />
      </div>
      <div style={{position: 'absolute', width: 330, right: 820, bottom: 50, padding: 9,
        border: `1px solid ${colors.sage}`, background: '#080908', boxShadow: '0 35px 90px #000'}}>
        <Img src={staticFile('evidence/mobile.webp')} style={{width: '100%', display: 'block'}} />
      </div>
    </AbsoluteFill>
  );
};

export const LexoraPoster = () => (
  <AbsoluteFill style={{...base, padding: 112}}>
    <div style={{display: 'grid', gridTemplateColumns: '.78fr 1.22fr', gap: 80, alignItems: 'center', height: '100%'}}>
      <Caption index="01" eyebrow="Source-faithful language practice" title={<>Scanned workbooks.<br /><em style={{color: colors.sage, fontFamily: 'Georgia, serif', fontWeight: 400}}>Structured practice.</em></>}
        body="Real product evidence from a synthetic, pre-analyzed, read-only demo." />
      <Evidence src="interactive-correct.webp" duration={1} />
    </div>
  </AbsoluteFill>
);

const Outro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 70}});
  return (
    <AbsoluteFill style={{...base, padding: 120, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center', opacity: enter, transform: `translateY(${(1 - enter) * 25}px)`}}>
        <div style={{margin: '0 auto 34px', width: 76, height: 76, display: 'grid', placeItems: 'center',
          border: `1px solid ${colors.line}`, color: colors.sage, font: '32px Georgia'}}>L</div>
        <h2 style={{fontSize: 118, margin: 0, letterSpacing: -7}}>Lexora</h2>
        <p style={{fontSize: 30, color: colors.muted, margin: '28px 0 64px'}}>Source-faithful workbook practice.</p>
        <div style={{fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', color: colors.sage,
          fontSize: 20, letterSpacing: 2}}>REACT · SPRING BOOT · VISION AI · DOCKER</div>
      </div>
    </AbsoluteFill>
  );
};

export const LexoraDemo = () => (
  <AbsoluteFill style={base}>
    <Sequence durationInFrames={150} premountFor={30}><Intro /></Sequence>
    <Sequence from={150} durationInFrames={240} premountFor={30}><Pipeline /></Sequence>
    <Sequence from={390} durationInFrames={150} premountFor={30}><Montage duration={150} image="interactive-correct.webp" family="Fill blank" position="01" /></Sequence>
    <Sequence from={540} durationInFrames={150} premountFor={30}><Montage duration={150} image="choice-correct.webp" family="Choice" position="02" /></Sequence>
    <Sequence from={690} durationInFrames={150} premountFor={30}><Montage duration={150} image="sentence-ordering.webp" family="Sentence ordering" position="03" /></Sequence>
    <Sequence from={840} durationInFrames={150} premountFor={30}><Montage duration={150} image="matching.webp" family="Matching" position="04" /></Sequence>
    <Sequence from={990} durationInFrames={300} premountFor={30}><SplitScene duration={300} image="interactive-correct.webp" index="05" eyebrow="Correction authority" title={<>Check. Explain.<br />Continue.</>} body="Mapped answers receive grounded feedback. Progress is saved locally. Ambiguity stays neutral." /></Sequence>
    <Sequence from={1290} durationInFrames={240} premountFor={30}><SplitScene duration={240} image="classic.webp" index="06" eyebrow="Source-faithful fallback" title={<>Classic Mode<br />keeps trust visible.</>} body="The original workbook page remains available whenever fidelity matters more than transformation." imageLeft mode="CLASSIC" /></Sequence>
    <Sequence from={1530} durationInFrames={270} premountFor={30}><DesktopMobile /></Sequence>
    <Sequence from={1800} durationInFrames={180} premountFor={30}><Outro /></Sequence>
  </AbsoluteFill>
);
