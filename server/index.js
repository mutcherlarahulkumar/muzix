import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import {router as rootRouter} from "./routes/server.js";

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://rahul:hDzJYkAenZIbyQLR@cluster0.qkwlpub.mongodb.net/').then(() => {
    console.log("Connected to MongoDB");
  }).catch((error) => {
    console.error("Error connecting to MongoDB:", error.message);
  });

//Navigating to API

app.use('/api',rootRouter);

app.listen(3000,()=>{
    console.log("The server is running on port 3000");
})