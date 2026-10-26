import Domain from '../../models/Domain.js';
import { inspect } from '../inspection/inspector.js';

async function list() {
	return Domain.find().sort({ name: 1 });
}

async function get(name) {
	return Domain.findOne({ name: name.toLowerCase().trim() });
}

async function upsert(name, cert) {
	const clean = name.toLowerCase().trim();
	const snapshot = cert || (await inspect(clean));
	return Domain.findOneAndUpdate(
		{ name: clean },
		{ $set: { cert: snapshot, lastCheckedAt: new Date() } },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
	);
}

async function remove(name) {
	return Domain.findOneAndDelete({ name: name.toLowerCase().trim() });
}

export default { list, get, upsert, remove };