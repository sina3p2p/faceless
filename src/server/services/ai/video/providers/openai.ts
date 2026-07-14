import { MEDIA } from "@/lib/constants";
import { IImageRequest, I2vRequest, VideoResult } from "@/types/video-provider";
import OpenAI, { toFile } from "openai";
import { BaseVideoProvider } from "./base";
import { mediaUrl } from "@/lib/storage";

export class OpenAIVideoProvider extends BaseVideoProvider {
    readonly client: OpenAI;

    constructor() {
        const token = MEDIA.openaiApiKey;
        if (!token) {
            throw new Error("OPENAI_API_KEY is not set (required for OpenAI video generation)");
        }
        super();
        this.client = new OpenAI({ apiKey: token });
    }

    findModel(model: string): string | undefined {
        return model;
    }

    getSize(ar: TAspectRatio): "1024x1536" | "1536x1024" | "1024x1024" {
        if (ar === "16:9") return "1536x1024";
        if (ar === "1:1") return "1024x1024";
        return "1024x1536";
    }

    async generateImage(req: IImageRequest): Promise<string[]> {
        const payload = {
            model: req.model,
            prompt: req.prompt,
            n: req.n ?? 1,
            size: this.getSize(req.aspectRatio),
            quality: req.quality ?? "low",
        };

        let response;
        if (req.referenceImages) {
            const files = await Promise.all(
                req.referenceImages.map(async (img) => {
                    const res = await fetch(await mediaUrl(img));
                    if (!res.ok) return null;
                    const buffer = Buffer.from(await res.arrayBuffer());
                    const ct = res.headers.get("content-type") || "image/jpeg";
                    const mimeType = ct.split(";")[0].trim();
                    const fileName = img.split("/").pop();
                    return toFile(buffer, fileName, { type: mimeType });
                }),
            );
            response = await this.client.images.edit({
                ...payload,
                image: files.filter((file) => !!file) as File[],
            });
        } else {
            response = await this.client.images.generate({
                ...payload,
                moderation: "low",
            });
        }

        const items = response.data ?? [];

        const results = await Promise.all(items.map(async (item) => {
            if (!item) return null;
            const b64 = item.b64_json;
            const remoteUrl = item.url;
            if (b64) {
                return await this.saveBase64ToR2(`ai/${req.model}/${Date.now()}.png`, b64);
            }
            if (remoteUrl) {
                return await this.saveUrlToR2(`ai/${req.model}/${Date.now()}.png`, remoteUrl);
            }
            return null;
        }));

        return results.filter((r) => r !== null);
    }

    async generateVideo(_: I2vRequest): Promise<VideoResult> {
        throw new Error("OpenAI: video generation is not supported");
    }
}