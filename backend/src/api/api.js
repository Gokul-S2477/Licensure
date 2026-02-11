const API_BASE = "http://localhost:5000/api";

export async function fetchLicenses() {
  const res = await fetch(`${API_BASE}/licenses`);
  return res.json();
}
