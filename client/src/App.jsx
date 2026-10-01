import { BrowserRouter, Routes, Route } from "react-router-dom";

import Sidebar from "./component/Sidebar";

import Dashboard from "./pages/Dashboard";
import LivingRoom from "./pages/LivingRoom";
import Analytics from "./pages/Analytics";
import Camera from "./pages/Camera";
import Settings from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-950">

        {/* Sidebar */}
        <Sidebar />

        {/* Pages */}
        <main className="flex-1">
          <Routes>

            <Route path="/" element={<Dashboard />} />

            <Route
              path="/living-room"
              element={<LivingRoom />}
            />

            <Route
              path="/analytics"
              element={<Analytics />}
            />

            <Route
              path="/camera"
              element={<Camera />}
            />

            <Route
              path="/settings"
              element={<Settings />}
            />

          </Routes>
        </main>

      </div>
    </BrowserRouter>
  );
}

export default App;