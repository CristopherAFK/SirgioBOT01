const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const BotSettings = mongoose.model(
  'BotSettings',
  new mongoose.Schema({
    _id: { type: String, default: 'main' },
    ticketCounter: { type: Number, default: 0 },
    modCaseCounter: { type: Number, default: 0 },
  }),
);

const Ticket = mongoose.model(
  'Ticket',
  new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    userId: String,
    category: String,
    categoryValue: String,
    number: String,
    openedAt: Number,
    meta: mongoose.Schema.Types.Mixed,
  }),
);

const PendingReview = mongoose.model(
  'PendingReview',
  new mongoose.Schema({
    reviewId: { type: String, required: true, unique: true },
    userId: String,
    category: String,
    ticketNumber: String,
    channelId: String,
    channelName: String,
    closedBy: String,
    closedByTag: String,
    closedAt: Number,
    transcript: String,
    rating: Number,
    opinion: String,
    submitted: { type: Boolean, default: false },
  }),
);

const Suggestion = mongoose.model(
  'Suggestion',
  new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    authorId: String,
    title: String,
    content: String,
    upvotes: { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    status: { type: String, default: 'open' },
    modResponse: { type: String, default: null },
    modTag: { type: String, default: null },
    modId: { type: String, default: null },
    createdAt: { type: Number, default: () => Date.now() },
    threadId: String,
    staffMessageId: String,
  }),
);

const ModCase = mongoose.model(
  'ModCase',
  new mongoose.Schema({
    caseId: { type: String, required: true, unique: true },
    type: String,
    userId: String,
    userTag: String,
    moderatorId: String,
    moderatorTag: String,
    reasonCategory: String,
    reasonDetail: String,
    durationMs: Number,
    proofs: String,
    source: { type: String, default: 'staff' },
    createdAt: { type: Number, default: () => Date.now() },
    expiresAt: Number,
    active: { type: Boolean, default: true },
  }),
);

const UserProfile = mongoose.model(
  'UserProfile',
  new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    staffWarns: {
      type: [
        {
          caseId: String,
          reasonCategory: String,
          reasonDetail: String,
          moderatorId: String,
          moderatorTag: String,
          at: Number,
        },
      ],
      default: [],
    },
    automodWordWarns: { type: Number, default: 0 },
    automodSpamWarns: { type: Number, default: 0 },
    wordMuteLevel: { type: Number, default: 0 },
    spamMuteLevel: { type: Number, default: 0 },
    muteExpiresAt: Number,
    activeMuteCaseId: String,
  }),
);

let connected = false;

async function connectDB() {
  if (connected) return;
  if (!config.mongoUri) throw new Error('Falta la variable de entorno MONGODB_URI');

  await mongoose.connect(config.mongoUri);
  connected = true;
  console.log('✅ Conectado a MongoDB');

  await BotSettings.findByIdAndUpdate(
    'main',
    { $setOnInsert: { ticketCounter: 0, modCaseCounter: 0 } },
    { upsert: true, new: true },
  );

  await migrateFromJsonIfNeeded();
}

