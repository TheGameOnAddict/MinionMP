import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import PartsCatalogViewer from './components/PartsCatalogViewer'
import PartsDashboard from './components/PartsDashboard'
import PartsDiscovery from './components/PartsDiscovery'
import LaunchPad from './components/LaunchPad'
import './App.css'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/launchpad" element={<LaunchPad />} />
        <Route path="/catalog" element={<PartsCatalogViewer />} />
        <Route path="/discovery" element={<PartsDiscovery />} />
        <Route path="/dashboard" element={<PartsDashboard />} />
        {/* Support old route just in case */}
        <Route path="/parts" element={<Navigate to="/dashboard" />} />
        <Route path="/mechanic" element={<Navigate to="/catalog" />} />
        <Route path="/" element={<Navigate to="/launchpad" />} />
      </Routes>
    </HashRouter>
  )
}

export default App
