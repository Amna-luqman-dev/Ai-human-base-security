import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Lightbulb, ShieldAlert } from 'lucide-react';

function LivingRoom() {
  const [isLightOn, setIsLightOn] = useState(false);

  return (
    <div className="p-6 md:p-10 text-white bg-slate-900 min-h-screen">
      {/* Title */}
      <h1 className="text-3xl font-bold mb-8 text-center md:text-left">
        Living Room Smart Hub
      </h1>

      {/* 4 Feature Divs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* 1. Real-time Pic Detection Div */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-blue-500 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Camera className="text-blue-400 w-7 h-7" />
              <h2 className="text-xl font-semibold">Live Camera Detection</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Real-time camera feed analysis for detecting objects and movement in the living room.
            </p>
          </div>
          
          <div className="bg-slate-900 h-48 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
            [ Camera Feed / Detection Box ]
          </div>
        </div>

        {/* 2. Image Detection / Upload Div */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-emerald-500 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <ImageIcon className="text-emerald-400 w-7 h-7" />
              <h2 className="text-xl font-semibold">Image Analysis</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Upload or capture a snapshot to process object classification and image detection.
            </p>
          </div>

          <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer transition-all">
            <ImageIcon className="text-slate-500 w-10 h-10 mb-2" />
            <span className="text-slate-400 text-sm">Upload Image to Detect</span>
          </div>
        </div>

        {/* 3. Light Control (ON / OFF) Div */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-amber-500 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Lightbulb className={`w-7 h-7 ${isLightOn ? 'text-amber-400' : 'text-slate-500'}`} />
              <h2 className="text-xl font-semibold">Smart Light Control</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Toggle living room main lighting on or off remotely.
            </p>
          </div>

          <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl">
            <span className="font-medium">
              Status: <span className={isLightOn ? 'text-amber-400' : 'text-slate-400'}>{isLightOn ? 'ON' : 'OFF'}</span>
            </span>
            <button
              onClick={() => setIsLightOn(!isLightOn)}
              className={`px-5 py-2 rounded-lg font-semibold transition-all ${
                isLightOn 
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' 
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              Turn {isLightOn ? 'OFF' : 'ON'}
            </button>
          </div>
        </div>

        {/* 4. Suspicious / Threat Detection Div */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-red-500 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="text-red-500 w-7 h-7" />
                <h2 className="text-xl font-semibold">Suspicious Activity Alert</h2>
              </div>
              <span className="bg-red-500/20 text-red-400 text-xs px-2.5 py-1 rounded-full font-medium">
                Active
              </span>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              AI-powered anomaly detection for unwanted items, intrusions, or abnormal activity.
            </p>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-red-500/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Security Status:</span>
              <span className="text-emerald-400 font-semibold">Clear (No Threat)</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default LivingRoom;