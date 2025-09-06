import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set" },
        { status: 500 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const prompt = String(form.get("prompt") || "").trim();
    const model = String(
      form.get("model") || "gemini-2.5-flash-image-preview"
    );
    const file = form.get("image");

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "image file is required" },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let mimeType = file.type || "image/png";
    // Gemini image inputs require raster formats (e.g., png/jpeg). Reject svg.
    if (mimeType === "image/svg+xml") {
      return NextResponse.json(
        { error: "Unsupported image type: SVG. Please upload PNG or JPEG." },
        { status: 400 }
      );
    }
    const base64 = bytes.toString("base64");

    const ai = new GoogleGenAI({ apiKey });

    // Use generateContent with inline image + prompt, no Vertex-only edit API
    const response = await ai.models.generateContent({
      model,
      contents: [
        // Put image first, then the instruction for better "edit" grounding
        { inlineData: { data: base64, mimeType } },
        { text: `Edit the provided image as follows: ${prompt}. Return only the edited image.` },
      ],
    });

    // Scan all candidates/parts for an image
    let data: string | undefined;
    const candidates = response?.candidates ?? [];
    for (const cand of candidates) {
      const parts = cand?.content?.parts ?? [];
      for (const part of parts) {
        if ((part as any)?.inlineData?.data) {
          data = (part as any).inlineData.data as string;
          break;
        }
      }
      if (data) break;
    }
    if (!data) {
      console.debug("/api/edit-image no-image", JSON.stringify({
        hasCandidates: !!candidates.length,
        firstPartsKinds: candidates[0]?.content?.parts?.map((p: any) => Object.keys(p)) ?? [],
      }));
      return NextResponse.json({ error: "No edited image returned from the model" }, { status: 500 });
    }

    return NextResponse.json({ image: `data:${mimeType};base64,${data}` });
  } catch (err: any) {
    console.error("/api/edit-image error", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error editing image" },
      { status: 500 }
    );
  }
}


