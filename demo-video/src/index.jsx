import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {HangONDemo} from './HangONDemo.jsx';

export const RemotionRoot = () => (
  <Composition
    id="HangONDemo"
    component={HangONDemo}
    durationInFrames={3600}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{}}
  />
);

export default RemotionRoot;

registerRoot(RemotionRoot);
