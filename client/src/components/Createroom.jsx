import axios from "axios";

import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Createroom(){
    const navigate = useNavigate();
    const [roomName,setRoomName] = useState('');
    const token = localStorage.getItem("token")
    return (
        <div className="h-screen flex justify-center items-center">
            <div className="text-white flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-5">
                <div className="text-3xl text-pink-600"><span className="text-blue-400">Create Room !!</span> and Chill With Your Friends!!</div>
                <div>
                <input type="text" id="username" name="username" className="text-black mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" onChange={(e)=>{
                                setRoomName(e.target.value);
                            }} required/>
                </div>
                <div  className="font-semibold text-lg border border-white p-2 rounded-md hover:bg-blue-300 hover:cursor-pointer" onClick={()=>{
                    axios.post('http://localhost:3000/api/user/create',{
                        roomName : roomName
                    },{
                        headers:{
                            'Authorization':`Bearer ${token}`
                        }
                    }
                    )
                    .then((response)=>{
                        console.log(response.data);
                        localStorage.setItem("roomid",response.data.room._id);
                        
                        navigate('/dashboard');
                    })
                    .catch((e)=>{
                        console.log(e.response.data.error);
                    })
                }}>Create </div>
            </div>
        </div>
        </div>
    )
}