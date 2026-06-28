import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IProvider, VideoResult } from "@/types/video-provider";
import { pollUntil } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";

export class KieVideoProvider implements IProvider {
  readonly client: AxiosInstance;

  constructor() {
    const token = AI_VIDEO.kieApiKey;
    if (!token) {
      throw new Error("KIE_API_KEY is not set (required for KIE video generation)");
    }
    this.client = axios.create({
      baseURL: "https://api.klingai.com",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  findModel(model: TVideoModelId): string | undefined {
    return ({
      "seedance-2-pro": "seedance-video-2.0",
      "seedance-2-fast": "seedance-video-2.0-mini",
    } as Partial<Record<TVideoModelId, string>>)[model];
  }

  async generateVideo(req: I2vRequest): Promise<VideoResult> {
    const modelName = this.findModel(req.model);
    if (!modelName) {
      throw new Error(`KIE: model "${req.model}" is not mapped. Add it to KieVideoProvider.findModel.`);
    }

    const body: Record<string, unknown> = {
      model_name: modelName,
      prompt: req.prompt,
      duration: req.duration,
      aspect_ratio: req.aspectRatio,
    };
    if (req.startImageUrl) body.image = req.startImageUrl;
    if (req.endImageUrl) body.tail_image = req.endImageUrl;
    if (req.generateAudio != null) body.generate_audio = req.generateAudio;

    const { data: task } = await this.client.post<{ data: { task_id: string } }>(
      "/v1/videos/image2video",
      body
    );

    return this.pollTask(task.data.task_id, req.duration);
  }

  private pollTask(taskId: string, expectedDuration: number): Promise<VideoResult> {
    return pollUntil(async () => {
      const { data } = await this.client.get<{
        data: { task_status: string; task_result?: { videos?: { url: string }[] } };
      }>(`/v1/videos/image2video/${taskId}`);
      const { task_status, task_result } = data.data;
      if (task_status === "succeed") {
        const url = task_result?.videos?.[0]?.url;
        if (!url) throw new Error("KIE: task succeeded but no video URL in response");
        return { videoUrl: url, durationSeconds: expectedDuration };
      }
      if (task_status === "failed") throw new Error(`KIE: task ${taskId} failed`);
      return null;
    });
  }
}
