import { APP } from "@/lib/constants";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}

const SERVICE = APP.serviceName;

function createEntry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: SERVICE,
    ...data,
  };
}

function write(entry: LogEntry) {
  const output = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(output);
  } else if (entry.level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>) {
    if (APP.isDevelopment) {
      write(createEntry("debug", message, data));
    }
  },
  info(message: string, data?: Record<string, unknown>) {
    write(createEntry("info", message, data));
  },
  warn(message: string, data?: Record<string, unknown>) {
    write(createEntry("warn", message, data));
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    const errorData: Record<string, unknown> = { ...data };
    if (error instanceof Error) {
      errorData.errorName = error.name;
      errorData.errorMessage = error.message;
      errorData.errorStack = error.stack;
    } else if (error) {
      errorData.errorRaw = String(error);
    }
    write(createEntry("error", message, errorData));
  },
};
