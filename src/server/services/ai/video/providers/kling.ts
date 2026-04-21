import axios, { type AxiosInstance } from "axios";
import * as crypto from "node:crypto";
import { AI_VIDEO } from "@/lib/constants";

const TOKEN_VALIDITY_SECONDS = 1800;
const CACHE_BUFFER_SECONDS = 300;

function base64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signKlingJwt(accessKey: string, secretKey: string): string {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64urlJson({
    iss: accessKey,
    exp: now + TOKEN_VALIDITY_SECONDS,
    nbf: now - 5,
  });
  const sig = crypto
    .createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

export interface KlingTaskSubmitResponse {
  code?: number;
  message?: string;
  data?: { task_id?: string };
}

interface KlingTaskStatusResponse {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{ url?: string }>;
      images?: Array<{ url?: string; width?: number; height?: number }>;
    };
  };
}

/**
 * Authenticated Kling HTTP + polling for still-image tasks; media image flow uses getKlingApiClient().
 */
export class KlingApiClient {
  private static cachedToken: string | null = null;
  private static tokenExpiry = 0;

  private http: AxiosInstance | null = null;

  private static getBearer(): string {
    const access = AI_VIDEO.klingAccessKey;
    const secret = AI_VIDEO.klingSecretKey;
    if (!access || !secret) {
      throw new Error("Kling API credentials missing (KLING_ACCESS_KEY / KLING_SECRET_KEY)");
    }
    const now = Math.floor(Date.now() / 1000);
    if (KlingApiClient.cachedToken && KlingApiClient.tokenExpiry > now + CACHE_BUFFER_SECONDS) {
      return `Bearer ${KlingApiClient.cachedToken}`;
    }
    KlingApiClient.cachedToken = signKlingJwt(access, secret);
    KlingApiClient.tokenExpiry = now + TOKEN_VALIDITY_SECONDS;
    return `Bearer ${KlingApiClient.cachedToken}`;
  }

  getHttp(): AxiosInstance {
    if (!this.http) {
      this.http = axios.create({
        baseURL: AI_VIDEO.klingBaseUrl,
        timeout: 120_000,
        headers: { "Content-Type": "application/json" },
      });
      this.http.interceptors.request.use((config) => {
        const headers = config.headers ?? {};
        headers.Authorization = KlingApiClient.getBearer();
        config.headers = headers;
        return config;
      });
    }
    return this.http;
  }

  async pollUntilVideoReady(
    queryPath: string,
    options: { intervalMs?: number; maxWaitMs?: number } = {}
  ): Promise<string> {
    const client = this.getHttp();
    const intervalMs = options.intervalMs ?? 3000;
    const maxWaitMs = options.maxWaitMs ?? 900_000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const { data } = await client.get<KlingTaskStatusResponse>(queryPath);
      const status = data?.data?.task_status;
      if (status === "succeed") {
        const url = data?.data?.task_result?.videos?.[0]?.url;
        if (!url) throw new Error("Kling task succeeded but returned no video URL");
        return url;
      }
      if (status === "failed") {
        throw new Error(data?.data?.task_status_msg || data?.message || "Kling video generation failed");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Kling video generation timed out");
  }

  async pollUntilImageReady(
    queryPath: string,
    options: { intervalMs?: number; maxWaitMs?: number } = {}
  ): Promise<{ url: string; width?: number; height?: number }> {
    const client = this.getHttp();
    const intervalMs = options.intervalMs ?? 3000;
    const maxWaitMs = options.maxWaitMs ?? 600_000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const { data } = await client.get<KlingTaskStatusResponse>(queryPath);
      const status = data?.data?.task_status;
      if (status === "succeed") {
        const img = data?.data?.task_result?.images?.[0];
        if (!img?.url) throw new Error("Kling image task succeeded but returned no image URL");
        return { url: img.url, width: img.width, height: img.height };
      }
      if (status === "failed") {
        throw new Error(data?.data?.task_status_msg || data?.message || "Kling image generation failed");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Kling image generation timed out");
  }
}

let defaultKlingApi: KlingApiClient | null = null;

export function getKlingApiClient(): KlingApiClient {
  defaultKlingApi ??= new KlingApiClient();
  return defaultKlingApi;
}
