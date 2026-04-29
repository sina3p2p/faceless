import { videoScenes } from "@/server/db/schema";

export type TVideoScene = typeof videoScenes.$inferSelect;