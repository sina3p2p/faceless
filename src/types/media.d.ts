type TImageModelId =
    | "gpt-image-1.5"
    | "gpt-image-2"
    | "nano-banana-2"
    | "nano-banana-pro"

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
    | 'pixverse-v6';

type TAspectRatio = "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
