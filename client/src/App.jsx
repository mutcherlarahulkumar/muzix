import './App.css'
import '../global.css'
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
    <>
      <BrowserRouter>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="/signup" element={<Signup />}></Route>
        <Route path="/signin" element={<Signin />}></Route>
        <Route path='/home' element={<Home />}></Route>
        <Route path='/createroom' element={<Createroom />}></Route>
        <Route path='/joinroom' element={<Joinroom />}></Route>
        <Route path='/dashboard' element={<Dashboard />}></Route>


          
          <Route path="*" element={<NoPage />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}

export default App
