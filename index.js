const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');
const config = require('./config');
const db = require('./database');
const suggestions = require('./suggestions');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const pendingTickets = new Map();


function getCategoryLabel(value) {
  const cat = config.categories.find((c) => c.value === value);
  return cat ? cat.label : value;
}

function isStaff(member) {
  if (!member) return false;
  if (member.id === config.ownerId) return true;
  return member.roles.cache.has(config.staffRoleId);
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle('🎟️ LagSupport')
    .setDescription(
      '¿Tienes alguna duda respecto al servidor? ¿Alguien te está molestando y deseas reportarlo? ¿Deseas apelar una sanción injusta?\n\n' +
        'En este canal podrás abrir un ticket para hablar directamente con el staff de **Sirgio**, quienes te ayudarán con los problemas o dudas que tengas. Simplemente tienes que elegir una opción con el menú de abajo el tipo de ayuda que necesitas y después explicar el problema que tienes.',
    )
    .setThumbnail(config.logoUrl);
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open_menu')
      .setLabel('Abrir un Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );
}

function buildCategorySelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Selecciona el tipo de ayuda que necesitas')
      .addOptions(
        config.categories.map((c) => ({
          label: c.label,
          value: c.value,
          emoji: c.emoji,
        })),
      ),
  );
}

function buildConfirmEmbed(categoryLabel) {
  return new EmbedBuilder()
    .setColor(config.colors.confirm)
    .setTitle('🟢 Confirmar apertura de ticket')
    .setDescription(
      `Has elegido: **${categoryLabel}**\n\n` +
        'Si continúas se abrirá un ticket en el que podrás explicar tu problema.',
    )
    .setThumbnail(config.logoUrl);
}

function buildConfirmRow(categoryValue) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_${categoryValue}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId('ticket_reject')
      .setLabel('Rechazar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId('ticket_faq')
      .setLabel('Ver preguntas frecuentes')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  );
}

function buildFaqEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.faq)
    .setTitle('📋 Preguntas Frecuentes')
    .setDescription(
      '**¿Puedo comunicarme con Sirgio mediante Tickets?**\n' +
        'R// No, Puedes comunicarte con el equipo de Sirgio los cuales te ayudaran en dado caso quieras comunicarte con el para una colaboración o promoción.\n\n' +
        '**¿Cuando abren las postulaciones?**\n' +
        'R// No hay fecha definida, se avisara unos dias antes o el mismo dia de la apertura de postulaciones en el canal de anuncios.\n\n' +
        '**¿Que Rol necesito para mandar sugerencias?**\n' +
        'R// Necesitas ser Minimo Nivel 5.\n\n' +
        '**¿Que hago si un usuario me esta molestando o me ofendio?**\n' +
        'R// Crea un ticket con la categoria "Reportar usuario"\n\n' +
        '**¿Que dias Sirgio Hace Streams/Lives?**\n' +
        'R// Sirgio No tiene un horario fijo, siempre anuncia unos minutos antes de prender Live.\n\n' +
        '**¿Que recompensas obtengo por boostear el server?**\n' +
        'R// Una tarjeta personalizada en el sistema de Niveles, Un 200% mas de XP en el sistema de Niveles, Acceso a canales exclusivos y a información como spoilers de actualizaciones futuras.\n\n' +
        '**¿Que Recompensas obtengo por ser VIP en tiktok o Twitch?**\n' +
        'R// Acceso a canales exclusivos, Un 200% mas de XP en el sistema de niveles y una tarjeta personalizada en el mismo.\n\n' +
        '**¿Puedo postularme otra vez si me rechazaron cuando me postule?**\n' +
        'R// Si, pero debes esperar a la siguente ronda de postulaciones y cumplir los requisitos de tu area a postular.\n\n' +
        '**¿Como mando imagenes en el chat general?**\n' +
        'R// Debes ser Nivel 25\n\n' +
        '**¿Cada cuando se reinicia el Leaderboard de niveles?**\n' +
        'R// Cada inicio de mes\n\n' +
        '**¿Cada cuanto se reinicia el sistema de economia?**\n' +
        'R// Cada 60 dias.\n\n' +
        '**¿Cada cuanto hay una actualización en el servidor?**\n' +
        'R// Cada 30 o 35 dias dependiendo el mes.\n\n' +
        '**¿Cuales son las recompensas por subir de nivel?**\n' +
        'R// puedes verlas haciendo `/rewards list`.',
    )
    .setThumbnail(config.logoUrl);
}

