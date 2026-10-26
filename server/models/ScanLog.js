import mongoose from 'mongoose';

const scanLogSchema = new mongoose.Schema(
	{
		startedAt: { type: Date, required: true },
		completedAt: { type: Date, required: true },
		duration: { type: Number, required: true },
		scanned: { type: Number, required: true },
		ok: { type: Number, default: 0 },
		warn: { type: Number, default: 0 },
		expired: { type: Number, default: 0 },
		unreachable: { type: Number, default: 0 },
		scanErrors: [
			{
				domain: String,
				error: String
			}
		]
	},
	{ timestamps: true }
);

scanLogSchema.index({ startedAt: -1 });

export default mongoose.model('ScanLog', scanLogSchema);