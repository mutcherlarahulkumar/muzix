import axios from "axios";
import { useEffect, useState } from "react";
import SongCard from "../components/SongCard";
export default function Dashboard(){

    const [link,setLink] = useState('');
    const room_id = localStorage.getItem("roomid");
    const token = localStorage.getItem("token");
    const [data,setData] = useState([]);

    const [roomdetails,setRoomDetails] = useState({});


    
    useEffect(()=>{
        axios.get(`http://localhost:3000/api/user/rooms/${room_id}/songs`,{
            headers:{
                "Authorization":`Bearer ${token}`
            }
        })
        .then((response)=>{
            setData(response.data);
        })
        .catch((error)=>{
            console.log(error);
        })

        //fetch roomdetails
        axios.get(`http://localhost:3000/api/user/rooms/${room_id}`,{
            headers:{
                "Authorization":`Bearer ${token}`
            }
        })
        .then((response)=>{
            setRoomDetails(response.data);
            console.log(response.data);
        })
        .catch((error)=>{
            console.log(error);
        })
    },[link]);





    return <div className="text-white">
        <div>
            <div className="text-3xl text-center font-semibold p-8">DashBoard</div>
        </div>
        <div className="flex justify-evenly p-9">
            <div className=" w-1/2  text-5xl">Welcome to Room : {roomdetails.roomName}</div>
            <div className="  px-12 mx-10 text-center">
            {
                <div>
            <div>Add Youtube Link</div>
            <input type="text" id="username" name="username" className="text-black mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" onChange={(e)=>{
                                setLink(e.target.value);
                            }} required/>
            </div>
            }
            <div className=" text-center rounded-lg p-3  text-red-400   hover:cursor-pointer font-semibold" onClick={()=>{
                axios.post(`http://localhost:3000/api/user/rooms/${room_id}/songs`,{
                        link : link
                    },{
                        headers:{
                            'Authorization':`Bearer ${token}`
                        }
                    }
                    )
                    .then((response)=>{
                        console.log(response.data);
                        //fetch songs again
                    })
                    .catch((e)=>{
                        console.log(e.response.data.error);
                    })
            }}>Add Song</div>
            
            </div>
        </div>

        <div className="flex justify-evenly p-9">
            <div className="h-screen w-1/2 border ">
                <div>All Songs</div>
                <div>
                    {
                        data.map((item)=>(
                            <SongCard key={item.id} item={item} />
                        ))
                    }
                </div>
            </div>
            <div className="h-screen border px-5 mx-10 w-1/2">
                <div>Current Song</div>
                <iframe width="560" height="315" src="https://www.youtube.com/embed/7lFAh_BR3_E?si=auXQvk33V8e8NkX6" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            </div>
        </div>
    </div>
}