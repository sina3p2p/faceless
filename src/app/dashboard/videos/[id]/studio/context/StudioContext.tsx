import { createContext, useContext } from "react";
import type { VideoDetail, Scene } from "../../types";

export type SelectedMedia = {
  mediaId: string;
  frameId: string;
  frameIndex: number;
  type: "image" | "video";
  url: string;
  modelUsed: string | null;
};

type StudioContextType = {
  scenes: Scene[];
  setScenes: (scenes: Scene[]) => void;
  video: VideoDetail;
  setVideo: (video: VideoDetail) => void;
  selectedSceneId: string | null;
  setSelectedSceneId: (sceneId: string | null) => void;
  editingScene: Scene | null;
  setEditingScene: (scene: Scene | null) => void;
  selectedMedia: SelectedMedia | null;
  setSelectedMedia: (media: SelectedMedia | null) => void;
};

const StudioContext = createContext<StudioContextType>({
  scenes: [],
  setScenes: () => { },
  video: {} as VideoDetail,
  setVideo: () => { },
  selectedSceneId: null,
  setSelectedSceneId: () => { },
  editingScene: null,
  setEditingScene: () => { },
  selectedMedia: null,
  setSelectedMedia: () => { },
});

export const useStudioContext = () => useContext(StudioContext);

export default StudioContext;
