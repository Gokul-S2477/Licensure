const API_BASE = "https://licensure.onrender.com/api";

export async function fetchLicenses() {
  const res = await fetch(`${API_BASE}/licenses`);
  return res.json();
}
