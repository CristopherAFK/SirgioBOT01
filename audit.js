const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('./config');
const { discordTs, discordTsRel, truncate } = require('./helpers');

let clientRef = null;

async function sendLog(channelKey, embed) {
  const channelId = config.audit[channelKey] || config.staffLogChannelId;
  const channel = clientRef?.channels.cache.get(channelId);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error(`Audit log error [${channelKey}]:`, err.message);
  });
}

function baseEmbed(title, color, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: 'SirgioBOT · Auditoría' });
  if (fields.length) embed.addFields(fields);
  return embed;
}

async function logModeration(data) {
  const embed = baseEmbed(`🛡️ ${data.title}`, config.colors.auditMod, [
    { name: '📋 Caso', value: `#${data.caseId}`, inline: true },
    { name: '⚙️ Acción', value: data.action, inline: true },
    { name: '👤 Usuario', value: `<@${data.userId}>\n\`${data.userId}\``, inline: false },
    { name: '🛡️ Moderador', value: data.moderatorId ? `<@${data.moderatorId}>\n\`${data.moderatorId}\`` : 'Automod', inline: false },
    { name: '📝 Razón', value: truncate(data.reason), inline: false },
  ]);
  if (data.detail) embed.addFields({ name: '📄 Detalle', value: truncate(data.detail), inline: false });
  if (data.duration) embed.addFields({ name: '⏱️ Duración', value: data.duration, inline: true });
  if (data.proofs) embed.addFields({ name: '📎 Pruebas', value: truncate(data.proofs), inline: false });
  embed.addFields({ name: '🕐 Fecha', value: `${discordTs()} (${discordTsRel()})`, inline: false });
  await sendLog('moderation', embed);
}

async function logMessageEdit(oldMsg, newMsg) {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  const embed = baseEmbed('✏️ Mensaje editado', config.colors.auditMessage, [
    { name: '👤 Autor', value: `<@${oldMsg.author.id}> (\`${oldMsg.author.id}\`)`, inline: true },
    { name: '📍 Canal', value: `<#${oldMsg.channel.id}>`, inline: true },
    { name: '🔗 Enlace', value: `[Ir al mensaje](${newMsg.url})`, inline: true },
    { name: '📜 Antes', value: truncate(oldMsg.content || '_Vacío_'), inline: false },
    { name: '📝 Después', value: truncate(newMsg.content || '_Vacío_'), inline: false },
    { name: '🕐 Fecha', value: discordTs(), inline: false },
  ]);
  await sendLog('messages', embed);
}

async function logMessageDelete(message) {
  if (!message.guild) return;
  const author = message.author;
  if (author?.bot) return;
  const fields = [
    { name: '👤 Autor', value: author ? `<@${author.id}> (\`${author.id}\`)` : 'Desconocido', inline: true },
    { name: '📍 Canal', value: `<#${message.channel.id}>`, inline: true },
    { name: '📝 Contenido', value: truncate(message.content || '_Sin texto_'), inline: false },
    { name: '🕐 Fecha', value: discordTs(), inline: false },
  ];
  if (message.attachments?.size) {
    const urls = [...message.attachments.values()].map((a) => a.url).join('\n');
    fields.splice(3, 0, { name: '📎 Adjuntos', value: truncate(urls, 900), inline: false });
  }
  await sendLog('messages', baseEmbed('🗑️ Mensaje eliminado', config.colors.auditMessage, fields));
}

