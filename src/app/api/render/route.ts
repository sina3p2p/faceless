import { NextRequest, NextResponse } from "next/server";
import { renderMediaOnLambda, getRenderProgress, AwsRegion } from "@remotion/lambda";
import { StoryCompositionProps } from "@/remotion/StoryComposition";

export const runtime = "nodejs";

function region(): AwsRegion {
  return (process.env.REMOTION_AWS_REGION ?? "us-east-1") as AwsRegion;
}

function functionName(): string {
  const name = process.env.REMOTION_FUNCTION_NAME;
  if (!name) throw new Error("REMOTION_FUNCTION_NAME env var is not set");
  return name;
}

function serveUrl(): string {
  const url = process.env.REMOTION_SERVE_URL;
  if (!url) throw new Error("REMOTION_SERVE_URL env var is not set");
  return url;
}

// POST /api/render — start a Lambda render, return { renderId, bucketName }
export async function POST(req: NextRequest) {
  try {
    const props = (await req.json()) as StoryCompositionProps;

    if (!props.clips || props.clips.length === 0) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: region(),
      functionName: functionName(),
      serveUrl: serveUrl(),
      composition: "StoryComposition",
      inputProps: props,
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 1,
    });

    return NextResponse.json({ renderId, bucketName });
  } catch (err) {
    console.error("[render/start]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start render" },
      { status: 500 },
    );
  }
}

// GET /api/render?renderId=...&bucketName=... — poll progress
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const renderId = searchParams.get("renderId");
    const bucketName = searchParams.get("bucketName");

    if (!renderId || !bucketName) {
      return NextResponse.json({ error: "renderId and bucketName are required" }, { status: 400 });
    }

    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: functionName(),
      region: region(),
    });

    return NextResponse.json({
      done: progress.done,
      progress: Math.round(progress.overallProgress * 100),
      outputFile: progress.outputFile,
      fatalError: progress.fatalErrorEncountered,
      errors: progress.errors,
    });
  } catch (err) {
    console.error("[render/progress]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get progress" },
      { status: 500 },
    );
  }
}
