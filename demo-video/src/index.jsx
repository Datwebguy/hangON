import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {HangONFinal} from './Final.jsx';
import edl from '../public/take/edl.json';

export const RemotionRoot = () => (
  <Composition
    id="HangONFinal"
    component={HangONFinal}
    durationInFrames={Math.ceil(edl.duration * 30)}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{}}
  />
);

export default RemotionRoot;

registerRoot(RemotionRoot);
