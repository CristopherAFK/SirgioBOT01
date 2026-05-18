const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const BotSettings = mongoose.model(
  'BotSettings',
  new mongoose.Schema({
    _id: { type: String, default: 'main' },
    ticketCounter: { type: Number, default: 0 },
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

let connected = false;

async function connectDB() {
  if (connected) return;
  if (!config.mongoUri) {
    throw new Error('Falta la variable de entorno MONGODB_URI');
  }

  await mongoose.connect(config.mongoUri);
  connected = true;
  console.log('✅ Conectado a MongoDB');

  await BotSettings.findByIdAndUpdate(
    'main',
    { $setOnInsert: { ticketCounter: 0 } },
    { upsert: true, new: true },
  );

  await migrateFromJsonIfNeeded();
}

async function migrateFromJsonIfNeeded() {
  const jsonPath = path.join(__dirname, 'tickets.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const existingTickets = await Ticket.countDocuments();
    if (existingTickets > 0) return;

    if (raw.counter) {
      await BotSettings.findByIdAndUpdate('main', { ticketCounter: raw.counter });
    }

    for (const [channelId, ticket] of Object.entries(raw.channels || {})) {
      await Ticket.findOneAndUpdate(
        { channelId },
        { channelId, ...ticket },
        { upsert: true },
      );
    }

    for (const [reviewId, review] of Object.entries(raw.pendingReviews || {})) {
      await PendingReview.findOneAndUpdate(
        { reviewId },
        { reviewId, ...review },
        { upsert: true },
      );
    }

    for (const [messageId, suggestion] of Object.entries(raw.suggestions || {})) {
      await Suggestion.findOneAndUpdate(
        { messageId },
        { messageId, ...suggestion },
        { upsert: true },
      );
    }

    fs.renameSync(jsonPath, `${jsonPath}.migrated`);
    console.log('📦 Datos migrados desde tickets.json a MongoDB');
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

async function getTicketByChannel(channelId) {
  const doc = await Ticket.findOne({ channelId }).lean();
  if (!doc) return null;
  const { channelId: _c, ...ticket } = doc;
  return ticket;
}

async function saveTicket(channelId, ticket) {
  await Ticket.findOneAndUpdate({ channelId }, { channelId, ...ticket }, { upsert: true });
}

async function deleteTicket(channelId) {
  await Ticket.deleteOne({ channelId });
}

async function userHasOpenTicket(userId) {
  const count = await Ticket.countDocuments({ userId });
  return count > 0;
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

module.exports = {
  connectDB,
  getNextTicketNumber,
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
};
