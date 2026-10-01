import React from 'react';

const DeviceCard = ({ name, room, isOn, onToggle, icon }) => {
  return (
    <div className={`p-5 rounded-2xl transition-all duration-300 border shadow-md flex flex-col justify-between h-40 ${
      isOn 
        ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500/50 text-white shadow-blue-900/20' 
        : 'bg-gray-800/90 border-gray-700/70 text-gray-300 hover:border-gray-600'
    }`}>
      <div className="flex justify-between items-start">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
          isOn ? 'bg-white/20 text-white' : 'bg-gray-700/60 text-gray-400'
        }`}>
          {icon}
        </div>

        {/* Custom Toggle Switch */}
        <button
          onClick={onToggle}
          className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${
            isOn ? 'bg-white justify-end' : 'bg-gray-600 justify-start'
          } flex items-center`}
        >
          <div className={`w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${
            isOn ? 'bg-blue-600' : 'bg-gray-300'
          }`} />
        </button>
      </div>

      <div>
        <h3 className="font-bold text-base tracking-wide">{name}</h3>
        <p className={`text-xs ${isOn ? 'text-blue-100' : 'text-gray-400'}`}>{room}</p>
      </div>
    </div>
  );
};

export default DeviceCard;