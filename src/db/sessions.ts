import { Channel, Message, User } from "discord.js";
import { Agent } from "./users";

export type Session = {
    id: string;
    createdAt: Date;
    createdBy: User['id'];
    channelId: Channel['id'];
    generating: boolean;
    conversationId?: string;
    context?: string;
    characters?: Agent['id'][];
    topicMessageId?: Message['id'];
};

const sessions: Session[] = [];

export async function createSession(createdBy: User['id'], channelId: Channel['id'], { characters, topicMessageId }: { characters?: Agent['id'][]; topicMessageId?: Message['id'] } = {}): Promise<Session> {
    const session: Session = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        createdBy,
        channelId,
        generating: false,
        characters,
        topicMessageId,
    };
    sessions.push(session);

    return session;
}

export async function getSessionForChannel(channelId: Channel['id']): Promise<Session | undefined> {
    return sessions.find((session) => session.channelId === channelId);
}

export async function deleteSession(id: Session['id']): Promise<void> {
    const index = sessions.findIndex((session) => session.id === id);
    if (index !== -1) {
        sessions.splice(index, 1);
    }
}

export async function markSessionGenerating(id: Session['id'], generating: boolean): Promise<void> {
    const session = sessions.find((s) => s.id === id);
    if (session) {
        session.generating = generating;
    }
}

export async function setSessionConversationId(id: Session['id'], conversationId: string): Promise<void> {
    const session = sessions.find((s) => s.id === id);
    if (session) {
        session.conversationId = conversationId;
    }
}

export async function setSessionContext(id: Session['id'], context: string): Promise<void> {
    const session = sessions.find((s) => s.id === id);
    if (session) {
        session.context = context;
    }
}
