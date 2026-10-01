import React, { useState, useEffect } from "react";
import { Activity, ShieldCheck, AlertTriangle } from "lucide-react";

export default function AnalyticsCard() {
  const [analysis, setAnalysis] = useState({
    fps: 30,
    objectsDetected: 2,
    threatLevel: "Low",
    status: "Clear",
    lastUpdated: "Just now",
  });

  // Smooth updates simulation without backend
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulating real-time AI detection changes
      const randomFPS = Math.floor(Math.random() * (30 - 27 + 1)) + 27;
      const randomObjects = Math.floor(Math.random() * 4); // 0 to 3 objects
      const hasThreat = randomObjects > 2;

      setAnalysis({
        fps: randomFPS,
        objectsDetected: randomObjects,
        threatLevel: hasThreat ? "Medium" : "Low",
        status: hasThreat ? "Suspicious Activity" : "Clear",
        lastUpdated: new Date().toLocaleTimeString(),
      });
    }, 4000); // Har 4 seconds par update hoga

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl text-white w-full max-w-md shadow-lg transition-all duration-500">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Activity className="text-blue-400 w-5 h-5 animate-pulse" /> Live Analysis
        </h3>
        <span className="text-xs text-slate-400">Updated: {analysis.lastUpdated}</span>
      </div>

      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700/50">
          <span className="text-sm text-slate-400">Threat Status</span>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 transition-all ${
              analysis.status === "Clear"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {analysis.status === "Clear" ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            {analysis.status}
          </span>
        </div>

        {/* Dynamic Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-700/50">
            <p className="text-xs text-slate-400">Objects Detected</p>
            <p className="text-xl font-bold text-blue-400 transition-all">
              {analysis.objectsDetected}
            </p>
          </div>
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-700/50">
            <p className="text-xs text-slate-400">Stream FPS</p>
            <p className="text-xl font-bold text-emerald-400 transition-all">
              {analysis.fps} FPS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}