const API_BASE = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api`;

export async function fetchLicenses() {
  const res = await fetch(`${API_BASE}/licenses`);
  return res.json();
}