function buildWelcomeEmbed(user, categoryLabel, ticketNumber) {
  const desc =
    config.categoryDescriptions[categoryLabel] ||
    'Describe tu consulta o problema con el mayor detalle posible.';

  return new EmbedBuilder()
    .setColor(config.colors.welcome)
    .setTitle('👋 ¡Bienvenido!')
    .setDescription(
      `${user}\n\n` +
        'Bienvenido a tu ticket.\n\n' +
        `**Categoría:** ${categoryLabel}\n\n` +
        `Este ticket es sobre **${categoryLabel}**. ${desc}\n\n` +
        'El Staff atenderá tu caso en breve.',
    )
    .setFooter({ text: `Ticket #${ticketNumber}` })
    .setThumbnail(config.logoUrl);
}

function buildAttendRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_attend')
      .setLabel('Atender ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛡️'),
  );
}

function buildRatingEmbed(ticketNumber, categoryLabel) {
  return new EmbedBuilder()
    .setColor(config.colors.rating)
    .setTitle('⭐ Valora tu experiencia')
    .setDescription(
      `Tu ticket **#${ticketNumber}** (${categoryLabel}) ha sido cerrado.\n\n` +
        '¿Cómo calificarías la atención del staff? Elige una cantidad de estrellas.\n' +
        'Después podrás dejar una opinión opcional.',
    )
    .setThumbnail(config.logoUrl);
}

