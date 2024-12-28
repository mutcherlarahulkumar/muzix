import { useNavigate } from "react-router-dom"
export default function Home(){
    const naviagte = useNavigate();
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-black">
            <div className="text-4xl font-bold p-2 text-pink-600">Welcome to MuZix</div>
            <div className="text-xs text-white">~ By Rahul Kumar Mutcherla</div>
            <div className="text-5xl font-extrabold text-blue-400 text-center">Create Your Music Room, Vote, and Enjoy the Beat!</div>
            <div className="flex p-12 justify-center gap-12">
                <div className="border-2 border-white rounded-lg p-3  text-red-400 hover:bg-white hover:text-black hover:border-pink-400 hover:cursor-pointer font-bold" onClick={()=>{
                    naviagte('/createroom')
                }}>Create Room</div>
                <div className="border-2 border-white rounded-lg p-3  text-pink-400 hover:bg-white hover:text-black hover:border-pink-400 hover:cursor-pointer font-bold" onClick={()=>{
                    naviagte('/joinroom')
                }}>Join Room</div>
            </div>

        </div>
    )
}