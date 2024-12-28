import express from "express";
import {router as authRoutes} from "./auth.js";
import { router as userRoutes } from "./users.js";

export const router = express();

// handle various api Requests

router.use('/auth',authRoutes);

router.use('/user',userRoutes);
