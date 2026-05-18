const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('./config');
const db = require('./database');
const audit = require('./audit');
const { isStaff, parseDuration, formatDuration, truncate, discordTs, discordTsRel } = require('./helpers');

async function applyMute(member, durationMs, reason, moderator, caseData) {
  const role = member.guild.roles.cache.get(config.mutedRoleId);
  if (!role) throw new Error('Rol de muteado no encontrado.');

  await member.roles.add(role, reason).catch(() => {});
  if (durationMs) {
    await member.timeout(durationMs, reason).catch(() => {});
  }

  const expiresAt = durationMs ? Date.now() + durationMs : null;
  if (expiresAt) {
    setTimeout(async () => {
      const m = await member.guild.members.fetch(member.id).catch(() => null);
      if (m?.roles.cache.has(config.mutedRoleId)) {
        await m.roles.remove(config.mutedRoleId, 'Mute expirado').catch(() => {});
        await m.timeout(null).catch(() => {});
      }
    }, durationMs);
  }

  await db.updateUserProfile(member.id, {
    muteExpiresAt: expiresAt,
    activeMuteCaseId: caseData.caseId,
  });
}

async function removeMute(member, moderatorTag) {
  await member.roles.remove(config.mutedRoleId, `Mute removido por ${moderatorTag}`).catch(() => {});
  await member.timeout(null, 'Mute removido').catch(() => {});
  await db.updateUserProfile(member.id, { muteExpiresAt: null, activeMuteCaseId: null });
}

async function executeSanction({
  guild,
  targetUser,
  type,
  reasonCategory,
  reasonDetail,
  durationMs,
  moderator,
  proofs,
  source = 'staff',
}) {
  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  const modCase = await db.createModCase({
    type,
    userId: targetUser.id,
    userTag: targetUser.tag,
    moderatorId: moderator?.id || null,
    moderatorTag: moderator?.tag || 'Automod',
    reasonCategory,
    reasonDetail,
    durationMs: durationMs || null,
    proofs: proofs || null,
    source,
    expiresAt: durationMs ? Date.now() + durationMs : null,
    active: true,
  });

  if (type === 'warn') {
    await db.addStaffWarn(targetUser.id, {
      caseId: modCase.caseId,
      reasonCategory,
      reasonDetail,
      moderatorId: moderator?.id,
      moderatorTag: moderator?.tag,
      at: Date.now(),
    });
  } else if (type === 'mute' && member) {
    await applyMute(member, durationMs, reasonDetail, moderator, modCase);
  } else if (type === 'ban') {
    await guild.members.ban(targetUser.id, {
      reason: `[#${modCase.caseId}] ${reasonCategory}: ${reasonDetail}`,
      deleteMessageSeconds: 0,
    });
  }

  await audit.logModeration({
    title: `Sanción — ${type.toUpperCase()}`,
    caseId: modCase.caseId,
    action: type,
    userId: targetUser.id,
    moderatorId: moderator?.id,
    reason: reasonCategory,
    detail: reasonDetail,
    duration: durationMs ? formatDuration(durationMs) : 'N/A',
    proofs,
  });

  return modCase;
}

function buildUserSanctionEmbed(modCase, isStaffView = false) {
  const color =
    modCase.type === 'ban' ? config.colors.ban : modCase.type === 'mute' ? config.colors.mute : config.colors.warn;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(isStaffView ? '🛡️ Registro de sanción' : '⚠️ Has recibido una sanción')
    .addFields(
      { name: '📋 Caso', value: `#${modCase.caseId}`, inline: true },
      { name: '⚙️ Tipo', value: modCase.type.toUpperCase(), inline: true },
      { name: '📝 Motivo', value: modCase.reasonCategory, inline: true },
      { name: '📄 Detalle', value: truncate(modCase.reasonDetail, 500), inline: false },
    )
    .setTimestamp();

  if (modCase.durationMs) {
    embed.addFields({ name: '⏱️ Duración', value: formatDuration(modCase.durationMs), inline: true });
    if (modCase.expiresAt) {
      embed.addFields({ name: '🕐 Expira', value: discordTsRel(new Date(modCase.expiresAt)), inline: true });
    }
  }

  if (isStaffView) {
    embed.addFields(
      { name: '👤 Usuario', value: `<@${modCase.userId}> (\`${modCase.userId}\`)`, inline: false },
      { name: '🛡️ Origen', value: modCase.source === 'automod' ? '🤖 Automod' : `Staff — ${modCase.moderatorTag}`, inline: false },
    );
    if (modCase.proofs) embed.addFields({ name: '📎 Pruebas', value: truncate(modCase.proofs), inline: false });
  }

  return embed;
}

