import { uploadFile } from "@/lib/storage";
import { I2vRequest, IImageRequest, IProvider, VideoResult } from "@/types/video-provider";
import { AxiosInstance } from "axios";
import OpenAI from "openai";

export abstract class BaseVideoProvider implements IProvider {
    abstract readonly client: AxiosInstance | OpenAI;
    abstract findModel(model: string): string | undefined;
    abstract generateVideo(req: I2vRequest): Promise<VideoResult>;
    abstract generateImage(req: IImageRequest): Promise<string[]>;

    protected async saveBase64ToR2(path: string, b64: string): Promise<string | null> {
        const buffer = Buffer.from(b64, "base64");
        await uploadFile(path, buffer, "image/png");
        return path;
    }

    protected async saveUrlToR2(path: string, url: string): Promise<string | null> {
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        await uploadFile(path, buffer, "image/png");
        return path;
    }
}