import { Composition, registerRoot } from 'remotion';
import { LexoraHomeHero, LexoraInteractiveLoop } from './Root';

export const RemotionRoot = () => (
  <>
    <Composition
      id="LexoraHomeHero"
      component={LexoraHomeHero}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{}}
    />
    <Composition
      id="LexoraInteractiveLoop"
      component={LexoraInteractiveLoop}
      durationInFrames={270}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{}}
    />
  </>
);

registerRoot(RemotionRoot);