async function migrateFromJsonIfNeeded() {
  const jsonPath = path.join(__dirname, 'tickets.json');
  if (!fs.existsSync(jsonPath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if ((await Ticket.countDocuments()) > 0) return;
    if (raw.counter) {
      await BotSettings.findByIdAndUpdate('main', { ticketCounter: raw.counter });
    }
    for (const [channelId, ticket] of Object.entries(raw.channels || {})) {
      await Ticket.findOneAndUpdate({ channelId }, { channelId, ...ticket }, { upsert: true });
    }
    for (const [reviewId, review] of Object.entries(raw.pendingReviews || {})) {
      await PendingReview.findOneAndUpdate({ reviewId }, { reviewId, ...review }, { upsert: true });
    }
    for (const [messageId, suggestion] of Object.entries(raw.suggestions || {})) {
      await Suggestion.findOneAndUpdate({ messageId }, { messageId, ...suggestion }, { upsert: true });
    }
    fs.renameSync(jsonPath, `${jsonPath}.migrated`);
    console.log('📦 Datos migrados desde tickets.json');
  } catch (err) {
    console.error('Error migrando tickets.json:', err);
  }
}

async function getNextTicketNumber() {
  const doc = await BotSettings.findByIdAndUpdate(
    'main',
    { $inc: { ticketCounter: 1 } },
    { new: true, upsert: true },
  );
  return String(doc.ticketCounter).padStart(3, '0');
}

async function getNextCaseId() {
  const doc = await BotSettings.findByIdAndUpdate(
    'main',
    { $inc: { modCaseCounter: 1 } },
    { new: true, upsert: true },
  );
  return String(doc.modCaseCounter).padStart(4, '0');
}

async function getTicketByChannel(channelId) {
  const doc = await Ticket.findOne({ channelId }).lean();
  if (!doc) return null;
  const { channelId: _c, _id, __v, ...ticket } = doc;
  return ticket;
}

async function saveTicket(channelId, ticket) {
  await Ticket.findOneAndUpdate({ channelId }, { channelId, ...ticket }, { upsert: true });
}

async function deleteTicket(channelId) {
  await Ticket.deleteOne({ channelId });
}

async function userHasOpenTicket(userId) {
  return (await Ticket.countDocuments({ userId })) > 0;
}

async function savePendingReview(reviewId, review) {
  await PendingReview.findOneAndUpdate({ reviewId }, { reviewId, ...review }, { upsert: true });
}

async function getPendingReview(reviewId) {
  const doc = await PendingReview.findOne({ reviewId }).lean();
  if (!doc) return null;
  const { reviewId: _r, _id, __v, ...review } = doc;
  return review;
}

async function updatePendingReview(reviewId, updates) {
  await PendingReview.findOneAndUpdate({ reviewId }, { $set: updates });
}

async function deletePendingReview(reviewId) {
  await PendingReview.deleteOne({ reviewId });
}

async function getSuggestion(messageId) {
  const doc = await Suggestion.findOne({ messageId }).lean();
  if (!doc) return null;
  const { messageId: _m, _id, __v, ...suggestion } = doc;
  return suggestion;
}

async function saveSuggestion(messageId, suggestion) {
  await Suggestion.findOneAndUpdate({ messageId }, { messageId, ...suggestion }, { upsert: true });
}

async function getUserProfile(userId) {
  let doc = await UserProfile.findOne({ userId }).lean();
  if (!doc) {
    doc = await UserProfile.create({ userId });
    doc = doc.toObject();
  }
  const { _id, __v, ...profile } = doc;
  return profile;
}

async function updateUserProfile(userId, updates) {
  await UserProfile.findOneAndUpdate({ userId }, { $set: updates }, { upsert: true });
}

async function addStaffWarn(userId, warn) {
  await UserProfile.findOneAndUpdate(
    { userId },
    { $push: { staffWarns: warn }, $setOnInsert: { userId } },
    { upsert: true },
  );
}

async function removeStaffWarns(userId, count) {
  const profile = await getUserProfile(userId);
  const remaining = profile.staffWarns.slice(0, Math.max(0, profile.staffWarns.length - count));
  await updateUserProfile(userId, { staffWarns: remaining });
  return profile.staffWarns.length - remaining.length;
}

async function createModCase(data) {
  const caseId = await getNextCaseId();
  const doc = { caseId, ...data };
  await ModCase.create(doc);
  return doc;
}

async function getModCase(caseId) {
  return ModCase.findOne({ caseId }).lean();
}

async function getUserCases(userId, limit = 15) {
  return ModCase.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

async function deactivateCase(caseId) {
  await ModCase.updateOne({ caseId }, { active: false });
}

module.exports = {
  connectDB,
  getNextTicketNumber,
  getNextCaseId,
  getTicketByChannel,
  saveTicket,
  deleteTicket,
  userHasOpenTicket,
  savePendingReview,
  getPendingReview,
  updatePendingReview,
  deletePendingReview,
  getSuggestion,
  saveSuggestion,
  getUserProfile,
  updateUserProfile,
  addStaffWarn,
  removeStaffWarns,
  createModCase,
  getModCase,
  getUserCases,
  deactivateCase,
};
