function serviceBase() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.NEXT_PUBLIC_API_URL) throw new Error("The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.");
    return "/api/account";
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") return `http://${window.location.hostname}:4000`;
  return "http://localhost:4000";
}

export type SupportMessage = { senderType: "user" | "admin"; senderName: string; body: string; createdAt: string };
export type SupportConversation = { id: string; email: string; participantType: "registered" | "guest"; status: "open" | "closed"; messages: SupportMessage[] };
export type GuestSupportSession = { conversation: SupportConversation; accessToken: string };

export async function supportRequest<T>(path: string, method = "GET", payload?: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${serviceBase()}/support/${path}`, {
      method,
      credentials: "include",
      headers: { ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { "X-Chat-Token": token } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch { throw new Error("Cannot reach EchoVest support right now. Check your connection and try again."); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || "Support request failed.");
  return data as T;
}
