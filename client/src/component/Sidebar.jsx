import React from 'react';
import { Link } from "react-router-dom";


import { Zap, LayoutDashboard,  LineChart, Settings ,Armchair, Camera} from 'lucide-react';
const Sidebar = () => {
  return (
    <aside className="w-70 bg-gray-900 border-r border-gray-800 p-6 flex flex-col justify-between hidden md:flex min-h-screen">
      <div>
        {/* Logo / Brand Name */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center 
          justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
            <Zap size={15} className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-wide">SmartHome</span>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-2">
          <Link
  to="/"
  className="flex items-center gap-3 px-4 py-3 text-gray-400
  hover:bg-gray-800 hover:text-white rounded-xl transition-all"
>
  <LayoutDashboard size={15} className="w-6 h-6 text-white" />
  Dashboard
</Link>
         
          
           <Link
  to="/living-room"
  className="flex items-center gap-3 px-4 py-3 text-gray-400
  hover:bg-gray-800 hover:text-white rounded-xl transition-all"
>
  <Armchair size={15} className="w-6 h-6 text-white" />
  Living Room
</Link>



          <Link
  to="/analytics"
  className="flex items-center gap-3 px-4 py-3 text-gray-400
  hover:bg-gray-800 hover:text-white rounded-xl transition-all"
>
  <LineChart size={15} className="w-6 h-6 text-white" />
  Analytics
</Link>

<Link
  to="/camera"
  className="flex items-center gap-3 px-4 py-3 text-gray-400
  hover:bg-gray-800 hover:text-white rounded-xl transition-all"
>
  <Camera size={15} className="w-6 h-6 text-white" />
  Camera
</Link>
          
          
         <Link
  to="/Settings"
  className="flex items-center gap-3 px-4 py-3 text-gray-400
  hover:bg-gray-800 hover:text-white rounded-xl transition-all"
>
  <Settings size={15} className="w-6 h-6 text-white" />
  Settings
</Link>
        </nav>
      </div>

      {/* System Status Indicator */}
      <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/50">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>ESP32 Gateway</span>
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        </div>
        <p className="text-sm font-semibold text-gray-200">Connected (Wi-Fi)</p>
      </div>
    </aside>
  );
};

export default Sidebar;