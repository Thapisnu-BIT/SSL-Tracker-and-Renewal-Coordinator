import mongoose from 'mongoose';

const alertLogSchema = new mongoose.Schema(
	{
		type: { type: String, enum: ['email', 'webhook'], required: true },
		domain: { type: String, required: true },
		window: { type: String, default: '' },
		message: { type: String, default: '' },
		status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
		recipient: { type: String, default: '' },
		error: { type: String, default: '' }
	},
	{ timestamps: true }
);

alertLogSchema.index({ createdAt: -1 });

export default mongoose.model('AlertLog', alertLogSchema);