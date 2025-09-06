import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set on the server" },
        { status: 500 }
      );
    }

    const { prompt } = await req.json();
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });

    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData && p.inlineData.data);
    const data = imagePart?.inlineData?.data as string | undefined;
    const mimeType = imagePart?.inlineData?.mimeType || "image/png";

    if (!data) {
      return NextResponse.json(
        { error: "No image data returned from the model" },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: `data:${mimeType};base64,${data}` });
  } catch (err: any) {
    console.error("/api/generate-image error", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error generating image" },
      { status: 500 }
    );
  }
}


