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

    type InlineDataPart = { inlineData?: { data?: unknown; mimeType?: string } };
    const parts = (response?.candidates?.[0]?.content?.parts ?? []) as InlineDataPart[];
    const imagePart = parts.find((p) => p.inlineData && typeof p.inlineData.data === "string");
    const data = (imagePart?.inlineData?.data as string | undefined) ?? undefined;
    const mimeType = imagePart?.inlineData?.mimeType || "image/png";

    if (!data) {
      return NextResponse.json(
        { error: "No image data returned from the model" },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: `data:${mimeType};base64,${data}` });
  } catch (err) {
    const error = err as unknown as { message?: string };
    console.error("/api/generate-image error", err);
    return NextResponse.json(
      { error: error?.message || "Unexpected error generating image" },
      { status: 500 }
    );
  }
}


