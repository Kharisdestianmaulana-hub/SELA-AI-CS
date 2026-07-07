import { config } from "dotenv";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY belum ada di .env.local");
  process.exit(1);
}

const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

try {
  const response = await fetch(endpoint);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Gagal mengambil daftar model Gemini.");
    console.error(data?.error?.message || `HTTP ${response.status}`);
    process.exit(1);
  }

  const models = data.models || [];
  const generateContentModels = models.filter((model) =>
    (model.supportedGenerationMethods || []).includes("generateContent"),
  );

  console.log("Model Gemini yang support generateContent:");
  for (const model of generateContentModels) {
    console.log(`- ${model.name.replace(/^models\//, "")}`);
  }

  console.log("");
  console.log("Rekomendasi untuk .env.local:");
  const recommended =
    generateContentModels.find((model) => model.name.includes("2.0-flash")) ||
    generateContentModels.find((model) => model.name.includes("flash")) ||
    generateContentModels[0];

  if (recommended) {
    console.log(`GEMINI_MODEL=${recommended.name.replace(/^models\//, "")}`);
  } else {
    console.log("Tidak ada model generateContent yang ditemukan untuk API key ini.");
  }
} catch (error) {
  console.error("Gagal menghubungi Gemini API.");
  console.error(error?.message || error);
  process.exit(1);
}
