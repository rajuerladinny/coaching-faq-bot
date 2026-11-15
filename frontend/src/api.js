import { createDemoApi } from "./lib/demo.js";

// Demo mode runs entirely in the browser: a build with VITE_DEMO_MODE=true, or ?demo in the URL.
export const DEMO =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  new URLSearchParams(window.location.search).has("demo");

const TOKEN_KEY = "faqbot_owner_token";
const TIMEOUT_MS = 20000;
let token = null;
try {
  token = window.localStorage.getItem(TOKEN_KEY);
} catch {
  // storage unavailable (private mode): stay logged in for this tab only
}

function setToken(value) {
  token = value;
  try {
    if (value) window.localStorage.setItem(TOKEN_KEY, value);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export class AuthError extends Error {}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.auth && token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      typeof detail.detail === "string" ? detail.detail : "Something went wrong";
    if (res.status === 401 && options.auth) {
      setToken(null);
      throw new AuthError(message);
    }
    throw new Error(message);
  }
  return res.json();
}

const httpApi = {
  isLoggedIn: () => Boolean(token),
  logout: () => setToken(null),
  login: async (email, password) => {
    const res = await request("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    return res;
  },

  // owner (needs login)
  myCentre: () => request("/admin/centre", { auth: true }),
  saveContent: (content) =>
    request("/admin/content", { method: "PUT", body: { content }, auth: true }),
  listLeads: () => request("/admin/leads", { auth: true }),
  setLeadStatus: (leadId, status) =>
    request(`/admin/leads/${leadId}`, { method: "PATCH", body: { status }, auth: true }),
  stats: () => request("/admin/stats", { auth: true }),
  preview: (question) =>
    request("/admin/preview", { method: "POST", body: { question }, auth: true }),

  // public
  publicCentre: (id) => request(`/centres/${id}`),
  chat: (id, session_id, question) =>
    request(`/centres/${id}/chat`, {
      method: "POST",
      body: { session_id, question },
    }),
  addLead: (id, lead) =>
    request(`/centres/${id}/leads`, { method: "POST", body: lead }),
};

export const api = DEMO ? createDemoApi() : httpApi;
