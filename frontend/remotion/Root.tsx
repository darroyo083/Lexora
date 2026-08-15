import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const CLASSIC = staticFile('release/lexora-loop-classic.webp');
const INTERACTIVE = staticFile('release/lexora-loop-interactive.webp');
const ASK = staticFile('release/lexora-loop-ask.webp');

function opacityBetween(frame: number, start: number, end: number): number {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
}

function screenStyle(scale: number, x: number, y: number): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${50 + x}% ${50 + y}%`,
    transform: `scale(${scale})`,
  };
}

function Screen({ src, opacity, scale, x = 0, y = 0 }: {
  src: string;
  opacity: number;
  scale: number;
  x?: number;
  y?: number;
}) {
  return <Img src={src} style={{ ...screenStyle(scale, x, y), opacity }} />;
}

function Cursor({ frame }: { frame: number }) {
  const x = interpolate(frame, [135, 195, 245], [24, 48, 67], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic),
  });
  const y = interpolate(frame, [135, 195, 245], [70, 51, 35], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic),
  });
  const opacity = interpolate(frame, [132, 146, 250, 265], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`, opacity,
      width: 22, height: 28, transform: 'rotate(-12deg)',
      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.4))',
    }}>
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true">
        <path d="M3 2.2 19.8 15l-7.2 1.5 4 8.1-3.5 1.8-4.1-8.2-4.5 5.7L3 2.2Z" fill="#F4F7F1" stroke="#152019" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FocusMark({ frame }: { frame: number }) {
  const opacity = interpolate(frame, [147, 164, 210, 228], [0, .9, .9, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [147, 170, 228], [.92, 1, 1.04], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <div style={{
    position: 'absolute', left: '23%', top: '38%', width: '32%', height: '13%',
    border: '1px solid rgba(184, 216, 181, .8)',
    boxShadow: '0 0 0 7px rgba(134, 186, 136, .1), 0 10px 40px rgba(60, 110, 70, .24)',
    transform: `scale(${scale})`, opacity, borderRadius: 4,
  }} />;
}

export function LexoraMicroLoop() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const classicOpacity = frame < 105 ? 1 : 1 - opacityBetween(frame, 105, 138);
  const interactiveOpacity = opacityBetween(frame, 112, 145) * (1 - opacityBetween(frame, 238, 270));
  const askOpacity = opacityBetween(frame, 232, 266);
  const breathing = interpolate(frame, [0, 150, 300], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin) });
  const classicScale = 1.015 + breathing * .012;
  const interactiveScale = 1.01 + breathing * .008;
  return (
    <AbsoluteFill style={{ backgroundColor: '#101711', overflow: 'hidden' }}>
      <AbsoluteFill style={{
        width, height, padding: 38, boxSizing: 'border-box',
        background: 'linear-gradient(135deg, #172219 0%, #0e140f 58%, #19251b 100%)',
      }}>
        <AbsoluteFill style={{ inset: 38, overflow: 'hidden', borderRadius: 12, boxShadow: '0 24px 70px rgba(0,0,0,.42)', backgroundColor: '#121a14' }}>
          <Screen src={CLASSIC} opacity={classicOpacity} scale={classicScale} x={-1} y={1} />
          <Screen src={INTERACTIVE} opacity={interactiveOpacity} scale={interactiveScale} x={0} y={0} />
          <Screen src={ASK} opacity={askOpacity} scale={1.008} x={0} y={0} />
          <FocusMark frame={frame} />
          <Cursor frame={frame} />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
