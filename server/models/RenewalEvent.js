import mongoose from 'mongoose';

const renewalEventSchema = new mongoose.Schema(
	{
		domain: { type: String, required: true, trim: true, lowercase: true },
		deadline: { type: Date, required: true },
		daysLeft: { type: Number, required: true },
		window: {
			type: String,
			enum: ['upcoming', 'approaching', 'urgent', 'expired'],
			required: true
		},
		status: {
			type: String,
			enum: ['active', 'completed', 'dismissed'],
			default: 'active'
		},
		notifiedAt: { type: Date, default: null }
	},
	{ timestamps: true }
);

renewalEventSchema.index({ domain: 1, status: 1 });
renewalEventSchema.index({ deadline: 1 });

export default mongoose.model('RenewalEvent', renewalEventSchema);