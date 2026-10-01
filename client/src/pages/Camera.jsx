import React, { useEffect, useRef, useState } from "react";
import { Video, ShieldCheck, Camera as CameraIcon } from "lucide-react";

// 8 Specific Cameras List
const CAMERA_LOCATIONS = [
  { id: 1, name: "Main Entrance Gate", location: "Outdoor" },
  { id: 2, name: "Living Room", location: "Indoor" },
  { id: 3, name: "Kitchen", location: "Indoor" },
  { id: 4, name: "Garage / Porch", location: "Outdoor" },
  { id: 5, name: "Backyard / Garden", location: "Outdoor" },
  { id: 6, name: "Master Bedroom", location: "Indoor" },
  { id: 7, name: "Staircase Hallway", location: "Indoor" },
  { id: 8, name: "Rooftop Terrace", location: "Outdoor" },
];

function CameraStream() {
  const videoRef = useRef(null);

  useEffect(() => {
    let streamInstance = null;

    async function startCamera() {
      try {
        streamInstance = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = streamInstance;
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }

    startCamera();

    return () => {
      if (streamInstance) {
        streamInstance.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover rounded-xl"
    />
  );
}

export default function CameraHub() {
  // Pehle camera (Main Entrance) ko default active banaya hai
  const [activeCamId, setActiveCamId] = useState(1);

  return (
    <div className="p-6 md:p-10 bg-slate-900 min-h-screen text-white">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Video className="text-blue-500 w-8 h-8" /> Smart Surveillance Hub
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitoring 8 active security zones in real-time
          </p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-300">
          Active Cameras: <span className="text-emerald-400 font-semibold">8 / 8 Online</span>
        </div>
      </div>

      {/* 8 Cameras Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CAMERA_LOCATIONS.map((cam) => {
          const isActive = cam.id === activeCamId;

          return (
            <div
              key={cam.id}
              onClick={() => setActiveCamId(cam.id)}
              className={`bg-slate-800 border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
                isActive
                  ? "border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500"
                  : "border-slate-700 hover:border-slate-500"
              }`}
            >
              {/* Camera Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 overflow-hidden">
                  <CameraIcon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                  <h3 className="font-semibold text-sm truncate">{cam.name}</h3>
                </div>
                <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                  {cam.location}
                </span>
              </div>

              {/* Video Box */}
              <div className="relative w-full h-44 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                {isActive ? (
                  <CameraStream />
                ) : (
                  <div className="text-center p-4">
                    <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs">Standby Mode</p>
                    <p className="text-blue-400 text-[11px] mt-1">Click to view stream</p>
                  </div>
                )}

                {/* Status Indicator */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700/50 text-[10px] text-slate-300 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}></span>
                  {isActive ? "LIVE" : "READY"}
                </div>
              </div>

              {/* Footer Info */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Detection Active
                </span>
                <span>CAM-0{cam.id}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}