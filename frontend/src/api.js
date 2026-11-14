async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      typeof detail.detail === "string" ? detail.detail : "Something went wrong";
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  listCentres: () => request("/admin/centres"),
  createCentre: (name) =>
    request("/admin/centres", { method: "POST", body: { name } }),
  getCentre: (id) => request(`/admin/centres/${id}`),
  saveContent: (id, content) =>
    request(`/admin/centres/${id}/content`, { method: "PUT", body: { content } }),
  listLeads: (id) => request(`/admin/centres/${id}/leads`),
  publicCentre: (id) => request(`/centres/${id}`),
  chat: (id, session_id, question) =>
    request(`/centres/${id}/chat`, {
      method: "POST",
      body: { session_id, question },
    }),
  addLead: (id, lead) =>
    request(`/centres/${id}/leads`, { method: "POST", body: lead }),
};
