import axios from "axios";

export default function SongCard({item}){
    const token = localStorage.getItem("token");
    const roomId = localStorage.getItem("roomid");
    return (
        <div className="border border-white p-1">
            <div className="flex justify-around">
                <div>
                    <img src={item.thumburl} alt="image" style={{ width: '180px', height: '100px' }} />
                    {/* {console.log(item)} */}
                </div>
                <div className="pt-3 text-center">{item.title}</div>
            </div>
            <div className="flex justify-end">
                <div className="m-1 hover:cursor-pointer" onClick={()=>{
                    axios.post(`http://localhost:3000/api/user/rooms/${roomId}/songs/${item._id}/upvote`,{},{
            headers:{
                "Authorization":`Bearer ${token}`
            }
        })
        .then((response)=>{
            // console.log(response.data);
        })
        .catch((e)=>{
            console.log(e);
        })
                }}>upvote⬆️</div>
                <div className=" m-1">{item.upvotes}</div>
            </div>
        </div>
    )
}