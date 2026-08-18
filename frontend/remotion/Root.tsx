import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const HOME_CLASSIC = staticFile('release/lexora-home-classic.webp');
const HOME_INTERACTIVE = staticFile('release/lexora-home-interactive.webp');
const HOME_ASK = staticFile('release/lexora-home-ask.webp');
const INTERACTIVE_START = staticFile('release/lexora-interactive-start.webp');
const INTERACTIVE_ANSWER = staticFile('release/lexora-interactive-answer.webp');
const INTERACTIVE_FEEDBACK = staticFile('release/lexora-interactive-feedback.webp');
const INTERACTIVE_NEXT = staticFile('release/lexora-interactive-next.webp');

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

function ProductStage({ children }: { children: React.ReactNode }) {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#101711', overflow: 'hidden' }}>
      <AbsoluteFill style={{
        width,
        height,
        padding: 38,
        boxSizing: 'border-box',
        background: 'linear-gradient(135deg, #172219 0%, #0e140f 58%, #19251b 100%)',
      }}>
        <AbsoluteFill style={{
          inset: 38,
          overflow: 'hidden',
          borderRadius: 12,
          boxShadow: '0 24px 70px rgba(0,0,0,.42)',
          backgroundColor: '#121a14',
        }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SourceFocus({ frame }: { frame: number }) {
  const opacity = interpolate(frame, [48, 66, 114, 132], [0, .82, .82, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [66, 88, 132], [.985, 1, 1.015], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  return <div style={{
    position: 'absolute',
    left: '28%',
    top: '24%',
    width: '48%',
    height: '30%',
    border: '1px solid rgba(184, 216, 181, .86)',
    boxShadow: '0 0 0 7px rgba(134, 186, 136, .1), 0 12px 40px rgba(60, 110, 70, .22)',
    transform: `scale(${scale})`,
    opacity,
    borderRadius: 5,
  }} />;
}

export function LexoraHomeHero() {
  const frame = useCurrentFrame();
  const breathing = interpolate(frame, [0, 150, 300], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const classicOpacity = frame < 120
    ? 1
    : frame < 156
      ? 1 - opacityBetween(frame, 120, 156)
      : frame < 270
        ? 0
        : opacityBetween(frame, 270, 300);
  const interactiveOpacity = opacityBetween(frame, 120, 156)
    * (1 - opacityBetween(frame, 222, 252));
  const askOpacity = opacityBetween(frame, 222, 252)
    * (1 - opacityBetween(frame, 270, 300));

  return (
    <ProductStage>
      <Screen src={HOME_CLASSIC} opacity={classicOpacity} scale={1.11 + breathing * .012} />
      <Screen src={HOME_INTERACTIVE} opacity={interactiveOpacity} scale={1.003 + breathing * .006} />
      <Screen src={HOME_ASK} opacity={askOpacity} scale={1.002} />
      <SourceFocus frame={frame} />
    </ProductStage>
  );
}

export function LexoraInteractiveLoop() {
  const frame = useCurrentFrame();
  const breathing = interpolate(frame, [0, 135, 270], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const startOpacity = frame < 78
    ? 1
    : frame < 96
      ? 1 - opacityBetween(frame, 78, 96)
      : frame < 246
        ? 0
        : opacityBetween(frame, 246, 270);
  const answerOpacity = opacityBetween(frame, 78, 96)
    * (1 - opacityBetween(frame, 132, 150));
  const feedbackOpacity = opacityBetween(frame, 132, 150)
    * (1 - opacityBetween(frame, 204, 222));
  const nextOpacity = opacityBetween(frame, 204, 222)
    * (1 - opacityBetween(frame, 246, 264));

  return (
    <ProductStage>
      <Screen src={INTERACTIVE_START} opacity={startOpacity} scale={1.003 + breathing * .006} />
      <Screen src={INTERACTIVE_ANSWER} opacity={answerOpacity} scale={1.003 + breathing * .006} />
      <Screen src={INTERACTIVE_FEEDBACK} opacity={feedbackOpacity} scale={1.002 + breathing * .004} />
      <Screen src={INTERACTIVE_NEXT} opacity={nextOpacity} scale={1.002} />
    </ProductStage>
  );
}
