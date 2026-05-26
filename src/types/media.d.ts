type TVideoProviderId = "fal" | "replicate";

type TImageModelId =
    | "gpt-image-1.5"
    | "gpt-image-2"
    | "nano-banana-2"
    | "nano-banana-pro"
    | "seedream-5-lite"

type TVideoModelId =
    | 'seedance-2-pro'
    | 'seedance-2-fast'
    | 'kling-v2.5-turbo-pro'
    | 'runway-gen4-turbo'
    | 'runway-gen4.5'
    | 'grok-imagine'
    | 'veo-31-lite'
    | 'veo-31-fast'
    | 'kling-3-standard'
    | 'kling-3-pro'
    | 'pixverse-v6'
    | 'vidu-q3-pro';

type TVideoModelEndpoint =
    | "bytedance/seedance-2.0"
    | "kwaivgi/kling-v2.5-turbo-pro"
    | "kwaivgi/kling-v2.6"
    | "bytedance/seedance-2.0/image-to-video"
    | "bytedance/seedance-2.0/fast/image-to-video"
    | "fal-ai/luma-dream-machine/ray-2/image-to-video"
    | "fal-ai/luma-dream-machine/ray-2-flash/image-to-video"
    | "xai/grok-imagine-video/image-to-video"
    | "fal-ai/veo3.1/image-to-video"
    | "fal-ai/veo3.1/fast/image-to-video"
    | "fal-ai/kling-video/v3/standard/image-to-video"
    | "fal-ai/kling-video/v3/pro/image-to-video"
    | "fal-ai/kling-video/v2.6/pro/image-to-video"
    | "pixverse/pixverse-v6"
    | "vidu/q3-pro";

type TAspectRatio = "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";

type TVideoResolution = "360p" | "480p" | "540p" | "720p" | "1080p" | "4k";

type TVideoModel = {
    id: TVideoModelId;
    label: string;
    description: string;
    provider: TVideoProviderId;
    endpoint?: TVideoModelEndpoint;
    durations: number[];
    supportedResolution: TVideoResolution[];
    endFrameSupported: boolean;
    /** Model can generate in-clip audio when generate_audio is passed. */
    supportsAudio?: boolean;
};

type TImageModel = {
    id: TImageModelId,
    label: string,
    description: string
}