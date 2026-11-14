const TOKEN_KEY = "faqbot_owner_token";
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
  const res = await fetch(`/api${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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

export const api = {
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
