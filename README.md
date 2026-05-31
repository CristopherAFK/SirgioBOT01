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
| **YouTube** | Notificaciones automáticas de **Sirgio_o** y **SirgioTV** vía RSS |
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

## Notificaciones de YouTube

El bot consulta el RSS de ambos canales cada **20 segundos**:

| Canal YouTube | Nombre en el mensaje | ID |
|---------------|----------------------|-----|
| Sirgio_o | `Sirgio_o` | `UCHiCSO5ETUYchA5mBahcjmg` |
| SirgioTV | `SirgioTV` | `UCr9-_GiZhW7w_Xq5Wqw5Npw` |

Al detectar un video nuevo envía en el canal configurado:

- Mención al rol **@Videos YouTube**
- Texto: `¡Sirgio subio nuevo video en Sirgio_o! vayan a verlo` (o `SirgioTV`)
- Enlace al video
- Embed rojo con título, miniatura y hashtag (si el video lo incluye)

Al reiniciar el bot **no** reenvía el último video; solo notifica subidas nuevas.

## Autoroles

Al ejecutar `!autoroles` en un canal, el bot publica **8 mensajes** (4 URLs de banner en texto plano + 4 embeds con reacciones):

1. **Países** (naranja) — Un solo país a la vez
2. **Género** (rojo) — Una sola opción a la vez
3. **Videojuegos** (celeste) — Varios roles permitidos
4. **Notificaciones** (verde) — Varios roles permitidos

Los usuarios reaccionan con el emoji para obtener el rol y quitan la reacción para perderlo.

## MongoDB — datos para bots externos

SirgioBOT persiste todos los eventos relevantes en MongoDB. Otro bot (por ejemplo, métricas de rendimiento del staff) puede conectarse con la misma `MONGODB_URI` usando un usuario de **solo lectura** en Atlas.

### Colecciones principales

| Colección | Uso para rendimiento del staff |
|-----------|--------------------------------|
| `auditlogs` | Timeline unificada: auditoría, comandos, tickets, sugerencias, automod, acciones de staff |
| `modcases` | Sanciones: warn, mute, ban, unmute, unban (`source`: `staff` o `automod`) |
| `ticketreviews` | Valoraciones completadas (estrellas, opinión, quién cerró/atendió) |
| `pendingreviews` | Valoraciones pendientes (ticket cerrado, usuario aún no calificó) |
| `tickets` | Tickets abiertos (incluye `attendedBy` si alguien pulsó «Atender») |
| `suggestions` | Sugerencias con estado, votos y respuesta del staff (`modId`, `modTag`) |
| `userprofiles` | Warns activos, contadores automod, mute en curso |
| `botsettings` | Contadores globales (tickets, casos) |

### Campos útiles en `auditlogs`

- `category`: `message`, `member`, `guild`, `voice`, `moderation`, `command`, `staff`, `error`
- `action`: por ejemplo `ticket.close`, `ticket.attend`, `ticket.review`, `suggestion.review`, `automod.violation`, `moderation.warn`, `command.sancion`
- `actorId` / `actorTag`: quien ejecutó la acción (staff o usuario)
- `targetId`: usuario afectado
- `caseId`: enlace con `modcases` cuando aplica
- `source`: `staff`, `automod`, `user`, `system`
- `payload`: detalles (razón, rating, texto, etc.)
- `at`: timestamp (`Date.now()`)

### Consultas de ejemplo (otro bot)

```js
// Sanciones de un moderador este mes
db.modcases.find({
  moderatorId: 'ID_STAFF',
  createdAt: { $gte: Date.now() - 30 * 86400000 },
});

// Tickets cerrados y valorados por staff
db.ticketreviews.find({ closedBy: 'ID_STAFF' }).sort({ ratedAt: -1 });

// Actividad reciente de un miembro del staff
db.auditlogs.find({ actorId: 'ID_STAFF' }).sort({ at: -1 }).limit(100);

// Solo automod
db.auditlogs.find({ source: 'automod' }).sort({ at: -1 });
```

Los embeds en Discord siguen publicándose en los canales de auditoría; MongoDB es la fuente para análisis y el bot de rendimiento.

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
├── youtube.js        # Notificaciones RSS de YouTube
├── audit.js          # Logs de auditoría
├── staffcmds.js      # /say, /embed, etc.
├── commands.js       # Registro de slash commands
└── helpers.js        # Utilidades compartidas
```

## Licencia

Proyecto privado para la comunidad de Sirgio. Uso y redistribución según acuerdo del equipo.
