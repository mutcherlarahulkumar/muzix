import './App.css'
import '../global.css'
import { HashRouter, Routes, Route } from "react-router-dom";
import Signup from './pages/Signup';
import Signin from './pages/Signin';
import Landing from './pages/Landing'
import NoPage from "./pages/NoPage";
import Home from './pages/Home';
import Createroom from './components/Createroom';
import Joinroom from './components/Joinroom';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/home" element={<Home />} />
        <Route path="/createroom" element={<Createroom />} />
        <Route path="/joinroom" element={<Joinroom />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<NoPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
