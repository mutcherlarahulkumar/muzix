// give signin signup and middleware routes 
import express from "express";
import {User} from "../db.js";
import zod from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

//zod objects

const signupBody = zod.object({
    username : zod.string(),
    email : zod.string().email(),
    password: zod.string().min(6),
});

const signinBody = zod.object({
    email : zod.string().email(),
    password : zod.string(),
});



export const router = express();

router.post('/signup',async(req,res)=>{
    //signup logic
    const {success} = signupBody.safeParse(req.body);
    if(!success){
        res.status(400).json({error: "Invalid request body"});
        return;
    }
    const {username,email,password} = req.body;
    
    //db call

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "Email already in use" });
        }
    
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Create a new user
        const newUser = new User({
          username,
          email,
          password: hashedPassword,
        });
    
        await newUser.save();
        res.status(201).json({ message: "User created successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }

    //

});

router.post('/signin',async(req,res)=>{
    //signin logic
    const {success} = signinBody.safeParse(req.body);
    if(!success){
        res.status(400).json({error: "Invalid request body"});
        return;
    }
    const {email,password} = req.body;

    //db call


    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
    
        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
    
        // Generate JWT token
        const token = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET || "your_jwt_secret_key",
          { expiresIn: "1h" } // Token expires in 1 hour
        );
    
        res.status(200).json({ token, userId: user._id, username: user.username });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }


    //

});

//create an middleware function and export it

export const authMiddleware = async(req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>
  
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_key");
      req.userId = decoded.userId; // Add user data to request object
      next();
    } catch (error) {
      res.status(401).json({ message: "Invalid token" });
    }
  };
