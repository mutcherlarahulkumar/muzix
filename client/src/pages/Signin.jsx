import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Signin() {
    const naviagte = useNavigate();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    return <div className="h-full flex py-12">
        <div className="h-full flex flex-col justify-center w-full max-w-md mx-auto bg-white shadow-md rounded-lg p-6 items-center m-12 py-12">
            <div className="text-3xl text-center p-5 font-bold">Sign In</div>
            <div className="flex flex-col items-center p-2">
                <div className="w-full">

                    <div className="mb-4">
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" name="email" id="email" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" onChange={(e)=>{
                            setEmail(e.target.value);
                        }} required />
                    </div>

                    <div className="mb-4">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                        <input type="password" name="password" id="password" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" onChange={(e)=>{
                            setPassword(e.target.value);
                        }} required/>
                    </div>

                    <div>
                        <button className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" onClick={()=>{
                            //signin button
                            axios.post('http://localhost:3000/api/auth/signin',{
                                email : email,
                                password : password
                            })
                            .then((response)=>{
                                console.log(response.data);
                                localStorage.setItem("token",response.data.token);
                                naviagte('/home')
                            })
                            .catch((error)=>{
                                console.log(error.response.data);
                            })

                            
                        }}>Sign In</button>
                    </div>

                </div>
            </div>
        </div>
    </div>
}