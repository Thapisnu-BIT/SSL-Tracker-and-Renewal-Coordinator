import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI;

export async function connectDB() {
	if (!MONGO_URI) {
		throw new Error(
			'MONGO_URI is not set. Add your MongoDB Atlas connection string to server/.env'
		);
	}
	await mongoose.connect(MONGO_URI, {
		serverSelectionTimeoutMS: 10000
	});
	console.log('MongoDB connected');
}