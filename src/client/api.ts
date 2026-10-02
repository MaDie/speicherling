import type { MessageKey } from "./i18n/de";

export class ApiError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const errorKeys: Record<string, MessageKey> = {
  invalid_credentials: "error_invalid_credentials",
  invalid_code: "error_invalid_code",
  rate_limited: "error_rate_limited",
  not_found: "error_not_found",
  already_exists: "error_already_exists",
  invalid_name: "error_invalid_name",
  too_large: "error_too_large",
  forbidden: "error_forbidden",
  email_taken: "error_email_taken",
  missing_fields: "error_missing_fields",
  weak_password: "error_weak_password",
  mail_failed: "error_mail_failed",
  unauthorized: "error_unauthorized",
  server_error: "error_server_error",
  not_a_folder: "error_not_a_folder",
  not_a_file: "error_not_a_file",
};

export function errorText(t: (key: MessageKey) => string, code: string): string {
  const key = errorKeys[code];
  return key ? t(key) : t("errorGeneric");
}

export function uploadForm(
  path: string,
  body: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let code = "server_error";
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        if (parsed.error) code = parsed.error;
      } catch {
        code = "server_error";
      }
      reject(new ApiError(code));
    };
    xhr.onerror = () => reject(new ApiError("server_error"));
    xhr.send(body);
  });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let code = "server_error";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      code = "server_error";
    }
    throw new ApiError(code);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
