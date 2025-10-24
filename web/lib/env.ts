const REQUIRED_SLACK_VARS = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"] as const;
const REQUIRED_GOOGLE_VARS = [
  "GOOGLE_PROJECT_ID",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "SHEET_ID"
] as const;

type RequiredSlackVar = (typeof REQUIRED_SLACK_VARS)[number];
type RequiredGoogleVar = (typeof REQUIRED_GOOGLE_VARS)[number];

export type SlackConfig = {
  botToken: string;
  channelId: string;
};

export type GoogleConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  sheetId: string;
  sheetRange?: string;
};

function pickEnv(keys: readonly string[]): Record<string, string | undefined> {
  return keys.reduce<Record<string, string | undefined>>((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});
}

function collectMissing<T extends readonly string[]>(vars: Record<string, string | undefined>, required: T): T[number][] {
  const missing: T[number][] = [];
  required.forEach((variable) => {
    const value = vars[variable];
    if (typeof value !== "string" || value.trim() === "") {
      missing.push(variable as T[number]);
    }
  });
  return missing;
}

export function resolveSlackConfig(): { config: SlackConfig | null; missing: RequiredSlackVar[] } {
  const vars = pickEnv(REQUIRED_SLACK_VARS);
  const missing = collectMissing(vars, REQUIRED_SLACK_VARS);
  if (missing.length > 0) {
    return { config: null, missing };
  }
  const botToken = (vars.SLACK_BOT_TOKEN as string).trim();
  const channelId = (vars.SLACK_CHANNEL_ID as string).trim();

  if (process.env.NODE_ENV !== "production") {
    const tokenPrefix = botToken.slice(0, Math.min(12, botToken.length));
    console.log("[ENVCHK] tokenPrefix=", tokenPrefix, "channel=", JSON.stringify(channelId));
    if (!/^[CG][A-Z0-9]+$/.test(channelId)) {
      console.warn("[ENVCHK] channel looks odd:", JSON.stringify(channelId));
    }
  }

  return {
    config: {
      botToken,
      channelId
    },
    missing: []
  };
}

export function resolveGoogleConfig(): { config: GoogleConfig | null; missing: RequiredGoogleVar[] } {
  const vars = pickEnv(REQUIRED_GOOGLE_VARS);
  const missing = collectMissing(vars, REQUIRED_GOOGLE_VARS);
  if (missing.length > 0) {
    return { config: null, missing };
  }

  const projectId = (vars.GOOGLE_PROJECT_ID as string).trim();
  const clientEmail = (vars.GOOGLE_CLIENT_EMAIL as string).trim();
  const sheetId = (vars.SHEET_ID as string).trim();
  const privateKeyRaw = (vars.GOOGLE_PRIVATE_KEY as string).trim();
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;

  const sheetRangeRaw = typeof process.env.SHEET_RANGE === "string" ? process.env.SHEET_RANGE.trim() : undefined;
  const sheetRange = sheetRangeRaw ? sheetRangeRaw : undefined;

  return {
    config: {
      projectId,
      clientEmail,
      privateKey,
      sheetId,
      sheetRange
    },
    missing: []
  };
}

export function resolveTimezone(): string {
  const timezoneRaw = process.env.TZ_DEFAULT;
  if (typeof timezoneRaw === "string") {
    const trimmed = timezoneRaw.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "Asia/Tokyo";
}

export function formatMissingEnv(missing: string[]): string {
  if (missing.length === 0) {
    return "";
  }
  const formatted = missing.map((key) => `- ${key}`).join("\n");
  return `Missing required environment variables:\n${formatted}`;
}
