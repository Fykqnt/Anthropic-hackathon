"use client";

import { useEffect, useMemo, useState } from "react";

type ArmRow = {
  arm_id: string;
  shows: number;
  thumbs_up: number;
  thumbs_down: number;
  ctr: number | null;
  wilson_lower: number | null;
  updated_at: string;
  arms?: {
    base_prompt_version: string;
    active: boolean;
    created_at: string;
  };
};

type SortKey = "ctr" | "shows" | "updated_at";

export default function DashboardPage() {
  const [data, setData] = useState<ArmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("ctr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [series, setSeries] = useState<{ date: string; rate: number }[]>([]);
  const [seriesSummary, setSeriesSummary] = useState<{ up: number; total: number; rate: number } | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/arms", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load arms");
        if (!ignore) setData(Array.isArray(json?.arms) ? json.arms : []);
      } catch (e) {
        if (!ignore) setError((e as { message?: string })?.message || "Unexpected error");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/metrics/approvals?days=30", { credentials: "include" });
        const json = await res.json();
        if (res.ok) {
          const pts = Array.isArray(json?.points) ? json.points as { date: string; rate: number }[] : [];
          setSeries(pts);
          setSeriesSummary(json?.summary ?? null);
        }
      } catch {}
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const maxShows = useMemo(() => data.reduce((m, r) => Math.max(m, r.shows || 0), 0) || 1, [data]);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number;
      const bv = (b[sortKey] ?? 0) as number;
      if (av === bv) return 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">配信ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-2">全体の承認率（👍/👍+👎）推移と、各腕のパフォーマンスを可視化</p>
      </div>

      {/* Overall approval-rate time series */}
      <section className="card glass-effect p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">承認率の推移（直近30日）</h2>
          {seriesSummary && (
            <div className="text-sm text-gray-600">
              合計: {seriesSummary.up}/{seriesSummary.total}（{Math.round((seriesSummary.rate || 0) * 100)}%）
            </div>
          )}
        </div>
        <div className="w-full overflow-hidden">
          {series.length === 0 ? (
            <div className="text-sm text-gray-500">データがありません</div>
          ) : (
            <svg viewBox="0 0 600 200" className="w-full h-40">
              <defs>
                <linearGradient id="gradLine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity="1" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="gradFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {(() => {
                const marginL = 40;
                const marginR = 10;
                const marginT = 10;
                const marginB = 20;
                const W = 600 - marginL - marginR;
                const H = 200 - marginT - marginB;
                const xs = (i: number) => marginL + (series.length <= 1 ? 0 : (i * W) / (series.length - 1));
                const ys = (v: number) => marginT + (1 - v) * H; // v in [0,1]
                const path = series.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.rate || 0)}`).join(" ");
                const area = `${path} L${xs(series.length - 1)},${ys(0)} L${xs(0)},${ys(0)} Z`;
                // Axes
                const ticksY = [0, 0.25, 0.5, 0.75, 1];
                return (
                  <g>
                    <rect x={marginL} y={marginT} width={W} height={H} fill="#fff" />
                    <path d={path} fill="none" stroke="url(#gradLine)" strokeWidth={2} />
                    <path d={area} fill="url(#gradFill)" />
                    {ticksY.map((t) => (
                      <g key={t}>
                        <line x1={marginL} x2={marginL + W} y1={ys(t)} y2={ys(t)} stroke="#eee" />
                        <text x={8} y={ys(t) + 4} fontSize={10} fill="#6b7280">{Math.round(t * 100)}%</text>
                      </g>
                    ))}
                    {/* Last point label */}
                    {series.length > 0 && (
                      <text x={xs(series.length - 1) + 6} y={ys(series[series.length - 1].rate || 0)} fontSize={10} fill="#6b7280">
                        {Math.round((series[series.length - 1].rate || 0) * 100)}%
                      </text>
                    )}
                  </g>
                );
              })()}
            </svg>
          )}
        </div>
      </section>

      <section className="card glass-effect p-6">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-600"><div className="loading-spinner" />読み込み中...</div>
        ) : error ? (
          <div className="status-error"><span>{error}</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Arm</th>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4 cursor-pointer" onClick={() => onSort("shows")}>露出数{sortKey === "shows" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
                  <th className="py-2 pr-4 cursor-pointer" onClick={() => onSort("ctr")}>CTR{sortKey === "ctr" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
                  <th className="py-2 pr-4 cursor-pointer" onClick={() => onSort("updated_at")}>最終更新{sortKey === "updated_at" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const ver = row.arms?.base_prompt_version || "-";
                  const isActive = row.arms?.active;
                  const ctrPct = Math.round(((row.ctr || 0) * 100 + Number.EPSILON) * 10) / 10;
                  const showsWidth = Math.max(4, Math.round(((row.shows || 0) / maxShows) * 100));
                  const shortId = row.arm_id.slice(0, 8) + "…";

                  return (
                    <tr key={row.arm_id} className="border-t border-gray-100">
                      <td className="py-3 pr-4 align-top">
                        <div className="font-mono text-gray-800">{shortId}</div>
                        <div className="mt-2 h-2 w-40 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-pink-400 to-purple-500" style={{ width: `${showsWidth}%` }} />
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">{ver}</span>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                            <span className="w-2 h-2 rounded-full bg-gray-300" />Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="text-gray-800 font-medium">{row.shows ?? 0}</div>
                        <div className="text-[11px] text-gray-400">露出</div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="text-gray-900 font-semibold">{ctrPct}%</div>
                        <div className="text-[11px] text-gray-400">承認率</div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="text-gray-700">{new Date(row.updated_at).toLocaleString()}</div>
                        <div className="text-[11px] text-gray-400">更新</div>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500">データがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


