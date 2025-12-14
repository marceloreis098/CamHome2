import { GoogleGenAI } from "@google/genai";

export const analyzeFrame = async (base64Image: string): Promise<string> => {
  // Initialize client directly with process.env.API_KEY as per guidelines.
  // We assume the key is pre-configured and valid.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
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