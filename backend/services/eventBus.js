const crypto = require("crypto");

class EventBus {
    constructor() {
        this.clients = new Set();
        this.recentEvents = [];
        this.maxRecent = 100;
    }

    addClient({ res, userId, role }) {
        const client = {
            id: crypto.randomUUID(),
            res,
            userId: userId ? userId.toString() : null,
            role: role || "guest"
        };
        this.clients.add(client);
        return client;
    }

    removeClient(client) {
        this.clients.delete(client);
    }

    publish({ type, payload = {}, audience = { public: true } }) {
        const event = {
            id: crypto.randomUUID(),
            version: "1.0",
            type,
            payload,
            timestamp: new Date().toISOString()
        };

        this.recentEvents.push({ event, audience });
        if (this.recentEvents.length > this.maxRecent) {
            this.recentEvents.shift();
        }

        const serialized = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

        for (const client of this.clients) {
            if (this.canReceive(client, audience)) {
                try {
                    client.res.write(serialized);
                } catch {
                    this.clients.delete(client);
                }
            }
        }

        return event;
    }

    canReceive(client, audience = {}) {
        if (audience.public) return true;
        if (client.role === "admin") return true;
        if (audience.roles && audience.roles.includes(client.role)) return true;
        if (
            audience.userIds &&
            client.userId &&
            audience.userIds.map(String).includes(client.userId)
        ) {
            return true;
        }
        return false;
    }

    getSnapshotForClient({ userId, role }) {
        const mockClient = {
            userId: userId ? userId.toString() : null,
            role: role || "guest"
        };
        return this.recentEvents
            .filter(({ audience }) => this.canReceive(mockClient, audience))
            .slice(-20)
            .map(({ event }) => event);
    }

    getStats() {
        return {
            connectedClients: this.clients.size,
            bufferedEvents: this.recentEvents.length
        };
    }
}

module.exports = new EventBus();
