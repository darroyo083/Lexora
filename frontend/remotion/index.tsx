import { Composition, registerRoot } from 'remotion';
import { LexoraMicroLoop } from './Root';

export const RemotionRoot = () => (
  <Composition
    id="LexoraMicroLoop"
    component={LexoraMicroLoop}
    durationInFrames={300}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{}}
  />
);

registerRoot(RemotionRoot);
