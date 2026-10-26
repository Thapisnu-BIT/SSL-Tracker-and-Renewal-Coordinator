import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
	{
		C: String,
		ST: String,
		L: String,
		O: String,
		OU: String,
		CN: String
	},
	{ _id: false }
);

const certSchema = new mongoose.Schema(
	{
		origin: subjectSchema,
		issuer: subjectSchema,
		from: String,
		to: String,
		sn: String,
		altNames: [String],
		rt: Number
	},
	{ _id: false }
);

const domainSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true, trim: true, lowercase: true },
		cert: { type: certSchema, default: null },
		certPem: { type: String, default: null },
		keyPemEnc: { type: String, default: null },
		issuedBy: { type: String, enum: ['selfsigned', 'acme', ''], default: '' },
		renewedAt: { type: Date, default: null },
		status: {
			type: String,
			enum: ['unknown', 'ok', 'warn', 'expired', 'unreachable'],
			default: 'unknown'
		},
		lastCheckedAt: { type: Date, default: null },
		lastStatusChangeAt: { type: Date, default: null }
	},
	{ timestamps: true }
);

export default mongoose.model('Domain', domainSchema);