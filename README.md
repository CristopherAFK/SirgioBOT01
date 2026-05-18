# SirgioBOT

Bot de Discord para la comunidad de **Sirgio**. Incluye tickets, moderación, sugerencias, autoroles por reacciones, bienvenidas, auditoría y automod.

## Características

| Módulo | Descripción |
|--------|-------------|
| **Tickets (LagSupport)** | Panel interactivo, categorías, valoración y transcripción al cerrar |
| **Moderación** | Warns, muteos, bans, historial y casos en MongoDB |
| **Automod** | Palabras prohibidas, spam, flood y enlaces (excepto GIFs permitidos) |
| **Sugerencias** | `/sugerir` con votos y revisión del staff |
| **Autoroles** | 4 paneles con reacciones (país, género, juegos, notificaciones) |
| **Bienvenida** | Embed al unirse un miembro nuevo |
| **Auditoría** | Registro de mensajes, miembros, voz y cambios del servidor |
| **Staff** | Envío de mensajes y embeds a canales o por DM |

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- [MongoDB](https://www.mongodb.com/) (Atlas o instancia propia)
- Bot de Discord con permisos adecuados en el servidor

### Intents en el [Portal de Desarrolladores](https://discord.com/developers/applications)

- `Guilds`
- `Guild Members`
- `Guild Messages`
- `Message Content` (privilegiado)
- `Guild Moderation`
- `Guild Message Reactions`
- `Guild Voice States`
- `Guild Invites`

### Permisos del bot en el servidor

- Gestionar canales y roles
- Enviar mensajes y embeds
- Gestionar mensajes y reacciones
- Expulsar / banear miembros (moderación)
- Ver canales de auditoría configurados

## Instalación

```bash
git clone https://github.com/CristopherAFK/SirgioBOT01.git
cd SirgioBOT01
npm install
```

Crea un archivo `.env` en la raíz del proyecto:

```env
DISCORD_TOKEN=tu_token_del_bot
MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/sirgio
PORT=3000
```

| Variable | Descripción |
|----------|-------------|
| `DISCORD_TOKEN` | Token del bot (Discord Developer Portal) |
| `MONGODB_URI` | URI de conexión a MongoDB |
| `PORT` | Puerto del health check (opcional, por defecto `3000`) |

Inicia el bot:

```bash
npm start
```

## Despliegue (Render / similar)

1. Conecta el repositorio y define las variables de entorno.
2. Comando de inicio: `npm start`
3. El bot expone `GET /health` y `GET /` para comprobar que está en línea.

## Configuración

Los IDs de canales, roles y paneles se definen en `config.js`. Ajusta ese archivo si cambias la estructura del servidor.

Principales valores:

- `guildId` — ID del servidor
- `staffRoleId` — Rol del staff
- `ticketCategoryId` — Categoría de tickets
- `welcomeChannelId` — Canal de bienvenidas
- `rulesChannelId` — Canal de reglas
- `autorolesChannelId` — Canal donde están los autoroles
- `autorolePanels` — Emojis, roles y banners de cada panel

## Comandos

### Prefijo (`!`) — Staff

| Comando | Descripción |
|---------|-------------|
| `!Tpanel` | Publica el panel de tickets LagSupport |
| `!cerrar` | Cierra el ticket actual (valoración + transcripción) |
| `!autoroles` | Publica los 4 paneles de autoroles con banners y reacciones |

### Slash — Todos

| Comando | Descripción |
|---------|-------------|
| `/sugerir` | Enviar una sugerencia |
| `/help` | Lista de comandos |
| `/avatar` | Ver avatar de un usuario |
| `/banner` | Ver banner de un usuario |
| `/userinfo` | Información de un usuario |
| `/serverinfo` | Información del servidor |

### Slash — Staff

| Comando | Descripción |
|---------|-------------|
| `/sancion` | Warn, mute o ban con razón y pruebas |
| `/removemute` | Quitar mute |
| `/unban` | Desbanear usuario |
| `/warnlist` | Ver advertencias |
| `/removewarn` | Quitar warns |
| `/historial` | Historial de sanciones |
| `/case` | Detalle de un caso por ID |
| `/limpiarwarns` | Eliminar todos los warns |
| `/guia` | Guía completa para el staff |
| `/say` | Enviar mensaje a un canal |
| `/saydm` | Enviar mensaje por DM |
| `/embed` | Enviar embed a un canal |
| `/embeddm` | Enviar embed por DM |
| `/staffcmds` | Ayuda de comandos de staff |

## Autoroles

Al ejecutar `!autoroles` en un canal, el bot publica **8 mensajes** (4 banners + 4 embeds):

1. **Países** (naranja) — Un solo país a la vez
2. **Género** (rojo) — Una sola opción a la vez
3. **Videojuegos** (celeste) — Varios roles permitidos
4. **Notificaciones** (verde) — Varios roles permitidos

Los usuarios reaccionan con el emoji para obtener el rol y quitan la reacción para perderlo.

## Estructura del proyecto

```
SirgioBOT/
├── index.js          # Entrada principal y eventos
├── config.js         # Configuración del servidor
├── database.js       # MongoDB (Mongoose)
├── tickets.js        # Sistema LagSupport
├── moderation.js     # Sanciones y comandos de mod
├── automod.js        # Filtros automáticos
├── suggestions.js    # Sugerencias
├── autoroles.js      # Paneles por reacciones
├── welcome.js        # Mensajes de bienvenida
├── audit.js          # Logs de auditoría
├── staffcmds.js      # /say, /embed, etc.
├── commands.js       # Registro de slash commands
└── helpers.js        # Utilidades compartidas
```

## Licencia

Proyecto privado para la comunidad de Sirgio. Uso y redistribución según acuerdo del equipo.
