import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";
import { logger } from "../logger";
import { createSession, getSessionForChannel } from "../db/sessions";
import { Agent, getAgentsByNameOrId, getUserByDiscordId } from "../db/users";

export async function startSessionCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel) {
        await interaction.reply({ content: 'This command can only be used in a channel!', ephemeral: true });
        return;
    }

    const user = await getUserByDiscordId(interaction.user.id);
    if (!user || !user.permissions.canStartSession) {
        logger.debug(`User ${interaction.user.id} not found in database.`);
        await interaction.reply({ content: 'Vous ne pouvez pas démarrer de session.', ephemeral: true });
        return;
    }

    const session = await getSessionForChannel(interaction.channel.id);

    if (session) {
        await interaction.reply({ content: 'A session is already running in this channel!', ephemeral: true });
        return;
    }

    const characters: { id: Agent['id']; name?: Agent['name'] }[] = [];

    const agentNamesOrId = interaction.options.getString('characters', false);

    if (agentNamesOrId) {
        logger.debug(`User ${interaction.user.id} requested characters: ${agentNamesOrId}`);

        const characterList = agentNamesOrId.split(',').map(name => name.trim()).filter(name => name.length > 0);

        if (characterList.length === 0) {
            await interaction.reply({ content: 'Please provide at least one valid character name or ID.', ephemeral: true });
            return;
        }

        const agents = await Promise.all(characterList.map(nameOrId => getAgentsByNameOrId(nameOrId, user.id)));

        // if any of the agents were not found, inform the user
        const notFoundAgents = agents
            .map((agentList, index) => ({ agentList, nameOrId: characterList[index] }))
            .filter(({ agentList }) => agentList.length === 0)
            .map(({ nameOrId }) => nameOrId);

        const agentsMoreThanOne = agents
            .map((agentList, index) => ({ agentList, nameOrId: characterList[index] }))
            .filter(({ agentList }) => agentList.length > 1)
            .map(({ nameOrId }) => nameOrId);

        if (notFoundAgents.length > 0 || agentsMoreThanOne.length > 0) {
            let replyMessage = "La session n'a pas pu être démarrée en raison des problèmes suivants :\n\n";

            if (notFoundAgents.length > 0) {
                replyMessage += `Impossible de trouver les personnages mentionnés : ${notFoundAgents.join(', ')}.\n\n`;
            }
            
            if (agentsMoreThanOne.length > 0) {
                replyMessage += `Plusieurs personnages trouvés pour : ${agentsMoreThanOne.join(', ')}.\nVeuillez être plus précis ou utiliser leurs identifiants.\n`;
            }
            
            await interaction.reply({ content: replyMessage, ephemeral: true });
            return;
        }

        for (const agentList of agents) {
            const agent = agentList[0];
            characters.push({ id: agent.id, name: agent.name });
        }
    }

    
    const reply = await interaction.reply(`Démarrage de la session RP. Décrivez le contexte de la scène avant de commencer à intéragir.\n\n# Personnages\n${characters.map(c => c.name || 'Non nommé(e)').join('\n')}\n\n# Contexte\n`);
    const topicMessage = await reply.fetch();

    await createSession(interaction.user.id, interaction.channel.id, { characters: characters.map(c => c.id), topicMessageId: topicMessage.id });
}