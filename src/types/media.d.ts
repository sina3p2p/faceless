type TVideoProviderId = "fal" | "replicate" | "kie";

type TImageModelId =
    | "gpt-image-1.5"
    | "gpt-image-2"
    | "nano-banana-2"
    | "nano-banana-pro"
    | "seedream-5-lite"

type TVideoModelId =
    | 'seedance-2-pro'
    | 'seedance-2-fast'
    | 'seedance-2-mini'
    | 'kling-v2.5-turbo-pro'
    | 'grok-imagine'
    | 'veo-31-lite'
    | 'veo-31-fast'
    | 'kling-3-standard'
    | 'kling-3-pro'
    | 'runway-gen4-turbo'
    | 'runway-gen4.5'
    | 'pixverse-v6'
    | 'vidu-q3-pro'
    | 'seedance-2-mini';

type TAspectRatio = "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";

type TVideoResolution = "360p" | "480p" | "540p" | "720p" | "1080p" | "4k";

type TVideoModel = {
    id: TVideoModelId;
    label: string;
    description: string;
    durations: number[];
    supportedResolution: TVideoResolution[];
    endFrameSupported?: boolean;
    /** Model can generate in-clip audio when generate_audio is passed. */
    supportsAudio?: boolean;
};

type TImageModel = {
    id: TImageModelId,
    label: string,
    description: string
}