function buildAppealRow(caseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_sanction#${caseId}`)
      .setLabel('Apelar sanción')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚖️'),
  );
}

async function notifySanction(guild, targetUser, modCase) {
  let userEmbed = buildUserSanctionEmbed(modCase, false);
  if (modCase.source === 'automod' && modCase.type === 'warn') {
    const profile = await db.getUserProfile(targetUser.id);
    const warnKey = modCase.reasonDetail?.includes('Spam') ? 'automodSpamWarns' : 'automodWordWarns';
    const count = profile[warnKey] || 0;
    userEmbed = userEmbed.setDescription(
      `${modCase.reasonDetail}\n\n⚠️ Llevas **${count}/${config.automod.warnLimit}** advertencias automod. Al llegar a 3 serás muteado.`,
    );
  }

  const components = ['mute', 'ban'].includes(modCase.type) ? [buildAppealRow(modCase.caseId)] : [];

  try {
    await targetUser.send({ embeds: [userEmbed], components });
  } catch {
    /* MD cerrados */
  }

  const staffChannel = guild.channels.cache.get(config.staffLogChannelId);
  if (staffChannel) {
    await staffChannel.send({ embeds: [buildUserSanctionEmbed(modCase, true)] });
  }
}

async function handleSlash(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (!interaction.guild) return false;

  const { commandName } = interaction;
  const staffCommands = [
    'sancion',
    'removemute',
    'unban',
    'warnlist',
    'removewarn',
    'historial',
    'case',
    'limpiarwarns',
  ];

  if (!staffCommands.includes(commandName) && !['help', 'guia', 'avatar', 'banner', 'userinfo', 'serverinfo'].includes(commandName)) {
    return false;
  }

  audit.logCommandUsage(interaction);

  if (staffCommands.includes(commandName) && !isStaff(interaction.member)) {
    await interaction.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    return true;
  }

  try {
    switch (commandName) {
      case 'sancion':
        await cmdSancion(interaction);
        break;
      case 'removemute':
        await cmdRemoveMute(interaction);
        break;
      case 'unban':
        await cmdUnban(interaction);
        break;
      case 'warnlist':
        await cmdWarnList(interaction);
        break;
      case 'removewarn':
        await cmdRemoveWarn(interaction);
        break;
      case 'historial':
        await cmdHistorial(interaction);
        break;
      case 'case':
        await cmdCase(interaction);
        break;
      case 'limpiarwarns':
        await cmdClearWarns(interaction);
        break;
      case 'help':
        await cmdHelp(interaction);
        break;
      case 'guia':
        await cmdGuia(interaction);
        break;
      case 'avatar':
        await cmdAvatar(interaction);
        break;
      case 'banner':
        await cmdBanner(interaction);
        break;
      case 'userinfo':
        await cmdUserInfo(interaction);
        break;
      case 'serverinfo':
        await cmdServerInfo(interaction);
        break;
      default:
        return false;
    }
  } catch (err) {
    audit.logBotError(`/${commandName}`, err);
    const msg = { content: `❌ Error: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
  return true;
}

async function cmdSancion(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  const tipo = interaction.options.getString('tipo', true).toLowerCase();
  const razon = interaction.options.getString('razon', true);
  const detalle = interaction.options.getString('detalle', true);
  const tiempo = interaction.options.getString('tiempo');
  const prueba = interaction.options.getAttachment('pruebas');

  let type = 'warn';
  if (tipo.includes('mute')) type = 'mute';
  if (tipo.includes('ban')) type = 'ban';

  let durationMs = null;
  if (type !== 'warn') {
    if (!tiempo) {
      return interaction.editReply({ content: '❌ Debes indicar el tiempo para mute o ban (ej: 30m, 2h, 7d).' });
    }
    durationMs = parseDuration(tiempo);
    if (!durationMs) {
      return interaction.editReply({ content: '❌ Formato de tiempo inválido. Usa: 10m, 1h, 2d...' });
    }
  }

  const proofs = prueba ? `${prueba.name}: ${prueba.url}` : null;
  const modCase = await executeSanction({
    guild: interaction.guild,
    targetUser: user,
    type,
    reasonCategory: razon,
    reasonDetail: detalle,
    durationMs,
    moderator: interaction.user,
    proofs,
  });

  await notifySanction(interaction.guild, user, modCase);
  await interaction.editReply({
    content: `✅ Sanción **${type}** aplicada a ${user} — Caso #${modCase.caseId}`,
  });
}

