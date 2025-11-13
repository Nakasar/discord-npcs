import { CommandInteraction } from "discord.js";
import { deleteSession, getSessionForChannel } from "../db/sessions";
import { logger } from "../logger";

export async function stopSessionCommand(interaction: CommandInteraction) {
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

    await interaction.reply('La session RP est désormais terminée.');
}