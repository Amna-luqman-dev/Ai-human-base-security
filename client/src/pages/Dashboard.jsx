import React, { useState } from "react";

import SensorCard from "../component/SensorCard";
import DeviceCard from "../component/DeviceCard";

function Dashboard() {

  // State for all controllable devices
  const [devices, setDevices] = useState([
    {
      id: 1,
      name: "Main Ceiling Light",
      room: "Living Room",
      isOn: true,
      icon: "💡",
    },
    {
      id: 2,
      name: "Air Conditioner",
      room: "Bedroom",
      isOn: false,
      icon: "❄️",
    },
    {
      id: 3,
      name: "Smart Fan",
      room: "Living Room",
      isOn: true,
      icon: "💨",
    },
    {
      id: 4,
      name: "Smart TV",
      room: "Living Room",
      isOn: false,
      icon: "📺",
    },
    {
      id: 5,
      name: "Night Lamp",
      room: "Bedroom",
      isOn: false,
      icon: "🌙",
    },
    {
      id: 6,
      name: "Kitchen Exhaust",
      room: "Kitchen",
      isOn: true,
      icon: "🌀",
    },
  ]);

  const [selectedRoom, setSelectedRoom] = useState("All");

  // Toggle device
  const handleToggle = (id) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === id
          ? { ...device, isOn: !device.isOn }
          : device
      )
    );
  };

  // Filter devices
  const filteredDevices =
    selectedRoom === "All"
      ? devices
      : devices.filter(
          (device) => device.room === selectedRoom
        );

  return (
    <div className="p-6 md:p-10 overflow-y-auto">

      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">

        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Overview Dashboard
          </h1>

          <p className="text-sm text-gray-400 mt-1">
            Control and monitor your smart home in real-time.
          </p>
        </div>

        <div className="flex items-center gap-4">

          {/* <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2">

            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>

            Live WebSockets

          </span> */}

          <div className="px-5 py-2 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-md gap-2">
            Login/Register
          </div>

        </div>
      </header>


      {/* Real-time Sensor Widgets */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">

        <SensorCard
          title="Temperature"
          value="26.4"
          unit="°C"
          icon="🌡️"
          statusColor="bg-orange-500/10 text-orange-400 border border-orange-500/20"
          subtitle="Optimal Room Temp"
        />

        <SensorCard
          title="Humidity"
          value="55"
          unit="%"
          icon="💧"
          statusColor="bg-blue-500/10 text-blue-400 border border-blue-500/20"
          subtitle="DHT11 Sensor Data"
        />

        <SensorCard
          title="Active Power"
          value="1.8"
          unit="kWh"
          icon="⚡"
          statusColor="bg-amber-500/10 text-amber-400 border border-amber-500/20"
          subtitle="3 Active Loads"
        />

      </section>


      {/* Room Filter Tabs & Device Controls */}
      <section>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">

          <h2 className="text-xl font-bold text-white">
            Smart Appliances
          </h2>

          {/* Filter Tabs */}
          <div className="flex gap-2 bg-gray-900 p-1.5 rounded-xl border border-gray-800">

            {["All", "Living Room", "Bedroom", "Kitchen"].map(
              (room) => (
                <button
                  key={room}
                  onClick={() => setSelectedRoom(room)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedRoom === room
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {room}
                </button>
              )
            )}

          </div>

        </div>


        {/* Device Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

          {filteredDevices.map((device) => (

            <DeviceCard
              key={device.id}
              name={device.name}
              room={device.room}
              isOn={device.isOn}
              icon={device.icon}
              onToggle={() => handleToggle(device.id)}
            />

          ))}

        </div>

      </section>

    </div>
  );
}

export default Dashboard;