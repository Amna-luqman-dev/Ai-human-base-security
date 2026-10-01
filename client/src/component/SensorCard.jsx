import React from 'react';

const SensorCard = ({ title, value, unit, icon, statusColor, subtitle }) => {
  return (
    <div className="bg-gray-800/80 backdrop-blur-md border border-gray-700/60 p-5 rounded-2xl shadow-lg flex justify-between items-center hover:border-gray-600 transition-all">
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{title}</p>
        <div className="flex items-baseline gap-1">
          <h2 className="text-3xl font-extrabold text-white">{value}</h2>
          <span className="text-sm font-semibold text-gray-400">{unit}</span>
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>

      <div className={`p-4 rounded-2xl text-2xl ${statusColor}`}>
        {icon}
      </div>
    </div>
  );
};

export default SensorCard;