import {Composition} from 'remotion';
import {LexoraDemo, LexoraPoster} from './LexoraDemo';

export const RemotionRoot = () => (
  <>
    <Composition
      id="LexoraDemo"
      component={LexoraDemo}
      durationInFrames={1980}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="LexoraPoster"
      component={LexoraPoster}
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
