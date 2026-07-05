// Isolated so frequent currentTime updates in the parent (on every Player
// timeupdate) don't re-render the Player itself — only compositionProps/

import { FPS, StoryComposition, type StoryCompositionProps } from "@/remotion/StoryComposition";
import { Player, type PlayerRef } from "@remotion/player";
import { memo } from "react";

// totalFrames changes should. See Remotion Player best practices.
const PlayerView = memo(function PlayerView({
    playerRef,
    compositionProps,
    totalFrames,
}: {
    playerRef: React.RefObject<PlayerRef | null>;
    compositionProps: StoryCompositionProps;
    totalFrames: number;
}) {
    return (
        <Player
            ref={playerRef}
            component={StoryComposition}
            inputProps={compositionProps}
            durationInFrames={totalFrames}
            compositionWidth={1920}
            compositionHeight={1080}
            fps={FPS}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            clickToPlay={false}
        />
    );
});

export default PlayerView;