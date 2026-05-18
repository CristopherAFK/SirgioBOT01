const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { isStaff } = require('./helpers');

const PANEL_HEADER = '**Reacciona con el emoji correspondiente para obtener el rol:**\n\n';

function buildPanelDescription(roles) {
  return (
    PANEL_HEADER +
    roles.map((r) => `${r.emoji} → <@&${r.roleId}> - *${r.label}*`).join('\n\n')
  );
}

function buildPanelEmbed(panel) {
  const color = config.colors[panel.colorKey] || config.colors.panel;
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(buildPanelDescription(panel.roles));
}

function emojiKey(emoji) {
  return emoji.id || emoji.name;
}

function buildBannerEmbed(bannerUrl) {
  return new EmbedBuilder().setImage(bannerUrl);
}

async function publishPanels(channel) {
  const sent = [];
  for (let i = 0; i < config.autorolePanels.length; i++) {
    const panelConfig = config.autorolePanels[i];
    if (panelConfig.bannerUrl) {
      await channel.send({ embeds: [buildBannerEmbed(panelConfig.bannerUrl)] });
    }
    const msg = await channel.send({ embeds: [buildPanelEmbed(panelConfig)] });
    for (const role of panelConfig.roles) {
      await msg.react(role.emoji).catch((err) => {
        console.error(`No se pudo añadir reacción ${role.emoji}:`, err.message);
      });
    }
    await db.saveAutorolePanel({
      messageId: msg.id,
      channelId: channel.id,
      guildId: channel.guild.id,
      panelIndex: i,
      exclusive: panelConfig.exclusive,
      roles: panelConfig.roles.map((r) => ({ emoji: r.emoji, roleId: r.roleId })),
    });
    sent.push(msg);
  }
  return sent;
}

async function toggleRole(member, panel, roleEntry, add) {
  const role = member.guild.roles.cache.get(roleEntry.roleId);
  if (!role) return { ok: false, reason: 'Rol no encontrado en el servidor.' };
  if (role.position >= member.guild.members.me.roles.highest.position) {
    return { ok: false, reason: 'El bot no puede gestionar ese rol (está muy arriba).' };
  }

  if (add) {
    if (panel.exclusive) {
      const toRemove = panel.roles
        .filter((r) => r.roleId !== roleEntry.roleId && member.roles.cache.has(r.roleId))
        .map((r) => r.roleId);
      if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});
    }
    if (!member.roles.cache.has(role.id)) await member.roles.add(role);
  } else if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role);
  }
  return { ok: true };
}

async function handleReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch {
      return;
    }
  }

  const panel = await db.getAutorolePanel(reaction.message.id);
  if (!panel) return;

  const key = emojiKey(reaction.emoji);
  const roleEntry = panel.roles.find((r) => r.emoji === key);
  if (!roleEntry) return;

  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await toggleRole(member, panel, roleEntry, add);
}

async function handleMessage(message) {
  const content = message.content.trim().toLowerCase();
  if (content !== '!autoroles') return false;
  if (!isStaff(message.member)) {
    await message.reply({ content: '❌ Solo el staff puede publicar los autoroles.' });
    return true;
  }

  await publishPanels(message.channel);
  if (message.deletable) await message.delete().catch(() => {});
  return true;
}

function init(client) {
  client.on('messageReactionAdd', (reaction, user) => handleReaction(reaction, user, true));
  client.on('messageReactionRemove', (reaction, user) => handleReaction(reaction, user, false));
}

module.exports = { init, handleMessage, publishPanels };