async function cmdRemoveMute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply({ content: '❌ Usuario no está en el servidor.' });

  await removeMute(member, interaction.user.tag);
  const modCase = await db.createModCase({
    type: 'unmute',
    userId: user.id,
    userTag: user.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    reasonCategory: 'Remoción manual',
    reasonDetail: 'Mute removido por staff',
    source: 'staff',
    active: false,
  });

  await audit.logModeration({
    title: 'Mute removido',
    caseId: modCase.caseId,
    action: 'unmute',
    userId: user.id,
    moderatorId: interaction.user.id,
    reason: 'Remoción manual',
    detail: 'Mute removido por staff',
  });

  await interaction.editReply({ content: `✅ Mute removido de ${user}.` });
}

async function cmdUnban(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  await interaction.guild.members.unban(user.id, `Desbaneado por ${interaction.user.tag}`);
  const modCase = await db.createModCase({
    type: 'unban',
    userId: user.id,
    userTag: user.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    reasonCategory: 'Desbaneo',
    reasonDetail: 'Desbaneado por staff',
    source: 'staff',
    active: false,
  });
  await audit.logModeration({
    title: 'Usuario desbaneado',
    caseId: modCase.caseId,
    action: 'unban',
    userId: user.id,
    moderatorId: interaction.user.id,
    reason: 'Desbaneo manual',
  });
  await interaction.editReply({ content: `✅ ${user.tag} ha sido desbaneado.` });
}

async function cmdWarnList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  const profile = await db.getUserProfile(user.id);

  if (!profile.staffWarns.length) {
    return interaction.editReply({ content: `${user.tag} no tiene advertencias registradas.` });
  }

  const lines = profile.staffWarns
    .map(
      (w, i) =>
        `**${i + 1}.** [#${w.caseId}] ${w.reasonCategory} — ${w.reasonDetail}\n` +
        `└ ${w.moderatorTag || 'Staff'} · ${discordTs(new Date(w.at))}`,
    )
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(config.colors.warn)
    .setTitle(`⚠️ Warns de ${user.tag}`)
    .setDescription(truncate(lines, 4000))
    .setFooter({ text: `Total: ${profile.staffWarns.length}` });

  await interaction.editReply({ embeds: [embed] });
}

async function cmdRemoveWarn(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  const cantidad = interaction.options.getInteger('cantidad') || 1;
  const removed = await db.removeStaffWarns(user.id, cantidad);
  await interaction.editReply({
    content: removed
      ? `✅ Se removieron ${removed} warn(s) de ${user.tag}.`
      : `❌ ${user.tag} no tenía warns que remover.`,
  });
}

async function cmdHistorial(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  const cases = await db.getUserCases(user.id, 10);
  if (!cases.length) return interaction.editReply({ content: 'Sin historial de sanciones.' });

  const lines = cases
    .map(
      (c) =>
        `**#${c.caseId}** · ${c.type.toUpperCase()} · ${c.reasonCategory}\n` +
        `└ ${discordTs(new Date(c.createdAt))} · ${c.source}`,
    )
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle(`📋 Historial — ${user.tag}`)
    .setDescription(lines);

  await interaction.editReply({ embeds: [embed] });
}

async function cmdCase(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const id = interaction.options.getString('id', true).replace('#', '');
  const modCase = await db.getModCase(id.padStart(4, '0'));
  if (!modCase) return interaction.editReply({ content: '❌ Caso no encontrado.' });
  await interaction.editReply({ embeds: [buildUserSanctionEmbed(modCase, true)] });
}

async function cmdClearWarns(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser('usuario', true);
  await db.updateUserProfile(user.id, { staffWarns: [] });
  await interaction.editReply({ content: `✅ Todos los warns de ${user.tag} fueron eliminados.` });
}