async function logMemberJoin(member) {
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  await sendLog(
    'members',
    baseEmbed('📥 Usuario ingresó', config.colors.auditMember, [
      { name: '👤 Usuario', value: `${member} (\`${member.id}\`)`, inline: false },
      { name: '📅 Cuenta creada', value: `${discordTs(member.user.createdAt)} · ${ageDays} días`, inline: true },
      { name: '👥 Miembros', value: `${member.guild.memberCount}`, inline: true },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logMemberLeave(member) {
  const roles = member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => r.name).join(', ') || 'Ninguno';
  await sendLog(
    'members',
    baseEmbed('📤 Usuario salió', config.colors.auditMember, [
      { name: '👤 Usuario', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
      { name: '🎭 Roles al salir', value: truncate(roles), inline: false },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logMemberUpdate(oldMember, newMember) {
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`**Apodo:** ${oldMember.nickname || '_ninguno_'} → ${newMember.nickname || '_ninguno_'}`);
  }
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const added = newRoles.filter((r) => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
  const removed = oldRoles.filter((r) => !newRoles.has(r.id) && r.id !== newMember.guild.id);
  if (added.size) changes.push(`**Roles +:** ${added.map((r) => r.name).join(', ')}`);
  if (removed.size) changes.push(`**Roles -:** ${removed.map((r) => r.name).join(', ')}`);
  if (!changes.length) return;

  await sendLog(
    'members',
    baseEmbed('👤 Perfil actualizado', config.colors.auditMember, [
      { name: '👤 Usuario', value: `<@${newMember.id}>`, inline: false },
      { name: '📋 Cambios', value: changes.join('\n'), inline: false },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logGuildChange(title, fields) {
  await sendLog('guild', baseEmbed(title, config.colors.auditGuild, fields));
}

async function logVoice(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  let title = null;
  const fields = [
    { name: '👤 Usuario', value: `<@${member.id}>`, inline: true },
    { name: '🕐 Fecha', value: discordTs(), inline: true },
  ];

  if (!oldState.channelId && newState.channelId) {
    title = '🔊 Entró a voz';
    fields.unshift({ name: '📍 Canal', value: `<#${newState.channelId}>`, inline: true });
  } else if (oldState.channelId && !newState.channelId) {
    title = '🔇 Salió de voz';
    fields.unshift({ name: '📍 Canal', value: `<#${oldState.channelId}>`, inline: true });
  } else if (oldState.channelId !== newState.channelId) {
    title = '↔️ Cambió de canal de voz';
    fields.unshift(
      { name: '📍 Desde', value: `<#${oldState.channelId}>`, inline: true },
      { name: '📍 Hacia', value: `<#${newState.channelId}>`, inline: true },
    );
  } else if (oldState.serverMute !== newState.serverMute || oldState.serverDeaf !== newState.serverDeaf) {
    title = '🛡️ Moderación de voz';
    fields.push({
      name: 'Estado',
      value: `Mute: ${newState.serverMute ? 'Sí' : 'No'} · Deaf: ${newState.serverDeaf ? 'Sí' : 'No'}`,
      inline: false,
    });
  } else return;

  await sendLog('voice', baseEmbed(title, config.colors.auditVoice, fields));
}

function logCommandUsage(interaction) {
  console.log(
    `[CMD] /${interaction.commandName} por ${interaction.user.tag} (${interaction.user.id}) en #${interaction.channel?.name}`,
  );
}

function logBotError(context, error) {
  console.error(`[BOT ERROR] ${context}:`, error?.stack || error);
}

function init(client) {
  clientRef = client;

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (oldMsg.partial) oldMsg.fetch().then((m) => logMessageEdit(m, newMsg)).catch(() => {});
    else if (oldMsg.content !== newMsg.content) logMessageEdit(oldMsg, newMsg);
  });

  client.on('messageDelete', (msg) => {
    if (msg.partial) msg.fetch().then(logMessageDelete).catch(() => logMessageDelete(msg));
    else logMessageDelete(msg);
  });

  client.on('guildMemberAdd', logMemberJoin);
  client.on('guildMemberRemove', logMemberLeave);
  client.on('guildMemberUpdate', logMemberUpdate);

  client.on('channelCreate', (ch) => {
    if (!ch.guild) return;
    logGuildChange('📁 Canal creado', [
      { name: 'Nombre', value: ch.name, inline: true },
      { name: 'ID', value: ch.id, inline: true },
      { name: 'Tipo', value: String(ch.type), inline: true },
    ]);
  });

  client.on('channelDelete', (ch) => {
    if (!ch.guild) return;
    logGuildChange('🗑️ Canal eliminado', [
      { name: 'Nombre', value: ch.name || 'desconocido', inline: true },
      { name: 'ID', value: ch.id, inline: true },
    ]);
  });

  client.on('channelUpdate', (oldCh, newCh) => {
    if (!newCh.guild || oldCh.name === newCh.name) return;
    logGuildChange('✏️ Canal renombrado', [
      { name: 'Antes', value: oldCh.name, inline: true },
      { name: 'Después', value: newCh.name, inline: true },
      { name: 'ID', value: newCh.id, inline: true },
    ]);
  });

  client.on('roleCreate', (role) => {
    logGuildChange('🎭 Rol creado', [
      { name: 'Nombre', value: role.name, inline: true },
      { name: 'ID', value: role.id, inline: true },
    ]);
  });

  client.on('roleDelete', (role) => {
    logGuildChange('🗑️ Rol eliminado', [
      { name: 'Nombre', value: role.name, inline: true },
      { name: 'ID', value: role.id, inline: true },
    ]);
  });

  client.on('roleUpdate', (oldRole, newRole) => {
    const permsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
    logGuildChange('✏️ Rol actualizado', [
      { name: 'Rol', value: newRole.name, inline: true },
      { name: 'Permisos', value: permsChanged ? 'Modificados ⚠️' : 'Sin cambio', inline: true },
    ]);
  });

  client.on('inviteCreate', (invite) => {
    logGuildChange('🔗 Invitación creada', [
      { name: 'Código', value: invite.code, inline: true },
      { name: 'Por', value: invite.inviter ? `<@${invite.inviter.id}>` : 'Desconocido', inline: true },
      { name: 'Usos máx.', value: invite.maxUses ? String(invite.maxUses) : '∞', inline: true },
      { name: 'Expira', value: invite.expiresAt ? discordTs(invite.expiresAt) : 'Nunca', inline: false },
    ]);
  });

  client.on('voiceStateUpdate', logVoice);
}

module.exports = {
  init,
  logModeration,
  logMessageDelete,
  logCommandUsage,
  logBotError,
};
