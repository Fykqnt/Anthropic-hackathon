"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SurgeryIntensity, surgeryOptions, defaultIntensities, generateSurgeryPrompt, getIntensityLabel, getIntensityColor, PROMPT_VERSION } from "@/lib/prompt";

export default function Home() {
  const [intensities, setIntensities] = useState<SurgeryIntensity>(defaultIntensities);
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showComparison, setShowComparison] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<string>("");

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        setFile(file);
        setError(null);
        // Create preview URL for the original image
        const url = URL.createObjectURL(file);
        setOriginalImageUrl(url);
      } else {
        setError("Please upload an image file (PNG or JPEG)");
      }
    }
  }, []);

  useEffect(() => {
    setGeneratedPrompt(generateSurgeryPrompt(intensities));
  }, [intensities]);

  // Cleanup function to revoke object URLs
  useEffect(() => {
    return () => {
      if (originalImageUrl) {
        URL.revokeObjectURL(originalImageUrl);
      }
    };
  }, [originalImageUrl]);

  useEffect(() => {
    if (image && !feedbackSubmitted) {
      const t = setTimeout(() => setShowFeedbackModal(true), 10000);
      return () => clearTimeout(t);
    }
    setShowFeedbackModal(false);
  }, [image, feedbackSubmitted]);

  const submitFeedback = useCallback(async (rating: 1 | -1) => {
    try {
      if (generationId) {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId, rating: rating === 1 ? 1 : 0, reason: feedbackReason || undefined }),
        });
      } else {
        console.log("feedback(no-genId)", { rating, at: new Date().toISOString() });
      }
    } finally {
      setFeedbackSubmitted(true);
      setShowFeedbackModal(false);
      setFeedbackReason("");
    }
  }, [generationId, feedbackReason]);

  const handleIntensityChange = (key: keyof SurgeryIntensity, value: number) => {
    setIntensities(prev => ({
      ...prev,
      [key]: value
    }));
  };

  async function onEdit() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setImage(null);
    setShowFeedbackModal(false);
    setFeedbackSubmitted(false);
    setGenerationId(null);
    try {
      if (!file) throw new Error("写真をアップロードしてください");
      const form = new FormData();
      form.set("prompt", generatedPrompt);
      form.set("image", file);
      const res = await fetch("/api/edit-image", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "シミュレーションに失敗しました");
      setImage(data.image);
      setSuccess("美容整形シミュレーションが完了しました！");
      // Record generation meta to Supabase
      try {
        const genRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            procedure: "face",
            intensities,
            model: "gemini-2.5-flash-image-preview",
            promptVersion: PROMPT_VERSION,
          }),
        });
        const genData = await genRes.json();
        if (genRes.ok && genData?.generationId) setGenerationId(genData.generationId);
      } catch {}
    } catch (err) {
      const error = err as unknown as { message?: string };
      setError(error?.message || "予期しないエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      // Create preview URL for the original image
      const url = URL.createObjectURL(selectedFile);
      setOriginalImageUrl(url);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-to-br from-pink-400/10 to-red-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-gradient-to-br from-green-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <main className="relative max-w-4xl mx-auto p-6 sm:p-10">
        {/* Header */}
        <header className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl">
              ✨
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              美容整形シミュレーション
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            AIを使った美容整形シミュレーションです。写真をアップロードして、各施術の強度を調整し、
            理想の仕上がりをプレビューできます。
          </p>
        </header>

        {/* Main Editor Card */}
        <section className="card glass-effect p-8 mb-8 slide-up">
        <form
            className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
              if (!loading && file) void onEdit();
            }}
          >
            {/* File Upload Area */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📷 写真をアップロード
              </label>
              <div
                className={`dropzone cursor-pointer transition-all duration-300 ${
                  dragActive ? "border-blue-500 bg-blue-50 scale-105" : ""
                } ${file ? "border-green-500 bg-green-50" : ""}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-4">
                  {file ? (
                    <>
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-green-700">{file.name}</p>
                        <p className="text-sm text-green-600">シミュレーション準備完了 • クリックで変更</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M7 18a4.6 4.4 0 0 1 0-9 5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="m9 15 3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="m12 12 0 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-700">写真をドロップまたはクリック</p>
                        <p className="text-sm text-gray-500">PNG、JPEG対応 • 顔がはっきり写った写真をご使用ください</p>
                      </div>
                    </>
                  )}
            </div>
            <input
                  ref={fileInputRef}
              type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            {/* Surgery Options */}
            <div className="space-y-6">
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                🔧 施術内容と強度調整
          </label>
              
              {surgeryOptions.map((option) => (
                <div key={option.key} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{option.icon}</span>
                      <div>
                        <h3 className="font-medium text-gray-800">{option.label}</h3>
                        {option.description && (
                          <p className="text-xs text-gray-600">{option.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getIntensityColor(intensities[option.key])}`}>
                        {intensities[option.key]}
                      </div>
                      <div className="text-xs text-gray-500">
                        {getIntensityLabel(intensities[option.key])}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={intensities[option.key]}
                      onChange={(e) => handleIntensityChange(option.key, parseInt(e.target.value))}
                      className="w-full bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${intensities[option.key] * 10}%, #e5e7eb ${intensities[option.key] * 10}%, #e5e7eb 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>0</span>
                      <span>5</span>
                      <span>10</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Generated Prompt Preview */}
            {generatedPrompt && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  📝 生成されたプロンプト
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {generatedPrompt}
                  </pre>
                </div>
              </div>
            )}

            {/* Submit Button */}
          <button
            type="submit"
              className={`w-full px-8 py-4 ${loading ? 'btn-primary' : 'btn-accent'} font-semibold text-white transition-all duration-300 text-lg`}
              disabled={loading || !file}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="loading-spinner"></div>
                  シミュレーション実行中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  ✨ 美容整形シミュレーション開始
                </span>
              )}
          </button>
        </form>

          {/* Status Messages */}
          {loading && (
            <div className="status-loading fade-in mt-6">
              <div className="loading-spinner"></div>
              <span>AIが美容整形シミュレーションを実行中です...</span>
            </div>
          )}
          
          
          
          {error && (
            <div className="status-error fade-in mt-6">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="status-success fade-in mt-6">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {success}
            </div>
          )}
        </section>

        {/* Results Section */}
        {image && originalImageUrl && (
          <section className="card glass-effect overflow-hidden slide-up">
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-6 border-b border-pink-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center">
                    ✨
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">美容整形シミュレーション結果</h2>
                    <p className="text-sm text-gray-600">AIによる施術シミュレーション完了</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowComparison(!showComparison)}
                    className="px-3 py-2 text-sm bg-white border border-pink-300 rounded-lg hover:bg-pink-50 transition-colors flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 12h20m-10-8v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    {showComparison ? 'After のみ' : 'Before/After'}
                  </button>
                  <a
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
                href={image}
                    download="cosmetic-surgery-simulation.png"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    ダウンロード
                  </a>
                </div>
              </div>
            </div>
            <div className="p-6">
              {showComparison ? (
                /* Before/After Comparison */
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Before Image */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          B
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800">Before（施術前）</h3>
                      </div>
                      <div className="relative group aspect-square">
                        <img 
                          src={originalImageUrl} 
                          alt="施術前の画像" 
                          className="w-full h-full object-cover rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.02]" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 rounded-xl"></div>
                      </div>
                    </div>
                    
                    {/* After Image */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          A
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800">After（施術後）</h3>
                      </div>
                      <div className="relative group aspect-square">
                        <img 
                          src={image} 
                          alt="美容整形シミュレーション結果" 
                          className="w-full h-full object-cover rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.02]" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 rounded-xl"></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Comparison Arrow */}
                  <div className="flex justify-center">
                    <div className="flex items-center gap-4 bg-white rounded-full px-6 py-3 shadow-md">
                      <span className="text-gray-600 font-medium">Before</span>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 12h14m-7-7 7 7-7 7" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-pink-600 font-medium">After</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* After Only */
                <div className="relative group">
                  <img 
                    src={image} 
                    alt="美容整形シミュレーション結果" 
                    className="w-full rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.02]" 
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 rounded-xl"></div>
                </div>
              )}
              
              {/* Applied Surgery Summary */}
              <div className="mt-6 bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-3">適用された施術内容</h3>
                <div className="grid grid-cols-2 gap-3">
                  {surgeryOptions.filter(option => intensities[option.key] > 0).map(option => (
                    <div key={option.key} className="flex items-center justify-between bg-white rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span>{option.icon}</span>
                        <span className="text-sm font-medium">{option.label}</span>
                      </div>
                      <div className={`text-sm font-bold ${getIntensityColor(intensities[option.key])}`}>
                        強度 {intensities[option.key]}
                      </div>
                    </div>
                  ))}
                </div>
                {surgeryOptions.filter(option => intensities[option.key] > 0).length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">施術なし（自然な状態）</p>
                )}
              </div>
            </div>
          </section>
        )}

        {showFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl max-w-sm w-[90%] p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center">✨</div>
                  <h3 className="text-lg font-semibold text-gray-800">この結果は役に立ちましたか？</h3>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                アプリ改善のため、フィードバックをお願いします。
              </p>
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1">任意の理由（改善に役立つメモ）</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  rows={3}
                  placeholder="（例）鼻筋が不自然／肌が滑らかすぎる 等"
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="btn-primary px-4 py-2 text-sm flex-1 flex items-center justify-center gap-2"
                  onClick={() => submitFeedback(1)}
                >
                  👍 納得
                </button>
                <button
                  className="px-4 py-2 text-sm flex-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => submitFeedback(-1)}
                >
                  👎 イマイチ
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