function buildRatingRow(reviewId) {
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_rate#${reviewId}#${i}`)
        .setLabel('⭐'.repeat(i))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

async function buildTranscript(channel, ticket) {
  const allMessages = [];
  let lastId;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = [
    '═══════════════════════════════════════',
    '       TRANSCRIPCIÓN DE TICKET — SIRGIO',
    '═══════════════════════════════════════',
    `Ticket: #${ticket.number}`,
    `Categoría: ${ticket.category}`,
    `Usuario: ${ticket.userId}`,
    `Canal: ${channel.name} (${channel.id})`,
    `Generado: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Mexico_City' })}`,
    '═══════════════════════════════════════',
    '',
  ];

  for (const msg of allMessages) {
    const date = msg.createdAt.toLocaleString('es-ES', { timeZone: 'America/Mexico_City' });
    const author = msg.author?.bot ? `[BOT] ${msg.author.tag}` : msg.author?.tag || 'Desconocido';
    let body = msg.content || '';
    if (msg.embeds.length) body += body ? ' ' : '' + `[Embed: ${msg.embeds[0].title || 'sin título'}]`;
    if (msg.attachments.size) {
      body += (body ? ' ' : '') + `[Adjuntos: ${[...msg.attachments.values()].map((a) => a.url).join(', ')}]`;
    }
    if (!body) body = '[sin contenido de texto]';
    lines.push(`[${date}] ${author}: ${body}`);
  }

  lines.push('', '═══════════════════════════════════════', '              FIN DE TRANSCRIPCIÓN', '═══════════════════════════════════════');
  return lines.join('\n');
}

async function createTicketChannel(guild, member, categoryValue) {
  const categoryLabel = getCategoryLabel(categoryValue);
  const ticketNumber = await db.getNextTicketNumber();
  const channelName = `ticket-${ticketNumber}-${member.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 100);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: config.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  await db.saveTicket(channel.id, {
    userId: member.id,
    category: categoryLabel,
    categoryValue,
    number: ticketNumber,
    openedAt: Date.now(),
  });

  await channel.send({
    content: `${member}`,
    embeds: [buildWelcomeEmbed(member, categoryLabel, ticketNumber)],
    components: [buildAttendRow()],
  });

  return { channel, ticketNumber, categoryLabel };
}

async function closeTicket(channel, closedBy) {
  const ticket = await db.getTicketByChannel(channel.id);
  if (!ticket) {
    return { ok: false, reason: 'Este canal no está registrado como ticket activo.' };
  }

  const guild = channel.guild;
  const user = await guild.members.fetch(ticket.userId).catch(() => null);
  const categoryLabel = ticket.category;
  const ticketNumber = ticket.number;

  let transcript = '';
  try {
    transcript = await buildTranscript(channel, ticket);
  } catch (err) {
    console.error('Error generando transcripción:', err);
    transcript = 'No se pudo generar la transcripción.';
  }

  const reviewId = `${channel.id}_${Date.now()}`;
  await db.savePendingReview(reviewId, {
    userId: ticket.userId,
    category: categoryLabel,
    ticketNumber,
    channelId: channel.id,
    channelName: channel.name,
    closedBy: closedBy.id,
    closedByTag: closedBy.user.tag,
    closedAt: Date.now(),
    transcript,
    submitted: false,
  });
  await db.deleteTicket(channel.id);

  if (user) {
    try {
      await user.send({
        embeds: [buildRatingEmbed(ticketNumber, categoryLabel)],
        components: [buildRatingRow(reviewId)],
      });
    } catch {
      await channel.send(
        `⚠️ No pude enviar el mensaje de valoración por MD a ${user}. Es posible que tenga los MD cerrados.`,
      );
    }
  }

  const closeEmbed = new EmbedBuilder()
    .setColor(config.colors.close)
    .setTitle('🔒 Ticket cerrado')
    .setDescription(
      `Este ticket fue cerrado por **${closedBy.user.tag}**.\n` +
        'El canal se eliminará en unos segundos...',
    )
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });
  setTimeout(() => channel.delete().catch(() => {}), 5000);

  return { ok: true, ticketNumber, categoryLabel };
}

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('sugerir')
      .setDescription('Envía una sugerencia para mejorar el servidor')
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), {
    body: commands,
  });
  console.log('✅ Comandos slash registrados');
}

function startHealthServer() {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('SirgioBOT online');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Health check activo en puerto ${port}`);
  });
}

