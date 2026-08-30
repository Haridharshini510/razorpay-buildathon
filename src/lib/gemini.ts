import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not defined");
    }
    client = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return client;
}

export function isLLMAvailable(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY !== "your-gemini-api-key-here";
}