async function cmdHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle('📖 Comandos de SirgioBOT')
    .setDescription(
      '**🎫 Tickets**\n`!Tpanel` · `!cerrar`\n\n' +
        '**🎭 Autoroles (Staff)**\n`!autoroles`\n\n' +
        '**📨 Mensajes (Staff)**\n`/say` · `/saydm` · `/embed` · `/embeddm` · `/staffcmds`\n\n' +
        '**💡 Sugerencias**\n`/sugerir`\n\n' +
        '**🛡️ Moderación (Staff)**\n' +
        '`/sancion` · `/removemute` · `/unban`\n' +
        '`/warnlist` · `/removewarn` · `/historial`\n' +
        '`/case` · `/limpiarwarns`\n\n' +
        '**ℹ️ Utilidad**\n' +
        '`/avatar` · `/banner` · `/userinfo` · `/serverinfo`\n' +
        '`/help` · `/guia`',
    )
    .setThumbnail(config.logoUrl);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdGuia(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle('📚 Guía del Staff — SirgioBOT')
    .setDescription(
      '**Tickets**\n' +
        '• `!Tpanel` publica el panel LagSupport.\n' +
        '• `!cerrar` cierra el ticket, envía valoración y transcripción.\n\n' +
        '**Autoroles**\n' +
        '• `!autoroles` publica 4 paneles (país, género, juegos, notificaciones) con reacciones.\n' +
        '• País y género son exclusivos; juegos y notificaciones permiten varios roles.\n\n' +
        '**Mensajes personalizados**\n' +
        '• `/say` y `/saydm` para texto en canal o DM.\n' +
        '• `/embed` y `/embeddm` con título, descripción, color e imagen (URL o adjunto).\n' +
        '• `/staffcmds` lista todos los comandos de staff.\n\n' +
        '**Sugerencias**\n' +
        '• Los usuarios usan `/sugerir` en el canal designado.\n' +
        '• Revisa en el canal de staff: Aprobar/Rechazar/Pendiente con respuesta personalizada.\n\n' +
        '**Sanciones**\n' +
        '• `/sancion` — Warn, Mute o Ban con razón, detalle y tiempo.\n' +
        '• `/removemute` y `/unban` revocan sanciones.\n' +
        '• `/warnlist` y `/removewarn` gestionan advertencias.\n' +
        '• `/historial` y `/case` consultan registros (MongoDB).\n\n' +
        '**Automod**\n' +
        '• Filtra palabras, spam (+5 msgs), +7 líneas y links (excepto GIFs).\n' +
        '• 3 warns automáticos = mute progresivo (10m→2h máx).\n' +
        '• Los usuarios pueden apelar desde el MD.\n\n' +
        '**Auditoría**\n' +
        '• Todo se registra en el canal de logs: mods, mensajes, miembros, voz y servidor.',
    )
    .setThumbnail(config.logoUrl);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdAvatar(interaction) {
  const user = interaction.options.getUser('usuario') || interaction.user;
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle(`🖼️ Avatar de ${user.tag}`)
    .setImage(user.displayAvatarURL({ size: 1024 }))
    .setURL(user.displayAvatarURL({ size: 1024 }));
  await interaction.reply({ embeds: [embed] });
}

async function cmdBanner(interaction) {
  const user = interaction.options.getUser('usuario') || interaction.user;
  const full = await user.fetch(true);
  const banner = full.bannerURL({ size: 1024 });
  if (!banner) return interaction.reply({ content: '❌ Este usuario no tiene banner.', ephemeral: true });
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle(`🎨 Banner de ${user.tag}`)
    .setImage(banner);
  await interaction.reply({ embeds: [embed] });
}

async function cmdUserInfo(interaction) {
  const user = interaction.options.getUser('usuario') || interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const profile = await db.getUserProfile(user.id);
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle(`👤 ${user.tag}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'ID', value: user.id, inline: true },
      { name: 'Cuenta creada', value: discordTs(user.createdAt), inline: true },
      { name: 'Ingresó al servidor', value: member ? discordTs(member.joinedAt) : 'N/A', inline: true },
      { name: 'Warns (staff)', value: String(profile.staffWarns.length), inline: true },
      { name: 'Warns automod', value: `Palabras: ${profile.automodWordWarns} · Spam: ${profile.automodSpamWarns}`, inline: true },
    );
  if (member) {
    embed.addFields({
      name: 'Roles',
      value: truncate(member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => r.name).join(', ') || 'Ninguno', 200),
    });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdServerInfo(interaction) {
  const g = interaction.guild;
  const embed = new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle(`🏠 ${g.name}`)
    .setThumbnail(g.iconURL())
    .addFields(
      { name: 'ID', value: g.id, inline: true },
      { name: 'Miembros', value: String(g.memberCount), inline: true },
      { name: 'Canales', value: String(g.channels.cache.size), inline: true },
      { name: 'Roles', value: String(g.roles.cache.size), inline: true },
      { name: 'Creado', value: discordTs(g.createdAt), inline: true },
      { name: 'Dueño', value: `<@${g.ownerId}>`, inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  handleSlash,
  executeSanction,
  notifySanction,
  applyMute,
  removeMute,
  buildUserSanctionEmbed,
  buildAppealRow,
};