client.once('ready', async () => {
  console.log(`✅ SirgioBOT conectado como ${client.user.tag}`);
  try {
    await registerSlashCommands();
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toLowerCase();

  if (content === '!tpanel') {
    if (!isStaff(message.member)) {
      return message.reply({
        content: '❌ Solo el staff puede publicar el panel de tickets.',
      });
    }
    await message.channel.send({
      embeds: [buildPanelEmbed()],
      components: [buildPanelRow()],
    });
    if (message.deletable) await message.delete().catch(() => {});
    return;
  }

  if (content === '!cerrar') {
    if (!isStaff(message.member)) {
      return message.reply({
        content: '❌ Solo los moderadores pueden cerrar tickets.',
      });
    }

    const ticket = await db.getTicketByChannel(message.channel.id);
    if (!ticket) {
      return message.reply({
        content: '❌ Este canal no es un ticket activo.',
      });
    }

    const result = await closeTicket(message.channel, message.member);
    if (!result.ok) {
      return message.reply({ content: `❌ ${result.reason}` });
    }
    return;
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const handled = await suggestions.handleSlash(interaction);
      if (handled !== false) return;
    }

    if (interaction.isButton()) {
      const sugHandled = await suggestions.handleButton(interaction);
      if (sugHandled !== false) return;
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
    } else if (interaction.isModalSubmit()) {
      const sugHandled = await suggestions.handleModal(interaction);
      if (sugHandled) return;
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Error en interacción:', err);
    const reply = {
      content: '❌ Ocurrió un error al procesar tu solicitud. Inténtalo de nuevo.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

async function handleButton(interaction) {
  const { customId } = interaction;

  if (customId === 'ticket_open_menu') {
    return interaction.reply({
      content: '📂 Elige la categoría de tu ticket:',
      components: [buildCategorySelect()],
      ephemeral: true,
    });
  }

  if (customId === 'ticket_reject') {
    pendingTickets.delete(interaction.user.id);
    return interaction.update({
      content: '❌ Has cancelado la apertura del ticket.',
      embeds: [],
      components: [],
    });
  }

  if (customId === 'ticket_faq') {
    return interaction.reply({
      embeds: [buildFaqEmbed()],
      ephemeral: true,
    });
  }

  if (customId.startsWith('ticket_confirm_')) {
    const categoryValue = customId.replace('ticket_confirm_', '');
    const categoryLabel = getCategoryLabel(categoryValue);

    const hasOpen = await db.userHasOpenTicket(interaction.user.id);
    if (hasOpen) {
      return interaction.reply({
        content: '⚠️ Ya tienes un ticket abierto. Ciérralo antes de abrir otro.',
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    const { channel, ticketNumber } = await createTicketChannel(
      interaction.guild,
      interaction.member,
      categoryValue,
    );

    await interaction.editReply({
      content: `✅ Tu ticket ha sido creado: ${channel} — **#${ticketNumber}** (${categoryLabel})`,
      embeds: [],
      components: [],
    });
    pendingTickets.delete(interaction.user.id);
    return;
  }

  if (customId === 'ticket_attend') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo los moderadores pueden atender tickets.',
        ephemeral: true,
      });
    }

    const ticket = await db.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({
        content: '❌ Este canal no es un ticket válido.',
        ephemeral: true,
      });
    }

    const user = await interaction.guild.members.fetch(ticket.userId).catch(() => null);

    const attendEmbed = new EmbedBuilder()
      .setColor(config.colors.confirm)
      .setDescription(
        `🛡️ **${interaction.user.tag}** se hará cargo de este ticket.\n` +
          `${user ? user : `<@${ticket.userId}>`}, un moderador atenderá tu caso en breve.`,
      )
      .setTimestamp();

    await interaction.reply({ embeds: [attendEmbed] });
    await interaction.message.edit({ components: [buildAttendRow()] }).catch(() => {});
    return;
  }

  const rateMatch = customId.match(/^ticket_rate#(.+)#(\d)$/);
  if (rateMatch) {
    const reviewId = rateMatch[1];
    const rating = parseInt(rateMatch[2], 10);

    const review = await db.getPendingReview(reviewId);
    if (!review || review.submitted) {
      return interaction.reply({
        content: '❌ Esta valoración ya no está disponible o expiró.',
        ephemeral: true,
      });
    }

    if (interaction.user.id !== review.userId) {
      return interaction.reply({
        content: '❌ Solo quien abrió el ticket puede valorarlo.',
        ephemeral: true,
      });
    }

    await db.updatePendingReview(reviewId, { rating });

    const modal = new ModalBuilder()
      .setCustomId(`ticket_opinion#${reviewId}`)
      .setTitle('💬 Opinión opcional');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('opinion_text')
          .setLabel('¿Quieres dejar un comentario? (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
          .setPlaceholder('Deja tu opinión o envía vacío para omitir...'),
      ),
    );

    return interaction.showModal(modal);
  }
}

async function handleSelect(interaction) {
  if (interaction.customId !== 'ticket_category_select') return;

  const categoryValue = interaction.values[0];
  const categoryLabel = getCategoryLabel(categoryValue);

  pendingTickets.set(interaction.user.id, categoryValue);

  await interaction.update({
    content: null,
    embeds: [buildConfirmEmbed(categoryLabel)],
    components: [buildConfirmRow(categoryValue)],
  });
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith('ticket_opinion#')) return;

  const reviewId = interaction.customId.replace('ticket_opinion#', '');
  const review = await db.getPendingReview(reviewId);

  if (!review || review.submitted) {
    return interaction.reply({
      content: '❌ Esta valoración ya fue enviada.',
      ephemeral: true,
    });
  }

  if (interaction.user.id !== review.userId) {
    return interaction.reply({
      content: '❌ No puedes enviar esta valoración.',
      ephemeral: true,
    });
  }

  if (!review.rating) {
    return interaction.reply({
      content: '❌ Primero debes elegir una puntuación.',
      ephemeral: true,
    });
  }

  const opinion = interaction.fields.getTextInputValue('opinion_text')?.trim() || null;
  review.opinion = opinion;
  review.submitted = true;

  await sendReviewToChannel(review, reviewId);
  await db.deletePendingReview(reviewId);

  await interaction.reply({
    content: '✅ ¡Gracias por tu valoración y comentario!',
    ephemeral: true,
  });

  try {
    const dmChannel = interaction.channel;
    const messages = await dmChannel.messages.fetch({ limit: 10 });
    const ratingMsg = messages.find((m) =>
      m.components.some((r) =>
        r.components.some((c) => c.customId?.startsWith('ticket_rate#')),
      ),
    );
    if (ratingMsg) {
      await ratingMsg.edit({
        content: '✅ Valoración enviada. ¡Gracias!',
        embeds: [],
        components: [],
      });
    }
  } catch {
    /* ignore */
  }
}

async function sendReviewToChannel(review, reviewId) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;

  const reviewsChannel = guild.channels.cache.get(config.reviewsChannelId);
  if (!reviewsChannel) {
    console.error('Canal de reseñas no encontrado');
    return;
  }

  const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  let userTag = review.userId;
  try {
    const u = await client.users.fetch(review.userId);
    userTag = u.tag;
  } catch {
    /* ignore */
  }

  const embed = new EmbedBuilder()
    .setColor(config.colors.review)
    .setTitle('📝 Nueva reseña de ticket')
    .addFields(
      { name: '🎫 Ticket', value: `#${review.ticketNumber}`, inline: true },
      { name: '📂 Categoría', value: review.category, inline: true },
      { name: '⭐ Puntuación', value: `${stars} (${review.rating}/5)`, inline: true },
      { name: '👤 Usuario', value: `<@${review.userId}> (${userTag})`, inline: false },
      {
        name: '🛡️ Cerrado por',
        value: review.closedByTag || `<@${review.closedBy}>`,
        inline: true,
      },
      {
        name: '💬 Opinión',
        value: review.opinion || '_Sin comentario adicional_',
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: `ID: ${reviewId}` })
    .setThumbnail(config.logoUrl);

  const files = [];
  if (review.transcript) {
    const buffer = Buffer.from(review.transcript, 'utf8');
    files.push(
      new AttachmentBuilder(buffer, {
        name: `transcript-ticket-${review.ticketNumber}.txt`,
        description: 'Transcripción completa del ticket',
      }),
    );
  }

  await reviewsChannel.send({
    embeds: [embed],
    files: files.length ? files : undefined,
    content: files.length ? '📄 **Transcripción del ticket adjunta.**' : undefined,
  });
}

async function main() {
  if (!config.token) {
    console.error('❌ Falta la variable de entorno DISCORD_TOKEN.');
    process.exit(1);
  }
  if (!config.mongoUri) {
    console.error('❌ Falta la variable de entorno MONGODB_URI.');
    process.exit(1);
  }

  startHealthServer();

  try {
    await db.connectDB();
  } catch (err) {
    console.error('❌ No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }

  await client.login(config.token);
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});
