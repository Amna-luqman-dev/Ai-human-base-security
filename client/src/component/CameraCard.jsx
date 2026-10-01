// import React from "react";

// const cameras = [
//   {
//     id: 1,
//     name: "Front Camera",
//     location: "Main Entrance",
//     status: "Active",
//   },
//   {
//     id: 2,
//     name: "Back Camera",
//     location: "Back Entrance",
//     status: "Active",
//   },
//   {
//     id: 3,
//     name: "Office Camera",
//     location: "Office Room",
//     status: "Active",
//   },
//   {
//     id: 4,
//     name: "Parking Camera",
//     location: "Parking Area",
//     status: "Active",
//   },
//   {
//     id: 5,
//     name: "Hall Camera",
//     location: "Main Hall",
//     status: "Offline",
//   },
//   {
//     id: 6,
//     name: "Gate Camera",
//     location: "Security Gate",
//     status: "Active",
//   },
// ];

// export default function CameraCard() {
//   return (
//     <div className="min-h-screen bg-gray-950 p-8">
//       <h1 className="text-3xl font-bold text-white mb-8">
//         Security Cameras
//       </h1>

//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
//         {cameras.map((camera) => (
//           <div
//             key={camera.id}
//             className="bg-gray-900 border border-gray-800 rounded-2xl p-5
//             hover:border-gray-600 transition-all"
//           >
//             {/* Camera Preview */}
//             <div className="h-40 bg-gray-800 rounded-xl flex items-center justify-center mb-4">
//               <CameraIcon />
//             </div>

//             {/* Camera Info */}
//             <h2 className="text-xl font-semibold text-white">
//               {camera.name}
//             </h2>

//             <p className="text-gray-400 mt-1">
//               {camera.location}
//             </p>

//             <div className="flex items-center gap-2 mt-4">
//               <span
//                 className={`w-2.5 h-2.5 rounded-full ${
//                   camera.status === "Active"
//                     ? "bg-green-500"
//                     : "bg-red-500"
//                 }`}
//               ></span>

//               <span className="text-gray-300">
//                 {camera.status}
//               </span>
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function CameraIcon() {
//   return (
//     <svg
//       className="w-12 h-12 text-gray-400"
//       fill="none"
//       stroke="currentColor"
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         strokeWidth="1.5"
//         d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
//       />
//     </svg>
//   );
// }
import React from "react";
import CameraCard from "../component/CameraCard";
import { Camera } from "lucide-react";

const CameraPage = () => {
  return (
    <div className="p-6 md:p-10 bg-slate-900 min-h-screen text-white">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Camera Surveillance</h1>
        <p className="text-slate-400 text-sm mt-1">
          Monitor real-time feed and live detections.
        </p>
      </div>

      {/* Camera Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Single Camera Card or Multiple */}
        <Camera title="Living Room Main Feed" />
        {/* Agla camera card add karna ho to directly yahan include kar saktay hain */}
      </div>
    </div>
  );
};

export default CameraCard;