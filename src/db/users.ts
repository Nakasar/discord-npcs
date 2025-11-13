export type User = {
    id: string;
    username: string;
    discordId: string;
};
export type Agent = {
    id: string;
    accessibleByUsers: User['id'][];
    name?: string;
};

const users: User[] = [
    {
        id: 'nakasar',
        username: 'Nakasar',
        discordId: "186208105502081025",
    },
    {
        id: 'azgal',
        username: 'Azgal',
        discordId: "288041001329754112",
    },
];

const agents: Agent[] = [
    {
        id: '4SCC_h5il1',
        name: 'Irène Lothaire',
        accessibleByUsers: ['nakasar', 'azgal'],
    },
];

export async function getUserByDiscordId(discordId: string): Promise<User | undefined> {
    return users.find(user => user.discordId === discordId);
}

export async function getAgentsByNameOrId(nameOrId: string, userId: User['id']): Promise<Agent[]> {
    const lowerCased = nameOrId.toLowerCase();
    const matchedAgents = agents.filter(agent => {
        const isAccessible = agent.accessibleByUsers.includes(userId);
        const matchesId = agent.id.toLowerCase() === lowerCased;
        const matchesName = agent.name?.toLowerCase().startsWith(lowerCased);
        
        return isAccessible && (matchesId || matchesName);
    });

    return matchedAgents;
}
