import { Channel, Client, EmbedBuilder, Events, GatewayIntentBits, MessageType, REST, Routes, SlashCommandBuilder, User } from 'discord.js';
import config from 'config';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});
const rest = new REST().setToken(config.get('services.discord.token'));

/*
 * COMMANDS
 */
const commands = [
	new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!').toJSON(),
	new SlashCommandBuilder()
			.setName('start')
			.setNameLocalization('fr', 'demarrer')
			.setDescription('Create a new session in this channel')
			.setDescriptionLocalization('fr', 'Crée une nouvelle session dans ce canal')
			.toJSON(),
	new SlashCommandBuilder()
			.setName('stop')
			.setNameLocalization('fr', 'arreter')
			.setDescription('Stop the session in this channel')
			.setDescriptionLocalization('fr', 'Arrête la session dans ce canal')
			.toJSON(),
];

async function refreshGlobalCommands() {
	await rest.put(Routes.applicationCommands(config.get('services.discord.applicationId')), { body: commands });
}

async function refreshGuildCommands(guildId: string) {
	await rest.put(Routes.applicationGuildCommands(config.get('services.discord.applicationId'), guildId), { body: commands });
}

/*
 * Data
 */
export type Session = {
	id: string;
	createdAt: Date;
	createdBy: User['id'];
	channelId: Channel['id'];
}
const sessions: Session[] = [];

async function createSession(createdBy: User['id'], channelId: Channel['id']): Promise<Session> {
	const session: Session = {
		id: crypto.randomUUID(),
		createdAt: new Date(),
		createdBy,
		channelId,
	};
	sessions.push(session);

	return session;
}

async function getSessionForChannel(channelId: Channel['id']): Promise<Session | undefined> {
	return sessions.find((session) => session.channelId === channelId);
}

async function deleteSession(id: Session['id']): Promise<void> {
	const index = sessions.findIndex((session) => session.id === id);
	if (index !== -1) {
		sessions.splice(index, 1);
	}
}


/*
 * Events handlers
 */
client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return;

	if (message.content === 'refreshCommands') {
		await refreshGlobalCommands();
		if (message.guild) {
			await refreshGuildCommands(message.guild.id);
		}
		await message.channel.send('Refreshed commands!');
	} else {
		const session = await getSessionForChannel(message.channel.id);
		if (!session) {
			return;
		}

		await message.channel.send(`Acknowledged your message in session ${session.id}`);
	}
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === 'ping') {
		await interaction.reply('Pong!');
	} else if (interaction.commandName === 'start') {
		if (!interaction.channel) {
			await interaction.reply({ content: 'This command can only be used in a channel!', ephemeral: true });
			return;
		}

		const session = await getSessionForChannel(interaction.channel.id);

		if (session) {
			await interaction.reply({ content: 'A session is already running in this channel!', ephemeral: true });
			return;
		}

		await createSession(interaction.user.id, interaction.channel.id);

		await interaction.reply('Session started!');
	} else if (interaction.commandName === 'stop') {
		if (!interaction.channel) {
			await interaction.reply({ content: 'This command can only be used in a channel!', ephemeral: true });
			return;
		}


		const session = await getSessionForChannel(interaction.channel.id);
		if (!session) {
			await interaction.reply({ content: 'No session is running in this channel!', ephemeral: true });
			return;
		}

		await deleteSession(session.id);

		await interaction.reply('Session stopped!');
	}
});

client.on(Events.Error, (error) => {
	console.error('The client encountered an error:', error);
});

client.login(config.get('services.discord.token'));
