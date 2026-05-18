const http = require('http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const db = require('./database');
const audit = require('./audit');
const automod = require('./automod');
const moderation = require('./moderation');
const tickets = require('./tickets');
const suggestions = require('./suggestions');
const commands = require('./commands');
const autoroles = require('./autoroles');
const staffcmds = require('./staffcmds');
const welcome = require('./welcome');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

function startHealthServer() {
  const port = Number(process.env.PORT) || 3000;
  http
    .createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('SirgioBOT online');
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(port, '0.0.0.0', () => console.log(`🌐 Health check en puerto ${port}`));
}

client.once('ready', async () => {
  console.log(`✅ SirgioBOT conectado como ${client.user.tag}`);
  try {
    await commands.registerCommands(client);
  } catch (err) {
    audit.logBotError('registerCommands', err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  try {
    if (await automod.handleMessage(message)) return;
    if (await autoroles.handleMessage(message)) return;
    await tickets.handleMessage(message);
  } catch (err) {
    audit.logBotError('messageCreate', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (await suggestions.handleSlash(interaction)) return;
      if (await staffcmds.handleSlash(interaction)) return;
      if (await moderation.handleSlash(interaction)) return;
      return;
    }

    if (interaction.isButton()) {
      if (await suggestions.handleButton(interaction)) return;
      if (await tickets.handleButton(interaction, client)) return;
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (await tickets.handleSelect(interaction)) return;
      return;
    }

    if (interaction.isModalSubmit()) {
      if (await suggestions.handleModal(interaction)) return;
      if (await tickets.handleModal(interaction, client)) return;
    }
  } catch (err) {
    audit.logBotError('interactionCreate', err);
    const reply = { content: '❌ Ocurrió un error. Inténtalo de nuevo.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

async function main() {
  if (!config.token) {
    console.error('❌ Falta DISCORD_TOKEN');
    process.exit(1);
  }
  if (!config.mongoUri) {
    console.error('❌ Falta MONGODB_URI');
    process.exit(1);
  }

  startHealthServer();
  await db.connectDB();
  audit.init(client);
  autoroles.init(client);
  welcome.init(client);
  await client.login(config.token);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
