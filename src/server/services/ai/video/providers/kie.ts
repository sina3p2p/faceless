import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IProvider, VideoResult } from "@/types/video-provider";
import { pollUntil } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";

type KieTaskResult = {
  code: 200 | 401 | 403 | 404 | 500 | 505,
  msg: string,
  data: {
    taskId: string,
    model: string,
    state: "success" | "waiting" | "queuing" | "generating" | "fail",
    param: string,
    resultJson: string,
    failCode: string,
    failMsg: string,
    costTime: number,
    completeTime: number,
    createTime: number,
    updateTime: number,
    progress: number,
    creditsConsumed: number
  }
};
export class KieVideoProvider implements IProvider {
  readonly client: AxiosInstance;

  constructor() {
    const token = AI_VIDEO.kieApiKey;
    if (!token) {
      throw new Error("KIE_API_KEY is not set (required for KIE video generation)");
    }
    this.client = axios.create({
      baseURL: "https://api.kie.ai/api/v1",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  findModel(model: TVideoModelId): string | undefined {
    return ({
      "seedance-2-pro": "bytedance/seedance-2",
      "seedance-2-fast": "bytedance/seedance-2-fast",
      "seedance-2-mini": "bytedance/seedance-2-mini",
    } as Partial<Record<TVideoModelId, string>>)[model];
  }

  async generateVideo(req: I2vRequest): Promise<VideoResult> {
    const modelName = this.findModel(req.model);
    if (!modelName) {
      throw new Error(`KIE: model "${req.model}" is not mapped. Add it to KieVideoProvider.findModel.`);
    }

    const input: Record<string, unknown> = {
      prompt: req.prompt,
      duration: req.duration,
      aspect_ratio: req.aspectRatio,
      resolution: req.resolution,
    };
    if (req.startImageUrl) input.first_frame_url = req.startImageUrl;
    if (req.endImageUrl) input.last_frame_url = req.endImageUrl;
    if (req.generateAudio != null) input.generate_audio = req.generateAudio;
    if (req.referenceImages && req.referenceImages.length > 0) input.reference_image_urls = req.referenceImages;

    const { data: task } = await this.client.post<{ data: { taskId: string } }>(
      "/jobs/createTask",
      {
        model: modelName,
        input,
      }
    );
    console.log("KIE: task created", JSON.stringify(task, null, 2));
    return this.pollTask(task.data.taskId, req.duration);
  }

  private pollTask(taskId: string, expectedDuration: number): Promise<VideoResult> {
    return pollUntil(async () => {
      const { data } = await this.client.get<KieTaskResult>(`/jobs/recordInfo?taskId=${taskId}`);
      const { state, resultJson } = data.data;
      if (state === "success") {
        const result = JSON.parse(resultJson);
        const url = result.resultUrls[0];
        if (!url) throw new Error("KIE: task succeeded but no video URL in response");
        return { videoUrl: url, durationSeconds: expectedDuration };
      } else if (state === "fail") {
        throw new Error(`KIE: task ${taskId} failed: ${data.data.failMsg}`);
      }
      return null;
    });
  }
}
