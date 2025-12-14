import { GoogleGenAI } from "@google/genai";

const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key is missing. AI features will not work.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeFrame = async (base64Image: string): Promise<string> => {
  const client = getGeminiClient();
  if (!client) {
    return "API Key missing. Cannot analyze image.";
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: "You are a security AI. Briefly describe what you see in this security camera frame. Mention any people, vehicles, or suspicious activity. Keep it under 50 words."
          }
        ]
      }
    });

    return response.text || "No analysis available.";
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return "Failed to analyze image. Please try again.";
  }
};