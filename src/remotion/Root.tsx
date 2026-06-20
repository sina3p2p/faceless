import { Composition } from "remotion";
import { StoryComposition, StoryCompositionProps, FPS, computeSequenceLayout } from "./StoryComposition";

export function RemotionRoot() {
  return (
    <Composition
      id="StoryComposition"
      component={StoryComposition}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ clips: [] } satisfies StoryCompositionProps}
      calculateMetadata={({ props }) => {
        const { totalFrames } = computeSequenceLayout(props.clips);
        return { durationInFrames: Math.max(1, totalFrames) };
      }}
    />
  );
}
