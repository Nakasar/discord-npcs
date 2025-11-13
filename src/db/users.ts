import config from "config";

export type User = {
    id: string;
    username: string;
    discordId: string;
    permissions: {
        canStartSession?: boolean;
    };
};
export type Agent = {
    id: string;
    accessibleByUsers: User['id'][];
    name?: string;
    app?: {
        instanceId: string;
        id: string;
        secret: string;
    }
};

const users: User[] = [
    {
        id: 'nakasar',
        username: 'Nakasar',
        discordId: "186208105502081025",
        permissions: {
            canStartSession: true,
        },
    },
    {
        id: 'azgal',
        username: 'Azgal',
        discordId: "288041001329754112",
        permissions: {
            canStartSession: true,
        },
    },
];

const agents: Agent[] = [
    {
        id: '4SCC_h5il1',
        name: 'Irène Lothaire',
        accessibleByUsers: ['nakasar', 'azgal'],
    },
    {
        id: 'TxDelY5_cW',
        name: 'Jean Monnet', 
        accessibleByUsers: ['nakasar'],
        app: {
            instanceId: config.get('tmp.appInstance'),
            id: config.get('tmp.appId'),
            secret: config.get('tmp.appSecret'),
        },
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
