import React, { useState } from 'react';
import { 
  Sliders, 
  ShieldAlert, 
  HardDrive, 
  Lock, 
  Bell, 
  Wifi, 
  Eye, 
  Save, 
  CheckCircle2,
  Moon
} from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('detection');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Settings State Management
  const [settings, setSettings] = useState({
    resolution: '1080p',
    nightVision: 'auto',
    audioRecording: true,
    motionSensitivity: 'medium',
    humanDetection: true,
    vehicleDetection: true,
    suspiciousAlerts: true,
    pushNotifications: true,
    recordingMode: 'event',
    autoDeleteDays: '30',
    twoFactorAuth: true,
    privacyMode: false,
  });

  const handleToggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 md:p-10 bg-slate-900 min-h-screen text-white">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">System Settings</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage your camera feeds, AI detection rules, and storage preferences.
          </p>
        </div>

        {/* Save Changes Button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 w-fit"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-300" /> Saved!
            </>
          ) : (
            <>
              <Save className="w-5 h-5" /> Save Changes
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Tabs Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'general'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            <Sliders className="w-5 h-5" /> Camera & Feed
          </button>

          <button
            onClick={() => setActiveTab('detection')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'detection'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-5 h-5" /> AI Detection & Alerts
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'storage'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            <HardDrive className="w-5 h-5" /> Storage & NVR
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'privacy'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60 hover:text-white'
            }`}
          >
            <Lock className="w-5 h-5" /> Privacy & Security
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="lg:col-span-3 bg-slate-800 border border-slate-700 rounded-2xl p-6 md:p-8 space-y-8">
          
          {/* TAB 1: GENERAL / CAMERA SETTINGS */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold border-b border-slate-700 pb-4 flex items-center gap-2">
                <Sliders className="text-blue-400" /> Camera & Streaming Controls
              </h2>

              {/* Video Resolution */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="font-medium text-slate-200">Default Stream Quality</label>
                  <p className="text-xs text-slate-400 mt-0.5">Select preferred video quality for live streams</p>
                </div>
                <select
                  value={settings.resolution}
                  onChange={(e) => handleChange('resolution', e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="720p">720p (Data Saver)</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="4k">4K Ultra HD</option>
                </select>
              </div>

              {/* Night Vision Mode */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center gap-3">
                  <Moon className="text-indigo-400 w-5 h-5" />
                  <div>
                    <label className="font-medium text-slate-200">Night Vision Mode</label>
                    <p className="text-xs text-slate-400 mt-0.5">Infrared night vision behavior</p>
                  </div>
                </div>
                <select
                  value={settings.nightVision}
                  onChange={(e) => handleChange('nightVision', e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="auto">Auto (Sensor Triggered)</option>
                  <option value="always_on">Always ON</option>
                  <option value="off">Disabled</option>
                </select>
              </div>

              {/* Audio Recording Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div>
                  <label className="font-medium text-slate-200">Audio Stream & Mic</label>
                  <p className="text-xs text-slate-400 mt-0.5">Capture live audio and enable 2-way talk</p>
                </div>
                <button
                  onClick={() => handleToggle('audioRecording')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.audioRecording ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.audioRecording ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: AI DETECTION & ALERTS */}
          {activeTab === 'detection' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold border-b border-slate-700 pb-4 flex items-center gap-2">
                <ShieldAlert className="text-emerald-400" /> AI Detection & Real-time Alerts
              </h2>

              {/* Motion Sensitivity */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="font-medium text-slate-200">Motion Detection Sensitivity</label>
                  <p className="text-xs text-slate-400 mt-0.5">Adjust threshold to minimize false alarms</p>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
                  {['low', 'medium', 'high'].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => handleChange('motionSensitivity', lvl)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                        settings.motionSensitivity === lvl
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Human Detection */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div>
                  <label className="font-medium text-slate-200">Human Shape Recognition</label>
                  <p className="text-xs text-slate-400 mt-0.5">Identify and trigger alerts specifically for people</p>
                </div>
                <button
                  onClick={() => handleToggle('humanDetection')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.humanDetection ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.humanDetection ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Suspicious Object / Activity Alerts */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div>
                  <label className="font-medium text-slate-200">Suspicious Activity Alerts</label>
                  <p className="text-xs text-slate-400 mt-0.5">Alert when unassigned or suspicious objects are detected</p>
                </div>
                <button
                  onClick={() => handleToggle('suspiciousAlerts')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.suspiciousAlerts ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.suspiciousAlerts ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Push Notifications */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div className="flex items-center gap-3">
                  <Bell className="text-amber-400 w-5 h-5" />
                  <div>
                    <label className="font-medium text-slate-200">Mobile Push Notifications</label>
                    <p className="text-xs text-slate-400 mt-0.5">Receive instant alerts on your phone</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('pushNotifications')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.pushNotifications ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.pushNotifications ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: STORAGE SETTINGS */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold border-b border-slate-700 pb-4 flex items-center gap-2">
                <HardDrive className="text-amber-400" /> Storage & Recording Setup
              </h2>

              {/* Recording Mode */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="font-medium text-slate-200">Recording Mode</label>
                  <p className="text-xs text-slate-400 mt-0.5">Choose continuous or event-triggered recording</p>
                </div>
                <select
                  value={settings.recordingMode}
                  onChange={(e) => handleChange('recordingMode', e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="event">Event Motion Only (Saves Space)</option>
                  <option value="continuous">24/7 Continuous Recording</option>
                </select>
              </div>

              {/* Auto Cleanup Days */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-700/50">
                <div>
                  <label className="font-medium text-slate-200">Auto-Delete Footage</label>
                  <p className="text-xs text-slate-400 mt-0.5">Automatically clear old recordings</p>
                </div>
                <select
                  value={settings.autoDeleteDays}
                  onChange={(e) => handleChange('autoDeleteDays', e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="7">After 7 Days</option>
                  <option value="14">After 14 Days</option>
                  <option value="30">After 30 Days</option>
                  <option value="60">After 60 Days</option>
                </select>
              </div>

              {/* Storage Info Card */}
              <div className="bg-slate-900 border border-slate-700/80 p-4 rounded-xl mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Local Storage (NVR Drive)</span>
                  <span className="text-slate-200 font-semibold">1.2 TB / 2.0 TB Used</span>
                </div>
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-[60%]" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PRIVACY & SECURITY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold border-b border-slate-700 pb-4 flex items-center gap-2">
                <Lock className="text-rose-400" /> Privacy & Security Controls
              </h2>

              {/* Privacy Mode */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className="text-purple-400 w-5 h-5" />
                  <div>
                    <label className="font-medium text-slate-200">Indoor Camera Privacy Mode</label>
                    <p className="text-xs text-slate-400 mt-0.5">Turn off indoor video feeds when home</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('privacyMode')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.privacyMode ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.privacyMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Two Factor Authentication */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div>
                  <label className="font-medium text-slate-200">Two-Factor Authentication (2FA)</label>
                  <p className="text-xs text-slate-400 mt-0.5">Require OTP code on login</p>
                </div>
                <button
                  onClick={() => handleToggle('twoFactorAuth')}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    settings.twoFactorAuth ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full transition-transform ${
                      settings.twoFactorAuth ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}