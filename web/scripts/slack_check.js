require("dotenv").config({ path: "./.env.local" });

const API_BASE = "https://slack.com/api";

async function slackApi(method, token, params = {}) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      body.append(key, value.join(","));
      return;
    }
    body.append(key, String(value));
  });

  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data.ok) {
    const error = new Error(data.error || "unknown_error");
    error.data = data;
    throw error;
  }

  return data;
}

(async () => {
  const token = (process.env.SLACK_BOT_TOKEN || "").trim();
  const channel = (process.env.SLACK_CHANNEL_ID || "").trim();
  const dump = (value) => `[len=${value.length}] ` + Array.from(value).map((char) => char.charCodeAt(0).toString(16)).join(" ");
  console.log("[CHK] tokenPrefix=", token.slice(0, Math.min(12, token.length)), "channel=", JSON.stringify(channel));
  console.log("[CHK] channel hex =", dump(channel));

  try {
    const auth = await slackApi("auth.test", token);
    console.log("[CHK] auth.test =>", auth.ok, auth.user || auth.bot_id);
  } catch (error) {
    console.log("[CHK] auth.test error =", error.data?.error || error.message);
    return;
  }

  try {
    const members = await slackApi("conversations.members", token, { channel, limit: 3 });
    console.log("[CHK] members.ok=", members.ok, "first=", members.members?.[0]);
  } catch (error) {
    console.log("[CHK] members.error=", error.data?.error || error.message, error.data);
  }

  try {
    const literalMembers = await slackApi("conversations.members", token, { channel: "C0957N7D0MP", limit: 3 });
    console.log("[CHK] members(literal).ok=", literalMembers.ok, "first=", literalMembers.members?.[0]);
  } catch (error) {
    console.log("[CHK] members(literal).error=", error.data?.error || error.message, error.data);
  }
})();
