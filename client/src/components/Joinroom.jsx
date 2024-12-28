export default function Joinroom(){
    return (
        <div className="h-screen flex justify-center items-center">
            <div className="text-white flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-5">
                <div className="text-3xl text-pink-600"><span className="text-blue-400">Join Room !!</span> and Chill With Your Friends!!</div>
                <div>
                <input type="text" id="username" name="username" className="text-black mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" onChange={(e)=>{
                                setRoomName(e.target.value);
                            }} required/>
                </div>
                <div  className="font-semibold text-lg border border-white p-2 rounded-md hover:bg-blue-300 hover:cursor-pointer">Join </div>
            </div>
        </div>
        </div>
    )
}