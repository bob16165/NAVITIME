import axios from "axios";

const HERE_API_KEY = process.env.HERE_API_KEY;

if (!HERE_API_KEY) {
  // Development can continue with mock responses even without HERE key.
  console.warn("[warn] HERE_API_KEY is not set. API routes will return fallback mock data.");
}

export const hereRoutingClient = axios.create({
  baseURL: "https://router.hereapi.com/v8",
  timeout: 12000,
  params: {
    apiKey: HERE_API_KEY
  }
});

export const hereTrafficClient = axios.create({
  baseURL: "https://data.traffic.hereapi.com/v7",
  timeout: 12000,
  params: {
    apiKey: HERE_API_KEY
  }
});

export const hereSearchClient = axios.create({
  baseURL: "https://discover.search.hereapi.com/v1",
  timeout: 12000,
  params: {
    apiKey: HERE_API_KEY
  }
});

export const hasHereKey = Boolean(HERE_API_KEY);
