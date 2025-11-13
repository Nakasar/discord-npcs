import { Client, EmbedBuilder, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from 'config';
import { logger } from './logger';
import { createSession, deleteSession, getSessionForChannel, markSessionGenerating, setSessionContext, setSessionConversationId } from './db/sessions';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
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
			.setNameLocalization('fr', 'démarrer')
			.setDescription('Create a new session in this channel')
			.setDescriptionLocalization('fr', 'Crée une nouvelle session dans ce canal')
			.addStringOption(option => option
				.setName('agents')
				.setNameLocalization('fr', 'agents')
				.setDescription('List of coma-separated agent names or IDs')
				.setDescriptionLocalization('fr', 'Liste des noms ou ID d\'agents séparés par des virgules')
				.setRequired(false)
			)
			.toJSON(),
	new SlashCommandBuilder()
			.setName('stop')
			.setNameLocalization('fr', 'arrêter')
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
 * Events handlers
 */
client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return;

	if (message.content === 'ping') {
		logger.debug(`Received ping from user: ${message.author.id}`);

		logger.debug({
			id: message.author.id,
			member: message.member?.displayName,
		});
	} else if (message.content === 'refreshCommands') {
		logger.debug(`Received refreshCommands request from user: ${message.author.id}`);

		if (['186208105502081025'].includes(message.author.id) === false) {
			logger.debug(`User ${message.author.id} is not authorized to refresh commands.`);
			return;
		}

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

		logger.debug(`Received message in session ${session.id} by user: ${message.author.id}.`);

		if (session.generating) {
			logger.debug(`Session ${session.id} is already generating a response. Ignoring message.`);
			return;
		}

		if (!session.context) {
			logger.debug(`Adding first message as context to session.`);
			
			await setSessionContext(session.id, message.content);

			await message.channel.send('✅ Le contexte est initialisé pour cette session. Ouverture du RP !');

			return;
		}

		await markSessionGenerating(session.id, true);

		const agentId = '4SCC_h5il1';

		await message.channel.sendTyping();

		const messageContent = message.content;
		let name: string | undefined;
		let content: string = messageContent;

		let formatted: string;
		if (messageContent.toLowerCase().startsWith('[[contexte]]')) {
			formatted = content;
		} else {
			const match = messageContent.match(/^\+([^:]+):\s*(.*)$/);
			if (match) {
				name = match[1].trim();
				content = match[2].trim();
			}
			if (name) {
				formatted = `- **${name} :** ${content}`;
			} else {
				formatted = `- **${message.member?.displayName ?? message.author.displayName} :** ${content}`;
			}
		}

		if (session.conversationId) {
			const response = await fetch(`${config.get('services.breign.endpoint')}/conversations/${session.conversationId}/prompts`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': config.get('services.breign.apiKey'),
				},
				body: JSON.stringify({
					message: formatted,
				}),
			});

			if (!response.ok) {
				logger.error(`Failed to send prompt to conversation ${session.conversationId}: ${response.status} ${response.statusText}`);

				await markSessionGenerating(session.id, false);
				await message.channel.send(`Une erreur est survenue.`);

				return;
			}

			const responseData = await response.json() as { conversationId: string; text: string };

			await message.channel.send(responseData.text);

			await markSessionGenerating(session.id, false);
		} else {
			const initialMessageWithContext = `[[contexte]]\n${session.context ?? 'Aucun contexte particulier.'}\n\n${formatted}`;

			const response = await fetch(`${config.get('services.breign.endpoint')}/agents/${agentId}/prompts`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': config.get('services.breign.apiKey'),
				},
				body: JSON.stringify({
					lang: 'fr',
					message: initialMessageWithContext,
				}),
			});

			if (!response.ok) {
				logger.error(`Failed to send prompt to conversation ${session.conversationId}: ${response.status} ${response.statusText}`);

				await markSessionGenerating(session.id, false);
				await message.channel.send(`Une erreur est survenue.`);

				return;
			}

			const responseData = await response.json() as { conversationId: string; text: string };
			await setSessionConversationId(session.id, responseData.conversationId);

			await message.channel.send(responseData.text);

			await markSessionGenerating(session.id, false);
		}
	}
});

client.on(Events.InteractionCreate, async (interaction) => {
	logger.debug(`Received interaction: ${interaction.id} of type ${interaction.type}`);

	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === 'ping') {
		await interaction.reply('Pong!');
	} else if (interaction.commandName === 'start') {
		if (!interaction.channel) {
			await interaction.reply({ content: 'This command can only be used in a channel!', ephemeral: true });
			return;
		}

		if (['186208105502081025', '288041001329754112'].includes(interaction.user.id) === false) {
			logger.debug(`User ${interaction.user.id} is not authorized to start a session.`);
			return;
		}

		const session = await getSessionForChannel(interaction.channel.id);

		if (session) {
			await interaction.reply({ content: 'A session is already running in this channel!', ephemeral: true });
			return;
		}

		await createSession(interaction.user.id, interaction.channel.id);

		await interaction.reply('Démarrage de la session RP. Décrivez le contexte de la scène avant de commencer à intéragir.\n\n# Contexte :');
	} else if (interaction.commandName === 'stop') {
		if (!interaction.channel) {
			await interaction.reply({ content: 'This command can only be used in a channel!', ephemeral: true });
			return;
		}

		if (['186208105502081025', '288041001329754112'].includes(interaction.user.id) === false) {
			logger.debug(`User ${interaction.user.id} is not authorized to stop a session.`);
			return;
		}

		const session = await getSessionForChannel(interaction.channel.id);
		if (!session) {
			await interaction.reply({ content: 'No session is running in this channel!', ephemeral: true });
			return;
		}

		await deleteSession(session.id);

		await interaction.reply('La session RP est désormais terminée.');
	}
});

client.on(Events.Error, (error) => {
	console.error('The client encountered an error:', error);
});

client.login(config.get('services.discord.token'));
