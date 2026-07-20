import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

// Attach the JWT token (if present) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("saics_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
