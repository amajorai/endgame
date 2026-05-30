import { env } from "@endgame/env/server";
import mongoose from "mongoose";

await mongoose.connect(env.DATABASE_URL);

const client = mongoose.connection.getClient().db();

export { client };
